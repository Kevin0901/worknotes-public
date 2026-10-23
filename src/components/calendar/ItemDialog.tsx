"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FileText, Lock, MapPin, Trash2, Users } from "lucide-react";
import { CALENDAR_COLORS, colorValue, formatDayLabel, taipeiParts } from "@/lib/calendar-utils";
import { api, errorMessage } from "@/lib/client-api";
import { locationLabel } from "@/lib/tree";
import type { CalendarItem, CalendarKind, TaskStatus } from "@/lib/types";
import { Markdown } from "../Markdown";
import { Modal } from "../Modal";
import { useDialogs, useToast } from "../Providers";
import { useWorkspace } from "../workspace";
import { EVENT_TITLE_PLACEHOLDER, TASK_TITLE_PLACEHOLDER } from "@/lib/site-content";

export type DialogState =
  | { mode: "create"; kind: CalendarKind; date: string | null }
  | { mode: "edit"; item: CalendarItem }
  | null;

interface FormValue {
  kind: CalendarKind;
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  status: TaskStatus;
  color: string;
  visibility: "private" | "shared";
  noteId: string;
}

function initialValue(state: NonNullable<DialogState>): FormValue {
  if (state.mode === "create") {
    return {
      kind: state.kind,
      title: "",
      description: "",
      location: "",
      allDay: state.kind === "task",
      startDate: state.date ?? "",
      startTime: "09:00",
      endDate: "",
      endTime: state.kind === "event" ? "10:00" : "",
      status: "todo",
      color: state.kind === "task" ? "orange" : "green",
      visibility: "private",
      noteId: "",
    };
  }
  const it = state.item;
  const s = it.startsAt ? taipeiParts(it.startsAt) : null;
  const e = it.endsAt ? taipeiParts(it.endsAt) : null;
  return {
    kind: it.kind,
    title: it.title,
    description: it.description,
    location: it.location ?? "",
    allDay: it.allDay,
    startDate: s?.dateKey ?? "",
    startTime: s && !it.allDay ? s.time : "09:00",
    endDate: e && e.dateKey !== s?.dateKey ? e.dateKey : "",
    endTime: e && !it.allDay ? e.time : "",
    status: it.status,
    color: it.color ?? "green",
    visibility: it.visibility,
    noteId: it.noteId ?? "",
  };
}

export function canModifyItem(item: CalendarItem, opts: { canEdit: boolean; actor: string | null; isAdmin: boolean }) {
  return opts.canEdit && (opts.isAdmin || item.visibility === "shared" || item.createdBy === opts.actor);
}

export function itemTimeLabel(item: CalendarItem): string {
  if (!item.startsAt) return "未排日期";
  const s = taipeiParts(item.startsAt);
  const e = item.endsAt ? taipeiParts(item.endsAt) : null;
  if (item.allDay) {
    return e && e.dateKey !== s.dateKey ? `${formatDayLabel(s.dateKey)} ～ ${formatDayLabel(e.dateKey)}` : `${formatDayLabel(s.dateKey)} 全天`;
  }
  if (!e) return `${formatDayLabel(s.dateKey)} ${s.time}`;
  return e.dateKey === s.dateKey
    ? `${formatDayLabel(s.dateKey)} ${s.time} ～ ${e.time}`
    : `${formatDayLabel(s.dateKey)} ${s.time} ～ ${formatDayLabel(e.dateKey)} ${e.time}`;
}

export function ItemDialog({
  state,
  onClose,
  actor,
  isAdmin,
}: {
  state: DialogState;
  onClose: () => void;
  actor: string | null;
  isAdmin: boolean;
}) {
  if (!state) return null;
  return <ItemDialogInner key={state.mode === "edit" ? state.item.id : "new"} state={state} onClose={onClose} actor={actor} isAdmin={isAdmin} />;
}

