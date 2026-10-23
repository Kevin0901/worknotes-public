"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { BookOpen, Bot, FileText, Folder, Search } from "lucide-react";
import { locationLabel } from "@/lib/tree";
import { useWorkspace } from "./workspace";

interface Item {
  key: string;
  href: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
}

/** Ctrl/⌘ + K 快速搜尋（標題、標籤、分類） */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tree } = useWorkspace();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const notes = tree.notes.map((n) => ({
      key: `n:${n.id}`,
      href: `/n/${n.id}`,
      icon: n.icon ? <span className="w-4 text-center">{n.icon}</span> : <FileText size={16} className="text-faint" />,
      title: n.title,
      sub: locationLabel(tree, n),
      hay: `${n.title} ${n.tags.join(" ")} ${locationLabel(tree, n)}`.toLowerCase(),
      updatedAt: n.updatedAt,
    }));
    const cats = tree.categories.map((c) => ({
      key: `c:${c.id}`,
      href: `/c/${c.id}`,
      icon: c.icon ? <span className="w-4 text-center">{c.icon}</span> : <Folder size={16} className="text-faint" />,
      title: c.name,
      sub: "分類 · " + locationLabel(tree, { spaceUserId: c.spaceUserId, categoryId: c.id }),
      hay: locationLabel(tree, { spaceUserId: c.spaceUserId, categoryId: c.id }).toLowerCase(),
      updatedAt: "",
    }));
    const guides = tree.guides.map((g) => ({
      key: `g:${g.slug}`,
      href: g.href,
      icon: g.icon ? <span className="w-4 text-center">{g.icon}</span> : <BookOpen size={16} className="text-faint" />,
      title: g.title,
      sub: "互動教學 · 公共區",
      hay: `${g.title} 互動教學 教學 guide`.toLowerCase(),
      updatedAt: "",
    }));
    const ai = {
      key: "ai",
      href: "/ai",
      icon: <Bot size={16} className="text-accent" />,
      title: "AI 助理",
      sub: "用自己的 API 金鑰對話，可引用網站的筆記與教學",
      hay: "ai 助理 聊天 chat claude chatgpt gemini assistant",
      updatedAt: "",
    };
    let all = [...guides, ...cats, ...notes];
    if (q) all.push(ai);
    if (q) {
      const terms = q.split(/\s+/);
      all = all.filter((i) => terms.every((t) => i.hay.includes(t)));
      all.sort((a, b) => Number(b.title.toLowerCase().startsWith(q)) - Number(a.title.toLowerCase().startsWith(q)));
    } else {
      all = notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    const result: Item[] = all.slice(0, 40);
    if (q) {
      result.push({
        key: "search",
        href: `/search?q=${encodeURIComponent(query.trim())}`,
        icon: <Search size={16} className="text-accent" />,
        title: `在所有內容中搜尋「${query.trim()}」`,
        sub: "全文搜尋（包含筆記內文與指令）",
      });
    }
    return result;
  }, [query, tree]);

  useEffect(() => {
    if (index >= items.length) setIndex(Math.max(0, items.length - 1));
  }, [items.length, index]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!open || typeof document === "undefined") return null;

  const go = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    router.push(item.href);
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center p-3 pt-[10vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-line bg-card shadow-pop">
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={18} className="text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(items[index]);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder="搜尋筆記標題、標籤或分類…"
            className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
          />
          <kbd className="hidden rounded border border-line px-1.5 text-[11px] text-faint sm:inline">Esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto thin-scroll p-1.5">
          {!query && <div className="px-3 pb-1 pt-2 text-xs text-faint">最近更新</div>}
          {items.length === 0 && <div className="px-3 py-6 text-center text-sm text-faint">找不到符合的項目</div>}
          {items.map((item, i) => (
            <button
              key={item.key}
              type="button"
              data-index={i}
              onMouseMove={() => setIndex(i)}
              onClick={() => go(item)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${i === index ? "bg-hover" : ""}`}
            >
              <span className="flex w-5 shrink-0 justify-center">{item.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{item.title}</span>
                <span className="block truncate text-xs text-faint">{item.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
