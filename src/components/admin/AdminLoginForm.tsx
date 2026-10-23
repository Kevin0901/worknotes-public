"use client";

import Link from "next/link";
import { useState } from "react";
import { LogIn } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";

export function AdminLoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        try {
          await api("POST", "/api/admin/login", {
            username: String(data.get("username") ?? ""),
            password: String(data.get("password") ?? ""),
          });
          window.location.href = "/admin";
        } catch (err) {
          setError(errorMessage(err));
          setBusy(false);
        }
      }}
    >
      {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">帳號</span>
        <input name="username" className="input" autoComplete="username" required autoFocus />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">密碼</span>
        <input name="password" type="password" className="input" autoComplete="current-password" required />
      </label>
      <button type="submit" className="btn-primary w-full py-2" disabled={busy}>
        <LogIn size={16} />
        {busy ? "登入中…" : "登入後台"}
      </button>
      <p className="text-center text-xs text-faint">連續失敗 5 次會暫停登入 15 分鐘</p>
      <div className="border-t border-line pt-4 text-center">
        <Link href="/" className="text-xs text-faint hover:text-muted">
          ← 回到筆記
        </Link>
      </div>
    </form>
  );
}
