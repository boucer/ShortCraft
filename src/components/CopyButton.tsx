"use client";

import * as React from "react";

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50"
    >
      {copied ? "Copied ✅" : "Copy"}
    </button>
  );
}
