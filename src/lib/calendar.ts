import "server-only";
import type { Viewer } from "./auth";
import { DATE_RE, TIME_RE, addDays, taipeiDate } from "./calendar-utils";
import { db, type Sql } from "./db";
import { HttpError } from "./http";
import type { CalendarItem, CalendarKind, TaskStatus } from "./types";

interface ItemRow {
  id: string;
  kind: CalendarKind;
  title: string;
  description: string;
  location: string | null;
  starts_at: Date | null;
  ends_at: Date | null;
  all_day: boolean;
  status: TaskStatus;
  color: string | null;
  visibility: "private" | "shared";
  note_id: string | null;
  created_by: string | null;
  updated_at: Date;
  completed_at: Date | null;
}

const toItem = (r: ItemRow): CalendarItem => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  description: r.description,
  location: r.location,
  startsAt: r.starts_at?.toISOString() ?? null,
  endsAt: r.ends_at?.toISOString() ?? null,
  allDay: r.all_day,
  status: r.status,
  color: r.color,
  visibility: r.visibility,
  noteId: r.note_id,
  createdBy: r.created_by,
  updatedAt: r.updated_at.toISOString(),
  completedAt: r.completed_at?.toISOString() ?? null,
});

/** 私人項目只有建立者（與管理員）看得到 */
function visibleTo(sql: Sql, viewer: Viewer) {
  if (viewer.admin) return sql`TRUE`;
  return sql`(visibility = 'shared' OR created_by = ${viewer.actor ?? ""})`;
}

export function canModify(item: CalendarItem, viewer: Viewer): boolean {
  if (!viewer.canEdit) return false;
  return !!viewer.admin || item.visibility === "shared" || item.createdBy === viewer.actor;
}

/** 與 [from, to) 日期區間重疊的行程與有日期的待辦 */
export async function listRange(viewer: Viewer, fromKey: string, toKeyExclusive: string): Promise<CalendarItem[]> {
  const sql = await db();
  const from = taipeiDate(fromKey);
  const to = taipeiDate(toKeyExclusive);
  const rows = await sql<ItemRow[]>`
    SELECT * FROM calendar_items
    WHERE starts_at IS NOT NULL AND starts_at < ${to} AND COALESCE(ends_at, starts_at) >= ${from}
      AND ${visibleTo(sql, viewer)}
    ORDER BY all_day DESC, starts_at, created_at`;
  return rows.map(toItem);
}

/** 未完成的待辦（含沒有日期的），以及最近 7 天完成的 */
export async function listTasks(viewer: Viewer): Promise<CalendarItem[]> {
  const sql = await db();
  const rows = await sql<ItemRow[]>`
    SELECT * FROM calendar_items
    WHERE kind = 'task' AND (status <> 'done' OR completed_at > now() - interval '7 days')
      AND ${visibleTo(sql, viewer)}
    ORDER BY (status = 'done'), starts_at NULLS LAST, created_at`;
  return rows.map(toItem);
}

export async function getItem(id: string, viewer: Viewer): Promise<CalendarItem | null> {
  const sql = await db();
  const rows = await sql<ItemRow[]>`SELECT * FROM calendar_items WHERE id = ${id} AND ${visibleTo(sql, viewer)}`;
  return rows[0] ? toItem(rows[0]) : null;
}

export interface ItemInput {
  kind: CalendarKind;
  title: string;
  description: string;
  location: string | null;
  allDay: boolean;
  startDate: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  status: TaskStatus;
  color: string | null;
  visibility: "private" | "shared";
  noteId: string | null;
}

