import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { buildHooksPrompt } from "@/lib/prompts/hooks";

function extractJsonArray(raw: string): string[] {
  const text = (raw || "").trim();

  // 1) Enlever les fences ```json ... ```
  const unfenced = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  // 2) Essayer direct
  try {
    const direct = JSON.parse(unfenced);
    if (Array.isArray(direct) && direct.every((x) => typeof x === "string")) return direct;
  } catch {}

  // 3) Extraire la portion entre [ ... ] si le modèle a ajouté du texte
  const first = unfenced.indexOf("[");
  const last = unfenced.lastIndexOf("]");
  if (first !== -1 && last !== -1 && last > first) {
    const slice = unfenced.slice(first, last + 1);
    const parsed = JSON.parse(slice);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) return parsed;
  }

  throw new Error("AI JSON array not found");
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const session = await auth();
    const email = session?.user?.email;
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const projectId = String(body.projectId ?? "").trim();
    const locale = String(body.locale ?? "").trim();
    if (!projectId || !locale) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true, idea: true },
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    // V1: si hooks existent déjà -> skip (zéro coût)
    const existing = await prisma.projectOutput.findFirst({
      where: { projectId: project.id, locale, kind: "hooks" },
      select: { id: true },
    });
    if (existing) return NextResponse.json({ ok: true, skipped: true });

    const prompt = buildHooksPrompt({ idea: project.idea, locale });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    let hooks: string[];

    try {
      hooks = extractJsonArray(raw);
    } catch (err) {
      console.error("❌ Invalid AI response (raw):", raw);
      return NextResponse.json(
        { error: "Invalid AI response" },
        { status: 500 }
      );
    }

    // petite protection: max 10-15 hooks
    hooks = hooks.filter(Boolean).slice(0, 10);

    await prisma.projectOutput.create({
      data: {
        projectId: project.id,
        locale,
        kind: "hooks",
        content: hooks,
        version: 1,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("❌ /api/generate/hooks error:", e);
    return NextResponse.json(
      { error: "Server error", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
