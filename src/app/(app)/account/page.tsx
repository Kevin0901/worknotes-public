import type { Metadata } from "next";
import Link from "next/link";
import { QrCode } from "lucide-react";
import { AccountSessions } from "@/components/AccountSessions";
import { requirePageViewer } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { trackPageView } from "@/lib/logs";
import { listActiveSessions } from "@/lib/sessions";

export const metadata: Metadata = { title: "我的帳號" };

export default async function AccountPage() {
  const viewer = await requirePageViewer("/account");
  await trackPageView("/account", viewer);

  if (!viewer.user || !viewer.session) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-10">
        <h1 className="text-2xl font-bold">我的帳號</h1>
        <p className="mt-3 text-sm text-muted">目前是以管理員或訪客身分瀏覽；登入裝置管理只適用於 Google 帳號。</p>
      </div>
    );
  }

  const sessions = await listActiveSessions(viewer.user.id);
  const u = viewer.user;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 md:px-10 md:pt-10">
      <h1 className="text-2xl font-bold">我的帳號</h1>

      <section className="card mt-6 flex items-center gap-4 p-5">
        {u.picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={u.picture} alt="" referrerPolicy="no-referrer" className="h-14 w-14 rounded-full" />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-xl font-semibold text-accent">
            {(u.name || u.email).slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold">{u.name || u.email}</div>
          <div className="truncate text-sm text-muted">{u.email}</div>
          <div className="text-xs text-faint">
            權限：{u.role === "editor" ? "可編輯" : "僅檢視"}・核准時間 {formatDateTime(u.approvedAt)}
          </div>
        </div>
      </section>

      <section className="card mt-6 p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">在其他電腦登入</h2>
            <p className="mt-1 text-sm text-muted">
              在客戶的電腦開啟登入頁，選「用手機掃碼登入」，再用這支手機掃描 QR Code 或輸入代碼核准，不需要在別人的電腦輸入 Google 密碼。
            </p>
          </div>
          <Link href="/qr" className="btn-primary">
            <QrCode size={15} /> 輸入代碼核准
          </Link>
        </div>
      </section>

      <AccountSessions sessions={sessions} currentId={viewer.session.id} />
    </div>
  );
}
