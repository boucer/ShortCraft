import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";

function stripFences(raw: string) {
  return (raw || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

async function callModel(system: string, user: string) {
  const anyOpenai = openai as any;

  if (anyOpenai?.responses?.create) {
    return await anyOpenai.responses.create({
      model: process.env.OPENAI_MODEL_TRANSLATE || process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
    });
  }

  return await anyOpenai.chat.completions.create({
    model: process.env.OPENAI_MODEL_TRANSLATE || process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.2,
  });
}

function getModelText(resp: any): string {
  const outText =
    resp?.output_text ||
    resp?.output?.[0]?.content?.find?.((c: any) => c?.type === "output_text")?.text;

  if (typeof outText === "string" && outText.trim()) return outText.trim();

  const cc = resp?.choices?.[0]?.message?.content;
  if (typeof cc === "string" && cc.trim()) return cc.trim();

  return "";
}

function isSupportedKind(kind: string) {
  return ["hooks", "storyboard", "script"].includes(kind);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const projectId = String(body?.projectId || "").trim();
  const kind = String(body?.kind || "").trim();
  const targetLanguage = String(body?.targetLanguage || "").trim(); // "en" | "fr"
  const sourceLanguage = String(body?.sourceLanguage || "").trim(); // "en" | "fr" (optional but recommended)
  const localeUI = String(body?.locale || "").trim() || "en";

  if (!projectId || !kind || !targetLanguage) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!isSupportedKind(kind)) {
    return NextResponse.json({ error: "Unsupported kind" }, { status: 400 });
  }
  if (!["en", "fr"].includes(targetLanguage)) {
    return NextResponse.json({ error: "Unsupported targetLanguage" }, { status: 400 });
  }
  const srcLang = sourceLanguage === "fr" ? "fr" : sourceLanguage === "en" ? "en" : null;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    select: { id: true, title: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Prefer translating from the currently displayed language (sourceLanguage),
  // else fallback to latest any-locale.
  const latest = srcLang
    ? await prisma.projectOutput.findFirst({
        where: { projectId: project.id, kind, locale: srcLang },
        orderBy: { version: "desc" },
        select: { content: true, version: true, locale: true },
      })
    : null;

  const fallbackLatest = !latest
    ? await prisma.projectOutput.findFirst({
        where: { projectId: project.id, kind },
        orderBy: { version: "desc" },
        select: { content: true, version: true, locale: true },
      })
    : null;

  const source = latest || fallbackLatest;

  if (!source) {
    return NextResponse.json({ error: "Nothing to translate yet." }, { status: 400 });
  }

  // Next version within target locale (keeps per-language history clean)
  const lastTarget = await prisma.projectOutput.findFirst({
    where: { projectId: project.id, kind, locale: targetLanguage },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (lastTarget?.version ?? 0) + 1;

  const system =
    "You are a professional translator for short-form video content. Keep meaning, tone, and structure. Do not add new claims.";
  const userPrompt = [
    `Project: ${project.title}`,
    `Kind: ${kind}`,
    `Target language: ${targetLanguage === "fr" ? "French (Québec-friendly neutral)" : "English"}`,
    `Source locale (for reference): ${(source as any).locale || "unknown"}`,
    "",
    "Translate the content below.",
    "Return the SAME STRUCTURE as the input:",
    "- If input is an array, return an array.",
    "- If input is an object, return an object.",
    "- Do not wrap in markdown.",
    "",
    "INPUT JSON:",
    JSON.stringify((source as any).content, null, 2),
  ].join("\n");

  const resp = await callModel(system, userPrompt);
  const rawText = getModelText(resp);
  const cleaned = stripFences(rawText);

  let translated: any = null;
  try {
    translated = JSON.parse(cleaned);
  } catch {
    translated = cleaned;
  }

  await prisma.projectOutput.create({
    data: {
      projectId: project.id,
      locale: targetLanguage,
      kind,
      version: nextVersion,
      content: translated,
    } as any,
  });

  return NextResponse.json({
    ok: true,
    version: nextVersion,
    locale: targetLanguage,
    ui: localeUI,
    sourceLocale: (source as any).locale || null,
  });
}
