import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";

type UserPlan = "FREE" | "STARTER" | "PRO" | "STUDIO";

/**
 * V1.1 plan resolution (no DB migration):
 * - Defaults to FREE
 * - You can override by email allowlists in env vars:
 *   SHORTCRAFT_STARTER_EMAILS, SHORTCRAFT_PRO_EMAILS, SHORTCRAFT_STUDIO_EMAILS
 *   (comma-separated emails)
 */
function resolvePlanByEmail(email: string): UserPlan {
  const e = (email || "").toLowerCase().trim();
  const list = (v?: string) =>
    (v || "")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);

  const studio = new Set(list(process.env.SHORTCRAFT_STUDIO_EMAILS));
  const pro = new Set(list(process.env.SHORTCRAFT_PRO_EMAILS));
  const starter = new Set(list(process.env.SHORTCRAFT_STARTER_EMAILS));

  if (studio.has(e)) return "STUDIO";
  if (pro.has(e)) return "PRO";
  if (starter.has(e)) return "STARTER";
  return "FREE";
}

function getPlanLimits(plan: UserPlan) {
  // quota unit = "short output" for generation endpoints (here: editing_script)
  if (plan === "STUDIO") return { perDay: 50, perWeek: 9999 };
  if (plan === "PRO") return { perDay: 20, perWeek: 9999 };
  if (plan === "STARTER") return { perDay: 5, perWeek: 9999 };
  // FREE: 1/day AND max 3/week
  return { perDay: 1, perWeek: 3 };
}

// ---------- helpers: JSON parsing ----------
function stripFences(raw: string) {
  return (raw || "").trim().replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "");
}

