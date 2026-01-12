"use client";

import { useMemo, useState } from "react";

function pretty(v: any) {
  try {
    return typeof v === "string" ? v : JSON.stringify(v, null, 2);
  } catch {
    return String(v ?? "");
  }
}

export default function EditingScriptPanel({
  content,
  defaultExpanded = false,
}: {
  content: any;
  defaultExpanded?: boolean;
}) {
  const [open, setOpen] = useState(defaultExpanded);

  const meta = content?.meta ?? null;
  const timeline = Array.isArray(content?.timeline) ? content.timeline : [];
  const exportNotes = Array.isArray(content?.exportNotes) ? content.exportNotes : [];
  const raw = typeof content?.raw === "string" ? content.raw : pretty(content);

  const rawText = useMemo(() => raw, [raw]);

  async function copyRaw() {
    try {
      await navigator.clipboard.writeText(rawText);
      // ultra simple: feedback minimal non-intrusif
      alert("RAW copied ✅");
    } catch {
      alert("Copy failed ❌");
    }
  }

  return (
    <div className="mt-3 rounded-2xl border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div>
          <div className="font-medium">Editing Script (V1)</div>
          <div className="mt-1 text-xs text-neutral-500">
            Timeline + cuts + text + SFX + export notes
          </div>
        </div>
        <div className="text-xs text-neutral-500">{open ? "Hide" : "Show"}</div>
      </button>

      {open ? (
        <div className="border-t p-5">
          {meta ? (
            <div className="rounded-xl border p-4">
              <div className="text-sm font-medium">Meta</div>
              <div className="mt-2 text-sm text-neutral-700 whitespace-pre-wrap">
                {pretty(meta)}
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <div className="text-sm font-medium">Timeline</div>
            {timeline.length ? (
              <div className="mt-3 space-y-3">
                {timeline.map((t: any, idx: number) => (
                  <div key={idx} className="rounded-xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">
                        Scene {t?.scene ?? idx + 1}{" "}
                        {t?.time ? <span className="text-neutral-500 font-normal">• {t.time}</span> : null}
                      </div>
                    </div>

                    {t?.clip ? (
                      <div className="mt-2 text-sm text-neutral-800">
                        <span className="font-medium">Clip:</span> {t.clip}
                      </div>
                    ) : null}

                    {t?.edit ? (
                      <div className="mt-1 text-sm text-neutral-800">
                        <span className="font-medium">Edit:</span> {t.edit}
                      </div>
                    ) : null}

                    {t?.onScreenText ? (
                      <div className="mt-1 text-sm text-neutral-800">
                        <span className="font-medium">On-screen:</span> {t.onScreenText}
                      </div>
                    ) : null}

                    {t?.voiceover ? (
                      <div className="mt-1 text-sm text-neutral-800">
                        <span className="font-medium">VO:</span> {t.voiceover}
                      </div>
                    ) : null}

                    {t?.sound ? (
                      <div className="mt-1 text-sm text-neutral-800">
                        <span className="font-medium">Sound:</span> {t.sound}
                      </div>
                    ) : null}

                    {t?.notes ? (
                      <div className="mt-1 text-sm text-neutral-600 whitespace-pre-wrap">
                        <span className="font-medium text-neutral-800">Notes:</span> {t.notes}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-sm text-neutral-600">No timeline items.</div>
            )}
          </div>

          <div className="mt-4">
            <div className="text-sm font-medium">Export notes</div>
            {exportNotes.length ? (
              <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-neutral-700">
                {exportNotes.map((n: string, i: number) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            ) : (
              <div className="mt-2 text-sm text-neutral-600">No export notes.</div>
            )}
          </div>

          <div className="mt-5 rounded-xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">RAW</div>
              <button
                type="button"
                className="rounded-xl border px-3 py-2 text-xs"
                onClick={copyRaw}
              >
                Copy RAW
              </button>
            </div>
            <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-800">
{rawText}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
