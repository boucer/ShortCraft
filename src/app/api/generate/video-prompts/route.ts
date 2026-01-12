import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";

type ToolKey = "GENERIC" | "VEO" | "RUNWAY";

type StoryboardScene = {
  scene: number;
  onScreenText: string;
  voiceover: string;
  visual: string;
};

type VideoPromptItem = {
  sceneNumber: number;
  title: string;
  variants: Record<ToolKey, string>;
};

function stripFences(raw: string) {
  return (raw || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function extractJsonArray(raw: string): any[] {
  const t = stripFences(raw);

  // 1) direct parse
  try {
    const d = JSON.parse(t);
    if (Array.isArray(d)) return d;
  } catch {}

  // 2) extract [ ... ]
  const a = t.indexOf("[");
  const b = t.lastIndexOf("]");
  if (a !== -1 && b !== -1 && b > a) {
    try {
      const d = JSON.parse(t.slice(a, b + 1));
      if (Array.isArray(d)) return d;
    } catch {}
  }

  return [];
}

function ensureString(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function pickTextFromModelResponse(resp: any): string {
  // responses API
  if (resp?.output_text && typeof resp.output_text === "string") return resp.output_text;
  // chat.completions API
  const c = resp?.choices?.[0]?.message?.content;
  if (typeof c === "string") return c;
  // fallback
  if (typeof resp === "string") return resp;
  return "";
}

function parseDurationPreset(preset?: string) {
  const p = String(preset || "").toUpperCase();
  if (p.includes("6_8") || p.includes("6-8")) return { min: 6, max: 8 };
  if (p.includes("9_12") || p.includes("9-12")) return { min: 9, max: 12 };
  if (p.includes("12_15") || p.includes("12-15")) return { min: 12, max: 15 };
  if (p.includes("15_30") || p.includes("15-30")) return { min: 15, max: 30 };
  return { min: 6, max: 8 };
}

function normalizePromptItem(p: any): VideoPromptItem | null {
  const sceneNumber = Number(p?.sceneNumber ?? 0);
  if (!sceneNumber || sceneNumber < 1) return null;

  const title =
    typeof p?.title === "string" && p.title.trim()
      ? p.title.trim()
      : `Scene ${sceneNumber}`;

  const variantsRaw = p?.variants ?? p?.outputs ?? null;

  const GENERIC = ensureString(variantsRaw?.GENERIC ?? p?.GENERIC ?? "");
  const VEO = ensureString(variantsRaw?.VEO ?? p?.VEO ?? "");
  const RUNWAY = ensureString(variantsRaw?.RUNWAY ?? p?.RUNWAY ?? "");

  // If model used fullPrompt legacy: treat as GENERIC fallback
  const legacy = ensureString(p?.fullPrompt ?? "");

  const variants: Record<ToolKey, string> = {
    GENERIC: GENERIC || legacy,
    VEO: VEO || GENERIC || legacy,
    RUNWAY: RUNWAY || GENERIC || legacy,
  };

  if (!variants.GENERIC) return null;

  return { sceneNumber, title, variants };
}

async function callModel(system: string, user: string) {
  const anyOpenai = openai as any;

  // Prefer Responses API if available
  if (anyOpenai?.responses?.create) {
    return await anyOpenai.responses.create({
      model: process.env.OPENAI_MODEL_VIDEO_PROMPTS || process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.7,
    });
  }

  // Fallback to Chat Completions
  return await anyOpenai.chat.completions.create({
    model: process.env.OPENAI_MODEL_VIDEO_PROMPTS || process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.7,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const projectId = String(body?.projectId || "").trim();
  const locale = String(body?.locale || "en").trim();

  const platformPreset = String(body?.platformPreset || "INSTAGRAM_REELS");
  const stylePreset = String(body?.stylePreset || "UGC_TALKING_HEAD");
  const durationPreset = String(body?.durationPreset || "6_8_PUNCHY");
  const toolPreset = String(body?.toolPreset || "VEO"); // UI preset only (still outputs all 3 variants)

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    select: { id: true, title: true, idea: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const storyboardOutput = await prisma.projectOutput.findFirst({
    where: { projectId: project.id, locale, kind: "storyboard" },
    select: { content: true },
  });

  const storyboard: StoryboardScene[] =
    Array.isArray(storyboardOutput?.content)
      ? (storyboardOutput!.content as any)
      : (storyboardOutput?.content as any)?.scenes;

  if (!Array.isArray(storyboard) || storyboard.length === 0) {
    return NextResponse.json(
      { error: "Storyboard required before video prompts." },
      { status: 400 }
    );
  }

  // Optional: if you want “generate once per locale”
  // (delete DB record to regenerate)
  const existing = await prisma.projectOutput.findFirst({
    where: { projectId: project.id, locale, kind: "video_prompts" },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { min, max } = parseDurationPreset(durationPreset);

  const system = `
You are a senior short-form VIDEO PROMPT ENGINEER.

OUTPUT RULES:
- Return ONLY valid JSON (no markdown).
- Return an ARRAY of objects.
- Each object MUST be:
{
  "sceneNumber": number,
  "title": string,
  "variants": {
    "GENERIC": string,
    "VEO": string,
    "RUNWAY": string
  }
}

LANGUAGE:
- EVERYTHING must be written in ENGLISH ONLY.
- If you output ANY non-English word, you failed. English only.

PREMIUM++ FORMAT:
Each variants.* MUST be a MULTI-LINE block with EXACTLY these labels:

HOOK LINE:
CUTS:
SCENE:
CAMERA:
LIGHTING:
ACTION:
ON-SCREEN TEXT:
VOICE-OVER (EN):
SOUND DESIGN:
NEGATIVE:
SETTINGS:

CUTS:
- 3 to 5 bullet beats
- Describe shot changes / motion beats
- No timestamps

SETTINGS:
- Format: 9:16
- Duration: choose an exact value between ${min}-${max} seconds

TOOL EMPHASIS:
- GENERIC: universal, tool-agnostic, clean
- VEO: cinematic camera language, believable sound cues
- RUNWAY: motion continuity, clear transitions, anti-warp

FORBIDDEN:
- Brand names, copyrighted music, platform UI references
- Vague filler ("nice", "cool", "beautiful")
  `.trim();

  const storyboardText = storyboard
    .slice()
    .sort((a, b) => a.scene - b.scene)
    .map(
      (s) => `SCENE ${s.scene}
VISUAL: ${s.visual}
ON-SCREEN TEXT: ${s.onScreenText}
VOICEOVER HINT: ${s.voiceover}`
    )
    .join("\n\n");

  const userPrompt = `
PROJECT
Title: ${project.title}
Idea: ${project.idea}

PRESETS
Platform: ${platformPreset}
Style: ${stylePreset}
Duration preset: ${durationPreset}
Tool preset (UI): ${toolPreset}

STORYBOARD
${storyboardText}

TASK
Generate premium tool-ready video prompts (3 variants per scene) following the exact labeled format.
Return ONLY the JSON array.
  `.trim();

  try {
    const resp = await callModel(system, userPrompt);
    const raw = pickTextFromModelResponse(resp);

    const arr = extractJsonArray(raw);
    const prompts = arr
      .map(normalizePromptItem)
      .filter(Boolean) as VideoPromptItem[];

    if (!prompts.length) {
      return NextResponse.json(
        { error: "Model returned empty prompts.", raw },
        { status: 502 }
      );
    }

    await prisma.projectOutput.create({
      data: {
        projectId: project.id,
        locale,
        kind: "video_prompts",
        version: 8,
        content: {
          presets: { platformPreset, stylePreset, durationPreset, toolPreset },
          tools: ["GENERIC", "VEO", "RUNWAY"],
          prompts,
        },
      },
    });

    return NextResponse.json({ ok: true, promptsCount: prompts.length });
  } catch (err: any) {
    console.error("VIDEO PROMPTS ERROR", err);
    return NextResponse.json(
      { error: "Video prompts generation failed.", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
