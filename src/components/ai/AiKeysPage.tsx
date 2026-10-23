"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft, BookOpen, Check, CircleCheck, Copy, CreditCard, ExternalLink, Gauge, KeyRound, Laptop, Lock, Plug, Plus,
  Server, ShieldCheck, Sparkles, Trash2, TriangleAlert, UserRoundCheck, type LucideIcon,
} from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";
import {
  ENDPOINT_PRESETS, EXCLUDED_FREE, FREE_TIER_CHECKED, FREE_TIER_SOURCES, PROVIDERS, PROVIDER_BY_ID, type ProviderId,
} from "@/lib/ai/catalog";
import { useDialogs, useToast } from "../Providers";
import { AddKeyDialog } from "./AddKeyDialog";
import { useAiKeys, type KeyOption } from "./KeyStore";

type Tab = "keys" | "free" | "custom" | "security";
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "keys", label: "我的金鑰", icon: KeyRound },
  { id: "free", label: "免費金鑰申請", icon: Sparkles },
  { id: "custom", label: "連接 Ollama／自訂端點", icon: Plug },
  { id: "security", label: "安全說明", icon: ShieldCheck },
];
const isTab = (v: string): v is Tab => TABS.some((t) => t.id === v);

/** 申請教學的平台順序：免費（Gemini 第一）→ 付費 */
const GUIDE_PROVIDERS = [...PROVIDERS.filter((p) => p.free.available), ...PROVIDERS.filter((p) => !p.free.available && p.group !== "custom")];

