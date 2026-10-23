"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-1 rounded-md border border-line bg-bg px-2 py-1.5">
      <code className="min-w-0 flex-1 break-all font-mono text-xs">{value}</code>
      <button
        type="button"
        className="icon-btn h-7 w-7"
        aria-label="複製"
        onClick={() => {
          navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check size={14} className="text-accent" /> : <Copy size={14} />}
      </button>
    </div>
  );
}
