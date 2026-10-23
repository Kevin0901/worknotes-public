"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ChevronRight, Download, Ellipsis, FolderInput, History, Link2, ListTree, Pencil, Pin, PinOff, RotateCcw, Share2, Tag,
  Trash2,
} from "lucide-react";
import { AccessBadge } from "./AccessBadge";
import { downloadNoteMarkdown } from "./transfer/client";
import { api, errorMessage } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";
import { categoryPath, spaceLabel, uncategorizedHref } from "@/lib/tree";
import type { Note, Revision } from "@/lib/types";
import { DropdownMenu } from "./DropdownMenu";
import { Markdown } from "./Markdown";
import { Modal } from "./Modal";
import { clearDraft, NoteEditor, type EditorValue } from "./NoteEditor";
import { useDialogs, useToast } from "./Providers";
import { useWorkspace, useWorkspaceActions } from "./workspace";

function displayActor(actor: string | null): string {
  if (!actor) return "—";
  if (actor === "system") return "系統預設";
  if (actor.startsWith("admin:")) return `管理員 ${actor.slice(6)}`;
  return actor;
}

/** 依內容中的 h2/h3 產生目錄 */
function Toc({ content }: { content: string }) {
  const [items, setItems] = useState<{ id: string; text: string; level: number }[]>([]);
  useEffect(() => {
    const root = document.getElementById("note-content");
    if (!root) return;
    const hs = Array.from(root.querySelectorAll<HTMLHeadingElement>("h2[id], h3[id]"));
    setItems(hs.map((h) => ({ id: h.id, text: h.textContent ?? "", level: h.tagName === "H2" ? 2 : 3 })));
  }, [content]);
  if (items.length < 2) return null;
  return (
    <nav className="text-sm">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-faint">
        <ListTree size={14} /> 目錄
      </div>
      <ul className="space-y-1 border-l border-line">
        {items.map((it) => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              className={`-ml-px block border-l border-transparent py-0.5 text-muted hover:border-accent hover:text-fg ${
                it.level === 3 ? "pl-6 text-[13px]" : "pl-3"
              }`}
            >
              {it.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function RevisionsModal({
  note,
  open,
  onClose,
  canEdit,
  onRestored,
}: {
  note: Note;
  open: boolean;
  onClose: () => void;
  canEdit: boolean;
  onRestored: (note: Note) => void;
}) {
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [selected, setSelected] = useState<Revision | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const dialogs = useDialogs();

  useEffect(() => {
    if (!open) return;
    setRevisions(null);
    setSelected(null);
    api<{ revisions: Revision[] }>("GET", `/api/notes/${note.id}/revisions`)
      .then((r) => {
        setRevisions(r.revisions);
        setSelected(r.revisions[0] ?? null);
      })
      .catch((err) => toast(errorMessage(err), "error"));
  }, [open, note.id, toast]);

  const restore = async () => {
    if (!selected) return;
    const ok = await dialogs.confirm({
      title: "還原到這個版本？",
      message: `會以 ${formatDateTime(selected.createdAt)} 的版本取代目前內容（目前內容也會保留為一個版本）。`,
      confirmLabel: "還原",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api<{ note: Note }>("POST", `/api/notes/${note.id}/revisions/${selected.id}`);
      toast("已還原版本");
      onRestored(res.note);
      onClose();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="版本紀錄"
      size="xl"
      footer={
        canEdit && selected ? (
          <button type="button" className="btn-primary" onClick={restore} disabled={busy}>
            <RotateCcw size={15} /> 還原此版本
          </button>
        ) : undefined
      }
    >
      {revisions === null ? (
        <p className="py-8 text-center text-sm text-faint">載入中…</p>
      ) : revisions.length === 0 ? (
        <p className="py-8 text-center text-sm text-faint">還沒有歷史版本（每次修改內容或標題時會自動保留前一版，最多 30 筆）。</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <ul className="flex gap-1 overflow-x-auto md:max-h-[60vh] md:flex-col md:overflow-y-auto">
            {revisions.map((r) => (
              <li key={r.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setSelected(r)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-hover ${selected?.id === r.id ? "bg-active" : ""}`}
                >
                  <div className="font-medium">{formatDateTime(r.createdAt)}</div>
                  <div className="truncate text-xs text-faint">{displayActor(r.editedBy)}</div>
                </button>
              </li>
            ))}
          </ul>
          {selected && (
            <div className="min-w-0 rounded-lg border border-line p-4">
              <h3 className="mb-3 text-lg font-semibold">{selected.title}</h3>
              <Markdown content={selected.content} />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export function NoteView({ initialNote, startEditing }: { initialNote: Note; startEditing: boolean }) {
  const { tree } = useWorkspace();
  const actions = useWorkspaceActions();
  const router = useRouter();
  const toast = useToast();
  const dialogs = useDialogs();
  const [note, setNote] = useState(initialNote);
  const canEdit = note.canEdit;
  const [editing, setEditing] = useState(startEditing && initialNote.canEdit);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const firstRender = useRef(true);

  // 伺服器重新整理（router.refresh）後同步最新資料
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!editing) setNote(initialNote);
  }, [initialNote, editing]);

  const path = categoryPath(tree.categories, note.categoryId);

  const exitEditUrl = () => {
    if (window.location.search.includes("edit=1")) router.replace(`/n/${note.id}`, { scroll: false });
  };

  const save = async (value: EditorValue) => {
    setSaving(true);
    try {
      const res = await api<{ note: Note }>("PATCH", `/api/notes/${note.id}`, {
        title: value.title,
        icon: value.icon || null,
        content: value.content,
        tags: value.tags,
        baseUpdatedAt: note.updatedAt,
      });
      setNote(res.note);
      clearDraft(note.id);
      setEditing(false);
      toast("已儲存");
      exitEditUrl();
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (dirty: boolean) => {
    if (dirty) {
      const ok = await dialogs.confirm({
        title: "放棄未儲存的修改？",
        message: "目前的修改不會被儲存（草稿也會一併清除）。",
        confirmLabel: "放棄修改",
        danger: true,
      });
      if (!ok) return;
    }
    clearDraft(note.id);
    setEditing(false);
    exitEditUrl();
  };

  if (editing) {
    return <NoteEditor note={note} saving={saving} onSave={save} onCancel={cancel} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] gap-10 px-4 pb-24 pt-5 md:px-10 md:pt-8">
      <article className="min-w-0 flex-1">
        <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted">
          <Link href="/" className="hover:text-fg">
            首頁
          </Link>
          <ChevronRight size={14} className="text-faint" />
          <span>{spaceLabel(tree, note.spaceUserId)}</span>
          {path.length === 0 && (
            <>
              <ChevronRight size={14} className="text-faint" />
              <Link href={uncategorizedHref(note.spaceUserId)} className="hover:text-fg">
                未分類
              </Link>
            </>
          )}
          {path.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <ChevronRight size={14} className="text-faint" />
              <Link href={`/c/${c.id}`} className="hover:text-fg">
                {c.icon} {c.name}
              </Link>
            </span>
          ))}
        </nav>

        <header className="mb-6">
          <div className="flex items-start gap-3">
            <h1 className="min-w-0 flex-1 text-[1.75rem] font-bold leading-tight md:text-[2.1rem]">
              {note.icon && <span className="mr-2">{note.icon}</span>}
              {note.title}
            </h1>
            <div className="flex shrink-0 items-center gap-1 pt-1">
              {canEdit && (
                <button type="button" className="btn" onClick={() => setEditing(true)}>
                  <Pencil size={15} />
                  <span className="hidden sm:inline">編輯</span>
                </button>
              )}
              <DropdownMenu
                label="更多操作"
                align="right"
                trigger={<Ellipsis size={18} />}
                triggerClassName="icon-btn h-8 w-8"
                items={[
                  {
                    label: "複製筆記連結",
                    icon: <Link2 size={15} />,
                    onSelect: () => {
                      navigator.clipboard.writeText(window.location.href.split("?")[0]).then(() => toast("已複製連結"));
                    },
                  },
                  { label: "版本紀錄", icon: <History size={15} />, onSelect: () => setHistoryOpen(true) },
                  { label: "下載 Markdown（.md）", icon: <Download size={15} />, onSelect: () => downloadNoteMarkdown(note) },
                  ...(note.canManage
                    ? [{ label: "分享與權限", icon: <Share2 size={15} />, onSelect: () => actions.shareNote(note) }]
                    : []),
                  ...(canEdit
                    ? [
                        {
                          label: note.pinned ? "取消釘選" : "釘選到首頁",
                          icon: note.pinned ? <PinOff size={15} /> : <Pin size={15} />,
                          onSelect: () => actions.togglePin(note),
                        },
                        { label: "移動到…", icon: <FolderInput size={15} />, onSelect: () => actions.moveNoteTo(note) },
                        { label: "", onSelect: () => {}, divider: true },
                        { label: "移到垃圾桶", icon: <Trash2 size={15} />, danger: true, onSelect: () => actions.trashNote(note) },
                      ]
                    : []),
                ]}
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-faint">
            <AccessBadge item={note} parentId={note.categoryId} />
            <span>更新於 {formatDateTime(note.updatedAt)}</span>
            <span>編輯者 {displayActor(note.updatedBy)}</span>
            {note.pinned && (
              <span className="flex items-center gap-1">
                <Pin size={12} /> 已釘選
              </span>
            )}
          </div>
          {note.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {note.tags.map((t) => (
                <Link key={t} href={`/search?q=${encodeURIComponent(t)}`} className="chip hover:text-fg">
                  <Tag size={11} />
                  {t}
                </Link>
              ))}
            </div>
          )}
        </header>

        <div id="note-content">
          {note.content.trim() ? (
            <Markdown content={note.content} />
          ) : (
            <div className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-faint">
              這篇筆記還沒有內容
              {canEdit && (
                <div className="mt-3">
                  <button type="button" className="btn" onClick={() => setEditing(true)}>
                    <Pencil size={15} /> 開始撰寫
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </article>

      <aside className="hidden w-56 shrink-0 xl:block">
        <div className="sticky top-6 max-h-[calc(100dvh-7rem)] overflow-y-auto thin-scroll">
          <Toc content={note.content} />
        </div>
      </aside>

      <RevisionsModal
        note={note}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        canEdit={canEdit}
        onRestored={(n) => {
          setNote(n);
          router.refresh();
        }}
      />
    </div>
  );
}
