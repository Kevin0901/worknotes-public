"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import { useToast } from "../Providers";

export function AdminPasswordForm({ username }: { username: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="card p-5">
      <h2 className="font-semibold">變更後台密碼</h2>
      <p className="mt-1 text-xs text-muted">
        帳號：<b className="text-fg">{username}</b>。密碼至少 12 字元，需包含大寫、小寫英文字母與數字。變更後其他裝置的後台登入會自動失效。
      </p>
      <form
        className="mt-4 grid max-w-md gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          const next = String(data.get("newPassword") ?? "");
          if (next !== String(data.get("confirm") ?? "")) {
            setError("兩次輸入的新密碼不一致");
            return;
          }
          setBusy(true);
          setError(null);
          try {
            await api("POST", "/api/admin/password", {
              currentPassword: String(data.get("currentPassword") ?? ""),
              newPassword: next,
            });
            form.reset();
            toast("已變更密碼");
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <input type="text" name="username" value={username} autoComplete="username" readOnly hidden />
        <label className="block text-sm">
          目前密碼
          <input name="currentPassword" type="password" className="input mt-1" autoComplete="current-password" required />
        </label>
        <label className="block text-sm">
          新密碼
          <input name="newPassword" type="password" className="input mt-1" autoComplete="new-password" minLength={12} required />
        </label>
        <label className="block text-sm">
          確認新密碼
          <input name="confirm" type="password" className="input mt-1" autoComplete="new-password" minLength={12} required />
        </label>
        {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <div>
          <button type="submit" className="btn-primary" disabled={busy}>
            <KeyRound size={15} /> {busy ? "處理中…" : "變更密碼"}
          </button>
        </div>
      </form>
    </section>
  );
}
