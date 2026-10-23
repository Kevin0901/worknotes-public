"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ban, Check, LogOut, Trash2, UserPlus, X } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";
import type { AppUser, UserRole, UserStatus } from "@/lib/types";
import { useDialogs, useToast } from "../Providers";

const STATUS_LABEL: Record<UserStatus, string> = {
  pending: "待審核",
  approved: "已核准",
  rejected: "已拒絕",
  disabled: "已停用",
};

const STATUS_TONE: Record<UserStatus, string> = {
  pending: "bg-warn-soft text-warn",
  approved: "bg-accent-soft text-accent",
  rejected: "bg-danger-soft text-danger",
  disabled: "bg-hover text-muted",
};

const ROLE_LABEL: Record<UserRole, string> = { editor: "可編輯", viewer: "僅檢視" };

function UserAvatar({ user }: { user: AppUser }) {
  if (user.picture) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-9 w-9 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-hover text-sm font-semibold text-muted">
      {(user.name || user.email).slice(0, 1).toUpperCase()}
    </span>
  );
}

export function AdminUsers({ users }: { users: AppUser[] }) {
  const router = useRouter();
  const toast = useToast();
  const dialogs = useDialogs();
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | UserStatus>("all");

  const pending = users.filter((u) => u.status === "pending");
  const shown = users.filter((u) => filter === "all" || u.status === filter);

  const patch = async (user: AppUser, body: { status?: UserStatus; role?: UserRole }, msg: string) => {
    setBusy(user.id);
    try {
      await api("PATCH", `/api/admin/users/${user.id}`, body);
      toast(msg);
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (user: AppUser) => {
    const ok = await dialogs.confirm({
      title: `刪除帳號 ${user.email}？`,
      message: "刪除後此人再次以 Google 登入時，會重新變成「待審核」申請。若要永久阻擋，請改用「停用」。",
      confirmLabel: "刪除",
      danger: true,
    });
    if (!ok) return;
    setBusy(user.id);
    try {
      await api("DELETE", `/api/admin/users/${user.id}`);
      toast("已刪除帳號");
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  };

  const revokeAll = async (user: AppUser) => {
    const ok = await dialogs.confirm({
      title: `登出 ${user.email} 的所有裝置？`,
      message: `目前有 ${user.activeSessions ?? 0} 個裝置登入中，全部會被要求重新登入（帳號本身仍維持核准狀態）。`,
      confirmLabel: "全部登出",
      danger: true,
    });
    if (!ok) return;
    setBusy(user.id);
    try {
      const res = await api<{ count: number }>("PATCH", `/api/admin/users/${user.id}`, { revokeSessions: true });
      toast(`已登出 ${res.count} 個裝置`);
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  };

  const addUser = async () => {
    const v = await dialogs.form({
      title: "預先加入帳號",
      description: "輸入對方的 Google 帳號 Email，加入後對方第一次登入就能直接使用。",
      fields: [
        { name: "email", label: "Google 帳號 Email", type: "email", required: true, placeholder: "someone@gmail.com" },
        {
          name: "role",
          label: "權限",
          type: "select",
          defaultValue: "editor",
          options: [
            { value: "editor", label: "可編輯（新增／修改／刪除筆記）" },
            { value: "viewer", label: "僅檢視" },
          ],
        },
      ],
      submitLabel: "加入並核准",
    });
    if (!v) return;
    try {
      await api("POST", "/api/admin/users", v);
      toast("已加入帳號");
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <>
      {pending.length > 0 && (
        <section className="card border-warn/40 p-5">
          <h2 className="font-semibold">待審核申請（{pending.length}）</h2>
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {pending.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
                <UserAvatar user={u} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{u.name || "（未提供名稱）"}</div>
                  <div className="truncate text-xs text-muted">{u.email}</div>
                  <div className="text-xs text-faint">申請時間 {formatDateTime(u.createdAt)}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy === u.id}
                    onClick={() => patch(u, { status: "approved", role: "editor" }, "已核准（可編輯）")}
                  >
                    <Check size={15} /> 核准（可編輯）
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy === u.id}
                    onClick={() => patch(u, { status: "approved", role: "viewer" }, "已核准（僅檢視）")}
                  >
                    核准（僅檢視）
                  </button>
                  <button
                    type="button"
                    className="btn text-danger"
                    disabled={busy === u.id}
                    onClick={() => patch(u, { status: "rejected" }, "已拒絕")}
                  >
                    <X size={15} /> 拒絕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex-1 font-semibold">所有帳號（{users.length}）</h2>
          <select className="input w-auto py-1.5" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">全部狀態</option>
            {(Object.keys(STATUS_LABEL) as UserStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={addUser}>
            <UserPlus size={15} /> 預先加入帳號
          </button>
        </div>

        {shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-faint">
            {users.length === 0 ? "還沒有人申請。請使用者到登入頁以 Google 帳號登入即可送出申請。" : "沒有符合的帳號"}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {shown.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
                <UserAvatar user={u} />
                <div className="min-w-0 flex-1 basis-56">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{u.name || u.email}</span>
                    <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_TONE[u.status]}`}>{STATUS_LABEL[u.status]}</span>
                  </div>
                  <div className="truncate text-xs text-muted">{u.email}</div>
                  <div className="text-xs text-faint">
                    申請 {formatDateTime(u.createdAt)}・最後登入 {formatDateTime(u.lastLoginAt)}・登入中裝置 {u.activeSessions ?? 0} 個
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    className="input w-auto py-1.5"
                    value={u.role}
                    disabled={busy === u.id}
                    onChange={(e) => patch(u, { role: e.target.value as UserRole }, "已更新權限")}
                    aria-label="權限"
                  >
                    {(Object.keys(ROLE_LABEL) as UserRole[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  {u.status !== "approved" ? (
                    <button
                      type="button"
                      className="btn"
                      disabled={busy === u.id}
                      onClick={() => patch(u, { status: "approved" }, "已核准")}
                    >
                      <Check size={15} /> 核准
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn"
                      disabled={busy === u.id}
                      onClick={() => patch(u, { status: "disabled" }, "已停用")}
                    >
                      <Ban size={15} /> 停用
                    </button>
                  )}
                  {(u.activeSessions ?? 0) > 0 && (
                    <button
                      type="button"
                      className="icon-btn h-8 w-8 hover:text-danger"
                      disabled={busy === u.id}
                      onClick={() => revokeAll(u)}
                      aria-label="登出所有裝置"
                      title="登出此帳號的所有裝置"
                    >
                      <LogOut size={16} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-btn h-8 w-8 hover:text-danger"
                    disabled={busy === u.id}
                    onClick={() => remove(u)}
                    aria-label="刪除帳號"
                    title="刪除帳號"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
