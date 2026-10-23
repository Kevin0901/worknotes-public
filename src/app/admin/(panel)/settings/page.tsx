import type { Metadata } from "next";
import { AdminPasswordForm } from "@/components/admin/AdminPasswordForm";
import { AdminSettingsForm } from "@/components/admin/AdminSettingsForm";
import { getViewer } from "@/lib/auth";
import { hasDatabase } from "@/lib/env";

export const metadata: Metadata = { title: "系統設定" };

export default async function AdminSettingsPage() {
  const viewer = await getViewer();
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">系統設定</h1>
      {!hasDatabase() && (
        <p className="rounded-md bg-warn-soft px-3 py-2 text-sm">尚未設定資料庫，設定無法儲存。</p>
      )}
      <AdminSettingsForm settings={viewer.settings} />
      <AdminPasswordForm username={viewer.admin!.username} />
    </div>
  );
}
