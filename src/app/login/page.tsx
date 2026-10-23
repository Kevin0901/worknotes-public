import type { Metadata } from "next";
import Link from "next/link";
import { QrCode } from "lucide-react";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { getViewer } from "@/lib/auth";
import { googleConfig } from "@/lib/env";
import { trackPageView } from "@/lib/logs";
import { safeNext } from "@/lib/oauth";

export const metadata: Metadata = { title: "登入" };

const ERRORS: Record<string, string> = {
  denied: "此帳號已被拒絕或停用，如有疑問請聯絡管理員。",
  closed: "目前未開放新帳號申請。",
  state: "登入逾時或驗證失敗，請重新登入。",
  google: "Google 登入失敗，請稍後再試。",
  cancelled: "已取消 Google 登入。",
  config: "系統尚未設定 Google 登入（GOOGLE_CLIENT_ID／GOOGLE_CLIENT_SECRET），請聯絡管理員。",
};

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; loggedout?: string }>;
}) {
  const { next: rawNext, error, loggedout } = await searchParams;
  const next = safeNext(rawNext);
  const viewer = await getViewer();
  if (viewer.user) redirect(next);
  await trackPageView(`/login${rawNext ? `?next=${rawNext}` : ""}`, viewer);
  const configured = !!googleConfig();

  return (
    <AuthCard title={viewer.settings.siteTitle} subtitle="請使用 Google 帳號登入">
      {loggedout && <p className="mb-4 rounded-md bg-accent-soft px-3 py-2 text-sm">你已登出。</p>}
      {error && ERRORS[error] && (
        <p className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{ERRORS[error]}</p>
      )}
      {!configured && !error && (
        <p className="mb-4 rounded-md bg-warn-soft px-3 py-2 text-sm">{ERRORS.config}</p>
      )}
      <a
        href={`/api/auth/google?next=${encodeURIComponent(next)}`}
        className={`flex w-full items-center justify-center gap-3 rounded-lg border border-line bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-hover ${
          configured ? "" : "pointer-events-none opacity-50"
        }`}
        aria-disabled={!configured}
      >
        <GoogleIcon />
        使用 Google 帳號登入
      </a>
      <Link
        href={`/login/qr?next=${encodeURIComponent(next)}`}
        className="mt-3 flex w-full items-center justify-center gap-3 rounded-lg border border-line bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-hover"
      >
        <QrCode size={18} />
        用手機掃碼登入
      </Link>
      <p className="mt-1.5 text-center text-xs text-faint">適合在客戶或公用電腦上使用，不需要輸入 Google 密碼</p>
      <p className="mt-4 text-center text-xs leading-relaxed text-faint">
        第一次登入會送出使用申請，經管理員核准後才能使用。
      </p>
      {!viewer.settings.requireLogin && (
        <Link href="/" className="mt-4 block text-center text-sm text-muted hover:text-fg">
          以訪客身分瀏覽 →
        </Link>
      )}
      {viewer.admin && (
        <Link href="/" className="mt-4 block text-center text-sm text-muted hover:text-fg">
          以管理員身分進入筆記 →
        </Link>
      )}
      <div className="mt-6 border-t border-line pt-4 text-center">
        <Link href="/admin/login" className="text-xs text-faint hover:text-muted">
          管理後台
        </Link>
      </div>
    </AuthCard>
  );
}
