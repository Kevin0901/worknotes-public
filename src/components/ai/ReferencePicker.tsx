"use client";

import { useMemo, useState } from "react";
import { BookOpen, FileText, Folder, Search } from "lucide-react";
import { childrenMap, notesByCategory, spaceRoots } from "@/lib/tree";
import type { Category } from "@/lib/types";
import { Modal } from "../Modal";
import { useWorkspace } from "../workspace";
import { GUIDE_HINTS } from "@/lib/site-content";

export interface ReferenceSelection {
  noteIds: string[];
  categoryIds: string[];
  guides: string[];
}

export const EMPTY_SELECTION: ReferenceSelection = { noteIds: [], categoryIds: [], guides: [] };

export function selectionSummary(s: ReferenceSelection): string {
  const parts: string[] = [];
  if (s.guides.length) parts.push(`${s.guides.length} 個教學`);
  if (s.categoryIds.length) parts.push(`${s.categoryIds.length} 個分類`);
  if (s.noteIds.length) parts.push(`${s.noteIds.length} 篇筆記`);
  return parts.join("、") || "尚未選擇";
}

/** 選擇 AI 可以引用的範圍：只列出目前使用者看得到的內容（側邊欄同一份資料） */
export function ReferencePicker({
  open,
  onClose,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  value: ReferenceSelection;
  onChange: (v: ReferenceSelection) => void;
}) {
  const { tree } = useWorkspace();
  const [draft, setDraft] = useState<ReferenceSelection>(value);
  const [filter, setFilter] = useState("");
  const kids = useMemo(() => childrenMap(tree.categories), [tree.categories]);
  const notesMap = useMemo(() => notesByCategory(tree.notes), [tree.notes]);
  const q = filter.trim().toLowerCase();

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDraft(value);
      setFilter("");
    }
  }

  const toggle = (key: keyof ReferenceSelection, id: string) =>
    setDraft((d) => ({ ...d, [key]: d[key].includes(id) ? d[key].filter((x) => x !== id) : [...d[key], id] }));

  const matchesCat = (c: Category): boolean => {
    if (!q) return true;
    if (c.name.toLowerCase().includes(q)) return true;
    if ((notesMap.get(c.id) ?? []).some((n) => n.title.toLowerCase().includes(q))) return true;
    return (kids.get(c.id) ?? []).some(matchesCat);
  };

  const renderCat = (c: Category, depth: number): React.ReactNode => {
    if (!matchesCat(c)) return null;
    const notes = (notesMap.get(c.id) ?? []).filter((n) => !q || n.title.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
    const catChecked = draft.categoryIds.includes(c.id);
    return (
      <div key={c.id}>
        <label className="flex cursor-pointer items-center gap-2 rounded-md py-1 pr-2 text-sm hover:bg-hover" style={{ paddingLeft: 8 + depth * 16 }}>
          <input type="checkbox" checked={catChecked} onChange={() => toggle("categoryIds", c.id)} className="accent-[var(--accent)]" />
          <span className="w-5 text-center">{c.icon || <Folder size={14} className="inline text-faint" />}</span>
          <span className="truncate font-medium">{c.name}</span>
          <span className="text-xs text-faint">（整個分類）</span>
        </label>
        {!catChecked && (
          <>
            {(kids.get(c.id) ?? []).map((child) => renderCat(child, depth + 1))}
            {notes.map((n) => (
              <label key={n.id} className="flex cursor-pointer items-center gap-2 rounded-md py-1 pr-2 text-sm hover:bg-hover" style={{ paddingLeft: 8 + (depth + 1) * 16 }}>
                <input type="checkbox" checked={draft.noteIds.includes(n.id)} onChange={() => toggle("noteIds", n.id)} className="accent-[var(--accent)]" />
                <span className="w-5 text-center">{n.icon || <FileText size={13} className="inline text-faint" />}</span>
                <span className="truncate text-muted">{n.title}</span>
              </label>
            ))}
          </>
        )}
      </div>
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="選擇 AI 可以引用的內容"
      size="lg"
      footer={
        <>
          <span className="mr-auto self-center text-xs text-faint">{selectionSummary(draft)}</span>
          <button type="button" className="btn" onClick={() => setDraft(EMPTY_SELECTION)}>
            清除
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              onChange(draft);
              onClose();
            }}
          >
            確定
          </button>
        </>
      }
    >
      <p className="mb-3 text-xs text-muted">只會列出你看得到的內容。選取的內容會在提問時送給你選擇的 AI 供應商，內容多時會挑選與問題最相關的段落。</p>
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input className="input pl-9" placeholder="篩選分類或筆記標題…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {tree.guides.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-xs font-semibold text-faint">互動教學</div>
          {tree.guides
            .filter((g) => !q || g.title.toLowerCase().includes(q))
            .map((g) => (
              <label key={g.slug} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-hover">
                <input type="checkbox" checked={draft.guides.includes(g.slug)} onChange={() => toggle("guides", g.slug)} className="accent-[var(--accent)]" />
                <span className="w-5 text-center">{g.icon || <BookOpen size={14} className="inline" />}</span>
                {g.title}
                <span className="text-xs text-faint">{GUIDE_HINTS[g.slug] ?? "（教學內容）"}</span>
              </label>
            ))}
        </div>
      )}
      {tree.spaces.map((space) => {
        const roots = spaceRoots(tree.categories, space.userId).filter(matchesCat);
        const loose = (notesMap.get(null) ?? []).filter((n) => n.spaceUserId === space.userId && (!q || n.title.toLowerCase().includes(q)));
        if (!roots.length && !loose.length) return null;
        return (
          <div key={space.key} className="mb-3">
            <div className="mb-1 text-xs font-semibold text-faint">{space.name}</div>
            {roots.map((c) => renderCat(c, 0))}
            {loose.map((n) => (
              <label key={n.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-hover">
                <input type="checkbox" checked={draft.noteIds.includes(n.id)} onChange={() => toggle("noteIds", n.id)} className="accent-[var(--accent)]" />
                <span className="w-5 text-center">{n.icon || <FileText size={13} className="inline text-faint" />}</span>
                <span className="truncate text-muted">{n.title}</span>
              </label>
            ))}
          </div>
        );
      })}
    </Modal>
  );
}
