import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdminPage } from "@/lib/auth";

export const metadata: Metadata = { title: { default: "管理後台", template: "%s｜管理後台" } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireAdminPage();
  return (
    <div className="min-h-dvh bg-subtle">
      <AdminNav username={viewer.admin!.username} siteTitle={viewer.settings.siteTitle} />
      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6 md:px-8">{children}</main>
    </div>
  );
}
