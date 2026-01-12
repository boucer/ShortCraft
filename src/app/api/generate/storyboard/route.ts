import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { buildStoryboardPrompt } from "@/lib/prompts/storyboard";

type StoryboardScene = {
  scene: number;
  onScreenText: string;
  voiceover: string;
  visual: string;
};

function extractJsonArrayOfScenes(raw: string): StoryboardScene[] {
  const text = (raw || "").trim();

  // 1) Remove ```json fences if present
  const unfenced = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  // 2) Try direct JSON.parse
  try {
    const direct = JSON.parse(unfenced);
    if (Array.isArray(direct)) return direct as StoryboardScene[];
  } catch {}

  // 3) Extract between [ ... ] if extra text exists
  const first = unfenced.indexOf("[");
  const last = unfenced.lastIndexOf("]");
  if (first !== -1 && last !== -1 && last > first) {
    const slice = unfenced.slice(first, last + 1);
    const parsed = JSON.parse(slice);
    if (Array.isArray(parsed)) return parsed as StoryboardScene[];
  }

  throw new Error("AI JSON array not found");
}

function isValidScene(x: any): x is StoryboardScene {
  return (
    x &&
    typeof x === "object" &&
    typeof x.scene === "number" &&
    typeof x.onScreenText === "string" &&
    typeof x.voiceover === "string" &&
    typeof x.visual === "string"
  );
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

    // ✅ V1: If storyboard exists already -> skip (no cost)
    const existing = await prisma.projectOutput.findFirst({
      where: { projectId: project.id, locale, kind: "storyboard" },
      select: { id: true },
    });
    if (existing) return NextResponse.json({ ok: true, skipped: true });

    // ✅ Must have hooks first
    const hooksOutput = await prisma.projectOutput.findFirst({
      where: { projectId: project.id, locale, kind: "hooks" },
      select: { content: true },
    });

    const hooks =
      hooksOutput && Array.isArray(hooksOutput.content)
        ? (hooksOutput.content as unknown as string[])
        : null;

    if (!hooks || hooks.length === 0) {
      return NextResponse.json(
        { error: "Hooks not found. Generate hooks first." },
        { status: 400 }
      );
    }

    const prompt = buildStoryboardPrompt({ idea: project.idea, hooks, locale });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = completion.choices[0]?.message?.content ?? "";

    let scenes: StoryboardScene[];
    try {
      scenes = extractJsonArrayOfScenes(raw);
    } catch {
      console.error("❌ Invalid storyboard AI response (raw):", raw);
      return NextResponse.json({ error: "Invalid AI response" }, { status: 500 });
    }

    scenes = scenes
      .filter(isValidScene)
      .map((s) => ({
        scene: Number(s.scene),
        onScreenText: String(s.onScreenText).trim(),
        voiceover: String(s.voiceover).trim(),
        visual: String(s.visual).trim(),
      }))
      .filter((s) => s.scene >= 1 && s.scene <= 20)
      .slice(0, 10);

    if (scenes.length === 0) {
      console.error("❌ Storyboard parsed but invalid/empty:", scenes, "raw:", raw);
      return NextResponse.json({ error: "Invalid storyboard format" }, { status: 500 });
    }

    await prisma.projectOutput.create({
      data: {
        projectId: project.id,
        locale,
        kind: "storyboard",
        content: scenes,
        version: 1,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("❌ /api/generate/storyboard error:", e);
    return NextResponse.json(
      { error: "Server error", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
