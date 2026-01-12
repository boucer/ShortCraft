import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";

type StoryboardScene = {
  scene: number;
  onScreenText: string;
  voiceover: string;
  visual: string;
};

function extractJsonObject(raw: string): any | null {
  const text = (raw || "").trim();

  // remove ```json fences
  const unfenced = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  // try direct
  try {
    return JSON.parse(unfenced);
  } catch {}

  // find first { ... } block
  const a = unfenced.indexOf("{");
  const b = unfenced.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(unfenced.slice(a, b + 1));
    } catch {}
  }

  return null;
}

function getStoryboardScenesFromContent(content: any): StoryboardScene[] | null {
  if (Array.isArray(content)) return content as StoryboardScene[];
  if (content && Array.isArray((content as any).scenes)) return (content as any).scenes as StoryboardScene[];
  return null;
}

function getVideoPromptsArrayFromContent(content: any): any[] | null {
  if (!content) return null;
  if (Array.isArray(content)) return content;
  const c = content as any;
  if (Array.isArray(c.prompts)) return c.prompts;
  if (Array.isArray(c.scenes)) return c.scenes;
  return null;
}

function ensureString(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  return String(v);
}

async function callModel(system: string, user: string) {
  const anyOpenai = openai as any;

  // Prefer Responses API if available
  if (anyOpenai?.responses?.create) {
    return await anyOpenai.responses.create({
      model:
        process.env.OPENAI_MODEL_EDITING_SCRIPT ||
        process.env.OPENAI_MODEL ||
        "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
    });
  }

  // Fallback to Chat Completions
  return await anyOpenai.chat.completions.create({
    model:
      process.env.OPENAI_MODEL_EDITING_SCRIPT ||
      process.env.OPENAI_MODEL ||
      "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.4,
  });
}

function getModelText(resp: any): string {
  // Responses API
  const outText =
    resp?.output_text ||
    resp?.output?.[0]?.content?.find?.((c: any) => c?.type === "output_text")?.text;

  if (typeof outText === "string" && outText.trim()) return outText.trim();

  // Chat Completions
  const cc = resp?.choices?.[0]?.message?.content;
  if (typeof cc === "string" && cc.trim()) return cc.trim();

  return "";
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const projectId = String(body?.projectId || "").trim();
  const locale = String(body?.locale || "").trim() || "en";

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
    select: { id: true, title: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Load required upstream outputs
  const storyboardOutput = await prisma.projectOutput.findFirst({
    where: { projectId: project.id, locale, kind: "storyboard" },
    select: { content: true },
  });

  const videoPromptsOutput = await prisma.projectOutput.findFirst({
    where: { projectId: project.id, locale, kind: "video_prompts" },
    select: { content: true },
  });

  const storyboardScenes = storyboardOutput
    ? getStoryboardScenesFromContent(storyboardOutput.content)
    : null;

  const videoPromptsArr = videoPromptsOutput
    ? getVideoPromptsArrayFromContent(videoPromptsOutput.content)
    : null;

  if (!storyboardScenes || storyboardScenes.length === 0) {
    return NextResponse.json(
      { error: "Missing storyboard. Generate storyboard first." },
      { status: 400 }
    );
  }
  if (!videoPromptsArr || videoPromptsArr.length === 0) {
    return NextResponse.json(
      { error: "Missing video prompts. Generate video prompts first." },
      { status: 400 }
    );
  }

  // Compact payload (token-safe)
  const compactStoryboard = storyboardScenes
    .slice()
    .sort((a, b) => (a.scene ?? 0) - (b.scene ?? 0))
    .map((s) => ({
      scene: s.scene,
      visual: s.visual,
      onScreenText: s.onScreenText,
      voiceover: s.voiceover,
    }));

  // Keep prompts short: we pass only the VEO/RUNWAY/GENERIC blocks if present, else stringify.
  const compactVideoPrompts = videoPromptsArr
    .map((p: any) => ({
      sceneNumber: Number(p?.sceneNumber ?? p?.scene ?? 0),
      title: typeof p?.title === "string" ? p.title : undefined,
      prompt: ensureString(p?.fullPrompt ?? p?.prompt ?? p),
    }))
    .filter((p: any) => p.sceneNumber > 0 && p.prompt.trim().length > 0)
    .sort((a: any, b: any) => a.sceneNumber - b.sceneNumber);

  const system = [
    "You are a senior short-form video editor.",
    "Your job: produce an EDITING SCRIPT (not a narration script).",
    "Return STRICT JSON only (no markdown).",
    "The output must be actionable for CapCut/Premiere: cuts, pacing, text, b-roll, sfx, music cues.",
    "Assume vertical 9:16, 6–8 seconds default unless storyboard implies otherwise.",
  ].join("\n");

  const userPrompt = [
    `Project: ${project.title}`,
    "",
    "INPUT 1) STORYBOARD SCENES (truth):",
    JSON.stringify(compactStoryboard, null, 2),
    "",
    "INPUT 2) VIDEO PROMPTS (for visual intent & camera ideas):",
    JSON.stringify(compactVideoPrompts.slice(0, 12), null, 2),
    "",
    "OUTPUT FORMAT (STRICT JSON):",
    JSON.stringify(
      {
        meta: {
          format: "9:16",
          duration: "6–8s",
          platform: "Reels/Shorts/TikTok",
          editingStyle: "fast paced, punchy",
        },
        timeline: [
          {
            scene: 1,
            time: "0.0–1.2s",
            clip: "What is shown (visual clip description)",
            edit: "Cut/zoom/speed/ramp instructions",
            onScreenText: "Exact on-screen text (short)",
            captions: "caption style note (optional)",
            voiceover: "what VO line plays here (from storyboard)",
            sound: "SFX + music cue",
            notes: "extra editor notes",
          },
        ],
        exportNotes: ["global notes for export, captions, pacing, audio mix"],
        raw: "A human-readable RAW editing plan (short but complete).",
      },
      null,
      2
    ),
    "",
    "Rules:",
    "- Keep each timeline item <= 8 lines worth of content.",
    "- Use storyboard voiceover text exactly (light trimming ok, but don’t invent new claims).",
    "- Make it punchy: frequent cuts, clear text overlays, strong first 1s.",
  ].join("\n");

  try {
    const resp = await callModel(system, userPrompt);
    const rawText = getModelText(resp);

    const parsed = extractJsonObject(rawText);
    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json(
        { error: "Model did not return valid JSON.", raw: rawText.slice(0, 2000) },
        { status: 500 }
      );
    }

    // Ensure raw exists
    if (!parsed.raw || typeof parsed.raw !== "string") {
      parsed.raw = rawText;
    }

    // Save as ProjectOutput (version bump)
    const existing = await prisma.projectOutput.findFirst({
      where: { projectId: project.id, locale, kind: "editing_script" },
      select: { id: true, version: true },
    });

    if (existing) {
      await prisma.projectOutput.update({
        where: { id: existing.id },
        data: {
          content: parsed,
          version: (existing.version ?? 1) + 1,
        },
      });
    } else {
      await prisma.projectOutput.create({
        data: {
          projectId: project.id,
          locale,
          kind: "editing_script",
          version: 1,
          content: parsed,
        } as any,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("EDITING SCRIPT ERROR", err);
    return NextResponse.json(
      { error: "Editing script generation failed.", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}