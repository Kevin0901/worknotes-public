"use client";

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { CODE_LANGUAGES } from "./extensions";
import { MapBlockView } from "./MapBlockView";

/** 程式碼區塊：上方可切換語言、複製；語言為 map 時改顯示地圖 */
export function CodeBlockView(props: NodeViewProps) {
  const { node, updateAttributes } = props;
  const language: string = node.attrs.language ?? "";
  const [copied, setCopied] = useState(false);

  if (language === "map") return <MapBlockView {...props} />;

  const known = CODE_LANGUAGES.some((l) => l.value === language);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(node.textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <NodeViewWrapper className="code-block-view group relative my-4 overflow-hidden rounded-lg border border-[var(--code-border)] bg-code">
      <div
        contentEditable={false}
        className="flex select-none items-center justify-between gap-2 border-b border-[var(--code-border)] px-2 py-1 text-xs text-faint"
      >
        <select
          value={language}
          onChange={(e) => updateAttributes({ language: e.target.value || null })}
          className="cursor-pointer rounded bg-transparent px-1 py-0.5 font-mono text-xs text-faint outline-none hover:bg-hover hover:text-fg"
          aria-label="程式語言"
        >
          {CODE_LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
          {!known && <option value={language}>{language}</option>}
        </select>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-hover hover:text-fg"
          aria-label="複製程式碼"
        >
          {copied ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
          {copied ? "已複製" : "複製"}
        </button>
      </div>
      <pre spellCheck={false}>
        <NodeViewContent<"code"> as="code" className={language ? `hljs language-${language}` : "hljs"} />
      </pre>
    </NodeViewWrapper>
  );
}
