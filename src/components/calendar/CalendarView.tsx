"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Download, List, Lock, MapPin, Plus } from "lucide-react";
import {
  WEEKDAYS, addDays, colorValue, formatDayLabel, monthGrid, shiftMonth, taipeiParts,
} from "@/lib/calendar-utils";
import { api, errorMessage } from "@/lib/client-api";
import type { CalendarItem, TaskStatus } from "@/lib/types";
import { DropdownMenu } from "../DropdownMenu";
import { useToast } from "../Providers";
import { useWorkspace } from "../workspace";
import { ItemDialog, canModifyItem, itemTimeLabel, type DialogState } from "./ItemDialog";

/** 每個項目涵蓋的日期（跨日行程會出現在每一天，最多 62 天） */
function daysOf(item: CalendarItem): string[] {
  if (!item.startsAt) return [];
  const start = taipeiParts(item.startsAt).dateKey;
  let end = item.endsAt ? taipeiParts(item.endsAt).dateKey : start;
  // 非全天行程在午夜整點結束時，不算進結束那一天
  if (item.endsAt && !item.allDay && taipeiParts(item.endsAt).time === "00:00" && end > start) end = addDays(end, -1);
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 62; d = addDays(d, 1)) out.push(d);
  return out;
}

function groupByDay(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>();
  for (const it of items) {
    for (const d of daysOf(it)) {
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(it);
    }
  }
  return map;
}

/** 顯示在某一天的時間；跨日行程在後續日期顯示「續」 */
function timeOf(item: CalendarItem, day?: string): string {
  if (item.allDay || !item.startsAt) return "";
  const start = taipeiParts(item.startsAt);
  return day && day !== start.dateKey ? "（續）" : start.time;
}

export function CalendarView({
  view,
  month,
  selected,
  today,
  items,
  tasks,
  actor,
  isAdmin,
}: {
  view: "month" | "list";
  month: string;
  selected: string;
  today: string;
  items: CalendarItem[];
  tasks: CalendarItem[];
  actor: string | null;
  isAdmin: boolean;
}) {
  const { viewer } = useWorkspace();
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [day, setDay] = useState(selected);
  const byDay = useMemo(() => groupByDay(items), [items]);
  const [y, m] = month.split("-").map(Number);

  const go = (params: Record<string, string>) => {
    const q = new URLSearchParams({ view, m: month, ...params });
    router.push(`/calendar?${q}`);
  };

  const open = (item: CalendarItem) => setDialog({ mode: "edit", item });
  const create = (kind: "event" | "task", date: string | null) => setDialog({ mode: "create", kind, date });

  return (
    <div className="mx-auto w-full max-w-7xl px-3 pb-24 pt-5 md:px-8 md:pt-8">
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-2 flex items-center gap-2 text-2xl font-bold">
          <CalendarDays size={24} /> 行事曆
        </h1>
        {view === "month" && (
          <div className="flex items-center gap-1">
            <button type="button" className="icon-btn h-8 w-8" aria-label="上個月" onClick={() => go({ m: shiftMonth(month, -1) })}>
              <ChevronLeft size={18} />
            </button>
            <span className="min-w-28 text-center font-semibold tabular-nums">
              {y} 年 {m} 月
            </span>
            <button type="button" className="icon-btn h-8 w-8" aria-label="下個月" onClick={() => go({ m: shiftMonth(month, 1) })}>
              <ChevronRight size={18} />
            </button>
            <button type="button" className="btn ml-1 py-1" onClick={() => router.push(`/calendar?view=month`)}>
              今天
            </button>
          </div>
        )}
        <div className="flex-1" />
        <div className="flex rounded-md border border-line p-0.5 text-sm">
          <button
            type="button"
            className={`flex items-center gap-1 rounded px-2 py-1 ${view === "month" ? "bg-active font-medium" : "text-muted"}`}
            onClick={() => router.push(`/calendar?view=month&m=${month}`)}
          >
            <CalendarDays size={14} /> 月曆
          </button>
          <button
            type="button"
            className={`flex items-center gap-1 rounded px-2 py-1 ${view === "list" ? "bg-active font-medium" : "text-muted"}`}
            onClick={() => router.push(`/calendar?view=list`)}
          >
            <List size={14} /> 清單
          </button>
        </div>
        <DropdownMenu
          label="匯出行事曆"
          align="right"
          trigger={<Download size={17} />}
          triggerClassName="icon-btn h-8 w-8"
          items={[
            { label: "匯出 .ics（Google／Outlook 行事曆）", onSelect: () => (window.location.href = "/api/calendar/export?format=ics") },
            { label: "匯出 CSV（Notion 資料庫）", onSelect: () => (window.location.href = "/api/calendar/export?format=csv") },
          ]}
        />
        {viewer.canEdit && (
          <>
            <button type="button" className="btn" onClick={() => create("task", null)}>
              <Plus size={15} /> 待辦
            </button>
            <button type="button" className="btn-primary" onClick={() => create("event", view === "month" ? day : today)}>
              <Plus size={15} /> 行程
            </button>
          </>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {view === "month" ? (
            <>
              <MonthGrid
                month={month}
                today={today}
                selected={day}
                byDay={byDay}
                onSelect={setDay}
                onOpen={open}
                onCreate={viewer.canEdit ? (d) => create("event", d) : undefined}
              />
              <DayPanel
                date={day}
                items={byDay.get(day) ?? []}
                onOpen={open}
                onCreate={viewer.canEdit ? () => create("event", day) : undefined}
              />
            </>
          ) : (
            <AgendaList today={today} byDay={byDay} onOpen={open} />
          )}
        </div>
        <TaskPanel
          tasks={tasks}
          today={today}
          onOpen={open}
          canToggle={(t) => canModifyItem(t, { canEdit: viewer.canEdit, actor, isAdmin })}
          canCreate={viewer.canEdit}
        />
      </div>

      <ItemDialog state={dialog} onClose={() => setDialog(null)} actor={actor} isAdmin={isAdmin} />
    </div>
  );
}

function Chip({ item, day, onOpen }: { item: CalendarItem; day: string; onOpen: (i: CalendarItem) => void }) {
  const done = item.kind === "task" && item.status === "done";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(item);
      }}
      className="flex w-full min-w-0 items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11.5px] leading-tight hover:brightness-95"
      style={{ background: `color-mix(in srgb, ${colorValue(item.color)} 16%, transparent)`, borderLeft: `3px solid ${colorValue(item.color)}` }}
      title={`${itemTimeLabel(item)} ${item.title}`}
    >
      {item.kind === "task" && <span>{done ? "☑" : "☐"}</span>}
      {timeOf(item, day) && <span className="shrink-0 tabular-nums text-muted">{timeOf(item, day)}</span>}
      <span className={`truncate ${done ? "text-faint line-through" : ""}`}>{item.title}</span>
    </button>
  );
}

