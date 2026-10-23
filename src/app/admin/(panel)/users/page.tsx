import type { Metadata } from "next";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { hasDatabase } from "@/lib/env";
import { listUsers } from "@/lib/users";

export const metadata: Metadata = { title: "帳號審核" };

export default async function AdminUsersPage() {
  if (!hasDatabase()) return <p className="text-sm text-muted">尚未設定資料庫。</p>;
  const users = await listUsers();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">帳號審核</h1>
        <p className="mt-1 text-sm text-muted">
          使用者第一次以 Google 登入時會建立「待審核」帳號，核准後才能使用。也可以預先加入 Email 直接核准。
        </p>
      </div>
      <AdminUsers users={users} />
    </div>
  );
}
