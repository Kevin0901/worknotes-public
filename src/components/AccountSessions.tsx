"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Monitor, Smartphone } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import { LOGIN_METHOD_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { UserSession } from "@/lib/types";
import { summarizeUserAgent } from "@/lib/ua";
import { useDialogs, useToast } from "./Providers";

export function AccountSessions({ sessions, currentId }: { sessions: UserSession[]; currentId: string }) {
  const router = useRouter();
  const toast = useToast();
  const dialogs = useDialogs();
  const [busy, setBusy] = useState<string | null>(null);

  const revoke = async (s: UserSession) => {
    const current = s.id === currentId;
    const ok = await dialogs.confirm({
      title: current ? "登出目前這個裝置？" : "登出這個裝置？",
      message: `${summarizeUserAgent(s.userAgent)}・${s.ip ?? ""}，該裝置下次操作時就會被要求重新登入。`,
      confirmLabel: "登出",
      danger: true,
    });
    if (!ok) return;
    setBusy(s.id);
    try {
      await api("DELETE", `/api/account/sessions/${s.id}`);
      if (current) {
        window.location.href = "/login?loggedout=1";
        return;
      }
      toast("已登出該裝置");
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  };

  const revokeOthers = async () => {
    const ok = await dialogs.confirm({
      title: "登出其他所有裝置？",
      message: "除了目前這個裝置以外，所有已登入的電腦與手機都會被登出。",
      confirmLabel: "全部登出",
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await api<{ count: number }>("DELETE", "/api/account/sessions/others");
      toast(`已登出 ${res.count} 個裝置`);
      router.refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <section className="card mt-6 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 font-semibold">登入裝置（{sessions.length}）</h2>
        {sessions.length > 1 && (
          <button type="button" className="btn text-danger" onClick={revokeOthers}>
            <LogOut size={15} /> 登出其他所有裝置
          </button>
        )}
      </div>
      <ul className="mt-3 divide-y divide-[var(--border)]">
        {sessions.map((s) => {
          const ua = summarizeUserAgent(s.userAgent);
          const mobile = /iOS|Android/.test(ua);
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-hover text-muted">
                {mobile ? <Smartphone size={17} /> : <Monitor size={17} />}
              </span>
              <div className="min-w-0 flex-1 basis-60">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {ua}
                  {s.id === currentId && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">目前裝置</span>}
                  <span className="rounded bg-hover px-1.5 py-0.5 text-xs text-muted">{LOGIN_METHOD_LABELS[s.method] ?? s.method}</span>
                </div>
                <div className="text-xs text-muted">
                  {[s.country, s.city].filter(Boolean).join(" · ") || "未知位置"}・{s.ip ?? "未知 IP"}
                </div>
                <div className="text-xs text-faint">
                  登入 {formatDateTime(s.createdAt)}・最後使用 {formatDateTime(s.lastSeenAt)}・到期 {formatDateTime(s.expiresAt)}
                </div>
              </div>
              <button type="button" className="btn" disabled={busy === s.id} onClick={() => revoke(s)}>
                <LogOut size={14} /> 登出
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
