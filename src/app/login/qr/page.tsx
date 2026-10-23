import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { QrLogin } from "@/components/QrLogin";
import { getViewer } from "@/lib/auth";
import { trackPageView } from "@/lib/logs";
import { safeNext } from "@/lib/oauth";

export const metadata: Metadata = { title: "手機掃碼登入" };

export default async function QrLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: rawNext } = await searchParams;
  const next = safeNext(rawNext);
  const viewer = await getViewer();
  if (viewer.user) redirect(next);
  await trackPageView("/login/qr", viewer);
  return (
    <AuthCard title={viewer.settings.siteTitle} subtitle="用手機掃碼登入這台電腦">
      <QrLogin next={next} />
    </AuthCard>
  );
}
