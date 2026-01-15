import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";

type UserPlan = "FREE" | "STARTER" | "PRO" | "AGENCY";
type EditingMode = "STATIC" | "DYNAMIC";
type ProductionMode = "IMAGE_ONLY" | "BALANCED" | "PREMIUM";
type MaxVideoScenes = 0 | 2 | 4;

function parseEmailList(envValue: string | undefined) {
  return (envValue || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
function isSuperAdmin(email: string) {
  const list = parseEmailList(process.env.SHORTCRAFT_SUPER_ADMIN_EMAILS);
  return list.includes((email || "").toLowerCase().trim());
}
function resolvePlanByEmail(email: string): UserPlan {
  const e = (email || "").toLowerCase().trim();
  const pro = parseEmailList(process.env.SHORTCRAFT_PLAN_PRO_EMAILS);
  const starter = parseEmailList(process.env.SHORTCRAFT_PLAN_STARTER_EMAILS);
  const agency = parseEmailList(process.env.SHORTCRAFT_PLAN_AGENCY_EMAILS);
  if (agency.includes(e)) return "AGENCY";
  if (pro.includes(e)) return "PRO";
  if (starter.includes(e)) return "STARTER";
  return "FREE";
}
function getPlanLimits(plan: UserPlan) {
  if (plan === "AGENCY") return { daily: 999, weeklyMax: 999 };
  if (plan === "PRO") return { daily: 20, weeklyMax: 100 };
  if (plan === "STARTER") return { daily: 5, weeklyMax: 25 };
  return { daily: 1, weeklyMax: 3 };
}

function ensureString(v: any) {
  if (typeof v === "string") return v;
  if (v == null) return "";
  try {
    return String(v);
  } catch {
    return "";
  }
}

function stripFences(s: string) {
  return (s || "")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

/**
 * ✅ JSON Repair (critical):
 * - Extract first {...} block
 * - Remove trailing commas
 * - Normalize quotes a bit
 */
function extractFirstJsonObject(text: string) {
  const s = stripFences(text || "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return s;
  return s.slice(start, end + 1);
}
function removeTrailingCommas(jsonLike: string) {
  // remove trailing commas before } or ]
  return jsonLike.replace(/,\s*([}\]])/g, "$1");
}
function safeJsonParse(text: string) {
  try {
    const extracted = extractFirstJsonObject(text);
    const cleaned = removeTrailingCommas(extracted);
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function tzOffsetMinutes() {
  return -new Date().getTimezoneOffset();
}
function startOfDayUTC(localNow: Date) {
  const d = new Date(localNow);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
function startOfWeekUTC(localNow: Date) {
  const d = new Date(localNow);
  const dow = d.getUTCDay();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

function getStoryboardScenesFromContent(content: any) {
  const arr =
    (Array.isArray(content?.scenes) && content.scenes) ||
    (Array.isArray(content?.storyboard?.scenes) && content.storyboard.scenes) ||
    (Array.isArray(content) && content) ||
    null;
  if (!Array.isArray(arr)) return null;

  return arr
    .map((s: any, i: number) => ({
      scene: Number(s?.scene ?? i + 1),
      visual: ensureString(s?.visual),
      onScreenText: ensureString(s?.onScreenText),
      voiceover: ensureString(s?.voiceover),
    }))
    .filter((x: any) => x.voiceover || x.visual || x.onScreenText);
}

function getVideoPromptsArrayFromContent(content: any) {
  const arr =
    (Array.isArray(content?.prompts) && content.prompts) ||
    (Array.isArray(content?.videoPrompts) && content.videoPrompts) ||
    (Array.isArray(content) && content) ||
    null;
  if (!Array.isArray(arr)) return null;

  return arr
    .map((p: any, i: number) => ({
      scene: Number(p?.scene ?? i + 1),
      prompt: ensureString(p?.prompt || p?.visualPrompt || p?.scenePrompt),
      camera: ensureString(p?.camera),
      notes: ensureString(p?.notes),
    }))
    .filter((x: any) => x.prompt || x.camera || x.notes);
}

function fmt1(n: number) {
  return Math.round(n * 10) / 10;
}
function makeTimeRanges(count: number, totalSec: number) {
  const safeCount = Math.max(1, count);
  const dur = Math.max(1, totalSec);
  const step = dur / safeCount;
  const out: string[] = [];
  for (let i = 0; i < safeCount; i++) {
    const a = fmt1(i * step);
    const b = fmt1((i + 1) * step);
    out.push(`${a}–${b}s`);
  }
  return out;
}
function normalizeEditingScriptTimes(payload: any, count: number, totalSec: number) {
  const times = makeTimeRanges(count, totalSec);
  const tl = Array.isArray(payload?.timeline) ? payload.timeline : [];
  const next = tl.map((it: any, idx: number) => ({
    ...it,
    time: times[idx] || it?.time || "",
  }));
  return { ...payload, timeline: next };
}

function ensureTimelineMatchesStoryboard(timeline: any[], storyboard: any[]) {
  const sbLen = storyboard.length;
  const tl = Array.isArray(timeline) ? timeline : [];
  const next: any[] = [];
  for (let i = 0; i < sbLen; i++) {
    const item = tl[i] || {};
    next.push({
      ...item,
      scene: i + 1,
      voiceover: ensureString(item?.voiceover || storyboard[i]?.voiceover),
      onScreenText: ensureString(item?.onScreenText || storyboard[i]?.onScreenText),
      clip: ensureString(item?.clip),
      edit: ensureString(item?.edit),
      sound: ensureString(item?.sound),
      notes: ensureString(item?.notes),
      // keep any assetType, but normalize later
      assetType: ensureString(item?.assetType),
      sourceScenes: item?.sourceScenes,
    });
  }
  return next;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function hashToUnitFloat(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = h >>> 0;
  return u / 4294967295;
}

function buildDynamicPlan(storyboardLen: number, seed: string) {
  const minScenes = Math.min(6, storyboardLen);
  const maxScenes = Math.min(9, storyboardLen);

  const r1 = hashToUnitFloat(seed + "|scenes");
  const sceneCount = clamp(
    Math.round(minScenes + r1 * (maxScenes - minScenes)),
    minScenes,
    maxScenes
  );

  const r2 = hashToUnitFloat(seed + "|dur");
  const rawDur = 21 + r2 * 4;
  const targetDuration = Math.round(rawDur * 2) / 2;

  const groups: number[][] = [];
  const mergesNeeded = storyboardLen - sceneCount;
  const base: number[][] = [];
  for (let i = 1; i <= storyboardLen; i++) base.push([i]);

  const mergeIndexes: number[] = [];
  for (let k = 0; k < mergesNeeded; k++) {
    const r = hashToUnitFloat(seed + "|merge|" + k);
    mergeIndexes.push(Math.floor(r * Math.max(1, base.length - 1)));
  }

  mergeIndexes
    .sort((a, b) => a - b)
    .reverse()
    .forEach((idx) => {
      const i = clamp(idx, 0, base.length - 2);
      const merged = [...base[i], ...base[i + 1]];
      base.splice(i, 2, merged);
    });

  for (const g of base) groups.push(g);
  return { sceneCount, targetDuration, groups };
}

/**
 * ✅ Smart picks by timeline index (hook/payoff/anchors)
 * Deterministic and perfect for V1.
 */
function pickVideoSceneIndexes(timelineLen: number, maxVideoScenes: MaxVideoScenes): number[] {
  if (maxVideoScenes === 0) return [];
  if (timelineLen <= 1) return maxVideoScenes > 0 ? [0] : [];

  const idxs: number[] = [];
  idxs.push(0); // hook
  if (maxVideoScenes >= 2) idxs.push(timelineLen - 1); // payoff
  if (maxVideoScenes >= 4) {
    const a = Math.floor(timelineLen * 0.33);
    const b = Math.floor(timelineLen * 0.66);
    if (!idxs.includes(a)) idxs.push(a);
    if (!idxs.includes(b)) idxs.push(b);
  }
  return Array.from(new Set(idxs)).sort((x, y) => x - y).slice(0, maxVideoScenes);
}

function normalizeAssetType(v: any) {
  const s = ensureString(v).trim().toUpperCase();
  if (s === "VIDEO") return "VIDEO";
  return "IMAGE";
}

/**
 * ✅ HARD enforce:
 * - compute SMART picks from maxVideoScenes
 * - force those indexes to VIDEO (unless IMAGE_ONLY)
 * - force all others to IMAGE if we exceed max
 * Also returns smartVideoIndexes used.
 */
function enforceSmartVideoPicks(
  timeline: any[],
  productionMode: ProductionMode,
  maxVideoScenes: MaxVideoScenes
) {
  const tl = Array.isArray(timeline) ? timeline : [];
  const normalized = tl.map((it) => ({
    ...it,
    assetType: normalizeAssetType(it?.assetType),
  }));

  if (productionMode === "IMAGE_ONLY" || maxVideoScenes === 0) {
    return {
      timeline: normalized.map((it) => ({ ...it, assetType: "IMAGE" })),
      smartVideoIndexes: [] as number[],
    };
  }

  const picks = pickVideoSceneIndexes(normalized.length, maxVideoScenes);
  const set = new Set(picks);

  const forced = normalized.map((it, idx) => ({
    ...it,
    assetType: set.has(idx) ? "VIDEO" : "IMAGE",
  }));

  return { timeline: forced, smartVideoIndexes: picks };
}

async function findLatestOutputLocaleFirst(projectId: string, kind: string, locale: string) {
  const exact = await prisma.projectOutput.findFirst({
    where: { projectId, kind, locale },
    orderBy: { version: "desc" },
  });
  if (exact) return exact;

  return await prisma.projectOutput.findFirst({
    where: { projectId, kind },
    orderBy: [{ locale: "desc" }, { version: "desc" }],
  });
}

async function callModel(system: string, user: string) {
  return await openai.responses.create({
    model: process.env.OPENAI_MODEL_EDITING_SCRIPT || "gpt-4.1-mini",
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
}

function extractText(res: any) {
  const outText = (res as any)?.output_text;
  if (typeof outText === "string" && outText.trim()) return outText;

  const output = (res as any)?.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c?.type === "output_text" && typeof c?.text === "string") return c.text;
          if (c?.type === "text" && typeof c?.text === "string") return c.text;
        }
      }
    }
  }
  return "";
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const email = session?.user?.email || "";
    const userId = (session?.user as any)?.id;

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const superAdmin = isSuperAdmin(email);
    const quotaDisabled = process.env.SHORTCRAFT_DISABLE_QUOTA === "1";
    const quotaBypass = superAdmin || quotaDisabled;

    const plan = resolvePlanByEmail(email);
    const limits = getPlanLimits(plan);

    const body = await req.json().catch(() => ({}));
    const projectId = body?.projectId as string | undefined;
    const locale = (body?.locale as string | undefined) || "en";

    const mode: EditingMode = body?.mode === "DYNAMIC" ? "DYNAMIC" : "STATIC";

    const rawMax = Number(body?.maxVideoScenes);
    const maxVideoScenes: MaxVideoScenes = rawMax === 2 ? 2 : rawMax === 4 ? 4 : 0;

    const rawProd = String(body?.productionMode || "").toUpperCase();
    const productionMode: ProductionMode =
      rawProd === "BALANCED"
        ? "BALANCED"
        : rawProd === "PREMIUM"
        ? "PREMIUM"
        : maxVideoScenes === 0
        ? "IMAGE_ONLY"
        : maxVideoScenes <= 2
        ? "BALANCED"
        : "PREMIUM";

    const videoSceneCost =
      Number.isFinite(Number(body?.videoSceneCost)) ? Number(body?.videoSceneCost) : 3;

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true, title: true, contentLanguage: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // ✅ Quota checks
    if (!quotaBypass && plan === "FREE") {
      const now = new Date();
      const offsetMin = tzOffsetMinutes();
      const localNow = new Date(now.getTime() + offsetMin * 60 * 1000);

      const dayStartLocal = startOfDayUTC(localNow);
      const weekStartLocal = startOfWeekUTC(localNow);

      const dayStartUTC = new Date(dayStartLocal.getTime() - offsetMin * 60 * 1000);
      const weekStartUTC = new Date(weekStartLocal.getTime() - offsetMin * 60 * 1000);

      const usedToday = await prisma.projectOutput.count({
        where: { kind: "editing_script", createdAt: { gte: dayStartUTC }, project: { userId } },
      });

      const usedThisWeek = await prisma.projectOutput.count({
        where: { kind: "editing_script", createdAt: { gte: weekStartUTC }, project: { userId } },
      });

      if (usedToday >= limits.daily || usedThisWeek >= limits.weeklyMax) {
        return NextResponse.json(
          {
            error: "Quota exceeded",
            code: "QUOTA_EXCEEDED",
            plan,
            limits,
            used: { today: usedToday, week: usedThisWeek },
          },
          { status: 429 }
        );
      }
    }

    // ✅ Dependencies
    const storyboardOutput = await findLatestOutputLocaleFirst(projectId, "storyboard", locale);
    const videoPromptsOutput = await findLatestOutputLocaleFirst(projectId, "video_prompts", locale);

    const storyboardScenes = getStoryboardScenesFromContent(storyboardOutput?.content);
    const videoPromptsArray = getVideoPromptsArrayFromContent(videoPromptsOutput?.content);

    if (!storyboardScenes || storyboardScenes.length === 0) {
      return NextResponse.json(
        { error: "Missing storyboard. Generate storyboard first." },
        { status: 400 }
      );
    }

    const safeVideoPromptsArray = Array.isArray(videoPromptsArray) ? videoPromptsArray : [];

    const compactStoryboard = storyboardScenes.map((s, i) => ({
      scene: s.scene ?? i + 1,
      visual: ensureString(s.visual),
      onScreenText: ensureString(s.onScreenText),
      voiceover: ensureString(s.voiceover),
    }));

    const compactVideoPrompts = safeVideoPromptsArray.slice(0, 12).map((p: any, i: number) => ({
      scene: p?.scene ?? i + 1,
      prompt: ensureString(p?.prompt),
      camera: ensureString(p?.camera),
      notes: ensureString(p?.notes),
    }));

    // Next version
    const last = await prisma.projectOutput.findFirst({
      where: { projectId, kind: "editing_script", locale },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (last?.version || 0) + 1;

    // Deterministic dynamic plan
    const seed = `${projectId}|${nextVersion}|${locale}|${mode}|${maxVideoScenes}|${productionMode}`;
    const dynPlan = buildDynamicPlan(compactStoryboard.length, seed);
    const targetDuration = mode === "DYNAMIC" ? dynPlan.targetDuration : 22.5;

    // ✅ Schema hint (no trailing commas!)
    const schemaHint = {
      meta: {
        mode,
        targetDuration,
        style: "fast-paced, clarity-first",
        productionMode,
        maxVideoScenes,
        videoSceneCost,
        ...(mode === "DYNAMIC"
          ? { sceneCount: dynPlan.sceneCount, groupingPlan: dynPlan.groups }
          : {}),
        // tells UI and backend what we intend:
        videoPlacementStrategy: "SMART",
      },
      timeline: [
        {
          scene: 1,
          time: "0.0–3.0s",
          assetType: "IMAGE",
          ...(mode === "DYNAMIC" ? { sourceScenes: [1, 2] } : {}),
          clip: "What to show",
          edit: "Cuts/motion instructions",
          onScreenText: "Short text",
          voiceover: "From storyboard only",
          sound: "SFX + music cue",
          notes: "Editor notes",
        },
      ],
      exportNotes: ["global notes"],
    };

    const system = [
      "You are a senior short-form video editor.",
      "Return STRICT JSON only (no markdown, no comments).",
      "Do NOT include trailing commas in JSON.",
      "Aspect ratio: 9:16.",
      "Each timeline item MUST include assetType: IMAGE or VIDEO.",
      `PRODUCTION: productionMode=${productionMode}, maxVideoScenes=${maxVideoScenes} (<=).`,
      "Voiceover MUST be based ONLY on storyboard voiceover (do not invent new VO).",
      mode === "DYNAMIC"
        ? [
            "MODE: DYNAMIC.",
            "Use sceneCount provided. Use groupingPlan.",
            "Each timeline item MUST include sourceScenes exactly matching the grouping plan entry.",
          ].join("\n")
        : [
            "MODE: STATIC.",
            "Timeline MUST have exactly one item per storyboard scene.",
          ].join("\n"),
    ].join("\n");

    const userPrompt = [
      `Project: ${project.title}`,
      "",
      "STORYBOARD (truth source):",
      JSON.stringify(compactStoryboard, null, 2),
      "",
      "VIDEO PROMPTS (OPTIONAL):",
      JSON.stringify(compactVideoPrompts, null, 2),
      "",
      "OUTPUT SCHEMA EXAMPLE:",
      JSON.stringify(schemaHint, null, 2),
      "",
      "REMINDERS:",
      "- Return JSON only.",
      "- No trailing commas.",
      "- Keep VO aligned to storyboard only.",
    ].join("\n");

    const response = await callModel(system, userPrompt);
    const raw = extractText(response);
    const parsed = safeJsonParse(raw);

    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json(
        {
          error: "Model returned invalid JSON.",
          details: extractFirstJsonObject(raw || "").slice(0, 2000),
        },
        { status: 502 }
      );
    }

    let normalized: any = parsed;

    // Normalize timeline structure + times
    if (mode === "STATIC") {
      normalized.timeline = ensureTimelineMatchesStoryboard(parsed?.timeline, compactStoryboard);
      normalized = normalizeEditingScriptTimes(normalized, compactStoryboard.length, targetDuration);
    } else {
      const desired = dynPlan.sceneCount;
      const tl = Array.isArray(parsed?.timeline) ? parsed.timeline : [];
      let fixed = tl.slice(0, desired);
      while (fixed.length < desired) {
        fixed.push({
          scene: fixed.length + 1,
          time: "",
          assetType: "IMAGE",
          sourceScenes: dynPlan.groups[fixed.length] || [],
          clip: "",
          edit: "",
          onScreenText: "",
          voiceover: "",
          sound: "",
          notes: "",
        });
      }
      normalized.timeline = fixed;
      normalized = normalizeEditingScriptTimes(normalized, desired, targetDuration);
    }

    // ✅ SMART PICKS: enforce video placement regardless of model output
    const enforced = enforceSmartVideoPicks(
      normalized.timeline,
      productionMode,
      maxVideoScenes
    );
    normalized.timeline = enforced.timeline;

    const mix = {
      image: normalized.timeline.filter((x: any) => normalizeAssetType(x?.assetType) !== "VIDEO").length,
      video: normalized.timeline.filter((x: any) => normalizeAssetType(x?.assetType) === "VIDEO").length,
    };

    normalized.meta = {
      ...(normalized.meta || {}),
      mode,
      targetDuration,
      sceneCount: Array.isArray(normalized.timeline) ? normalized.timeline.length : 0,
      style: normalized?.meta?.style || "fast-paced, clarity-first",
      productionMode,
      maxVideoScenes,
      videoSceneCost,
      estimatedCost: Math.max(0, mix.video) * videoSceneCost,
      mix,
      videoPlacementStrategy: "SMART",
      smartVideoIndexes: enforced.smartVideoIndexes,
      ...(mode === "DYNAMIC" ? { groupingPlan: dynPlan.groups } : {}),
      usedPrereqs: {
        storyboardLocale: (storyboardOutput as any)?.locale || null,
        videoPromptsLocale: (videoPromptsOutput as any)?.locale || null,
      },
    };

    await prisma.projectOutput.create({
      data: {
        projectId,
        kind: "editing_script",
        locale,
        version: nextVersion,
        content: normalized as any,
      },
    });

    return NextResponse.json({ ok: true, mode, version: nextVersion });
  } catch (err: any) {
    console.error("EDITING SCRIPT ERROR", err);
    return NextResponse.json(
      { error: "Editing script generation failed.", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
