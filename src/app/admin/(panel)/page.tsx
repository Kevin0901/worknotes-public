import Link from "next/link";
import { headers } from "next/headers";
import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { CopyField } from "@/components/admin/CopyField";
import { DailyViewsChart } from "@/components/admin/DailyViewsChart";
import { LogTable } from "@/components/admin/LogTable";
import { currentAdminPasswordHash } from "@/lib/admin";
import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
import { adminPasswordHashFromEnv, appOrigin, authSecret, googleConfig, hasDatabase } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { queryLogs } from "@/lib/logs";
import { dashboardStats, type DashboardStats } from "@/lib/stats";

function Tile({ label, value, href, tone }: { label: string; value: number | string; href?: string; tone?: "warn" }) {
  const body = (
    <div className={`card h-full p-4 ${href ? "transition-colors hover:bg-hover" : ""}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "warn" ? "text-warn" : ""}`}>{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Status({ ok, warn, label, detail }: { ok: boolean; warn?: boolean; label: string; detail: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-3">
      {ok ? (
        <CircleCheck size={18} className="mt-0.5 shrink-0 text-accent" />
      ) : warn ? (
        <CircleAlert size={18} className="mt-0.5 shrink-0 text-warn" />
      ) : (
        <CircleX size={18} className="mt-0.5 shrink-0 text-danger" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">
          {label}
          <span className="ml-2 text-xs font-normal text-faint">{ok ? "正常" : warn ? "建議處理" : "需要設定"}</span>
        </div>
        <div className="mt-0.5 text-xs leading-relaxed text-muted">{detail}</div>
      </div>
    </li>
  );
}

export default async function AdminDashboard() {
  const viewer = await getViewer();
  const origin = appOrigin(await headers());
  let dbOk = false;
  let stats: DashboardStats | null = null;
  if (hasDatabase()) {
    try {
      const sql = await db();
      await sql`SELECT 1`;
      dbOk = true;
      stats = await dashboardStats();
    } catch (err) {
      console.error("[admin] 資料庫錯誤", err);
    }
  }
  const recent = dbOk ? (await queryLogs({ pageSize: 10 })).rows : [];
  const pwFromDb = (await currentAdminPasswordHash()) !== adminPasswordHashFromEnv();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">總覽</h1>

      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="待審核帳號" value={stats.pendingUsers} href="/admin/users" tone={stats.pendingUsers > 0 ? "warn" : undefined} />
          <Tile label="已核准帳號" value={stats.approvedUsers} href="/admin/users" />
          <Tile label="筆記／分類" value={`${stats.notes} / ${stats.categories}`} href="/" />
          <Tile label="24 小時頁面瀏覽" value={stats.views24h} href="/admin/logs?event=page_view" />
          <Tile label="7 天不重複 IP" value={stats.uniqueIps7d} href="/admin/logs" />
          <Tile
            label="24 小時後台登入失敗"
            value={stats.failedAdmin24h}
            href="/admin/logs?event=admin_login_failed"
            tone={stats.failedAdmin24h > 0 ? "warn" : undefined}
          />
          <Tile label="前台登入要求" value={viewer.settings.requireLogin ? "需登入" : "公開瀏覽"} href="/admin/settings" />
          <Tile label="新帳號申請" value={viewer.settings.allowRegistration ? "開放中" : "已關閉"} href="/admin/settings" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="card p-5">
          <h2 className="font-semibold">近 14 天頁面瀏覽次數</h2>
          <p className="mb-4 text-xs text-faint">依台灣時間統計</p>
          {stats ? <DailyViewsChart data={stats.daily} /> : <p className="text-sm text-faint">資料庫未連線</p>}
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">近 7 天最常瀏覽的帳號</h2>
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {(stats?.topUsers ?? []).length === 0 && <li className="py-3 text-sm text-faint">尚無資料</li>}
            {stats?.topUsers.map((u) => (
              <li key={u.actor} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 truncate">{u.actor}</span>
                <span className="shrink-0 text-xs text-muted">
                  <b className="tabular-nums text-fg">{u.views}</b> 次・{formatDateTime(u.last)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card p-5">
        <h2 className="font-semibold">系統狀態</h2>
        <ul className="mt-1 divide-y divide-[var(--border)]">
          <Status
            ok={dbOk}
            label="資料庫"
            detail={
              dbOk
                ? "已連線（Postgres）"
                : hasDatabase()
                  ? "有設定 DATABASE_URL，但無法連線，請檢查 Neon 資料庫狀態。"
                  : "尚未設定 DATABASE_URL：請在 Vercel → Storage 建立 Neon Postgres 並連結此專案後重新部署。"
            }
          />
          <Status
            ok={!!googleConfig()}
            label="Google 登入"
            detail={
              <>
                {googleConfig() ? "已設定 GOOGLE_CLIENT_ID／GOOGLE_CLIENT_SECRET。" : "尚未設定 GOOGLE_CLIENT_ID／GOOGLE_CLIENT_SECRET。"}
                <span className="mt-2 block">在 Google Cloud Console 的 OAuth 用戶端中，「已授權的重新導向 URI」請填：</span>
                <span className="mt-1 block max-w-xl">
                  <CopyField value={`${origin}/api/auth/callback/google`} />
                </span>
                <span className="mt-2 block">「已授權的 JavaScript 來源」請填：</span>
                <span className="mt-1 block max-w-xl">
                  <CopyField value={origin} />
                </span>
              </>
            }
          />
          <Status ok={!!authSecret()} label="AUTH_SECRET" detail="用來簽署登入 Cookie 的金鑰（至少 32 字元）。" />
          <Status
            ok
            label="後台密碼"
            detail={pwFromDb ? "使用在後台變更過的密碼（存在資料庫）。" : "使用環境變數 ADMIN_PASSWORD_HASH 的密碼，可在「系統設定」變更。"}
          />
        </ul>
      </section>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">最新紀錄</h2>
          <Link href="/admin/logs" className="text-sm text-accent hover:underline">
            查看全部 →
          </Link>
        </div>
        <LogTable rows={recent} compact />
      </section>
    </div>
  );
}
