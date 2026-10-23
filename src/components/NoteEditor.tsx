"use client";

import { useEffect, useRef, useState } from "react";
import { Code2, Hash, Pencil, Save, Type, X } from "lucide-react";
import type { Note } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { sameRendering } from "./editor/markdown-utils";
import { RichEditor, type RichEditorHandle } from "./editor/RichEditor";
import { useDialogs } from "./Providers";
import { MARKDOWN_PLACEHOLDER } from "@/lib/site-content";

export interface EditorValue {
  title: string;
  icon: string;
  content: string;
  tags: string[];
}

interface Draft extends EditorValue {
  base: string;
  savedAt: string;
}

type Mode = "rich" | "source";

const draftKey = (id: string) => `wn:draft:${id}`;

function parseTags(input: string): string[] {
  return [...new Set(input.split(/[,，\s]+/).map((t) => t.trim().replace(/^#/, "")).filter(Boolean))].slice(0, 20);
}

export function NoteEditor({
  note,
  saving,
  onSave,
  onCancel,
}: {
  note: Note;
  saving: boolean;
  onSave: (value: EditorValue) => void;
  onCancel: (dirty: boolean) => void;
}) {
  const dialogs = useDialogs();
  const editorRef = useRef<RichEditorHandle>(null);
  const [title, setTitle] = useState(note.title);
  const [icon, setIcon] = useState(note.icon ?? "");
  const [tagInput, setTagInput] = useState(note.tags.join(", "));
  const [mode, setMode] = useState<Mode>("rich");
  const [source, setSource] = useState(note.content);
  /** 視覺編輯器載入原始內容後的 Markdown，用來判斷有沒有修改 */
  const [baseline, setBaseline] = useState<string | null>(null);
  const [content, setContent] = useState(note.content);
  const [changes, setChanges] = useState(0);
  const [lossy, setLossy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  // 視覺編輯器有變動時，稍後再轉成 Markdown（避免每打一個字就轉換整份文件）
  useEffect(() => {
    if (changes === 0 || mode !== "rich") return;
    const t = setTimeout(() => setContent(editorRef.current?.getMarkdown() ?? ""), 400);
    return () => clearTimeout(t);
  }, [changes, mode]);

  const currentContent = mode === "source" ? source : content;
  const contentDirty =
    mode === "source" ? source !== note.content && source !== baseline : baseline !== null && content !== baseline;
  const tags = parseTags(tagInput);
  const dirty = contentDirty || title !== note.title || icon !== (note.icon ?? "") || tags.join(",") !== note.tags.join(",");

  // 讀取未儲存的草稿
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey(note.id));
      if (!raw) return;
      const d = JSON.parse(raw) as Draft;
      if (d.content !== note.content || d.title !== note.title) setDraft(d);
      else localStorage.removeItem(draftKey(note.id));
    } catch {
      /* ignore */
    }
  }, [note.id, note.content, note.title]);

  // 自動暫存草稿（避免手機切換 App 或斷線時遺失內容）
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      try {
        const d: Draft = { title, icon, content: currentContent, tags, base: note.updatedAt, savedAt: new Date().toISOString() };
        localStorage.setItem(draftKey(note.id), JSON.stringify(d));
      } catch {
        /* ignore */
      }
    }, 800);
    return () => clearTimeout(t);
    // tags 由 tagInput 計算而來，以 tagInput 作為相依
  }, [dirty, title, icon, currentContent, tagInput, note.id, note.updatedAt]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const latestContent = () => (mode === "source" ? source : editorRef.current?.getMarkdown() ?? content);

  const save = () => {
    if (saving) return;
    const md = latestContent();
    // 內容沒有改動時保留原本的 Markdown 寫法，不因為編輯器而重新排版
    const unchanged = md === baseline || md === note.content;
    onSave({ title: title.trim() || "未命名筆記", icon, tags, content: unchanged ? note.content : md });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const switchMode = async (next: Mode) => {
    if (next === mode) return;
    if (next === "source") {
      setSource(editorRef.current?.getMarkdown() ?? content);
      setMode("source");
      return;
    }
    if (lossy && source === note.content) {
      const ok = await dialogs.confirm({
        title: "切換到視覺編輯？",
        message: "這篇筆記有部分 Markdown 寫法視覺編輯器無法完整保留（例如 HTML 或特殊語法），切換後儲存可能會改變這些內容。",
        confirmLabel: "仍要切換",
      });
      if (!ok) return;
    }
    editorRef.current?.setMarkdown(source);
    setContent(editorRef.current?.getMarkdown() ?? source);
    setMode("rich");
  };

  const restoreDraft = (d: Draft) => {
    setTitle(d.title);
    setIcon(d.icon);
    setTagInput(d.tags.join(", "));
    if (mode === "source") setSource(d.content);
    else {
      editorRef.current?.setMarkdown(d.content);
      setContent(editorRef.current?.getMarkdown() ?? d.content);
    }
    setDraft(null);
  };

  const header = (toolbar: React.ReactNode) => (
    <div className="sticky top-0 z-20 -mx-4 border-b border-line bg-bg/95 px-4 backdrop-blur md:-mx-10 md:px-10">
      <div className="flex flex-wrap items-center gap-2 py-2">
        <span className="flex items-center gap-1.5 text-sm text-muted">
          <Pencil size={15} />
          <span className="hidden sm:inline">編輯中</span>
          {dirty && <span className="text-warn"><span className="hidden sm:inline">・</span>尚未儲存</span>}
        </span>
        <div className="flex-1" />
        <div className="flex rounded-md border border-line p-0.5 text-sm" role="group" aria-label="編輯模式">
          <button
            type="button"
            onClick={() => switchMode("rich")}
            className={`flex items-center gap-1 rounded px-2 py-1 ${mode === "rich" ? "bg-active font-medium" : "text-muted"}`}
            title="所見即所得編輯"
          >
            <Type size={14} /> 視覺
          </button>
          <button
            type="button"
            onClick={() => switchMode("source")}
            className={`flex items-center gap-1 rounded px-2 py-1 ${mode === "source" ? "bg-active font-medium" : "text-muted"}`}
            title="直接編輯 Markdown 原始碼"
          >
            <Code2 size={14} /> <span className="hidden sm:inline">Markdown</span><span className="sm:hidden">MD</span>
          </button>
        </div>
        <button type="button" className="btn" onClick={() => onCancel(dirty)} disabled={saving}>
          <X size={15} />
          <span className="hidden sm:inline">取消</span>
        </button>
        <button type="button" className="btn-primary" onClick={save} disabled={saving}>
          <Save size={15} />
          {saving ? "儲存中…" : "儲存"}
        </button>
      </div>
      {toolbar && <div className="-mt-1 pb-1">{toolbar}</div>}
    </div>
  );

  const top = (
    <>
      {draft && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-sm">
          <span className="flex-1">發現 {formatDateTime(draft.savedAt)} 未儲存的草稿，要還原嗎？</span>
          <button type="button" className="btn" onClick={() => restoreDraft(draft)}>
            還原草稿
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              localStorage.removeItem(draftKey(note.id));
              setDraft(null);
            }}
          >
            捨棄
          </button>
        </div>
      )}
      {lossy && mode === "source" && (
        <p className="mt-4 rounded-lg border border-line bg-subtle px-3 py-2 text-sm text-muted">
          這篇筆記含有視覺編輯器無法完整保留的寫法，已自動切換到 Markdown 模式，內容會原樣保存。
        </p>
      )}

      <div className="mt-6 flex items-start gap-2">
        <input
          value={icon}
          onChange={(e) => setIcon(e.target.value.slice(0, 16))}
          placeholder="🙂"
          title="圖示（可輸入 emoji）"
          aria-label="圖示"
          className="h-12 w-14 shrink-0 rounded-md border border-transparent bg-transparent text-center text-2xl outline-none hover:border-line focus:border-accent"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="筆記標題"
          maxLength={200}
          aria-label="標題"
          className="h-12 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-[1.75rem] font-bold outline-none hover:border-line focus:border-accent md:text-[2.1rem]"
        />
      </div>
      <label className="mb-6 mt-2 flex items-center gap-2 text-sm text-muted">
        <Hash size={14} className="shrink-0" />
        <input
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-1 outline-none hover:border-line focus:border-accent"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          placeholder="標籤（以逗號或空白分隔，例如：driver, ubuntu）"
          aria-label="標籤"
        />
      </label>
    </>
  );

  return (
    <div className="mx-auto w-full max-w-[940px] px-4 pb-24 md:px-10">
      <RichEditor
        ref={editorRef}
        initialMarkdown={note.content}
        hidden={mode === "source"}
        header={header}
        top={top}
        onChange={() => setChanges((n) => n + 1)}
        onReady={(md) => {
          setBaseline(md);
          setContent(md);
          // 視覺編輯器無法完整保留的內容，改用 Markdown 模式編輯以免遺失
          if (note.content.trim() && !sameRendering(note.content, md)) {
            setLossy(true);
            setSource(note.content);
            setMode("source");
          }
        }}
      />

      {mode === "source" && (
        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Tab" && !e.shiftKey) {
              e.preventDefault();
              const ta = e.currentTarget;
              const { selectionStart: s, selectionEnd: end } = ta;
              setSource(source.slice(0, s) + "  " + source.slice(end));
              requestAnimationFrame(() => ta.setSelectionRange(s + 2, s + 2));
            }
          }}
          spellCheck={false}
          placeholder={MARKDOWN_PLACEHOLDER}
          className="block min-h-[60dvh] w-full resize-y rounded-lg border border-line bg-bg p-4 font-mono text-[13.5px] leading-relaxed outline-none focus:border-accent"
        />
      )}

      <p className="mt-6 text-xs leading-relaxed text-faint">
        {mode === "rich"
          ? "直接輸入即可。選取文字會出現樣式工具列，按滑鼠右鍵有剪下／複製／貼上與更多樣式；輸入「/」插入標題、清單、指令區塊、表格或地圖，輸入「[[」連結其他筆記。Ctrl + S 儲存。"
          : "Markdown 模式：標題（##）、清單（-）、表格、```指令區塊```、[[筆記標題]] 連結。Ctrl + S 儲存、Tab 縮排。"}
      </p>
    </div>
  );
}

export function clearDraft(noteId: string) {
  try {
    localStorage.removeItem(draftKey(noteId));
  } catch {
    /* ignore */
  }
}