/** 驗證並把日期欄位轉成資料庫時間 */
function resolveTimes(input: ItemInput): { startsAt: Date | null; endsAt: Date | null } {
  if (!input.startDate) {
    if (input.kind === "event") throw new HttpError(400, "行程需要日期");
    return { startsAt: null, endsAt: null };
  }
  if (!DATE_RE.test(input.startDate)) throw new HttpError(400, "日期格式錯誤");
  if (input.endDate && !DATE_RE.test(input.endDate)) throw new HttpError(400, "結束日期格式錯誤");
  if (input.allDay) {
    const end = input.endDate && input.endDate > input.startDate ? input.endDate : null;
    return { startsAt: taipeiDate(input.startDate), endsAt: end ? taipeiDate(end) : null };
  }
  const startTime = input.startTime && TIME_RE.test(input.startTime) ? input.startTime : "09:00";
  const startsAt = taipeiDate(input.startDate, startTime);
  let endsAt: Date | null = null;
  if (input.endTime && TIME_RE.test(input.endTime)) {
    endsAt = taipeiDate(input.endDate || input.startDate, input.endTime);
    if (endsAt <= startsAt) {
      // 結束時間早於開始：視為隔天（例如 22:00 ~ 02:00）
      endsAt = taipeiDate(addDays(input.endDate || input.startDate, 1), input.endTime);
    }
  }
  return { startsAt, endsAt };
}

export async function createItem(input: ItemInput, actor: string | null): Promise<CalendarItem> {
  const sql = await db();
  const { startsAt, endsAt } = resolveTimes(input);
  const rows = await sql<ItemRow[]>`
    INSERT INTO calendar_items (kind, title, description, location, starts_at, ends_at, all_day, status, color,
      visibility, note_id, created_by, updated_by, completed_at)
    VALUES (${input.kind}, ${input.title}, ${input.description}, ${input.location}, ${startsAt}, ${endsAt},
      ${input.allDay}, ${input.status}, ${input.color}, ${input.visibility}, ${input.noteId}, ${actor}, ${actor},
      ${input.kind === "task" && input.status === "done" ? sql`now()` : null})
    RETURNING *`;
  return toItem(rows[0]);
}

export async function updateItem(id: string, input: ItemInput, actor: string | null): Promise<CalendarItem> {
  const sql = await db();
  const { startsAt, endsAt } = resolveTimes(input);
  const rows = await sql<ItemRow[]>`
    UPDATE calendar_items SET
      kind = ${input.kind}, title = ${input.title}, description = ${input.description}, location = ${input.location},
      starts_at = ${startsAt}, ends_at = ${endsAt}, all_day = ${input.allDay}, status = ${input.status},
      color = ${input.color}, visibility = ${input.visibility}, note_id = ${input.noteId}, updated_by = ${actor},
      updated_at = now(),
      completed_at = CASE WHEN ${input.kind === "task" && input.status === "done"} THEN COALESCE(completed_at, now()) ELSE NULL END
    WHERE id = ${id}
    RETURNING *`;
  if (!rows[0]) throw new HttpError(404, "找不到這個項目");
  return toItem(rows[0]);
}

export async function setTaskStatus(id: string, status: TaskStatus, actor: string | null): Promise<CalendarItem> {
  const sql = await db();
  const rows = await sql<ItemRow[]>`
    UPDATE calendar_items SET status = ${status}, updated_by = ${actor}, updated_at = now(),
      completed_at = CASE WHEN ${status === "done"} THEN COALESCE(completed_at, now()) ELSE NULL END
    WHERE id = ${id} AND kind = 'task'
    RETURNING *`;
  if (!rows[0]) throw new HttpError(404, "找不到這個待辦");
  return toItem(rows[0]);
}

export async function deleteItem(id: string): Promise<void> {
  const sql = await db();
  await sql`DELETE FROM calendar_items WHERE id = ${id}`;
}

/** 首頁用：今天的行程與到期／逾期的待辦 */
export async function todaySummary(viewer: Viewer, today: string): Promise<{ events: CalendarItem[]; tasks: CalendarItem[] }> {
  const [events, tasks] = await Promise.all([listRange(viewer, today, addDays(today, 1)), listTasks(viewer)]);
  const end = taipeiDate(addDays(today, 1));
  return {
    events: events.filter((e) => e.kind === "event"),
    tasks: tasks.filter((t) => t.status !== "done" && t.startsAt && new Date(t.startsAt) < end),
  };
}
