"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleAlert, CircleCheck, Laptop, MapPin } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import { DEFAULT_SESSION_HOURS, SESSION_HOUR_OPTIONS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { LoginRequestInfo } from "@/lib/types";
import { summarizeUserAgent } from "@/lib/ua";

/** 手動輸入電腦上顯示的 8 碼代碼 */
export function QrCodeEntry() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean.length === 8) router.push(`/qr/${clean}`);
      }}
    >
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">輸入電腦畫面上的代碼</span>
        <input
          className="input text-center font-mono text-xl tracking-widest uppercase"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ABCD-EFGH"
          maxLength={9}
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
        />
      </label>
      <button type="submit" className="btn-primary w-full py-2" disabled={clean.length !== 8}>
        下一步
      </button>
      <p className="text-center text-xs text-faint">在電腦上開啟登入頁，選擇「用手機掃碼登入」即可看到代碼。</p>
    </form>
  );
}

export function QrApprove({ request, email }: { request: LoginRequestInfo | null; email: string }) {
  const [hours, setHours] = useState<number>(DEFAULT_SESSION_HOURS);
  const [result, setResult] = useState<"approved" | "denied" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!request) {
    return (
      <Notice tone="danger" title="找不到這個登入代碼">
        請確認代碼是否正確，或在電腦上重新產生 QR Code。
      </Notice>
    );
  }
  if (result === "approved") {
    return (
      <Notice tone="ok" title="已核准">
        電腦會在幾秒內自動登入，有效時間 {hours} 小時。用完後若忘記登出，可到
        <Link href="/account" className="mx-1 text-accent underline">
          我的帳號
        </Link>
        遠端登出。
      </Notice>
    );
  }
  if (result === "denied") return <Notice tone="danger" title="已拒絕這次登入" />;
  if (request.status !== "pending") {
    const msg =
      request.status === "expired" ? "這個代碼已過期，請在電腦上重新產生。" : "這個代碼已經被處理過了。";
    return <Notice tone="danger" title="無法核准">{msg}</Notice>;
  }

  const decide = async (decision: "approve" | "deny") => {
    setBusy(true);
    setError(null);
    try {
      await api("POST", "/api/auth/qr/decide", { code: request.code, decision, hours });
      setResult(decision === "approve" ? "approved" : "denied");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-warn/40 bg-warn-soft p-3 text-sm leading-relaxed">
        有一台電腦要求以 <b className="break-all">{email}</b> 登入。<b>請確認這是你本人剛剛在使用的電腦</b>，不是別人傳給你的連結或 QR Code。
      </div>
      <dl className="space-y-2 rounded-lg bg-subtle p-3 text-sm">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-muted">代碼</dt>
          <dd className="font-mono font-semibold tracking-wider">{request.code}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="flex w-16 shrink-0 items-center gap-1 text-muted">
            <Laptop size={13} /> 裝置
          </dt>
          <dd>{summarizeUserAgent(request.userAgent)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="flex w-16 shrink-0 items-center gap-1 text-muted">
            <MapPin size={13} /> 位置
          </dt>
          <dd className="break-all">
            {[request.country, request.city].filter(Boolean).join(" · ") || "未知"}（{request.ip ?? "未知 IP"}）
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-muted">時間</dt>
          <dd>{formatDateTime(request.createdAt, true)}</dd>
        </div>
      </dl>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">這台電腦保持登入多久？</legend>
        <div className="grid grid-cols-4 gap-1.5">
          {SESSION_HOUR_OPTIONS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHours(h)}
              className={`rounded-md border px-2 py-2 text-sm ${
                hours === h ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line hover:bg-hover"
              }`}
            >
              {h} 小時
            </button>
          ))}
        </div>
      </fieldset>

      {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn py-2.5 text-danger" disabled={busy} onClick={() => decide("deny")}>
          拒絕
        </button>
        <button type="button" className="btn-primary py-2.5" disabled={busy} onClick={() => decide("approve")}>
          核准登入
        </button>
      </div>
    </div>
  );
}

function Notice({ tone, title, children }: { tone: "ok" | "danger"; title: string; children?: React.ReactNode }) {
  return (
    <div className="py-6 text-center">
      {tone === "ok" ? (
        <CircleCheck size={40} className="mx-auto text-accent" />
      ) : (
        <CircleAlert size={40} className="mx-auto text-danger" />
      )}
      <h2 className="mt-3 text-lg font-semibold">{title}</h2>
      {children && <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>}
      <Link href="/" className="btn mt-6">
        回到筆記
      </Link>
    </div>
  );
}
