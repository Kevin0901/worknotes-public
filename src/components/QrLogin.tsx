"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";

interface StartResponse {
  code: string;
  expiresAt: string;
  approveUrl: string;
  qrSvg: string;
}

type Phase = "loading" | "pending" | "approved" | "expired" | "denied" | "error";

/** 電腦端：顯示 QR Code，等待手機核准 */
export function QrLogin({ next }: { next: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<StartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const polling = useRef(false);

  const start = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const res = await api<StartResponse>("POST", "/api/auth/qr/start", { next });
      setData(res);
      setPhase("pending");
    } catch (err) {
      setError(errorMessage(err));
      setPhase("error");
    }
  }, [next]);

  useEffect(() => {
    start();
  }, [start]);

  // 倒數計時
  useEffect(() => {
    if (phase !== "pending" || !data) return;
    const tick = () => {
      const left = Math.max(0, Math.round((new Date(data.expiresAt).getTime() - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) setPhase("expired");
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [phase, data]);

  // 每 2 秒詢問是否已核准
  useEffect(() => {
    if (phase !== "pending") return;
    const t = setInterval(async () => {
      if (polling.current) return;
      polling.current = true;
      try {
        const res = await api<{ status: string; next?: string }>("GET", "/api/auth/qr/poll");
        if (res.status === "approved") {
          setPhase("approved");
          window.location.href = res.next || next;
        } else if (res.status === "denied") {
          setPhase("denied");
        } else if (res.status === "expired" || res.status === "consumed") {
          setPhase("expired");
        }
      } catch {
        /* 網路短暫中斷時下次再試 */
      } finally {
        polling.current = false;
      }
    }, 2000);
    return () => clearInterval(t);
  }, [phase, next]);

  return (
    <div className="space-y-4">
      {phase === "loading" && <p className="py-16 text-center text-sm text-faint">產生登入代碼中…</p>}

      {phase === "pending" && data && (
        <>
          <div className="mx-auto w-[220px] rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
            <div className="[&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: data.qrSvg }} />
          </div>
          <div className="text-center">
            <div className="text-xs text-muted">或在手機開啟「核准電腦登入」並輸入代碼</div>
            <div className="mt-1 font-mono text-2xl font-bold tracking-widest">{data.code}</div>
            <div className="mt-1 text-xs text-faint">
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")} 後失效
            </div>
          </div>
          <ol className="space-y-1.5 rounded-lg bg-subtle p-3 text-xs leading-relaxed text-muted">
            <li className="flex gap-2">
              <Smartphone size={14} className="mt-0.5 shrink-0" />
              用手機相機掃描 QR Code（手機需已用 Google 登入本網站）
            </li>
            <li className="flex gap-2">
              <ShieldCheck size={14} className="mt-0.5 shrink-0" />
              在手機上確認電腦的位置與瀏覽器資訊無誤後，按「核准」
            </li>
          </ol>
        </>
      )}

      {phase === "approved" && <p className="py-16 text-center text-sm text-accent">已核准，登入中…</p>}

      {(phase === "expired" || phase === "denied" || phase === "error") && (
        <div className="py-8 text-center">
          <p className={`text-sm ${phase === "expired" ? "text-muted" : "text-danger"}`}>
            {phase === "expired" && "登入代碼已過期。"}
            {phase === "denied" && "手機端拒絕了這次登入。"}
            {phase === "error" && (error ?? "發生錯誤")}
          </p>
          <button type="button" className="btn mt-4" onClick={start}>
            <RefreshCw size={15} /> 重新產生 QR Code
          </button>
        </div>
      )}

      <p className="text-center text-xs leading-relaxed text-faint">
        使用完畢請記得登出；忘記的話，也可以在手機的「我的帳號 → 登入裝置」遠端登出這台電腦。
      </p>
      <div className="border-t border-line pt-4 text-center">
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-sm text-muted hover:text-fg">
          ← 改用 Google 帳號登入
        </Link>
      </div>
    </div>
  );
}
