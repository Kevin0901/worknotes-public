import type { Metadata } from "next";
import Link from "next/link";
import { Download, Filter } from "lucide-react";
import { LogTable } from "@/components/admin/LogTable";
import { PurgeLogsButton } from "@/components/admin/PurgeLogsButton";
import { hasDatabase } from "@/lib/env";
import { EVENT_GROUPS, eventLabel } from "@/lib/events";
import { queryLogs } from "@/lib/logs";
import { getViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "訪問紀錄" };

const PAGE_SIZE = 50;

type Search = { event?: string; q?: string; from?: string; to?: string; page?: string };

export default async function AdminLogsPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!hasDatabase()) return <p className="text-sm text-muted">尚未設定資料庫。</p>;
  const sp = await searchParams;
  const viewer = await getViewer();
  const page = Math.max(1, Number(sp.page) || 1);
  const filters = { event: sp.event || "", q: sp.q || "", from: sp.from || "", to: sp.to || "" };
  const { rows, total } = await queryLogs({ ...filters, page, pageSize: PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, ...extra })) if (v !== "" && v !== undefined) p.set(k, String(v));
    return p.toString();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-bold">訪問紀錄</h1>
          <p className="mt-1 text-sm text-muted">
            記錄登入、頁面瀏覽、筆記異動與後台操作。時間為台灣時間，紀錄保留 {viewer.settings.logRetentionDays} 天。
          </p>
        </div>
        <a href={`/api/admin/logs/export?${qs({})}`} className="btn">
          <Download size={15} /> 匯出 CSV
        </a>
        <PurgeLogsButton defaultDays={viewer.settings.logRetentionDays} />
      </div>

      <form action="/admin/logs" className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.4fr_auto_auto_auto]">
        <label className="text-xs text-muted">
          事件
          <select name="event" defaultValue={filters.event} className="input mt-1">
            <option value="">全部事件</option>
            {EVENT_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.events.length > 1 && <option value={g.events.join(",")}>（{g.label}：全部）</option>}
                {g.events.map((e) => (
                  <option key={e} value={e}>
                    {eventLabel(e)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          關鍵字（Email／IP／路徑／詳細）
          <input name="q" defaultValue={filters.q} className="input mt-1" placeholder="例如 gmail.com 或 203.0." />
        </label>
        <label className="text-xs text-muted">
          起日
          <input type="date" name="from" defaultValue={filters.from} className="input mt-1" />
        </label>
        <label className="text-xs text-muted">
          迄日
          <input type="date" name="to" defaultValue={filters.to} className="input mt-1" />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn-primary h-[38px]">
            <Filter size={15} /> 篩選
          </button>
          <Link href="/admin/logs" className="btn h-[38px]">
            清除
          </Link>
        </div>
      </form>

      <section className="card p-4">
        <div className="mb-2 text-sm text-muted">
          共 {total.toLocaleString("zh-TW")} 筆，第 {page} / {pages} 頁
        </div>
        <LogTable rows={rows} />
        {pages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            {page > 1 ? (
              <Link href={`/admin/logs?${qs({ page: page - 1 })}`} className="btn">
                上一頁
              </Link>
            ) : (
              <span className="btn opacity-40">上一頁</span>
            )}
            <span className="px-2 text-sm text-muted">
              {page} / {pages}
            </span>
            {page < pages ? (
              <Link href={`/admin/logs?${qs({ page: page + 1 })}`} className="btn">
                下一頁
              </Link>
            ) : (
              <span className="btn opacity-40">下一頁</span>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
