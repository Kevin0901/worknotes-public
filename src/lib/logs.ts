import "server-only";
import { after } from "next/server";
import { headers } from "next/headers";
import { db } from "./db";
import { hasDatabase } from "./env";
import { requestInfo } from "./request-info";
import { getViewer, type Viewer } from "./auth";
import type { AccessLog } from "./types";

export interface LogEntry {
  event: string;
  path?: string | null;
  method?: string | null;
  detail?: string | null;
  actor?: string | null;
  actorType?: Viewer["actorType"];
}

async function insertLog(entry: LogEntry, hdrs: Headers, retentionDays: number): Promise<void> {
  if (!hasDatabase()) return;
  try {
    const sql = await db();
    const info = requestInfo(hdrs);
    await sql`
      INSERT INTO access_logs (event, path, method, actor, actor_type, ip, country, city, user_agent, detail)
      VALUES (${entry.event}, ${entry.path?.slice(0, 500) ?? null}, ${entry.method ?? null},
              ${entry.actor ?? null}, ${entry.actorType ?? "anonymous"}, ${info.ip}, ${info.country},
              ${info.city}, ${info.userAgent}, ${entry.detail?.slice(0, 1000) ?? null})`;
    // 偶爾順便清除超過保留天數的紀錄
    if (Math.random() < 0.02 && retentionDays > 0) {
      await sql`DELETE FROM access_logs WHERE created_at < now() - make_interval(days => ${retentionDays})`;
    }
  } catch (err) {
    console.error("[logs] 寫入失敗", err);
  }
}

/** 預設在回應送出後才寫入紀錄，不拖慢頁面；immediate 用於需要立即計數的事件（例如登入失敗） */
export async function logEvent(entry: LogEntry, viewer?: Viewer, options?: { immediate?: boolean }): Promise<void> {
  const hdrs = new Headers(await headers());
  const v = viewer ?? (await getViewer());
  const full: LogEntry = {
    actor: v.actor,
    actorType: v.actorType,
    ...entry,
  };
  const retention = v.settings.logRetentionDays;
  if (options?.immediate) await insertLog(full, hdrs, retention);
  else after(() => insertLog(full, hdrs, retention));
}

/** 同一 IP 在指定分鐘內發生某事件的次數（用於登入失敗限制） */
export async function recentEventCount(event: string, ip: string | null, minutes: number): Promise<number> {
  if (!hasDatabase() || !ip) return 0;
  const sql = await db();
  const [{ count }] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM access_logs
    WHERE event = ${event} AND ip = ${ip} AND created_at > now() - make_interval(mins => ${minutes})`;
  return count;
}

/** 頁面瀏覽紀錄（可在後台關閉） */
export async function trackPageView(path: string, viewer?: Viewer): Promise<void> {
  const v = viewer ?? (await getViewer());
  if (!v.settings.logPageViews) return;
  await logEvent({ event: "page_view", path, method: "GET" }, v);
}

export interface LogQuery {
  event?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

interface LogRow {
  id: string;
  created_at: Date;
  event: string;
  path: string | null;
  method: string | null;
  actor: string | null;
  actor_type: string;
  ip: string | null;
  country: string | null;
  city: string | null;
  user_agent: string | null;
  detail: string | null;
}

function toLog(r: LogRow): AccessLog {
  return {
    id: String(r.id),
    createdAt: r.created_at.toISOString(),
    event: r.event,
    path: r.path,
    method: r.method,
    actor: r.actor,
    actorType: r.actor_type,
    ip: r.ip,
    country: r.country,
    city: r.city,
    userAgent: r.user_agent,
    detail: r.detail,
  };
}

/** 日期字串（YYYY-MM-DD）以台灣時間解讀 */
function taipeiDate(value: string | undefined, endOfDay = false): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function queryLogs(query: LogQuery): Promise<{ rows: AccessLog[]; total: number }> {
  const sql = await db();
  const pageSize = Math.min(Math.max(query.pageSize ?? 50, 1), 5000);
  const page = Math.max(query.page ?? 1, 1);
  const from = taipeiDate(query.from);
  const to = taipeiDate(query.to, true);
  const q = query.q?.trim() ? `%${query.q.trim().replace(/[%_\\]/g, (m) => "\\" + m)}%` : null;
  const events = query.event ? query.event.split(",").filter(Boolean) : null;

  const where = sql`
    WHERE (${events}::text[] IS NULL OR event = ANY(${events}::text[]))
      AND (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
      AND (${to}::timestamptz IS NULL OR created_at <= ${to}::timestamptz)
      AND (${q}::text IS NULL OR actor ILIKE ${q} OR ip ILIKE ${q} OR path ILIKE ${q} OR detail ILIKE ${q})`;

  const [{ total }] = await sql<{ total: number }[]>`SELECT count(*)::int AS total FROM access_logs ${where}`;
  const rows = await sql<LogRow[]>`
    SELECT * FROM access_logs ${where}
    ORDER BY created_at DESC, id DESC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
  return { rows: rows.map(toLog), total };
}

export async function purgeLogs(olderThanDays: number): Promise<number> {
  const sql = await db();
  const result = await sql`DELETE FROM access_logs WHERE created_at < now() - make_interval(days => ${olderThanDays})`;
  return result.count;
}
