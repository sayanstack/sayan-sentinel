"use client";

import { useState } from "react";

export function CopyField({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable — the value is still visible to select by hand.
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="rounded-md border border-border px-2 py-0.5 text-xs text-text-muted hover:bg-surface hover:text-text"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {multiline ? (
        <pre className="max-h-40 overflow-auto rounded-md bg-surface px-2 py-1.5 text-xs whitespace-pre-wrap text-text">
          {value}
        </pre>
      ) : (
        <code className="block overflow-x-auto rounded-md bg-surface px-2 py-1.5 text-xs text-text">
          {value}
        </code>
      )}
    </div>
  );
}
