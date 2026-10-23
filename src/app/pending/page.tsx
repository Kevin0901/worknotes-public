import type { Metadata } from "next";
import Link from "next/link";
import { Clock } from "lucide-react";
import { AuthCard } from "@/components/AuthCard";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "等待審核" };

export default async function PendingPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  const settings = await getSettings();
  return (
    <AuthCard title={settings.siteTitle}>
      <div className="text-center">
        <Clock size={36} className="mx-auto text-warn" />
        <h2 className="mt-3 text-lg font-semibold">已送出使用申請</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {email && (
            <>
              帳號 <b className="break-all text-fg">{email.slice(0, 254)}</b>
              <br />
            </>
          )}
          目前正在等待管理員核准，核准後再使用 Google 登入即可。
        </p>
        <Link href="/login" className="btn mt-6">
          返回登入頁
        </Link>
      </div>
    </AuthCard>
  );
}
