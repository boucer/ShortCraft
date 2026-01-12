"use client";

import * as React from "react";
import CopyButton from "@/components/CopyButton";

type ImagePromptItem = {
  scene: number;
  character?: string;
  intent?: string;
  style?: string;
  imagePrompt: string;
};

export default function ImagePromptsSection({
  title = "Image prompts",
  styleLabel,
  versionLabel,
  prompts,
}: {
  title?: string;
  styleLabel?: string; // ex: "business" / "automotive"
  versionLabel?: string; // ex: "v11 • 2026-01-12 ..."
  prompts: ImagePromptItem[];
}) {
  const sorted = React.useMemo(() => {
    return [...(prompts || [])].sort((a, b) => (a.scene ?? 0) - (b.scene ?? 0));
  }, [prompts]);

  const [open, setOpen] = React.useState<Record<number, boolean>>(() => {
    // Default: only scene 1 open (reduces scroll)
    const init: Record<number, boolean> = {};
    for (const p of sorted) init[p.scene] = p.scene === 1;
    return init;
  });

  React.useEffect(() => {
    // When prompts change, keep sane defaults
    const next: Record<number, boolean> = {};
    for (const p of sorted) next[p.scene] = p.scene === 1;
    setOpen(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted.length]);

  const allOpen = sorted.length > 0 && sorted.every((p) => open[p.scene]);
  const noneOpen = sorted.length > 0 && sorted.every((p) => !open[p.scene]);

  function toggleScene(scene: number) {
    setOpen((prev) => ({ ...prev, [scene]: !prev[scene] }));
  }

  function expandAll() {
    const next: Record<number, boolean> = {};
    for (const p of sorted) next[p.scene] = true;
    setOpen(next);
  }

  function collapseAll() {
    const next: Record<number, boolean> = {};
    for (const p of sorted) next[p.scene] = false;
    setOpen(next);
  }

  const copyAllText = React.useMemo(() => {
    return sorted
      .map((p) => {
        const header = `--- Scene ${p.scene} ---`;
        const intent = p.intent ? `Intent: ${p.intent}` : "";
        return [header, intent, p.imagePrompt].filter(Boolean).join("\n");
      })
      .join("\n\n");
  }, [sorted]);

  return (
    <section className="mt-6 rounded-2xl border p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-neutral-600">
            {styleLabel ? (
              <>
                Style: <span className="font-medium">{styleLabel}</span> •{" "}
              </>
            ) : null}
            Scenes: <span className="font-medium">{sorted.length}</span>
          </p>
        </div>

        <div className="text-right">
          {versionLabel ? (
            <div className="text-xs text-neutral-500">{versionLabel}</div>
          ) : null}

          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <CopyButton text={copyAllText} />
            {allOpen ? (
              <button
                type="button"
                className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50"
                onClick={collapseAll}
              >
                Collapse all
              </button>
            ) : (
              <button
                type="button"
                className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50"
                onClick={expandAll}
              >
                Expand all
              </button>
            )}

            {!noneOpen && !allOpen ? (
              <button
                type="button"
                className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50"
                onClick={collapseAll}
              >
                Collapse
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {sorted.map((p) => {
          const isOpen = !!open[p.scene];

          return (
            <div key={p.scene} className="rounded-xl border">
              <button
                type="button"
                onClick={() => toggleScene(p.scene)}
                className="w-full rounded-xl p-4 text-left hover:bg-neutral-50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium">Scene {p.scene}</div>
                    {p.intent ? (
                      <div className="mt-1 text-sm text-neutral-600">
                        <span className="font-medium">Intent:</span> {p.intent}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500">
                      {isOpen ? "Hide" : "Show"}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {isOpen ? "▾" : "▸"}
                    </span>
                  </div>
                </div>
              </button>

              {isOpen ? (
                <div className="px-4 pb-4">
                  <div className="flex justify-end">
                    <CopyButton text={p.imagePrompt} />
                  </div>

                  <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-neutral-50 p-3 text-sm text-neutral-800">
{p.imagePrompt}
                  </pre>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
