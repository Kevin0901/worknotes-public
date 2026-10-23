import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { QrApprove } from "@/components/QrApprove";
import { getViewer } from "@/lib/auth";
import { trackPageView } from "@/lib/logs";
import { getLoginRequestByCode, normalizeCode } from "@/lib/sessions";

export const metadata: Metadata = { title: "核准電腦登入" };

export default async function QrApprovePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = normalizeCode(decodeURIComponent(raw));
  const viewer = await getViewer();
  if (!viewer.user) redirect(`/login?next=${encodeURIComponent(`/qr/${code}`)}`);
  await trackPageView(`/qr/${code}`, viewer);
  const request = code.length === 8 ? await getLoginRequestByCode(code) : null;
  return (
    <AuthCard title={viewer.settings.siteTitle} subtitle="核准電腦登入">
      <QrApprove request={request} email={viewer.user.email} />
    </AuthCard>
  );
}
