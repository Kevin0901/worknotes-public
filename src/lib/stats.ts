import "server-only";
import { db } from "./db";

export interface DashboardStats {
  pendingUsers: number;
  approvedUsers: number;
  notes: number;
  categories: number;
  views24h: number;
  uniqueIps7d: number;
  failedAdmin24h: number;
  daily: { day: string; views: number }[];
  topUsers: { actor: string; views: number; last: string }[];
}

export async function dashboardStats(): Promise<DashboardStats> {
  const sql = await db();
  const [[counts], daily, topUsers] = await Promise.all([
    sql<Omit<DashboardStats, "daily" | "topUsers">[]>`
      SELECT
        (SELECT count(*)::int FROM app_users WHERE status = 'pending') AS "pendingUsers",
        (SELECT count(*)::int FROM app_users WHERE status = 'approved') AS "approvedUsers",
        (SELECT count(*)::int FROM notes WHERE deleted_at IS NULL) AS notes,
        (SELECT count(*)::int FROM categories) AS categories,
        (SELECT count(*)::int FROM access_logs WHERE event = 'page_view' AND created_at > now() - interval '24 hours') AS "views24h",
        (SELECT count(DISTINCT ip)::int FROM access_logs WHERE created_at > now() - interval '7 days') AS "uniqueIps7d",
        (SELECT count(*)::int FROM access_logs WHERE event = 'admin_login_failed' AND created_at > now() - interval '24 hours') AS "failedAdmin24h"`,
    sql<{ day: string; views: number }[]>`
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day, COALESCE(v.views, 0)::int AS views
      FROM generate_series(
        (now() AT TIME ZONE 'Asia/Taipei')::date - 13, (now() AT TIME ZONE 'Asia/Taipei')::date, interval '1 day'
      ) AS d(day)
      LEFT JOIN (
        SELECT (created_at AT TIME ZONE 'Asia/Taipei')::date AS day, count(*) AS views
        FROM access_logs
        WHERE event = 'page_view' AND created_at > now() - interval '15 days'
        GROUP BY 1
      ) v ON v.day = d.day::date
      ORDER BY d.day`,
    sql<{ actor: string; views: number; last: Date }[]>`
      SELECT actor, count(*)::int AS views, max(created_at) AS last FROM access_logs
      WHERE event = 'page_view' AND actor IS NOT NULL AND created_at > now() - interval '7 days'
      GROUP BY actor ORDER BY views DESC LIMIT 8`,
  ]);
  return {
    ...counts,
    daily,
    topUsers: topUsers.map((u) => ({ actor: u.actor, views: u.views, last: u.last.toISOString() })),
  };
}
