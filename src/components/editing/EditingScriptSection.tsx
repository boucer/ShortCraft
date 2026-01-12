"use client";

import { useState } from "react";
import EditingScriptPanel from "./EditingScriptPanel";

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

  async function generate() {
    if (loading) return;
    setLoading(true);

    try {
      // ✅ IMPORTANT: API routes are NOT locale-prefixed in your app
      const res = await fetch(`/api/generate/editing-script`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, locale }),
      });

      // Try to read JSON, but handle HTML/empty responses safely
      let data: any = null;
      const text = await res.text();
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        const msg =
          data?.error ||
          data?.details ||
          (text && text.length < 300 ? text : "") ||
          `Request failed (${res.status})`;
        alert(msg);
        return;
      }

      // simplest safe refresh
      window.location.reload();
    } catch (e: any) {
      alert(e?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Editing script</h2>
          <div className="mt-1 text-xs text-neutral-500">{versionLabel}</div>
        </div>

        <button
          type="button"
          disabled={!canGenerate || loading}
          onClick={generate}
          className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
          title={!canGenerate ? "Generate storyboard + video prompts first" : ""}
        >
          {loading ? "Generating..." : "Generate"}
        </button>
      </div>

      {content ? (
        <EditingScriptPanel content={content} defaultExpanded={false} />
      ) : (
        <div className="mt-3 rounded-2xl border p-6">
          <p className="text-sm text-neutral-600">Editing script not generated yet.</p>
          <p className="mt-1 text-sm text-neutral-500">
            Generate storyboard + video prompts first, then click “Generate”.
          </p>
        </div>
      )}
    </section>
  );
}
