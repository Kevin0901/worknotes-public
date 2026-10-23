"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Eye, EyeOff, KeyRound, Laptop, Loader2, Server, ShieldCheck } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import {
  ENDPOINT_PRESETS, PROVIDERS, PROVIDER_BY_ID, RETENTION_OPTIONS, isLocalBaseUrl,
  type CredentialInfo, type KeyRetention, type ModelInfo, type ProviderId,
} from "@/lib/ai/catalog";
import { listModelsDirect } from "@/lib/ai/direct-client";
import { Modal } from "../Modal";
import { useToast } from "../Providers";
import { useAiKeys } from "./KeyStore";

/** 網址看起來是不是這台電腦（瀏覽器直連） */
function looksLocal(url: string): boolean {
  return isLocalBaseUrl(url.trim());
}

export function AddKeyDialog({
  open,
  onClose,
  initialProvider,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  initialProvider?: ProviderId;
  /** 新增成功後回傳金鑰選項值（c:… 或 s:…）與模型清單 */
  onAdded?: (value: string, models: ModelInfo[]) => void;
}) {
  const store = useAiKeys();
  const toast = useToast();
  const [provider, setProvider] = useState<ProviderId>(initialProvider ?? "gemini");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [label, setLabel] = useState("");
  const [retention, setRetention] = useState<KeyRetention>("session");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setProvider(initialProvider ?? "gemini");
      setApiKey("");
      setBaseUrl(initialProvider === "custom" ? ENDPOINT_PRESETS[0].baseUrl : "");
      setLabel("");
      setRetention(store.canStore ? "30d" : "session");
      setShow(false);
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialProvider]);

  const info = PROVIDER_BY_ID.get(provider)!;
  const isCustom = provider === "custom";
  const trimmed = apiKey.trim();
  const url = baseUrl.trim().replace(/\/+$/, "");
  const direct = isCustom && looksLocal(url);
  const prefixMismatch = !isCustom && trimmed.length > 6 && info.keyPrefixes.length > 0 && !info.keyPrefixes.some((p) => trimmed.startsWith(p));
  // 直連端點的金鑰不能存在伺服器（瀏覽器需要明文），所以有填金鑰時只能「不儲存」
  const storedDisabled = (o: KeyRetention) => o !== "session" && (!store.canStore || (direct && !!trimmed));
  const canSubmit = isCustom ? /^https?:\/\/./.test(url) : trimmed.length >= 20;

  useEffect(() => {
    if (storedDisabled(retention)) setRetention("session");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direct, trimmed, store.canStore]);

  const close = () => {
    setApiKey("");
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let models: ModelInfo[];
      let credential: CredentialInfo | null = null;
      if (direct) {
        // 本機服務：由瀏覽器直接驗證並列出模型；要保存時伺服器只記下網址
        models = await listModelsDirect(url, trimmed);
        if (retention !== "session") {
          const res = await api<{ credential: CredentialInfo | null }>("POST", "/api/ai/credentials", {
            provider, baseUrl: url, direct: true, label: label.trim() || null, retention,
          });
          credential = res.credential;
        }
      } else {
        const res = await api<{ credential: CredentialInfo | null; models: ModelInfo[] }>("POST", "/api/ai/credentials", {
          provider,
          apiKey: trimmed,
          label: label.trim() || null,
          retention,
          ...(isCustom ? { baseUrl: url } : {}),
        });
        models = res.models;
        credential = res.credential;
      }
      let value: string;
      if (credential) {
        await store.refresh();
        value = `c:${credential.id}`;
        store.rememberModels(value, models);
        toast(isCustom ? `已儲存端點（${models.length} 個模型）` : `已加密儲存 ${info.short} 金鑰`);
      } else {
        value = store.addSessionKey({ provider, apiKey: trimmed, label: label.trim() || null, baseUrl: isCustom ? url : null, direct }, models);
        toast(`${isCustom ? "端點" : `${info.short} 金鑰`}可以使用了（${models.length} 個模型；未儲存，離開 AI 頁面或重新整理後需重新輸入）`);
      }
      setApiKey("");
      onAdded?.(value, models);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={
        <span className="flex items-center gap-2">
          <KeyRound size={17} /> {isCustom ? "連接 AI API 端點" : "新增 AI API 金鑰"}
        </span>
      }
      size="lg"
      footer={
        <>
          <button type="button" className="btn" onClick={close}>
            取消
          </button>
          <button type="submit" form="add-key-form" className="btn-primary primary-action" disabled={busy || !canSubmit}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            {isCustom ? "連線並載入模型" : "驗證並使用"}
          </button>
        </>
      }
    >
      <form id="add-key-form" onSubmit={submit} className="space-y-5" autoComplete="off">
        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="ai-provider">
            AI 供應商
          </label>
          <select
            id="ai-provider"
            className="input"
            value={provider}
            onChange={(e) => {
              const p = e.target.value as ProviderId;
              setProvider(p);
              if (p === "custom" && !baseUrl) setBaseUrl(ENDPOINT_PRESETS[0].baseUrl);
            }}
          >
            <optgroup label="主要（Claude／ChatGPT／Gemini）">
              {PROVIDERS.filter((p) => p.group === "main").map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.free.available ? "（有免費方案）" : ""}
                </option>
              ))}
            </optgroup>
            <optgroup label="免費方案">
              {PROVIDERS.filter((p) => p.group === "free").map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="以網址連線">
              <option value="custom">{PROVIDER_BY_ID.get("custom")!.name}</option>
            </optgroup>
          </select>
          {!isCustom && (
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              {info.free.summary}{" "}
              <a href={info.keyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">
                取得金鑰 <ExternalLink size={11} />
              </a>
            </p>
          )}
        </div>

        {isCustom && (
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="ai-base-url">
              API 網址（OpenAI 相容，通常以 /v1 結尾）
            </label>
            <input
              id="ai-base-url"
              className="input font-mono"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:11434/v1"
              autoComplete="off"
              spellCheck={false}
              required
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ENDPOINT_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  title={`${p.baseUrl} · ${p.note}`}
                  onClick={() => setBaseUrl(p.baseUrl)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${url === p.baseUrl.replace(/\/+$/, "") ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:bg-hover"}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <div className={`mt-3 flex gap-2.5 rounded-lg p-3 text-xs leading-relaxed ${direct ? "bg-accent-soft" : "bg-hover"}`}>
              {direct ? <Laptop size={16} className="mt-0.5 shrink-0 text-accent" /> : <Server size={16} className="mt-0.5 shrink-0 text-muted" />}
              {direct ? (
                <div>
                  <strong>瀏覽器直連（這台電腦上的服務）</strong>：由你的瀏覽器直接呼叫，對話內容不經過本站伺服器送到模型。
                  需允許本站跨網域存取（Ollama：環境變數 <code className="font-mono">OLLAMA_ORIGINS</code>
                  ＝ <code className="font-mono">{typeof window !== "undefined" ? window.location.origin : ""}</code>，再重新啟動 Ollama），
                  Chrome 詢問「存取區域網路裝置」時請允許。只有在這台電腦上能使用。
                </div>
              ) : (
                <div>
                  <strong>由本站伺服器連線</strong>：只接受公開的 <code className="font-mono">https://</code> 網址；
                  為了安全，會拒絕內部網路、本機與保留位址。公司內網或家裡的 Ollama 請改用
                  <code className="font-mono">http://localhost</code>（可用 SSH 通道或 Cloudflare Tunnel 轉到本機）。
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="ai-key">
            API 金鑰{isCustom && <span className="font-normal text-faint">（選填，Ollama、LM Studio 不需要）</span>}
          </label>
          <div className="relative">
            <input
              id="ai-key"
              name="ai-api-key"
              type={show ? "text" : "password"}
              className="input pr-10 font-mono"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={info.keyPlaceholder}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              required={!isCustom}
              autoFocus={!isCustom}
            />
            <button type="button" className="icon-btn absolute right-1.5 top-1/2 -translate-y-1/2" onClick={() => setShow(!show)} aria-label={show ? "隱藏金鑰" : "顯示金鑰"}>
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {prefixMismatch && (
            <p className="mt-1 text-xs text-warn">
              {info.short} 的金鑰通常以「{info.keyPrefixes.join("」或「")}」開頭，請確認沒有選錯供應商。
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="ai-label">
            名稱（選填）
          </label>
          <input
            id="ai-label"
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={40}
            placeholder={isCustom ? "例如：我的 Ollama" : `例如：${info.short} 個人`}
          />
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">保存方式</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {RETENTION_OPTIONS.map((o) => {
              const disabled = storedDisabled(o.value);
              return (
                <label
                  key={o.value}
                  className={`flex cursor-pointer gap-2.5 rounded-lg border p-2.5 text-sm ${retention === o.value ? "border-accent bg-accent-soft" : "border-line"} ${disabled ? "cursor-not-allowed opacity-50" : ""} ${o.value === "session" ? "sm:col-span-2" : ""}`}
                >
                  <input type="radio" name="retention" value={o.value} checked={retention === o.value} disabled={disabled} onChange={() => setRetention(o.value)} className="mt-0.5 accent-[var(--accent)]" />
                  <span>
                    <span className="font-medium">{o.label}</span>
                    <span className="mt-0.5 block text-xs text-muted">{o.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {!store.canStore && <p className="mt-1.5 text-xs text-faint">儲存需要以 Google 帳號登入；後台管理員帳號只能使用「不儲存」。</p>}
          {direct && trimmed && store.canStore && (
            <p className="mt-1.5 text-xs text-faint">瀏覽器直連的端點有填金鑰時只能「不儲存」：本站不會把金鑰傳回瀏覽器，所以無法替你保存。</p>
          )}
          {direct && !trimmed && store.canStore && <p className="mt-1.5 text-xs text-faint">儲存時只會保存網址與名稱（沒有金鑰）。</p>}
        </fieldset>

        <div className="flex gap-2 rounded-lg bg-hover p-3 text-xs leading-relaxed text-muted">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent" />
          <div>
            {direct
              ? "本機端點的金鑰（若有）只留在這個分頁的記憶體；本站伺服器只負責整理你看得到的筆記作為參考資料，並保存對話紀錄。"
              : "金鑰只透過 HTTPS 送到本站伺服器，先向服務驗證後才使用；伺服器不會把金鑰傳回瀏覽器，畫面只顯示前後 4 碼。儲存時以 AES-256-GCM 加密並與你的帳號（自訂端點另含網址）綁定，管理員後台看不到。可隨時永久刪除；到期也會自動刪除。"}
          </div>
        </div>

        {error && <p className="whitespace-pre-line rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
