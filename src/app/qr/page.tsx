import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { QrCodeEntry } from "@/components/QrApprove";
import { getViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "核准電腦登入" };

export default async function QrEntryPage() {
  const viewer = await getViewer();
  if (!viewer.user) redirect("/login?next=/qr");
  return (
    <AuthCard title={viewer.settings.siteTitle} subtitle="核准電腦登入">
      <QrCodeEntry />
    </AuthCard>
  );
}
