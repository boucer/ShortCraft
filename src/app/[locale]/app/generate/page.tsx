"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useState } from "react";

type PlatformPreset = "instagram" | "tiktok" | "shorts";
type StylePreset = "ugc" | "cinematic" | "faceless" | "screen" | "luxury";
type DurationPreset = "6-8" | "8-12" | "12-15";
type ToolPreset = "veo" | "runway" | "pika" | "generic";

export default function GeneratePage() {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const locale = pathname.split("/")[1];
  const projectId = search.get("projectId");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // ✅ V1.2 — Platform preset
  const [platform, setPlatform] = useState<PlatformPreset>("instagram");

  // ✅ V1.3 — Style preset
  const [style, setStyle] = useState<StylePreset>("ugc");

  // ✅ V1.4 — Duration preset
  const [duration, setDuration] = useState<DurationPreset>("6-8");

  // ✅ V1.5 — Tool preset (Bloc #4)
  const [tool, setTool] = useState<ToolPreset>("veo");

  async function post(endpoint: string, extraBody?: Record<string, any>) {
    if (!projectId || loading) return;

    setLoading(true);
    setMsg(null);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          locale,
          ...extraBody,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.error ?? "Generation error");
        setLoading(false);
        return;
      }

      router.push(`/${locale}/app/projects/${projectId}`);
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Generate</h1>
      <p className="mt-2 text-neutral-600">
        Generate outputs (OpenAI) and save them to your project.
      </p>

      {!projectId ? (
        <div className="mt-6 rounded-2xl border p-6">Missing projectId in URL.</div>
      ) : (
        <div className="mt-6 space-y-4 rounded-2xl border p-6">
          {/* ✅ Platform preset */}
          <div>
            <label className="mb-1 block text-sm font-medium">Platform preset (V1.2)</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as PlatformPreset)}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              disabled={loading}
            >
              <option value="instagram">Instagram (Reels)</option>
              <option value="tiktok">TikTok</option>
              <option value="shorts">YouTube Shorts</option>
            </select>
            <p className="mt-1 text-xs text-neutral-500">
              Affects video prompt structure only. Output stays in English.
            </p>
          </div>

          {/* ✅ Style preset */}
          <div>
            <label className="mb-1 block text-sm font-medium">Style preset (V1.3)</label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as StylePreset)}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              disabled={loading}
            >
              <option value="ugc">UGC / Talking Head</option>
              <option value="cinematic">Cinematic</option>
              <option value="faceless">Faceless B-roll</option>
              <option value="screen">Screen Recording</option>
              <option value="luxury">Luxury / Premium</option>
            </select>
            <p className="mt-1 text-xs text-neutral-500">
              Adds style constraints (camera, lighting, pacing, vibe) to video prompts.
            </p>
          </div>

          {/* ✅ Duration preset */}
          <div>
            <label className="mb-1 block text-sm font-medium">Duration preset (V1.4)</label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value as DurationPreset)}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              disabled={loading}
            >
              <option value="6-8">6–8 seconds (punchy)</option>
              <option value="8-12">8–12 seconds (explainer)</option>
              <option value="12-15">12–15 seconds (mini-story)</option>
            </select>
            <p className="mt-1 text-xs text-neutral-500">
              Controls pacing and how dense the voice-over should be.
            </p>
          </div>

          {/* ✅ Tool preset (Bloc #4) */}
          <div>
            <label className="mb-1 block text-sm font-medium">Tool preset (V1.5)</label>
            <select
              value={tool}
              onChange={(e) => setTool(e.target.value as ToolPreset)}
              className="w-full rounded-xl border px-3 py-2 text-sm"
              disabled={loading}
            >
              <option value="veo">Veo</option>
              <option value="runway">Runway</option>
              <option value="pika">Pika</option>
              <option value="generic">Generic (any tool)</option>
            </select>
            <p className="mt-1 text-xs text-neutral-500">
              Tunes the prompt for the selected video tool constraints.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => post("/api/generate/hooks")}
              className="rounded-xl border px-4 py-2"
              disabled={loading}
            >
              {loading ? "Generating..." : "Generate hooks"}
            </button>

            <button
              onClick={() => post("/api/generate/storyboard")}
              className="rounded-xl border px-4 py-2"
              disabled={loading}
            >
              {loading ? "Generating..." : "Generate storyboard"}
            </button>

            <button
              onClick={() => post("/api/generate/image-prompts")}
              className="rounded-xl border px-4 py-2"
              disabled={loading}
            >
              {loading ? "Generating..." : "Generate image prompts (V1.1)"}
            </button>

            <button
              onClick={() => post("/api/generate/video-prompts", { platform, style, duration, tool })}
              className="rounded-xl border px-4 py-2"
              disabled={loading}
            >
              {loading ? "Generating..." : "Generate video prompts (V1.5)"}
            </button>
          </div>

          {msg ? (
            <p className="text-sm text-red-600">{msg}</p>
          ) : (
            <p className="text-sm text-neutral-500">
              Video prompts adapt to platform + style + duration + tool presets.
            </p>
          )}

          <p className="text-sm text-neutral-500">
            V1: each output is generated once per locale (skips if already exists). Storyboard requires hooks first.
            Image prompts require storyboard first.
          </p>
        </div>
      )}
    </main>
  );
}
