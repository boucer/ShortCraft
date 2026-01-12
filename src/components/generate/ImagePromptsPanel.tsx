"use client";

import * as React from "react";

type StoryboardScene = {
  scene: number;
  onScreenText?: string;
  voiceover?: string;
  visual: string;
};

type ImagePromptV11 = {
  scene: number;
  character: string;
  intent: string;
  style: string;
  imagePrompt: string;
};

type ApiResponse = {
  style: string;
  count: number;
  prompts: ImagePromptV11[];
  error?: string;
};

export default function ImagePromptsPanel({
  scenes,
  niche,
  characterOverride,
  defaultOpen = true,
}: {
  scenes: StoryboardScene[];
  niche?: string;
  characterOverride?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [data, setData] = React.useState<ApiResponse | null>(null);
  const [copiedScene, setCopiedScene] = React.useState<number | "all" | null>(null);

  const canGenerate = Array.isArray(scenes) && scenes.length > 0;

  async function generate() {
    if (!canGenerate || loading) return;
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/generate/image-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche,
          characterOverride,
          scenes,
        }),
      });

      const json = (await res.json().catch(() => null)) as ApiResponse | null;

      if (!res.ok) {
        const msg =
          json?.error ||
          `Request failed (${res.status}). Check server logs for details.`;
        setErr(msg);
        setData(null);
        return;
      }

      setData(json);
    } catch (e: any) {
      setErr(e?.message || "Network error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function copyText(text: string, key: number | "all") {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedScene(key);
      window.setTimeout(() => setCopiedScene(null), 900);
    } catch {
      // Fallback (rare)
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedScene(key);
      window.setTimeout(() => setCopiedScene(null), 900);
    }
  }

  const allPromptsText = React.useMemo(() => {
    if (!data?.prompts?.length) return "";
    return data.prompts
      .map((p) => `SCENE ${p.scene}\n${p.imagePrompt}\n`)
      .join("\n");
  }, [data]);

  return (
    <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Image Prompts (V1.1)</h2>
          <p className="mt-1 text-sm text-white/70">
            Generate one high-quality 9:16 image prompt per storyboard scene.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
          >
            {open ? "Hide" : "Show"}
          </button>

          <button
            type="button"
            disabled={!canGenerate || loading}
            onClick={generate}
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-50"
          >
            {loading ? "Generating..." : data ? "Regenerate" : "Generate"}
          </button>
        </div>
      </header>

      {!canGenerate && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
          Add storyboard scenes first, then generate image prompts.
        </div>
      )}

      {err && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          <div className="font-semibold">Error</div>
          <div className="mt-1 opacity-90">{err}</div>
        </div>
      )}

      {open && data?.prompts?.length ? (
        <div className="mt-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-white/70">
              Style: <span className="text-white/90">{data.style}</span> · Scenes:{" "}
              <span className="text-white/90">{data.count}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => copyText(allPromptsText, "all")}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
              >
                {copiedScene === "all" ? "Copied ✅" : "Copy all"}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {data.prompts.map((p) => (
              <article
                key={p.scene}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="rounded-full bg-white/10 px-2 py-1 text-xs text-white/80">
                        Scene {p.scene}
                      </div>
                      <div className="text-xs text-white/50">{p.style}</div>
                    </div>

                    <div className="mt-2 text-sm text-white/80">
                      <span className="text-white/60">Intent:</span> {p.intent}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copyText(p.imagePrompt, p.scene)}
                      className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-white/90"
                    >
                      {copiedScene === p.scene ? "Copied ✅" : "Copy prompt"}
                    </button>
                  </div>
                </div>

                <details className="mt-3">
                  <summary className="cursor-pointer select-none text-xs text-white/60 hover:text-white/80">
                    View prompt
                  </summary>
                  <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/80">
{p.imagePrompt}
                  </pre>
                </details>
              </article>
            ))}
          </div>
        </div>
      ) : open && data && !data.prompts?.length ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
          No prompts returned.
        </div>
      ) : null}
    </section>
  );
}
