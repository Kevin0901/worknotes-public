"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Save } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import type { Settings } from "@/lib/types";
import { useToast } from "../Providers";

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 py-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-muted">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-active"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`}
        />
      </button>
    </div>
  );
}

export function AdminSettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(settings);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setValue((s) => ({ ...s, [k]: v }));
  const dirty = JSON.stringify(value) !== JSON.stringify(settings);

  return (
    <section className="card p-5">
      <h2 className="font-semibold">前台與紀錄</h2>
      <div className="divide-y divide-[var(--border)]">
        <Toggle
          checked={value.requireLogin}
          onChange={(v) => set("requireLogin", v)}
          label="前台需要登入才能查看"
          description={
            <>
              開啟（建議）：只有經核准的 Google 帳號與管理員能看到筆記。
              <br />
              關閉：任何知道網址的人都能<b>瀏覽</b>筆記（仍需核准的帳號才能新增、修改、刪除）。
            </>
          }
        />
        <Toggle
          checked={value.allowRegistration}
          onChange={(v) => set("allowRegistration", v)}
          label="開放新帳號申請"
          description="開啟時，未登記的 Google 帳號登入後會建立「待審核」申請；關閉時直接拒絕，只有預先加入的帳號能登入。"
        />
        <Toggle
          checked={value.logPageViews}
          onChange={(v) => set("logPageViews", v)}
          label="記錄頁面瀏覽"
          description="記錄每次開啟頁面的帳號、IP、地區、裝置。登入與異動紀錄不受此設定影響，一律記錄。"
        />
        <div className="grid gap-4 py-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium">網站名稱</span>
            <input
              className="input mt-1.5"
              value={value.siteTitle}
              maxLength={40}
              onChange={(e) => set("siteTitle", e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">紀錄保留天數</span>
            <input
              type="number"
              min={1}
              max={3650}
              className="input mt-1.5"
              value={value.logRetentionDays}
              onChange={(e) => set("logRetentionDays", Number(e.target.value))}
            />
          </label>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        {dirty && (
          <button type="button" className="btn" onClick={() => setValue(settings)} disabled={busy}>
            還原
          </button>
        )}
        <button
          type="button"
          className="btn-primary"
          disabled={!dirty || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api("PATCH", "/api/admin/settings", value);
              toast("設定已儲存");
              router.refresh();
            } catch (err) {
              toast(errorMessage(err), "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Save size={15} /> 儲存設定
        </button>
      </div>
    </section>
  );
}