export function AiKeysPage({ isUser }: { isUser: boolean }) {
  const store = useAiKeys();
  const dialogs = useDialogs();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("keys");
  const [adding, setAdding] = useState<ProviderId | null>(null);

  // 以網址 # 切換分頁（例如從 AI 助理連到 /ai/keys#free）；#add-<供應商> 直接開啟填寫視窗
  useEffect(() => {
    const sync = () => {
      const h = window.location.hash.replace(/^#/, "");
      if (h.startsWith("add-")) {
        const p = h.slice(4);
        if (PROVIDER_BY_ID.has(p as ProviderId)) setAdding(p as ProviderId);
        return;
      }
      if (isTab(h)) setTab(h);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", `#${t}`);
    document.getElementById("main")?.scrollTo({ top: 0 });
  };

  const remove = async (o: KeyOption) => {
    if (o.kind === "session") {
      store.removeSessionKey(o.value.slice(2));
      toast("已移除（未儲存的金鑰只在這個分頁）");
      return;
    }
    const ok = await dialogs.confirm({
      title: `刪除「${o.label}」？`,
      message: o.direct
        ? "這個端點設定會從伺服器永久刪除，無法復原。"
        : "金鑰會從伺服器永久刪除，無法復原。若金鑰可能外洩，也請到供應商網站撤銷（Revoke）它。",
      confirmLabel: "永久刪除",
      danger: true,
    });
    if (!ok) return;
    try {
      await api("DELETE", `/api/ai/credentials/${o.value.slice(2)}`);
      await store.refresh();
      toast("已永久刪除");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const removeAll = async () => {
    const ok = await dialogs.confirm({
      title: "刪除我所有儲存的金鑰與端點？",
      message: "所有加密儲存的金鑰與端點設定都會從伺服器永久刪除，無法復原。",
      confirmLabel: "全部刪除",
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await api<{ deleted: number }>("DELETE", "/api/ai/credentials");
      await store.refresh();
      toast(`已刪除 ${res.deleted} 筆`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-6 md:px-8 md:pt-8">
      <Link href="/ai" className="btn-ghost -ml-2">
        <ArrowLeft size={15} /> 回到 AI 助理
      </Link>
      <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold">
        <KeyRound size={22} /> API 金鑰與連線
      </h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
        使用你自己的 Claude、ChatGPT、Gemini、免費平台金鑰，或連接電腦上的 Ollama。費用與額度由你的帳號計算，本站不收費。
      </p>

      <nav
        className="sticky top-0 z-20 -mx-4 mt-5 flex gap-1 overflow-x-auto border-b border-line bg-bg/95 px-4 py-2 backdrop-blur thin-scroll md:-mx-8 md:px-8"
        aria-label="金鑰頁面分頁"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => go(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${tab === t.id ? "bg-active font-medium text-fg" : "text-muted hover:bg-hover hover:text-fg"}`}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "keys" && <KeysTab isUser={isUser} onAdd={(p) => setAdding(p)} onRemove={remove} onRemoveAll={removeAll} onGo={go} />}
        {tab === "free" && <FreeTab onAdd={(p) => setAdding(p)} />}
        {tab === "custom" && <CustomTab onAdd={() => setAdding("custom")} />}
        {tab === "security" && <SecurityTab />}
      </div>

      <AddKeyDialog open={adding !== null} onClose={() => setAdding(null)} initialProvider={adding ?? undefined} onAdded={() => go("keys")} />
    </div>
  );
}

// ───────────── 我的金鑰 ─────────────

function KeysTab({
  isUser,
  onAdd,
  onRemove,
  onRemoveAll,
  onGo,
}: {
  isUser: boolean;
  onAdd: (p: ProviderId) => void;
  onRemove: (o: KeyOption) => void;
  onRemoveAll: () => void;
  onGo: (t: Tab) => void;
}) {
  const store = useAiKeys();
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" onClick={() => onAdd("gemini")}>
          <Plus size={15} /> 新增金鑰
        </button>
        <button type="button" className="btn" onClick={() => onAdd("custom")}>
          <Plug size={15} /> 連接端點（Ollama 等）
        </button>
        <div className="flex-1" />
        {store.credentials.length > 0 && (
          <button type="button" className="btn-ghost text-danger" onClick={onRemoveAll}>
            <Trash2 size={15} /> 全部刪除
          </button>
        )}
      </div>

      {!store.loaded ? (
        <p className="text-sm text-faint">載入中…</p>
      ) : store.options.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <EmptyCard icon={Sparkles} title="沒有付費帳號？" text="Google Gemini、Groq 等平台有免費金鑰，跟著教學幾分鐘就能申請。" action="免費金鑰申請" onClick={() => onGo("free")} />
          <EmptyCard icon={Laptop} title="電腦上有 Ollama？" text="直接連接本機模型，對話內容不必送到雲端。" action="連接本機模型" onClick={() => onGo("custom")} />
          <EmptyCard icon={KeyRound} title="已經有金鑰" text="貼上 Claude、ChatGPT 或其他平台的 API 金鑰。" action="新增金鑰" onClick={() => onAdd("gemini")} />
        </div>
      ) : (
        <ul className="space-y-3">
          {store.options.map((o) => (
            <KeyRow key={o.value} o={o} onRemove={() => onRemove(o)} />
          ))}
        </ul>
      )}

      {!isUser && (
        <p className="rounded-lg bg-hover px-4 py-3 text-sm leading-relaxed text-muted">
          你目前以後台管理員帳號登入：只能使用「不儲存」的金鑰，對話也不會保存。改用 Google 帳號登入即可儲存金鑰與對話紀錄。
        </p>
      )}
    </section>
  );
}

function EmptyCard({ icon: Icon, title, text, action, onClick }: { icon: LucideIcon; title: string; text: string; action: string; onClick: () => void }) {
  return (
    <div className="card flex flex-col p-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <Icon size={18} />
      </span>
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1 flex-1 text-sm leading-relaxed text-muted">{text}</p>
      <button type="button" className="btn mt-4 self-start" onClick={onClick}>
        {action}
      </button>
    </div>
  );
}

function KeyRow({ o, onRemove }: { o: KeyOption; onRemove: () => void }) {
  const store = useAiKeys();
  const cred = store.credentials.find((c) => `c:${c.id}` === o.value);
  const p = PROVIDER_BY_ID.get(o.provider);
  const showHint = o.hint && o.hint !== "（無金鑰）";
  return (
    <li className="card flex flex-wrap items-start gap-x-4 gap-y-3 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-hover text-lg" aria-hidden>
        {p?.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{o.label}</span>
          {o.direct && (
            <span className="chip">
              <Laptop size={10} /> 本機直連
            </span>
          )}
          {o.kind === "session" ? (
            <span className="chip">未儲存 · 只在這個分頁</span>
          ) : (
            <span className="chip">
              <Lock size={10} /> {o.direct ? "已儲存網址" : "加密儲存"}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted">
          <span>{p?.short}</span>
          {o.baseUrl && <span className="break-all font-mono text-xs leading-5">{o.baseUrl}</span>}
          {showHint && <span className="font-mono text-xs leading-5">{o.hint}</span>}
        </div>
        {cred && (
          <div className="mt-1.5 text-xs leading-relaxed text-faint">
            新增於 {formatDateTime(cred.createdAt)} · {cred.lastUsedAt ? `最後使用 ${formatDateTime(cred.lastUsedAt)}` : "尚未使用"} ·{" "}
            {cred.expiresAt ? `${formatDateTime(cred.expiresAt)} 自動刪除` : "不會自動刪除"}
          </div>
        )}
      </div>
      <button type="button" className="btn-ghost text-danger" onClick={onRemove}>
        <Trash2 size={15} /> {o.kind === "session" ? "移除" : "刪除"}
      </button>
    </li>
  );
}

// ───────────── 免費金鑰申請 ─────────────

function Fact({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-hover p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-faint">
        <Icon size={13} /> {label}
      </div>
      <div className="mt-1 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

function FreeTab({ onAdd }: { onAdd: (p: ProviderId) => void }) {
  const [selected, setSelected] = useState<ProviderId>(GUIDE_PROVIDERS[0].id);
  const p = PROVIDER_BY_ID.get(selected)!;
  const free = PROVIDERS.filter((x) => x.free.available);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">免費 AI API 金鑰申請教學</h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
          依「上下文大小」與「免費額度」挑選，資料於 {FREE_TIER_CHECKED} 查證。各家額度經常調整，實際以供應商主控台顯示為準。
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-[200px_minmax(0,1fr)]">
        {/* 平台清單：手機為橫向捲動，桌機為左側直列 */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 thin-scroll md:mx-0 md:flex-col md:overflow-visible md:px-0" role="tablist" aria-label="選擇平台">
          {GUIDE_PROVIDERS.map((x, i) => {
            const on = x.id === selected;
            return (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setSelected(x.id)}
                className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm md:w-full ${on ? "border-accent bg-accent-soft font-medium" : "border-line hover:bg-hover"}`}
              >
                <span aria-hidden className="w-5 text-center">{x.icon}</span>
                <span className="flex-1 whitespace-nowrap">{x.short}</span>
                {i === 0 && <span className="rounded bg-accent px-1.5 py-px text-[10px] text-accent-fg">推薦</span>}
                {!x.free.available && <span className="rounded bg-hover px-1.5 py-px text-[10px] text-faint">付費</span>}
              </button>
            );
          })}
        </div>

        <article className="card p-5 md:p-6" role="tabpanel">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <span aria-hidden>{p.icon}</span>
            {p.name}
          </h3>
          <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{p.free.summary}</p>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <Fact icon={Gauge} label={p.free.available ? "免費額度" : "額度"}>{p.free.quota}</Fact>
            <Fact icon={BookOpen} label="上下文">{p.free.context}</Fact>
            <Fact icon={CreditCard} label="信用卡">{p.free.card}</Fact>
            <Fact icon={UserRoundCheck} label="資料隱私">{p.free.privacy}</Fact>
          </div>

          <h4 className="mt-6 font-semibold">申請步驟</h4>
          <ol className="mt-3 space-y-3">
            {p.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          {p.tips.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {p.tips.map((t) => (
                <p key={t} className="flex gap-2 text-sm leading-relaxed text-muted">
                  <CircleCheck size={15} className="mt-0.5 shrink-0 text-accent" />
                  {t}
                </p>
              ))}
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <a href={p.keyUrl} target="_blank" rel="noopener noreferrer" className="btn">
              前往申請 <ExternalLink size={13} />
            </a>
            <button type="button" className="btn-primary" onClick={() => onAdd(p.id)}>
              <KeyRound size={14} /> 填入金鑰
            </button>
          </div>
        </article>
      </div>

      <details className="card group">
        <summary className="cursor-pointer list-none px-5 py-3.5 font-medium">
          <span className="mr-2 inline-block text-faint transition-transform group-open:rotate-90">›</span>
          所有免費平台比較表
        </summary>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-subtle text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">平台</th>
                <th className="px-4 py-2.5 font-medium">免費額度</th>
                <th className="px-4 py-2.5 font-medium">上下文</th>
                <th className="px-4 py-2.5 font-medium">信用卡</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {free.map((x) => (
                <tr key={x.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 font-medium">
                    {x.icon} {x.short}
                  </td>
                  <td className="px-4 py-3 leading-relaxed text-muted">{x.free.quota}</td>
                  <td className="px-4 py-3 leading-relaxed text-muted">{x.free.context}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{x.free.card}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className="card group">
        <summary className="cursor-pointer list-none px-5 py-3.5 font-medium">
          <span className="mr-2 inline-block text-faint transition-transform group-open:rotate-90">›</span>
          沒有加入的平台與參考來源
        </summary>
        <div className="space-y-4 border-t border-line px-5 py-4 text-sm leading-relaxed">
          <ul className="list-disc space-y-1.5 pl-5 text-muted">
            {EXCLUDED_FREE.map((x) => (
              <li key={x.name}>
                <span className="font-medium text-fg">{x.name}</span>：{x.reason}
              </li>
            ))}
          </ul>
          <ul className="space-y-1">
            {FREE_TIER_SOURCES.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                  {s.label} <ExternalLink size={11} />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
}

// ───────────── 連接 Ollama／自訂端點 ─────────────

function CodeLine({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="mt-2 flex items-start gap-2 rounded-lg border border-[var(--code-border)] bg-code px-3 py-2">
      <code className="min-w-0 flex-1 break-all font-mono text-[13px] leading-6 text-fg">{code}</code>
      <button
        type="button"
        className="icon-btn h-6 w-6"
        aria-label="複製"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          } catch {
            /* ignore */
          }
        }}
      >
        {done ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
      </button>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">{n}</span>
      <div className="min-w-0 flex-1 pb-1">
        <h4 className="font-semibold leading-7">{title}</h4>
        <div className="mt-1 text-[15px] leading-relaxed text-muted">{children}</div>
      </div>
    </li>
  );
}

function CustomTab({ onAdd }: { onAdd: () => void }) {
  // 網址只在瀏覽器取得，避免伺服器與瀏覽器渲染結果不同
  const [origin, setOrigin] = useState("https://<本站網址>");
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-xl font-bold">以網址連接模型（OpenAI 相容 API）</h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
          輸入 API 網址就能載入該服務的模型，例如電腦上的 Ollama、LM Studio，或自架的 vLLM、OpenAI 相容的雲端服務。
        </p>
        <button type="button" className="btn-primary mt-4" onClick={onAdd}>
          <Plug size={15} /> 連接端點
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="card p-5">
          <h3 className="flex items-center gap-2 font-semibold">
            <Laptop size={17} className="text-accent" /> 瀏覽器直連（本機）
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            網址是 <code className="font-mono">localhost</code> 或 <code className="font-mono">127.0.0.1</code> 時使用。由你的瀏覽器直接呼叫，
            對話內容不經過本站伺服器送到模型；只能在這台電腦上使用。
          </p>
        </div>
        <div className="card p-5">
          <h3 className="flex items-center gap-2 font-semibold">
            <Server size={17} className="text-muted" /> 本站伺服器代連（公開 HTTPS）
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            其他 <code className="font-mono">https://</code> 網址由本站伺服器連線，任何裝置都能用。為了安全，會拒絕內部網路、本機與保留位址。
          </p>
        </div>
      </div>

      <div className="card p-5 md:p-6">
        <h3 className="text-lg font-semibold">連接電腦上的 Ollama（Windows）</h3>
        <ol className="mt-4 space-y-5">
          <Step n={1} title="安裝 Ollama 並下載模型">
            到{" "}
            <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              ollama.com/download
            </a>{" "}
            安裝，然後在 PowerShell 下載模型（模型名稱可在 ollama.com/library 查詢）：
            <CodeLine code="ollama pull llama3.2" />
          </Step>
          <Step n={2} title="允許本站存取 Ollama（只需設定一次）">
            Ollama 預設只接受本機網頁的請求。在 PowerShell 執行下面這行，再從工作列結束 Ollama 並重新開啟：
            <CodeLine code={`[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "${origin}", "User")`} />
          </Step>
          <Step n={3} title="（建議）加大上下文長度">
            Ollama 預設的上下文較小，引用多篇筆記時可能被截斷。可以再設定（數值越大越吃記憶體）：
            <CodeLine code={`[Environment]::SetEnvironmentVariable("OLLAMA_CONTEXT_LENGTH", "8192", "User")`} />
          </Step>
          <Step n={4} title="在本站連接">
            按上方「連接端點」，選擇「Ollama（本機）」後按「連線並載入模型」。Chrome 詢問是否允許「存取區域網路上的裝置」時，請選擇允許。
          </Step>
        </ol>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="card p-5">
          <h3 className="font-semibold">LM Studio</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">在 LM Studio 的 Developer 頁啟動伺服器，並開啟「Enable CORS」，網址填：</p>
          <CodeLine code="http://localhost:1234/v1" />
        </div>
        <div className="card p-5">
          <h3 className="font-semibold">公司內網或另一台 GPU 伺服器</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">本站伺服器在雲端連不到內網。可以用 SSH 通道轉到本機，再用 localhost 連線：</p>
          <CodeLine code="ssh -N -L 11434:localhost:11434 使用者@伺服器IP" />
          <p className="mt-2 text-xs leading-relaxed text-faint">
            也可以用 Cloudflare Tunnel 公開成 https 網址，但務必加上存取保護（例如 Cloudflare Access），不要讓模型對全世界開放。
          </p>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold">常用網址</h3>
        <ul className="mt-3 divide-y divide-line">
          {ENDPOINT_PRESETS.filter((x) => x.baseUrl !== "https://").map((x) => (
            <li key={x.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
              <span className="w-40 shrink-0 font-medium">{x.name}</span>
              <code className="min-w-0 flex-1 break-all font-mono text-[13px] text-muted">{x.baseUrl}</code>
              <span className="chip">{x.mode === "direct" ? "瀏覽器直連" : "伺服器代連"}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ───────────── 安全說明 ─────────────

const PROTECT = [
  "傳輸：只在 HTTPS 連線中以 POST 送到本站，不會出現在網址、Cookie 或記錄檔；本站只連線到各供應商的官方網址，或你指定、且通過公開位址檢查的 https 網址。",
  "儲存：以 AES-256-GCM 加密，每筆使用隨機 IV，並與你的帳號、供應商（自訂端點另含網址）綁定；資料庫外洩或被竄改時無法直接讀出或轉送金鑰。",
  "使用：只在伺服器端解密後呼叫 AI；瀏覽器、其他使用者、管理員後台都拿不到金鑰，畫面只顯示前後 4 碼。",
  "刪除：可隨時永久刪除單把或全部金鑰；設定期限的金鑰到期自動刪除；刪除帳號時一併刪除。",
  "「不儲存」模式：金鑰只在這個分頁的記憶體中，離開 AI 助理頁面或重新整理就消失，適合在客戶或公用電腦使用。",
  "自訂端點：伺服器代連時，會在連線當下檢查網址解析出的每個 IP 都是公開位址（防止 DNS rebinding），而且不跟隨轉址；本機服務改由瀏覽器直連，伺服器不會連到你的電腦。",
];

const CAUTION = [
  "引用網站資料時，相關筆記內容會一併送給你選擇的 AI 服務；含客戶機密的內容請改用「不引用」、指定範圍，或使用本機模型。",
  "部分免費方案會把提示內容用於改進模型（見「免費金鑰申請」各平台說明），機密資料請使用付費方案或本機模型。",
  "建議在供應商後台設定每月用量上限，並為本站建立專用金鑰，不用時隨時撤銷。",
  "AI 回答可能有錯，指令與設定請以原廠官方文件核對後再執行。",
];

function SecurityTab() {
  return (
    <section className="space-y-5">
      <div className="card p-5 md:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck size={18} className="text-accent" /> 金鑰如何被保護
        </h2>
        <ul className="mt-4 space-y-3">
          {PROTECT.map((t) => (
            <li key={t} className="flex gap-2.5 text-[15px] leading-relaxed">
              <CircleCheck size={16} className="mt-1 shrink-0 text-accent" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="card p-5 md:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <TriangleAlert size={18} className="text-warn" /> 使用前請注意
        </h2>
        <ul className="mt-4 space-y-3">
          {CAUTION.map((t) => (
            <li key={t} className="flex gap-2.5 text-[15px] leading-relaxed">
              <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