function MonthGrid({
  month,
  today,
  selected,
  byDay,
  onSelect,
  onOpen,
  onCreate,
}: {
  month: string;
  today: string;
  selected: string;
  byDay: Map<string, CalendarItem[]>;
  onSelect: (d: string) => void;
  onOpen: (i: CalendarItem) => void;
  onCreate?: (d: string) => void;
}) {
  const days = monthGrid(month);
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="grid grid-cols-7 border-b border-line bg-subtle text-center text-xs text-muted">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`py-1.5 ${i === 0 || i === 6 ? "text-faint" : ""}`}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, idx) => {
          const list = byDay.get(d) ?? [];
          const inMonth = d.startsWith(month);
          const isToday = d === today;
          const isSel = d === selected;
          return (
            <div
              key={d}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(d)}
              onDoubleClick={() => onCreate?.(d)}
              onKeyDown={(e) => e.key === "Enter" && onSelect(d)}
              className={`group relative min-h-16 cursor-pointer border-line p-1 text-left outline-none md:min-h-28 ${
                idx % 7 !== 6 ? "border-r" : ""
              } ${idx < 35 ? "border-b" : ""} ${inMonth ? "" : "bg-subtle/60"} ${isSel ? "bg-accent-soft" : "hover:bg-hover"}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums ${
                    isToday ? "bg-accent font-semibold text-accent-fg" : inMonth ? "" : "text-faint"
                  }`}
                >
                  {Number(d.slice(8))}
                </span>
                {onCreate && (
                  <button
                    type="button"
                    className="hidden h-5 w-5 items-center justify-center rounded text-faint hover:bg-active hover:text-fg md:group-hover:flex"
                    aria-label={`在 ${d} 新增行程`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreate(d);
                    }}
                  >
                    <Plus size={13} />
                  </button>
                )}
              </div>
              {/* 桌機：顯示標題；手機：只顯示色點 */}
              <div className="mt-0.5 hidden space-y-0.5 md:block">
                {list.slice(0, 3).map((it) => (
                  <Chip key={it.id} item={it} day={d} onOpen={onOpen} />
                ))}
                {list.length > 3 && <div className="px-1 text-[11px] text-muted">還有 {list.length - 3} 筆</div>}
              </div>
              {list.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-0.5 md:hidden">
                  {list.slice(0, 4).map((it) => (
                    <span key={it.id} className="h-1.5 w-1.5 rounded-full" style={{ background: colorValue(it.color) }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ItemRow({ item, day, onOpen }: { item: CalendarItem; day: string; onOpen: (i: CalendarItem) => void }) {
  const done = item.kind === "task" && item.status === "done";
  const time = item.allDay ? "全天" : timeOf(item, day);
  const end = item.endsAt && !item.allDay ? taipeiParts(item.endsAt).time : "";
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-hover"
    >
      <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: colorValue(item.color) }} />
      <span className="w-20 shrink-0 text-sm tabular-nums text-muted">
        {time}
        {end && <span className="block text-xs text-faint">～{end}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium ${done ? "text-faint line-through" : ""}`}>
          {item.kind === "task" && (done ? "☑ " : "☐ ")}
          {item.title}
          {item.visibility === "private" && <Lock size={11} className="ml-1 inline text-faint" />}
        </span>
        {item.location && (
          <span className="flex items-center gap-1 text-xs text-muted">
            <MapPin size={11} /> {item.location}
          </span>
        )}
      </span>
    </button>
  );
}

function DayPanel({
  date,
  items,
  onOpen,
  onCreate,
}: {
  date: string;
  items: CalendarItem[];
  onOpen: (i: CalendarItem) => void;
  onCreate?: () => void;
}) {
  return (
    <section className="card mt-4 p-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="font-semibold">{formatDayLabel(date)}</h2>
        {onCreate && (
          <button type="button" className="btn-ghost" onClick={onCreate}>
            <Plus size={15} /> 新增
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="px-1 py-4 text-sm text-faint">這天沒有行程</p>
      ) : (
        <div className="mt-1">
          {items.map((it) => (
            <ItemRow key={it.id} item={it} day={date} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  );
}

function AgendaList({ today, byDay, onOpen }: { today: string; byDay: Map<string, CalendarItem[]>; onOpen: (i: CalendarItem) => void }) {
  const days = [...byDay.keys()].filter((d) => d >= today).sort();
  if (days.length === 0) {
    return <p className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-faint">未來 60 天沒有行程</p>;
  }
  return (
    <div className="space-y-4">
      {days.map((d) => (
        <section key={d} className="card p-3">
          <h2 className={`px-1 font-semibold ${d === today ? "text-accent" : ""}`}>
            {formatDayLabel(d)}
            {d === today && <span className="ml-2 text-xs font-normal">今天</span>}
          </h2>
          <div className="mt-1">
            {byDay.get(d)!.map((it) => (
              <ItemRow key={`${d}-${it.id}`} item={it} day={d} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TaskPanel({
  tasks,
  today,
  onOpen,
  canToggle,
  canCreate,
}: {
  tasks: CalendarItem[];
  today: string;
  onOpen: (i: CalendarItem) => void;
  canToggle: (t: CalendarItem) => boolean;
  canCreate: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [quick, setQuick] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (t: CalendarItem) => {
    setBusy(t.id);
    const status: TaskStatus = t.status === "done" ? "todo" : "done";
    try {
      await api("PATCH", `/api/calendar/${t.id}`, { status });
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  };

  const addQuick = async () => {
    const title = quick.trim();
    if (!title) return;
    try {
      await api("POST", "/api/calendar", { kind: "task", title, allDay: true, status: "todo", color: "orange" });
      setQuick("");
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const open = tasks.filter((t) => t.status !== "done");
  const key = (t: CalendarItem) => (t.startsAt ? taipeiParts(t.startsAt).dateKey : null);
  const groups: { label: string; tone?: string; list: CalendarItem[] }[] = [
    { label: "已逾期", tone: "text-danger", list: open.filter((t) => key(t) && key(t)! < today) },
    { label: "今天", tone: "text-accent", list: open.filter((t) => key(t) === today) },
    { label: "之後", list: open.filter((t) => key(t) && key(t)! > today) },
    { label: "未排日期", list: open.filter((t) => !key(t)) },
    { label: "最近完成", tone: "text-faint", list: tasks.filter((t) => t.status === "done") },
  ];

  return (
    <aside className="card h-fit p-4 lg:sticky lg:top-4">
      <h2 className="font-semibold">待辦事項（{open.length}）</h2>
      {canCreate && (
        <input
          className="input mt-3"
          placeholder="快速新增待辦，按 Enter"
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) addQuick();
          }}
          maxLength={200}
        />
      )}
      {tasks.length === 0 && <p className="mt-4 text-sm text-faint">沒有待辦事項 🎉</p>}
      {groups.map(
        (g) =>
          g.list.length > 0 && (
            <div key={g.label} className="mt-4">
              <div className={`mb-1 text-xs font-semibold ${g.tone ?? "text-muted"}`}>
                {g.label}（{g.list.length}）
              </div>
              <ul className="space-y-0.5">
                {g.list.map((t) => (
                  <li key={t.id} className="flex items-start gap-2 rounded-md px-1 py-1 hover:bg-hover">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                      checked={t.status === "done"}
                      disabled={!canToggle(t) || busy === t.id}
                      onChange={() => toggle(t)}
                      aria-label={`完成：${t.title}`}
                    />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(t)}>
                      <span className={`block text-sm ${t.status === "done" ? "text-faint line-through" : ""}`}>
                        {t.title}
                        {t.status === "doing" && <span className="ml-1 rounded bg-warn-soft px-1 text-[11px] text-warn">進行中</span>}
                      </span>
                      {t.startsAt && <span className="text-xs text-faint">{formatDayLabel(key(t)!)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ),
      )}
      <p className="mt-4 border-t border-line pt-3 text-xs text-faint">
        有日期的待辦也會顯示在月曆上。可在 <Link href="/" className="underline">首頁</Link> 看到今天的行程與到期事項。
      </p>
    </aside>
  );
}
