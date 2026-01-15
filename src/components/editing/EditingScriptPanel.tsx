"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function pillClass(kind: "base" | "good" | "warn" | "blue" = "base") {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium";
  if (kind === "good")
    return `${base} border-emerald-200 bg-emerald-50 text-emerald-900`;
  if (kind === "warn")
    return `${base} border-amber-200 bg-amber-50 text-amber-900`;
  if (kind === "blue")
    return `${base} border-sky-200 bg-sky-50 text-sky-900`;
  return `${base} border-neutral-200 bg-neutral-50 text-neutral-800`;
}

function safeNum(n: any, fallback: number) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function computePacing(sceneCount: number, duration: number) {
  const cutsPerSec = sceneCount / Math.max(duration, 1);
  if (cutsPerSec >= 0.35) return { label: "FAST", kind: "good" as const };
  if (cutsPerSec >= 0.25) return { label: "MEDIUM", kind: "blue" as const };
  return { label: "SLOW", kind: "warn" as const };
}

function parseTimeEnd(time: string) {
  const m = time?.match(/–\s*([\d.]+)\s*s?$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function money(n: number) {
  return `$${Math.round(n * 100) / 100}`;
}

function upper(x: any) {
  return String(x || "").trim().toUpperCase();
}

export default function EditingScriptPanel({
  content,
  defaultExpanded = false,
}: {
  content: any;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showGroups, setShowGroups] = useState(false);

  const meta = content?.meta || {};
  const timelineRaw = Array.isArray(content?.timeline) ? content.timeline : [];

  // ✅ Normalize timeline once (assetType uppercase guarantee)
  const timeline = useMemo(() => {
    return timelineRaw.map((it: any) => ({
      ...it,
      assetType: upper(it?.assetType) || "IMAGE",
    }));
  }, [timelineRaw]);

  const mode = (meta?.mode || "STATIC") as "STATIC" | "DYNAMIC";
  const sceneCount = safeNum(meta?.sceneCount, timeline.length || 0);
  const targetDuration = safeNum(meta?.targetDuration, 22.8);

  const actualEnd = useMemo(() => {
    const last = timeline[timeline.length - 1];
    const t = parseTimeEnd(String(last?.time || ""));
    return t ?? targetDuration;
  }, [timeline, targetDuration]);

  const pacing = computePacing(sceneCount || timeline.length || 1, actualEnd);

  const groupingPlan: number[][] | null =
    Array.isArray(meta?.groupingPlan) ? meta.groupingPlan : null;

  // Cost & mix
  const defaultVideoSceneCost = 3;
  const videoSceneCost = safeNum(meta?.videoSceneCost, defaultVideoSceneCost);

  const computedVideoIndexes = useMemo(() => {
    const idxs: number[] = [];
    for (let i = 0; i < timeline.length; i++) {
      if (timeline[i]?.assetType === "VIDEO") idxs.push(i);
    }
    return idxs;
  }, [timeline]);

  // Smart picks info (prefer meta.smartVideoIndexes, fallback to computed from assetType)
  const placement: string | null = meta?.videoPlacementStrategy || null; // SMART / FIXED / null
  const picksFromMeta: number[] = Array.isArray(meta?.smartVideoIndexes)
    ? meta.smartVideoIndexes
        .map((n: any) => Number(n))
        .filter((n: number) => Number.isFinite(n))
    : [];

  const picks = picksFromMeta.length > 0 ? picksFromMeta : computedVideoIndexes;
  const picksSet = useMemo(() => new Set(picks), [picks]);

  const videoScenes = computedVideoIndexes.length;
  const totalScenes = timeline.length || sceneCount || 0;
  const imageScenes = Math.max(0, totalScenes - videoScenes);
  const estimatedCost = Math.max(
    0,
    safeNum(meta?.estimatedCost, videoScenes * videoSceneCost)
  );

  // Production guide
  type ProdGuideMode = "IMAGE_ONLY" | "BALANCED" | "PREMIUM";
  const productionGuide: ProdGuideMode =
    meta?.productionMode === "BALANCED"
      ? "BALANCED"
      : meta?.productionMode === "PREMIUM"
      ? "PREMIUM"
      : "IMAGE_ONLY";

  const guideContent: Record<
    ProdGuideMode,
    { title: string; description: string; checklist: string[]; costHint: string }
  > = {
    IMAGE_ONLY: {
      title: "Image-Only (Recommended)",
      description:
        "Create a professional short using images only. Motion, rhythm and text do the heavy lifting.",
      checklist: [
        "Use 1 strong image per scene",
        "Apply zoom / pan (6–10%) on every image",
        "Cut every 0.8–1.2s for rhythm",
        "Use punchy on-screen text",
        "Sound effects + music bed are critical",
      ],
      costHint: "$0 — no video AI needed",
    },
    BALANCED: {
      title: "Balanced (Smart Mix)",
      description:
        "Use 1–2 short video scenes for impact, keep the rest in images to control cost.",
      checklist: [
        "Use video only for hook or payoff",
        "Images for explanation scenes",
        "Max 2 video scenes recommended",
        "Fallback to image + motion if needed",
      ],
      costHint: `Typical: ${money(videoSceneCost)} / video scene`,
    },
    PREMIUM: {
      title: "Premium (Video-Heavy)",
      description:
        "High motion and visual richness. Use only if ROI is already validated.",
      checklist: [
        "3+ video scenes",
        "Ensure hook is video-based",
        "Watch generation cost carefully",
        "Not recommended for early testing",
      ],
      costHint: `Typical: ${money(videoSceneCost)} / video scene`,
    },
  };

  const activeGuide = guideContent[productionGuide];

  const wowSubtitle =
    mode === "DYNAMIC"
      ? "V1.2 Dynamic Editing Intelligence"
      : "V1.1 Static Editing Script";

  const costLabel =
    videoScenes > 0 ? `Est. cost: ${money(estimatedCost)}` : "Est. cost: $0";
  const mixLabel =
    totalScenes > 0 ? `${imageScenes} image • ${videoScenes} video` : "mix: n/a";

  // ✅ WOW: auto-scroll + pulse recommended scenes
  const firstRecommendedRef = useRef<HTMLDivElement | null>(null);

  // Reset ref on new content (new generation)
  useEffect(() => {
    firstRecommendedRef.current = null;
  }, [content]);

  // Auto-scroll when Smart Picks exists (or any picks exist)
  useEffect(() => {
    // Scroll only if we have recommended picks
    if (!picks || picks.length === 0) return;

    // Wait next paint so refs are assigned
    const t = setTimeout(() => {
      if (firstRecommendedRef.current) {
        firstRecommendedRef.current.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }, 60);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // change triggers on new output
    content,
    // or if picks change
    meta?.smartVideoIndexes,
    meta?.videoPlacementStrategy,
  ]);

  return (
    <div className="mt-4 rounded-2xl border bg-white">
      {/* WOW CSS (local, zero risk, no global file needed) */}
      <style jsx>{`
        @keyframes sc-pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.45);
          }
          70% {
            box-shadow: 0 0 0 14px rgba(34, 197, 94, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
          }
        }
        .sc-reco-pulse {
          animation: sc-pulse 1.2s ease-out 2;
        }
      `}</style>

      {/* Header */}
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">Editing Script</h3>

            <span className={pillClass(mode === "DYNAMIC" ? "good" : "base")}>
              {mode}
            </span>

            <span className={pillClass("blue")}>
              {sceneCount || timeline.length} scenes
            </span>

            <span className={pillClass("base")}>{actualEnd.toFixed(1)}s</span>

            <span className={pillClass(pacing.kind)}>{pacing.label} pacing</span>

            <span className={pillClass("base")}>{mixLabel}</span>
            <span className={pillClass(videoScenes > 0 ? "warn" : "good")}>
              {costLabel}
            </span>

            {placement && (
              <span className={pillClass("base")}>Picks: {String(placement)}</span>
            )}
          </div>

          <p className="mt-1 text-xs text-neutral-500">{wowSubtitle}</p>

          {picks.length > 0 && (
            <div className="mt-2 text-xs text-neutral-600">
              <span className="font-medium">Recommended video moments:</span>{" "}
              {picks.map((i) => `#${i + 1}`).join(", ")}{" "}
              <span className="text-neutral-400">(timeline scenes)</span>
            </div>
          )}

          {mode === "DYNAMIC" && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={pillClass("good")}>6–9 scènes (contrôlé)</span>
              <span className={pillClass("good")}>21–25s (adaptatif)</span>

              {(groupingPlan ||
                timeline.some((x: any) => Array.isArray(x?.sourceScenes))) && (
                <button
                  type="button"
                  onClick={() => setShowGroups((v) => !v)}
                  className="rounded-full border px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  {showGroups ? "Hide grouping" : "Show grouping"}
                </button>
              )}
            </div>
          )}

          <div className="mt-3 rounded-xl border bg-neutral-50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={pillClass("good")}>{activeGuide.title}</span>
              <span className={pillClass("base")}>{activeGuide.costHint}</span>
              <span className={pillClass(videoScenes > 0 ? "warn" : "good")}>
                {costLabel}
              </span>
              <span className={pillClass("base")}>{mixLabel}</span>
            </div>

            <p className="mt-2 text-sm text-neutral-700">
              {activeGuide.description}
            </p>

            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-600">
              {activeGuide.checklist.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>

            <div className="mt-3 text-xs text-neutral-500">
              Tip: 100% images can still look premium with motion + micro-cuts +
              sound design.
            </div>
          </div>
        </div>

        <button
          type="button"
          className="rounded-xl border px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Hide details" : "Show details"}
        </button>
      </div>

      {/* Grouping */}
      {mode === "DYNAMIC" && showGroups && (
        <div className="border-b bg-neutral-50 p-4">
          <div className="text-xs font-semibold text-neutral-700">
            Scene grouping
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(groupingPlan || []).map((g, idx) => (
              <div key={idx} className="rounded-xl border bg-white p-3">
                <div className="text-xs font-medium text-neutral-700">
                  Output scene {idx + 1}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  sourceScenes:{" "}
                  <span className="font-mono">{JSON.stringify(g)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="p-4">
        {/* ✅ WOW tip above timeline when Smart Picks or picks exist */}
        {picks.length > 0 && (
          <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
            <span className="font-semibold">Tip:</span> No video? Replace that
            moment with an image + zoom/pan + micro-cuts + SFX. Still looks
            premium.
          </div>
        )}

        <div className="text-xs font-semibold text-neutral-700">Timeline</div>

        <div className="mt-3 grid gap-3">
          {timeline.map((it: any, idx: number) => {
            const isVideo = it?.assetType === "VIDEO";
            const isSmartPick = picksSet.has(idx) && (placement === "SMART");
            const isRecommended = isSmartPick || isVideo;

            const setFirstRef = (el: HTMLDivElement | null) => {
              if (!el) return;
              if (!isRecommended) return;
              if (firstRecommendedRef.current) return;
              firstRecommendedRef.current = el;
            };

            return (
              <div
                key={idx}
                ref={setFirstRef}
                className={[
                  "rounded-2xl border p-4 transition",
                  isRecommended
                    ? "border-emerald-300 bg-emerald-50 sc-reco-pulse"
                    : "bg-white",
                ].join(" ")}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold">
                    Scene {it?.scene ?? idx + 1}{" "}
                    <span className="text-neutral-400">•</span>{" "}
                    <span className="text-neutral-600">
                      {String(it?.time || "")}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isRecommended && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                        🔥 Recommended Video Moment
                      </span>
                    )}

                    <span className={pillClass(isVideo ? "warn" : "base")}>
                      {isVideo ? "VIDEO" : "IMAGE"}
                    </span>

                    {isSmartPick && (
                      <span className={pillClass("good")}>Smart Pick</span>
                    )}

                    {Array.isArray(it?.sourceScenes) && (
                      <span className={pillClass(isRecommended ? "good" : "base")}>
                        source: {it.sourceScenes.join(", ")}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-2 text-sm">
                  {it?.clip && (
                    <div>
                      <span className="font-medium">Clip:</span>{" "}
                      <span className="text-neutral-700">{String(it.clip)}</span>
                    </div>
                  )}
                  {it?.edit && (
                    <div>
                      <span className="font-medium">Edit:</span>{" "}
                      <span className="text-neutral-700">{String(it.edit)}</span>
                    </div>
                  )}
                  {it?.onScreenText && (
                    <div>
                      <span className="font-medium">On-screen:</span>{" "}
                      <span className="text-neutral-700">
                        {String(it.onScreenText)}
                      </span>
                    </div>
                  )}
                  {it?.voiceover && (
                    <div>
                      <span className="font-medium">VO:</span>{" "}
                      <span className="text-neutral-700">
                        {String(it.voiceover)}
                      </span>
                    </div>
                  )}
                  {it?.sound && (
                    <div>
                      <span className="font-medium">Sound:</span>{" "}
                      <span className="text-neutral-700">{String(it.sound)}</span>
                    </div>
                  )}
                  {it?.notes && (
                    <div>
                      <span className="font-medium">Notes:</span>{" "}
                      <span className="text-neutral-700">{String(it.notes)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Meta + Export Notes */}
        {expanded && (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border p-4">
              <div className="text-xs font-semibold text-neutral-700">Meta</div>
              <pre className="mt-2 overflow-auto rounded-xl bg-neutral-50 p-3 text-xs text-neutral-800">
                {JSON.stringify(meta, null, 2)}
              </pre>
            </div>

            <div className="rounded-2xl border p-4">
              <div className="text-xs font-semibold text-neutral-700">
                Export notes
              </div>
              <pre className="mt-2 overflow-auto rounded-xl bg-neutral-50 p-3 text-xs text-neutral-800">
                {JSON.stringify(content?.exportNotes || [], null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
