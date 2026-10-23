"use client";

import Link from "next/link";
import { memo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import { Check, Copy } from "lucide-react";
import { parseMapBlock } from "@/lib/map";
import { MapCard } from "./map/MapCard";

/** 把 [[筆記標題]] 轉成站內連結（略過程式碼區塊與行內程式碼） */
export function transformWikiLinks(markdown: string): string {
  return markdown
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/\[\[([^\]\n]{1,200})\]\]/g, (_m, title: string) => {
            const t = title.trim();
            return `[${t.replace(/[[\]]/g, "")}](/go?t=${encodeURIComponent(t)})`;
          }),
    )
    .join("");
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in node) {
    return textOf((node as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

function CodeBlock({ children, ...props }: ComponentProps<"pre">) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const child = Array.isArray(children) ? children[0] : children;
  const className = (child as { props?: { className?: string } })?.props?.className ?? "";
  const lang = /language-([\w+-]+)/.exec(className)?.[1];
  const map = lang === "map" ? parseMapBlock(textOf(children)) : null;

  const copy = async () => {
    const text = (ref.current?.innerText ?? textOf(children)).replace(/\n$/, "");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  if (map) return <MapCard data={map} />;

  return (
    <div className="group relative my-4 overflow-hidden rounded-lg border border-[var(--code-border)] bg-code">
      <div className="flex items-center justify-between border-b border-[var(--code-border)] px-3 py-1 text-xs text-faint">
        <span className="font-mono">{lang ?? "text"}</span>
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
      <pre ref={ref} {...props}>
        {children}
      </pre>
    </div>
  );
}

const components: Components = {
  pre: CodeBlock,
  table: ({ children, ...props }) => (
    <div className="table-wrap">
      <table {...props}>{children}</table>
    </div>
  ),
  a: ({ href = "", children, ...props }) => {
    if (href.startsWith("/") && !href.startsWith("//")) {
      return (
        <Link href={href} {...props}>
          {children}
        </Link>
      );
    }
    if (href.startsWith("#")) {
      return (
        <a href={href} {...props}>
          {children}
        </a>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  },
};

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="prose-note">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, [rehypeHighlight, { detect: false, plainText: ["map"] }]]}
        components={components}
      >
        {transformWikiLinks(content)}
      </ReactMarkdown>
    </div>
  );
});