function safeJsonParse(raw: string) {
  const cleaned = stripFences(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// ---------- timezone helpers (quota windows) ----------
function tzOffsetMinutes(date: Date, timeZone: string): number {
  // Intl timeZoneName: 'shortOffset' => e.g. "GMT-05:00"
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const tzName = parts.find((p) => p.type === "timeZoneName")?.value || "GMT+00:00";
  const m = tzName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const hh = Number(m[2] || 0);
  const mm = Number(m[3] || 0);
  return sign * (hh * 60 + mm);
}

function startOfDayUTC(timeZone: string) {
  // 00:00 in the provided IANA timezone, returned as a UTC Date.
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const y = Number(parts.find((p) => p.type === "year")?.value || 1970);
  const mo = Number(parts.find((p) => p.type === "month")?.value || 1);
  const d = Number(parts.find((p) => p.type === "day")?.value || 1);

  // Start from UTC midnight, then subtract tz offset at that moment in the target timezone.
  const utcMidnight = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
  const offsetMin = tzOffsetMinutes(utcMidnight, timeZone);
  return new Date(utcMidnight.getTime() - offsetMin * 60_000);
}

function startOfWeekUTC(timeZone: string) {
  // ISO week starts Monday in the target timezone.
  const dayStart = startOfDayUTC(timeZone);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).formatToParts(dayStart);

  const wdStr = (parts.find((p) => p.type === "weekday")?.value || "").toLowerCase();
  const map: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
  const iso = map[wdStr.slice(0, 3)] || 1;

  const res = new Date(dayStart);
  res.setUTCDate(res.getUTCDate() - (iso - 1));
  return res;
}

type StoryboardScene = {
  scene: number;
  onScreenText: string;
  voiceover: string;
  visual: string;
};

function getStoryboardScenesFromContent(content: any): StoryboardScene[] | null {
  if (!content) return null;
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

/**
 * Locale-first output fetch:
 * 1) Try current locale (latest version)
 * 2) Fallback any locale (latest version)
 */
async function findLatestOutputLocaleFirst(projectId: string, locale: string, kind: string, select: any) {
  // 1) Locale-first
  const local = await prisma.projectOutput.findFirst({
    where: { projectId, locale, kind },
    orderBy: { version: "desc" },
    select,
  });
  if (local) return local;

  // 2) Fallback any locale (latest version)
  return prisma.projectOutput.findFirst({
    where: { projectId, kind },
    orderBy: { version: "desc" },
    select,
  });
}

// ---------- helpers: OpenAI call (supports both APIs) ----------
async function callModel(system: string, user: string) {
  const anyOpenai = openai as any;

  // Responses API (preferred)
  if (anyOpenai?.responses?.create) {
    return await anyOpenai.responses.create({
      model: process.env.OPENAI_MODEL_EDITING_SCRIPT || process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
    });
  }

  // Chat Completions API fallback
  if (anyOpenai?.chat?.completions?.create) {
    return await anyOpenai.chat.completions.create({
      model: process.env.OPENAI_MODEL_EDITING_SCRIPT || process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
    });
  }

  throw new Error("OpenAI client not configured (responses.create or chat.completions.create missing).");
}

function extractText(resp: any): string {
  // Responses API shape
  if (resp?.output_text && typeof resp.output_text === "string") return resp.output_text;

  // Some SDKs put text in output array
  if (Array.isArray(resp?.output)) {
    const texts: string[] = [];
    for (const item of resp.output) {
      if (item?.type === "message" && Array.isArray(item?.content)) {
        for (const c of item.content) {
          if (c?.type === "output_text" && typeof c.text === "string") texts.push(c.text);
          if (c?.type === "text" && typeof c.text === "string") texts.push(c.text);
        }
      }
    }
    if (texts.length) return texts.join("\n");
  }

  // Chat Completions shape
  const cc = resp?.choices?.[0]?.message?.content;
  if (typeof cc === "string" && cc.trim()) return cc.trim();

  return "";
}

// ---------- route ----------
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

  // ---------- quota (V1.1) ----------
  const plan = resolvePlanByEmail(session.user.email);
  const limits = getPlanLimits(plan);

  // Count usage for this user across ALL projects for the quota windows.
  // We count ONLY the heavy "short output" generations (editing_script and final script).
  const countKinds = ["editing_script", "script"];

  const tz = "America/Montreal";
  const dayStart = startOfDayUTC(tz);
  const weekStart = startOfWeekUTC(tz);

  const userProjectIds = await prisma.project.findMany({
    where: { userId: user.id },
    select: { id: true },
  });
  const pid = userProjectIds.map((p) => p.id);

  const usedToday = await prisma.projectOutput.count({
    where: {
      projectId: { in: pid },
      kind: { in: countKinds },
      createdAt: { gte: dayStart },
    },
  });

  const usedThisWeek = await prisma.projectOutput.count({
    where: {
      projectId: { in: pid },
      kind: { in: countKinds },
      createdAt: { gte: weekStart },
    },
  });

  if (usedToday >= limits.perDay || usedThisWeek >= limits.perWeek) {
    const remainingToday = Math.max(0, limits.perDay - usedToday);
    const remainingWeek = Math.max(0, limits.perWeek - usedThisWeek);
    return NextResponse.json(
      {
        error: "Quota exceeded",
        code: "QUOTA_EXCEEDED",
        plan,
        limits,
        usage: { today: usedToday, week: usedThisWeek },
        remaining: { today: remainingToday, week: remainingWeek },
        message:
          plan === "FREE"
            ? "Quota Free atteint. Limite: 1 génération/jour et max 3/semaine."
            : "Quota atteint pour votre forfait. Réessayez plus tard ou upgrade.",
      },
      { status: 429 }
    );
  }

  // Load prereqs (locale-first + fallback)
  const storyboardOutput = await findLatestOutputLocaleFirst(project.id, locale, "storyboard", {
    content: true,
    version: true,
    locale: true,
  });

  const videoPromptsOutput = await findLatestOutputLocaleFirst(project.id, locale, "video_prompts", {
    content: true,
    version: true,
    locale: true,
  });

  const storyboardScenes = storyboardOutput
    ? getStoryboardScenesFromContent((storyboardOutput as any).content)
    : null;

  const videoPromptsArr = videoPromptsOutput
    ? getVideoPromptsArrayFromContent((videoPromptsOutput as any).content)
    : null;

  if (!storyboardScenes || !storyboardScenes.length) {
    return NextResponse.json(
      { error: "Missing storyboard. Generate storyboard first." },
      { status: 400 }
    );
  }

  if (!videoPromptsArr || !videoPromptsArr.length) {
    return NextResponse.json(
      { error: "Missing video prompts. Generate video prompts first." },
      { status: 400 }
    );
  }

  // Compact inputs to reduce tokens
  const compactStoryboard = storyboardScenes
    .slice()
    .sort((a, b) => (a.scene ?? 0) - (b.scene ?? 0))
    .map((s) => ({
      scene: s.scene,
      visual: s.visual,
      onScreenText: s.onScreenText,
      voiceover: s.voiceover,
    }));

  const compactVideoPrompts = videoPromptsArr
    .map((p: any) => ({
      sceneNumber: Number(p?.sceneNumber ?? p?.scene ?? 0),
      title: typeof p?.title === "string" ? p.title : undefined,
      prompt: ensureString(p?.fullPrompt ?? p?.prompt ?? p),
    }))
    .filter((p: any) => p.sceneNumber > 0 && p.prompt.trim().length > 0)
    .sort((a: any, b: any) => a.sceneNumber - b.sceneNumber)
    .slice(0, 12);

  // Next version for editing_script
  const latest = await prisma.projectOutput.findFirst({
    where: { projectId: project.id, kind: "editing_script", locale },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latest?.version || 0) + 1;

  const system = [
    "You are a senior short-form video editor.",
    "Your job: produce an EDITING SCRIPT (not a narration script).",
    "Return STRICT JSON only (no markdown).",
    "Output must be actionable for CapCut/Premiere: cuts, pacing, text, b-roll, sfx, music cues.",
    "Assume vertical 9:16, TARGET duration 22–23 seconds (must land in that range).",
    "Keep voiceover lines aligned with the storyboard voiceover (do not invent new VO).",
  ].join("\n");

  const userPrompt = [
    `Project: ${project.title}`,
    "",
    "INPUT 1) STORYBOARD (truth source, keep VO aligned):",
    JSON.stringify(compactStoryboard, null, 2),
    "",
    "INPUT 2) VIDEO PROMPTS (for visual references / b-roll ideas):",
    JSON.stringify(compactVideoPrompts, null, 2),
    "",
    "OUTPUT REQUIREMENTS:",
    "- Return STRICT JSON matching this schema:",
    JSON.stringify(
      {
        meta: {
          targetDuration: "22–23s",
          style: "fast-paced, clarity-first",
          aspect: "9:16",
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
        exportNotes: ["global notes for export, captions, pacing, audio, etc."],
      },
      null,
      2
    ),
    "",
    "Hard rules:",
    "- Total timeline must end between 22.0s and 23.0s.",
    "- Use micro-cuts and pattern interrupts every 1–2 seconds.",
    "- On-screen text must be short, high-contrast, and punchy.",
    "- Add at least 4 SFX cues and 2 music moments (drop/raise).",
  ].join("\n");

  try {
    const resp = await callModel(system, userPrompt);
    const raw = extractText(resp);

    const parsed = safeJsonParse(raw);
    if (!parsed) {
      return NextResponse.json(
        {
          error: "Model returned invalid JSON.",
          details: raw?.slice(0, 800) || "No content",
        },
        { status: 500 }
      );
    }

    const saved = await prisma.projectOutput.create({
      data: {
        projectId: project.id,
        locale,
        kind: "editing_script",
        content: parsed,
        version: nextVersion,
      },
      select: {
        id: true,
        kind: true,
        version: true,
        locale: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      output: saved,
      version: nextVersion,
      usedPrereqs: {
        storyboardLocale: (storyboardOutput as any)?.locale,
        videoPromptsLocale: (videoPromptsOutput as any)?.locale,
      },
    });
  } catch (err: any) {
    console.error("EDITING SCRIPT ERROR", err);
    return NextResponse.json(
      { error: "Editing script generation failed.", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
