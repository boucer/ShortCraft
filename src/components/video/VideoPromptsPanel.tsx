"use client";

import { useEffect, useMemo, useState } from "react";

type VariantKey = "GENERIC" | "VEO" | "RUNWAY";

type CopyFormatKey =
  | "RAW"
  | "JSON"
  | "VEO31_READY"
  | "RUNWAY_GEN3"
  | "PIKA"
  | "HEYGEN"
  | "CAPCUT";

type VideoPromptItem = {
  sceneNumber?: number;
  title?: string;
  fullPrompt?: any; // string OR object OR variants
  prompt?: any;
  variants?: any;
};

type VideoPromptsContent =
  | VideoPromptItem[]
  | {
      prompts?: VideoPromptItem[];
      meta?: any;
      toolPreset?: any;
      tool?: any;
    }
  | null
  | undefined;

function safeString(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

/** Extract prompts array from whatever shape we stored in DB */
function getPromptsArray(content: VideoPromptsContent): VideoPromptItem[] {
  if (!content) return [];
  if (Array.isArray(content)) return content;
  if (typeof content === "object" && Array.isArray((content as any).prompts))
    return (content as any).prompts;
  return [];
}

/** Try to infer a tool preset from DB content */
function inferToolPreset(content: VideoPromptsContent): string | null {
  if (!content) return null;
  const obj = !Array.isArray(content) && typeof content === "object" ? content : null;
  const meta = obj?.meta ?? null;

  const candidates = [meta?.toolPreset, meta?.tool, obj?.toolPreset, obj?.tool].filter(Boolean);

  if (candidates.length) {
    const v = String(candidates[0]).toUpperCase();
    if (v.includes("VEO")) return "VEO";
    if (v.includes("RUNWAY")) return "RUNWAY";
    return null;
  }

  return null;
}

/** Resolve the displayed prompt for a given variant */
function resolvePromptText(item: VideoPromptItem, variant: VariantKey): string {
  // 1) variants on item.variants
  const variants = item?.variants ?? null;
  if (variants && typeof variants === "object") {
    const direct =
      variants?.[variant] ??
      variants?.[variant.toLowerCase?.()] ??
      variants?.[variant.toLowerCase?.().replace?.("_", "")];
    if (typeof direct === "string" && direct.trim()) return direct;
  }

  // 2) if fullPrompt itself is an object with keys
  const full = item?.fullPrompt ?? item?.prompt ?? null;
  if (full && typeof full === "object" && !Array.isArray(full)) {
    const direct =
      full?.[variant] ??
      full?.[variant.toLowerCase?.()] ??
      full?.[variant.toLowerCase?.().replace?.("_", "")];
    if (typeof direct === "string" && direct.trim()) return direct;

    // common shapes like { generic, veo, runway }
    const alt = full?.generic || full?.veo || full?.runway || full?.text || full?.fullPrompt || null;
    if (typeof alt === "string" && alt.trim()) return alt;

    // fallback stringification
    return safeString(full);
  }

  // 3) plain string
  if (typeof full === "string") return full;

  return "";
}

function toolDefaultsFromPreset(toolPreset: string | null): { variant: VariantKey; format: CopyFormatKey } | null {
  if (!toolPreset) return null;
  const t = toolPreset.toUpperCase();
  if (t === "VEO") return { variant: "VEO", format: "VEO31_READY" };
  if (t === "RUNWAY") return { variant: "RUNWAY", format: "RUNWAY_GEN3" };
  return null;
}

function defaultFormatForVariant(variant: VariantKey): CopyFormatKey {
  if (variant === "VEO") return "VEO31_READY";
  if (variant === "RUNWAY") return "RUNWAY_GEN3";
  return "RAW";
}

function formatForTool(format: CopyFormatKey, item: VideoPromptItem, promptText: string): string {
  const n = item.sceneNumber ?? 0;
  const title = (item.title || "").trim() || `Scene ${n || "?"}`;
  const clean = (promptText || "").trim();

  if (format === "RAW") return clean;

  if (format === "JSON") {
    return JSON.stringify(
      {
        sceneNumber: n || undefined,
        title,
        prompt: clean,
      },
      null,
      2
    );
  }

  // Tool-ready blocks (simple + copy/paste friendly)
  const lines: string[] = [];
  lines.push(`# Scene ${n || ""} — ${title}`.trim());
  if (format === "VEO31_READY") lines.push(`TOOL: Veo 3.1`);
  if (format === "RUNWAY_GEN3") lines.push(`TOOL: Runway Gen-3`);
  if (format === "PIKA") lines.push(`TOOL: Pika`);
  if (format === "HEYGEN") lines.push(`TOOL: HeyGen`);
  if (format === "CAPCUT") lines.push(`TOOL: CapCut`);

  lines.push("");
  lines.push(clean);

  return lines.join("\n");
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

/** When user changes Variant, auto-pick a matching Copy Format (without overriding explicit tool formats like JSON/Pika/etc.) */
function syncFormatOnVariantChange(nextVariant: VariantKey, prevFormat: CopyFormatKey): CopyFormatKey {
  // If user explicitly chose a “manual” tool format, we respect it.
  if (prevFormat === "JSON" || prevFormat === "PIKA" || prevFormat === "HEYGEN" || prevFormat === "CAPCUT") {
    return prevFormat;
  }

  // Otherwise we auto-default to the tool matching the selected variant.
  return defaultFormatForVariant(nextVariant);
}

export default function VideoPromptsPanel({
  content,
  versionLabel,
}: {
  content: VideoPromptsContent;
  versionLabel?: string;
}) {
  const prompts = useMemo(() => getPromptsArray(content), [content]);
  const inferredToolPreset = useMemo(() => inferToolPreset(content), [content]);

  const LS_VARIANT = "shortcraft.video.variant";
  const LS_FORMAT = "shortcraft.video.copyFormat";

  // Defaults: DB meta.toolPreset -> localStorage -> fallback
  const initialDefaults = useMemo(() => {
    const fromTool = toolDefaultsFromPreset(inferredToolPreset);
    if (fromTool) return fromTool;

    if (typeof window !== "undefined") {
      const v = (localStorage.getItem(LS_VARIANT) || "").toUpperCase();
      const f = (localStorage.getItem(LS_FORMAT) || "").toUpperCase();
      const vv = (["GENERIC", "VEO", "RUNWAY"] as const).includes(v as any) ? (v as VariantKey) : null;
      const ff = (["RAW", "JSON", "VEO31_READY", "RUNWAY_GEN3", "PIKA", "HEYGEN", "CAPCUT"] as const).includes(f as any)
        ? (f as CopyFormatKey)
        : null;

      const variant = vv ?? "GENERIC";
      const format = ff ?? defaultFormatForVariant(variant);
      return { variant, format };
    }

    return { variant: "GENERIC" as VariantKey, format: "RAW" as CopyFormatKey };
  }, [inferredToolPreset]);

  const [variant, setVariant] = useState<VariantKey>(initialDefaults.variant);
  const [copyFormat, setCopyFormat] = useState<CopyFormatKey>(initialDefaults.format);

  // Keep variant/format synced when tool preset exists (ex: DB says VEO)
  useEffect(() => {
    const fromTool = toolDefaultsFromPreset(inferredToolPreset);
    if (fromTool) {
      setVariant(fromTool.variant);
      setCopyFormat(fromTool.format);
      try {
        localStorage.setItem(LS_VARIANT, fromTool.variant);
        localStorage.setItem(LS_FORMAT, fromTool.format);
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inferredToolPreset]);

  // Persist user changes
  useEffect(() => {
    try {
      localStorage.setItem(LS_VARIANT, variant);
    } catch {}
  }, [variant]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_FORMAT, copyFormat);
    } catch {}
  }, [copyFormat]);

  // Expand / collapse
  const [openScenes, setOpenScenes] = useState<Record<number, boolean>>({});

  function expandAll() {
    const next: Record<number, boolean> = {};
    for (const p of prompts) next[p.sceneNumber ?? 0] = true;
    setOpenScenes(next);
  }
  function collapseAll() {
    setOpenScenes({});
  }

  const headerToolLabel = useMemo(() => {
    if (variant === "VEO") return "VEO";
    if (variant === "RUNWAY") return "RUNWAY";
    return "GENERIC";
  }, [variant]);

  return (
    <section className="mt-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Video prompts</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Copy une scène ou tout le pack, et déplie/replie pour scroller vite.
            <br />
            <span className="text-neutral-500">
              Output tool = variante (GENERIC/VEO/RUNWAY). Copy format = reformatage pour coller dans un outil.
            </span>
          </p>
        </div>
        {versionLabel ? <div className="text-sm text-neutral-500">{versionLabel}</div> : null}
      </div>

      <div className="mt-4 rounded-2xl border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-xl border px-4 py-2"
            onClick={async () => {
              const pack = prompts
                .map((p) => {
                  const txt = resolvePromptText(p, variant);
                  return formatForTool(copyFormat, p, txt);
                })
                .filter(Boolean)
                .join("\n\n---\n\n");
              await copyToClipboard(pack);
            }}
          >
            Copy ALL
          </button>

          {/* Variant dropdown */}
          <label className="flex items-center gap-2">
            <span className="sr-only">Output tool</span>
            <select
              className="rounded-xl border px-3 py-2"
              value={variant}
              onChange={(e) => {
                const nextVariant = e.target.value as VariantKey;
                setVariant(nextVariant);
                setCopyFormat((prev) => syncFormatOnVariantChange(nextVariant, prev));
              }}
              aria-label="Output tool variant"
            >
              <option value="GENERIC">GENERIC</option>
              <option value="VEO">VEO</option>
              <option value="RUNWAY">RUNWAY</option>
            </select>
          </label>

          {/* Copy format dropdown */}
          <label className="flex items-center gap-2">
            <span className="sr-only">Copy format</span>
            <select
              className="rounded-xl border px-3 py-2"
              value={copyFormat}
              onChange={(e) => setCopyFormat(e.target.value as CopyFormatKey)}
              aria-label="Copy format"
            >
              <option value="RAW">Raw (as-is)</option>
              <option value="VEO31_READY">Veo 3.1 (ready)</option>
              <option value="RUNWAY_GEN3">Runway Gen3 (ready)</option>
              <option value="PIKA">Pika</option>
              <option value="HEYGEN">HeyGen</option>
              <option value="CAPCUT">CapCut</option>
              <option value="JSON">JSON</option>
            </select>
          </label>

          <button type="button" className="rounded-xl border px-4 py-2" onClick={expandAll}>
            Expand ALL
          </button>
          <button type="button" className="rounded-xl border px-4 py-2" onClick={collapseAll}>
            Collapse ALL
          </button>
        </div>

        <div className="mt-4">
          {!prompts.length ? (
            <div className="rounded-xl border p-4 text-sm text-neutral-600">Aucun video prompt pour ce projet.</div>
          ) : (
            <div className="space-y-3">
              {prompts.map((p) => {
                const n = p.sceneNumber ?? 0;
                const isOpen = !!openScenes[n];
                const title = (p.title || "").trim() || `Scene ${n}`;
                const promptText = resolvePromptText(p, variant);
                const copyPreview = formatForTool(copyFormat, p, promptText);

                return (
                  <div key={n} className="rounded-2xl border">
                    <div className="flex items-center justify-between gap-3 p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold">
                          {n || "?"}
                        </div>

                        <div>
                          <div className="font-semibold">{title}</div>
                          <button
                            type="button"
                            className="text-left text-xs text-neutral-500 hover:underline"
                            onClick={() =>
                              setOpenScenes((prev) => ({
                                ...prev,
                                [n]: !prev[n],
                              }))
                            }
                          >
                            {isOpen ? "Click to collapse" : "Click to expand"}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded-xl border px-4 py-2"
                          onClick={async () => {
                            await copyToClipboard(copyPreview);
                          }}
                        >
                          Copy
                        </button>

                        <button
                          type="button"
                          className="rounded-xl border px-3 py-2"
                          aria-label="Toggle"
                          onClick={() =>
                            setOpenScenes((prev) => ({
                              ...prev,
                              [n]: !prev[n],
                            }))
                          }
                        >
                          {isOpen ? "▾" : "▸"}
                        </button>
                      </div>
                    </div>

                    {isOpen ? (
                      <div className="border-t p-3">
                        <div className="rounded-xl border bg-white p-4 text-sm leading-relaxed whitespace-pre-wrap">
                          {promptText || "(empty prompt)"}
                        </div>

                        <div className="mt-3">
                          <div className="text-xs font-semibold text-neutral-600">
                            Copy preview ({copyFormat.replaceAll("_", " ")})
                          </div>
                          <pre className="mt-2 rounded-xl border bg-neutral-50 p-4 text-xs leading-relaxed whitespace-pre-wrap">
                            {copyPreview}
                          </pre>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 text-xs text-neutral-500">
          Selected variant: <span className="font-semibold">{headerToolLabel}</span>
          {" · "}
          Selected copy format: <span className="font-semibold">{copyFormat}</span>
          {inferredToolPreset ? (
            <>
              {" · "}
              DB toolPreset detected: <span className="font-semibold">{inferredToolPreset}</span>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
