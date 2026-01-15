"use client";

import { useState } from "react";
import EditingScriptPanel from "./EditingScriptPanel";
import Link from "next/link";

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

  async function generate() {
    if (loading) return;
    setLoading(true);
    setQuotaError(null);

    try {
      const res = await fetch(`/api/generate/editing-script`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, locale }),
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        // ✅ Interception clean du quota
        if (data?.code === "QUOTA_EXCEEDED") {
          setQuotaError({
            message: data.message,
            plan: data.plan,
            remaining: data.remaining,
          });
          return;
        }

        // ❌ fallback legacy (on ne casse rien)
        const msg =
          data?.error ||
          data?.details ||
          (text && text.length < 300 ? text : "") ||
          `Request failed (${res.status})`;
        alert(msg);
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
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Editing script</h2>
          <div className="mt-1 text-xs text-neutral-500">{versionLabel}</div>
          <div className="mt-1 text-xs text-neutral-400">
            Conversion de langue <strong>n’affecte pas votre quota</strong>
          </div>
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