function ItemDialogInner({
  state,
  onClose,
  actor,
  isAdmin,
}: {
  state: NonNullable<DialogState>;
  onClose: () => void;
  actor: string | null;
  isAdmin: boolean;
}) {
  const { tree, viewer } = useWorkspace();
  const router = useRouter();
  const toast = useToast();
  const dialogs = useDialogs();
  const [v, setV] = useState<FormValue>(() => initialValue(state));
  const [busy, setBusy] = useState(false);
  const editable = state.mode === "create" || canModifyItem(state.item, { canEdit: viewer.canEdit, actor, isAdmin });
  const [editing, setEditing] = useState(state.mode === "create");
  const set = <K extends keyof FormValue>(k: K, val: FormValue[K]) => setV((s) => ({ ...s, [k]: val }));

  const noteOptions = useMemo(
    () =>
      [...tree.notes]
        .sort((a, b) => a.title.localeCompare(b.title, "zh-Hant"))
        .map((n) => ({ value: n.id, label: `${n.title}（${locationLabel(tree, n)}）` })),
    [tree],
  );

  const save = async () => {
    if (!v.title.trim()) return toast("請輸入標題", "error");
    if (v.kind === "event" && !v.startDate) return toast("行程需要日期", "error");
    setBusy(true);
    const body = {
      ...v,
      startDate: v.startDate || null,
      startTime: v.allDay ? null : v.startTime || null,
      endDate: v.endDate || null,
      endTime: v.allDay ? null : v.endTime || null,
      noteId: v.noteId || null,
      location: v.location || null,
    };
    try {
      if (state.mode === "create") await api("POST", "/api/calendar", body);
      else await api("PATCH", `/api/calendar/${state.item.id}`, body);
      toast(state.mode === "create" ? "已新增" : "已儲存");
      onClose();
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (state.mode !== "edit") return;
    const ok = await dialogs.confirm({ title: `刪除「${state.item.title}」？`, confirmLabel: "刪除", danger: true });
    if (!ok) return;
    try {
      await api("DELETE", `/api/calendar/${state.item.id}`);
      toast("已刪除");
      onClose();
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  // ── 檢視模式 ──
  if (!editing && state.mode === "edit") {
    const it = state.item;
    const note = it.noteId ? tree.notes.find((n) => n.id === it.noteId) : null;
    return (
      <Modal
        open
        onClose={onClose}
        title={
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: colorValue(it.color) }} />
            {it.kind === "task" ? "待辦" : "行程"}
          </span>
        }
        footer={
          editable ? (
            <>
              <button type="button" className="btn text-danger" onClick={remove}>
                <Trash2 size={15} /> 刪除
              </button>
              <button type="button" className="btn-primary primary-action" onClick={() => setEditing(true)}>
                編輯
              </button>
            </>
          ) : undefined
        }
      >
        <h3 className={`text-lg font-semibold ${it.status === "done" && it.kind === "task" ? "text-faint line-through" : ""}`}>{it.title}</h3>
        <div className="mt-2 space-y-1.5 text-sm text-muted">
          <div>{itemTimeLabel(it)}</div>
          {it.location && (
            <div className="flex items-center gap-1.5">
              <MapPin size={14} /> {it.location}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            {it.visibility === "shared" ? <Users size={14} /> : <Lock size={14} />}
            {it.visibility === "shared" ? "共用（所有核准的使用者可見）" : "僅自己可見"}
          </div>
          {note && (
            <Link href={`/n/${note.id}`} className="flex items-center gap-1.5 text-accent hover:underline" onClick={onClose}>
              <FileText size={14} /> {note.title}
            </Link>
          )}
        </div>
        {it.description.trim() && (
          <div className="mt-4 rounded-lg border border-line p-3">
            <Markdown content={it.description} />
          </div>
        )}
      </Modal>
    );
  }

  // ── 新增／編輯表單 ──
  return (
    <Modal
      open
      onClose={onClose}
      title={state.mode === "create" ? (v.kind === "task" ? "新增待辦" : "新增行程") : "編輯"}
      footer={
        <>
          {state.mode === "edit" && (
            <button type="button" className="btn mr-auto text-danger" onClick={remove} disabled={busy}>
              <Trash2 size={15} /> 刪除
            </button>
          )}
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="button" className="btn-primary" onClick={save} disabled={busy}>
            {busy ? "儲存中…" : "儲存"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex rounded-md border border-line p-0.5 text-sm">
          {(["event", "task"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setV((s) => ({ ...s, kind: k, allDay: k === "task" ? true : s.allDay }))}
              className={`flex-1 rounded px-2 py-1.5 ${v.kind === k ? "bg-active font-medium" : "text-muted"}`}
            >
              {k === "event" ? "📅 行程" : "✅ 待辦事項"}
            </button>
          ))}
        </div>

        <input
          className="input text-base font-medium"
          placeholder={v.kind === "task" ? TASK_TITLE_PLACEHOLDER : EVENT_TITLE_PLACEHOLDER}
          value={v.title}
          onChange={(e) => set("title", e.target.value)}
          maxLength={200}
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && save()}
        />

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={v.allDay} onChange={(e) => set("allDay", e.target.checked)} className="accent-[var(--accent)]" />
            全天{v.kind === "task" && "（待辦可不填日期）"}
          </label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input type="date" className="input" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} aria-label="日期" />
            {!v.allDay && (
              <input type="time" className="input w-28" value={v.startTime} onChange={(e) => set("startTime", e.target.value)} aria-label="開始時間" />
            )}
          </div>
          {v.kind === "event" && (
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
              <span className="text-sm text-muted">到</span>
              <input
                type="date"
                className="input"
                value={v.endDate}
                min={v.startDate || undefined}
                onChange={(e) => set("endDate", e.target.value)}
                aria-label="結束日期"
              />
              {!v.allDay && (
                <input type="time" className="input w-28" value={v.endTime} onChange={(e) => set("endTime", e.target.value)} aria-label="結束時間" />
              )}
            </div>
          )}
          {v.kind === "event" && <p className="text-xs text-faint">結束日期可留空（當天結束）。</p>}
        </div>

        {v.kind === "task" && (
          <label className="block text-sm">
            <span className="mb-1 block text-muted">狀態</span>
            <select className="input" value={v.status} onChange={(e) => set("status", e.target.value as TaskStatus)}>
              <option value="todo">待辦</option>
              <option value="doing">進行中</option>
              <option value="done">完成</option>
            </select>
          </label>
        )}

        <input className="input" placeholder="地點（選填）" value={v.location} onChange={(e) => set("location", e.target.value)} maxLength={200} />

        <textarea
          className="input min-h-24 font-mono text-[13px]"
          placeholder="說明（選填，支援 Markdown）"
          value={v.description}
          onChange={(e) => set("description", e.target.value)}
        />

        <label className="block text-sm">
          <span className="mb-1 block text-muted">相關筆記（選填）</span>
          <select className="input" value={v.noteId} onChange={(e) => set("noteId", e.target.value)}>
            <option value="">（無）</option>
            {noteOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" role="radiogroup" aria-label="顏色">
            {CALENDAR_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={v.color === c.key}
                aria-label={c.label}
                title={c.label}
                onClick={() => set("color", c.key)}
                className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-[var(--card)] ${v.color === c.key ? "ring-2 ring-[var(--fg)]" : ""}`}
                style={{ background: c.value }}
              />
            ))}
          </div>
          <select
            className="input w-auto py-1.5 text-sm"
            value={v.visibility}
            onChange={(e) => set("visibility", e.target.value as "private" | "shared")}
            aria-label="可見範圍"
          >
            <option value="private">🔒 僅自己可見</option>
            <option value="shared">👥 共用給其他使用者</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}
