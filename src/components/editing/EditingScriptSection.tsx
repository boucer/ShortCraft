"use client";

import { useMemo, useState } from "react";
import EditingScriptPanel from "./EditingScriptPanel";
import Link from "next/link";

type MaxVideoScenes = 0 | 2 | 4;
type ProductionMode = "IMAGE_ONLY" | "BALANCED" | "PREMIUM";
type VideoPlacementStrategy = "SMART" | "FIXED";

function money(n: number) {
  return `$${Math.round(n * 100) / 100}`;
}

export default function EditingScriptSection({
  projectId,
  locale,
  initialContent,
  versionLabel,
  canGenerate,
}: {
  projectId: string;
  locale: string;
  initialContent: any | null;
  versionLabel: string;
  canGenerate: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [content] = useState<any | null>(initialContent);
  const [quotaError, setQuotaError] = useState<{
    message?: string;
    plan?: string;
    remaining?: { today?: number; week?: number };
  } | null>(null);

  // ✅ V1.2 toggle (default off = V1.1 behavior)
  const [dynamicMode, setDynamicMode] = useState(false);

  // ✅ Budget knob (0/2/4 video scenes)
  const [maxVideoScenes, setMaxVideoScenes] = useState<MaxVideoScenes>(0);

  // ✅ Smart Picks toggle (default ON when videos > 0)
  const [smartPicks, setSmartPicks] = useState(true);

  // UI-only estimate (rough)
  const videoSceneCost = 3;

  const productionMode: ProductionMode = useMemo(() => {
    if (maxVideoScenes === 0) return "IMAGE_ONLY";
    if (maxVideoScenes <= 2) return "BALANCED";
    return "PREMIUM";
  }, [maxVideoScenes]);

  const estimatedCost = useMemo(() => {
    return maxVideoScenes * videoSceneCost;
  }, [maxVideoScenes]);

  // Preview copy for the “Ce que je ferais…” card (no storyboard needed)
  const smartPreview = useMemo(() => {
    if (maxVideoScenes === 0) {
      return {
        title: "Ce que je ferais (0 vidéo)",
        bullets: [
          "100% images + motion (zoom/pan 6–10%)",
          "Micro-cuts + on-screen text punchy",
          "Sound design agressif (SFX + bed)",
          "Résultat : pro + viral sans coût vidéo",
        ],
      };
    }
    if (maxVideoScenes === 2) {
      return {
        title: "Ce que je ferais (2 vidéos)",
        bullets: [
          "VIDEO sur le Hook (première scène)",
          "VIDEO sur le Payoff (dernière scène)",
          "Images (motion) sur le reste pour contrôler le budget",
          "Le backend choisit automatiquement les meilleurs moments",
        ],
      };
    }
    return {
      title: "Ce que je ferais (4 vidéos)",
      bullets: [
        "VIDEO sur Hook + Payoff",
        "VIDEO sur 2 “moments forts” au milieu (scoring storyboard)",
        "Images (motion) sur le reste",
        "Le backend maximise l’impact sans dépasser ton budget",
      ],
    };
  }, [maxVideoScenes]);

  const videoPlacementStrategy: VideoPlacementStrategy =
    maxVideoScenes === 0 ? "FIXED" : smartPicks ? "SMART" : "FIXED";

  async function generate() {
    if (loading) return;
    setLoading(true);
    setQuotaError(null);

    try {
      const res = await fetch(`/api/generate/editing-script`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          locale,
          mode: dynamicMode ? "DYNAMIC" : "STATIC",
          productionMode,
          maxVideoScenes,
          videoPlacementStrategy, // ✅ NEW: SMART vs FIXED
          videoSceneCost, // ✅ optional hint for meta
        }),
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        if (data?.code === "QUOTA_EXCEEDED") {
          setQuotaError({
            message: data.message,
            plan: data.plan,
            remaining: data.remaining,
          });
          return;
        }

        const errTitle =
          data?.error ||
          (text && text.length < 300 ? text : "") ||
          `Request failed (${res.status})`;

        const errDetails = data?.details
          ? `\n\nDETAILS:\n${String(data.details).slice(0, 2000)}`
          : "";

        alert(`${errTitle}${errDetails}`);
        return;
      }

      window.location.reload();
    } catch (e: any) {
      alert(e?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Editing script</h2>
          <div className="mt-1 text-xs text-neutral-500">{versionLabel}</div>
          <div className="mt-1 text-xs text-neutral-400">
            Conversion de langue <strong>n’affecte pas votre quota</strong>
          </div>

          {/* ✅ V1.2 toggle */}
          <label className="mt-3 inline-flex items-center gap-2 text-xs text-neutral-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-neutral-300"
              checked={dynamicMode}
              onChange={(e) => setDynamicMode(e.target.checked)}
              disabled={loading}
            />
            Dynamic (V1.2) — 6–9 scènes, 21–25s
          </label>

          {/* ✅ Budget knob */}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-neutral-600">
            <span className="font-medium text-neutral-700">
              Max video scenes:
            </span>

            <div className="inline-flex overflow-hidden rounded-xl border bg-white">
              {[0, 2, 4].map((v) => {
                const val = v as MaxVideoScenes;
                const active = maxVideoScenes === val;
                return (
                  <button
                    key={val}
                    type="button"
                    disabled={loading}
                    onClick={() => setMaxVideoScenes(val)}
                    className={[
                      "px-3 py-1.5 text-xs",
                      active
                        ? "bg-neutral-900 text-white"
                        : "bg-white text-neutral-700 hover:bg-neutral-50",
                    ].join(" ")}
                    title={
                      val === 0
                        ? "Image-only (recommended)"
                        : val === 2
                        ? "Balanced mix"
                        : "Premium (video-heavy)"
                    }
                  >
                    {val}
                  </button>
                );
              })}
            </div>

            <span className="rounded-full border bg-neutral-50 px-2.5 py-1 text-xs text-neutral-700">
              Mode:{" "}
              {productionMode === "IMAGE_ONLY"
                ? "Image-only"
                : productionMode === "BALANCED"
                ? "Balanced"
                : "Premium"}
            </span>

            <span
              className={[
                "rounded-full border px-2.5 py-1 text-xs",
                estimatedCost > 0
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900",
              ].join(" ")}
              title="Simple estimate: maxVideoScenes × $3 (adjustable later)"
            >
              Est. cost: {money(estimatedCost)}
            </span>

            <span className="text-neutral-400">
              (Tu peux faire 100% images + motion + SFX.)
            </span>
          </div>

          {/* ✅ Smart Picks toggle + WOW card */}
          <div className="mt-3 rounded-xl border bg-neutral-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-semibold text-neutral-800">
                WOW — “Ce que je ferais à ta place”
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-neutral-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-neutral-300"
                  checked={maxVideoScenes === 0 ? false : smartPicks}
                  onChange={(e) => setSmartPicks(e.target.checked)}
                  disabled={loading || maxVideoScenes === 0}
                />
                Smart Picks (recommended)
              </label>
            </div>

            <div className="mt-2 text-sm font-medium text-neutral-800">
              {smartPreview.title}
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-600">
              {smartPreview.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>

            <div className="mt-2 text-xs text-neutral-500">
              {videoPlacementStrategy === "SMART"
                ? "Smart Picks utilise le storyboard pour scorer les moments forts (hook, preuve, reveal, chiffres, émotion) et place les vidéos automatiquement."
                : "FIXED place les vidéos sur hook/payoff/anchors sans scoring avancé."}
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={!canGenerate || loading}
          onClick={generate}
          className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
          title={!canGenerate ? "Generate storyboard + video prompts first" : ""}
        >
          {loading
            ? "Generating..."
            : dynamicMode
            ? "Generate (Dynamic)"
            : "Generate"}
        </button>
      </div>

      {/* ✅ QUOTA UX */}
      {quotaError && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-medium text-amber-900">
            {quotaError.message || "Quota reached"}
          </p>

          {quotaError.plan === "FREE" && (
            <p className="mt-1 text-amber-800">
              Free plan: 1 editing script / day, max 3 / week.
            </p>
          )}

          <div className="mt-3">
            <Link
              href="/pricing"
              className="inline-flex items-center rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              Upgrade your plan →
            </Link>
          </div>
        </div>
      )}

      {content ? (
        <EditingScriptPanel content={content} defaultExpanded={false} />
      ) : (
        <div className="mt-3 rounded-2xl border p-6">
          <p className="text-sm text-neutral-600">
            Editing script not generated yet.
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            Generate storyboard + video prompts first, then click “Generate”.
          </p>
        </div>
      )}
    </section>
  );
}
