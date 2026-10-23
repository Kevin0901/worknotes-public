"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";
import { getBusySnapshot, getServerBusySnapshot, installFetchTracking, subscribeBusy } from "@/lib/busy";

/** 等多久才出現（快的動作不閃一下）、出現後至少顯示多久、多久後改顯示「網路較慢」 */
const SHOW_DELAY = 300;
const MIN_VISIBLE = 400;
const SLOW_AFTER = 10_000;

/** 畫面上方的等待提示：按下按鈕或換頁、等待網路回應時顯示轉圈 */
export function BusyIndicator() {
  const busy = useSyncExternalStore(subscribeBusy, getBusySnapshot, getServerBusySnapshot);
  const [visible, setVisible] = useState(false);
  const [shownAt, setShownAt] = useState(0);
  const [slow, setSlow] = useState(false);
  const [kind, setKind] = useState(busy.kind);

  useEffect(() => {
    installFetchTracking();
  }, []);

  useEffect(() => {
    if (busy.count > 0) {
      setKind(busy.kind);
      if (visible) return;
      const t = setTimeout(() => {
        setVisible(true);
        setShownAt(Date.now());
      }, Math.max(0, SHOW_DELAY - (Date.now() - busy.since)));
      return () => clearTimeout(t);
    }
    if (!visible) return;
    const t = setTimeout(() => {
      setVisible(false);
      setSlow(false);
    }, Math.max(0, MIN_VISIBLE - (Date.now() - shownAt)));
    return () => clearTimeout(t);
  }, [busy, visible, shownAt]);

  useEffect(() => {
    if (!visible || busy.count === 0) return;
    const t = setTimeout(() => setSlow(true), Math.max(0, SLOW_AFTER - (Date.now() - busy.since)));
    return () => clearTimeout(t);
  }, [visible, busy]);

  const text = slow ? "網路較慢，仍在處理…" : kind === "action" ? "處理中…" : "載入中…";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 top-14 z-[95] sm:top-2 flex justify-center px-4 transition-opacity duration-150 ${visible ? "opacity-100" : "opacity-0"}`}
    >
      {visible && (
        <span data-busy-indicator className="flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-medium text-muted shadow-pop">
          <Loader2 size={14} className="text-accent motion-safe:animate-spin" aria-hidden />
          {text}
        </span>
      )}
    </div>
  );
}
