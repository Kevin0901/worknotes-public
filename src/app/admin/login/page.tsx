import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { getViewer } from "@/lib/auth";
import { trackPageView } from "@/lib/logs";

export const metadata: Metadata = { title: "管理後台登入" };

export default async function AdminLoginPage() {
  const viewer = await getViewer();
  if (viewer.admin) redirect("/admin");
  await trackPageView("/admin/login", viewer);
  return (
    <AuthCard title={viewer.settings.siteTitle} subtitle="管理後台">
      <AdminLoginForm />
    </AuthCard>
  );
}
