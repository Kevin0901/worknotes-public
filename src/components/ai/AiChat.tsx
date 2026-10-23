"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen, Bot, Check, Copy, History, KeyRound, Library, Loader2, MessageSquarePlus, Pencil, Plug, RefreshCw, Send, Square,
  Trash2, TriangleAlert, User,
} from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";
import {
  PROVIDER_BY_ID, REFERENCE_AMOUNT,
  type ChatSource, type ModelInfo, type PreparedChat, type ReferenceAmount, type ReferenceMode,
} from "@/lib/ai/catalog";
import { streamChatDirect } from "@/lib/ai/direct-client";
import { Markdown } from "../Markdown";
import { Modal } from "../Modal";
import { useDialogs, useToast } from "../Providers";
import { AddKeyDialog } from "./AddKeyDialog";
import { pickDefaultModel, useAiKeys } from "./KeyStore";
import { EMPTY_SELECTION, ReferencePicker, selectionSummary, type ReferenceSelection } from "./ReferencePicker";
import { AI_EXAMPLES as EXAMPLES, AI_REFERENCE_EXAMPLES } from "@/lib/site-content";

interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: ChatSource[];
  model?: string | null;
  pending?: boolean;
  error?: string;
  notice?: string;
}

interface ConversationInfo {
  id: string;
  title: string;
  provider: string | null;
  model: string | null;
  updatedAt: string;
}

interface Prefs {
  key?: string;
  model?: string;
  refMode?: ReferenceMode;
  refAmount?: ReferenceAmount;
  save?: boolean;
  freeOnly?: boolean;
}

/** 只記住「選了哪把金鑰（id）、哪個模型」等偏好，不含金鑰本身 */
const PREFS_KEY = "wn:ai-prefs";
function readPrefs(): Prefs {
  try {
    return (JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Prefs) ?? {};
  } catch {
    return {};
  }
}
function writePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...p }));
  } catch {
    /* ignore */
  }
}

/** 把回答中的 [1]、[2] 轉成來源連結（略過程式碼區塊） */
function linkCitations(text: string, sources: ChatSource[]): string {
  if (!sources.length) return text;
  const byN = new Map(sources.map((s) => [s.n, s.href]));
  return text
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2 === 1 ? part : part.replace(/\[(\d{1,2})\](?![(\]])/g, (m, n: string) => (byN.has(+n) ? `[\\[${n}\\]](${byN.get(+n)})` : m)),
    )
    .join("");
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost h-7 px-1.5 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* ignore */
        }
      }}
    >
      {done ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
      {done ? "已複製" : "複製"}
    </button>
  );
}

function MessageView({ m }: { m: UiMessage }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end gap-2">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-accent-soft px-4 py-2.5 text-[15px] leading-relaxed">{m.content}</div>
        <span className="mt-1 hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-hover sm:flex">
          <User size={14} />
        </span>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <span className="mt-1 hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg sm:flex">
        <Bot size={14} />
      </span>
      <div className="min-w-0 flex-1">
        {m.notice && <p className="mb-2 rounded-md bg-warn-soft px-3 py-1.5 text-xs text-warn">{m.notice}</p>}
        {m.content ? (
          <Markdown content={linkCitations(m.content, m.sources)} />
        ) : m.pending ? (
          <p className="flex items-center gap-2 text-sm text-faint">
            <Loader2 size={15} className="animate-spin" /> 思考中…
          </p>
        ) : null}
        {m.error && (
          <p className="mt-2 flex gap-1.5 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" />
            {m.error}
          </p>
        )}
        {m.sources.length > 0 && (
          <div className="mt-3 rounded-lg border border-line p-2.5">
            <div className="mb-1 text-xs font-semibold text-faint">參考來源</div>
            <ol className="space-y-0.5 text-sm">
              {m.sources.map((s) => (
                <li key={s.n} className="flex gap-1.5">
                  <span className="shrink-0 font-mono text-xs text-faint">[{s.n}]</span>
                  <Link href={s.href} className="truncate text-accent hover:underline" target="_blank">
                    {s.kind === "guide" ? "📘 " : "📄 "}
                    {s.title}
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        )}
        {!m.pending && m.content && (
          <div className="mt-1 flex items-center gap-2 text-xs text-faint">
            <CopyButton text={m.content} />
            {m.model && <span className="truncate">{m.model}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export function AiChat({ isUser }: { isUser: boolean }) {
  const store = useAiKeys();
  const toast = useToast();
  const dialogs = useDialogs();

  const [keyValue, setKeyValue] = useState("");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [model, setModel] = useState("");
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [freeOnly, setFreeOnly] = useState(true);
  const [modelFilter, setModelFilter] = useState("");

  const [refMode, setRefMode] = useState<ReferenceMode>("auto");
  const [refAmount, setRefAmount] = useState<ReferenceAmount>("normal");
  const [selection, setSelection] = useState<ReferenceSelection>(EMPTY_SELECTION);
  const [save, setSave] = useState(isUser);

  const [conversations, setConversations] = useState<ConversationInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // 載入偏好（不含金鑰）
  useEffect(() => {
    const p = readPrefs();
    if (p.refMode) setRefMode(p.refMode);
    if (p.refAmount && REFERENCE_AMOUNT[p.refAmount]) setRefAmount(p.refAmount);
    if (typeof p.save === "boolean" && isUser) setSave(p.save);
    if (typeof p.freeOnly === "boolean") setFreeOnly(p.freeOnly);
  }, [isUser]);

  // 金鑰清單載入後，選擇上次使用的金鑰
  useEffect(() => {
    if (!store.loaded) return;
    if (keyValue && store.options.some((o) => o.value === keyValue)) return;
    const last = readPrefs().key;
    const next = store.options.find((o) => o.value === last)?.value ?? store.options[0]?.value ?? "";
    setKeyValue(next);
  }, [store.loaded, store.options, keyValue]);

  const keyOption = store.options.find((o) => o.value === keyValue);
  const provider = keyOption?.provider;

  // 切換金鑰時載入模型清單
  useEffect(() => {
    if (!keyValue || !provider) {
      setModels([]);
      setModel("");
      return;
    }
    let cancelled = false;
    setModelsLoading(true);
    setModelsError("");
    store
      .models(keyValue)
      .then((list) => {
        if (cancelled) return;
        setModels(list);
        const last = readPrefs();
        const keep = last.key === keyValue && last.model && list.some((m) => m.id === last.model) ? last.model : null;
        setModel(keep ?? pickDefaultModel(provider, list));
      })
      .catch((err) => !cancelled && setModelsError(errorMessage(err)))
      .finally(() => !cancelled && setModelsLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyValue, provider, reloadTick]);

  useEffect(() => {
    if (keyValue && model) writePrefs({ key: keyValue, model });
  }, [keyValue, model]);

  const loadConversations = useCallback(async () => {
    if (!isUser) return;
    try {
      const res = await api<{ conversations: ConversationInfo[] }>("GET", "/api/ai/conversations");
      setConversations(res.conversations);
    } catch {
      /* ignore */
    }
  }, [isUser]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const visibleModels = useMemo(() => {
    let list = provider === "openrouter" && freeOnly ? models.filter((m) => m.free) : models;
    const f = modelFilter.trim().toLowerCase();
    if (f) list = list.filter((m) => m.id.toLowerCase().includes(f) || m.name.toLowerCase().includes(f));
    if (model && !list.some((m) => m.id === model)) {
      const cur = models.find((m) => m.id === model);
      if (cur) list = [cur, ...list];
    }
    return list.slice(0, 400);
  }, [models, provider, freeOnly, modelFilter, model]);
  const currentModel = models.find((m) => m.id === model);

  const openConversation = async (id: string) => {
    if (sending) return;
    try {
      const res = await api<{ messages: (UiMessage & { provider: string | null })[] }>("GET", `/api/ai/conversations/${id}`);
      setActiveId(id);
      setMessages(res.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, sources: m.sources ?? [], model: m.model })));
      setHistoryOpen(false);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const newConversation = () => {
    if (sending) return;
    setActiveId(null);
    setMessages([]);
    setHistoryOpen(false);
  };

  const renameConversation = async (c: ConversationInfo) => {
    const v = await dialogs.form({
      title: "重新命名對話",
      fields: [{ name: "title", label: "標題", required: true, maxLength: 80, defaultValue: c.title }],
      submitLabel: "儲存",
    });
    if (!v) return;
    try {
      await api("PATCH", `/api/ai/conversations/${c.id}`, { title: v.title });
      loadConversations();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const deleteConversation = async (c: ConversationInfo) => {
    const ok = await dialogs.confirm({ title: `刪除「${c.title}」？`, message: "對話紀錄會永久刪除，無法復原。", confirmLabel: "刪除", danger: true });
    if (!ok) return;
    try {
      await api("DELETE", `/api/ai/conversations/${c.id}`);
      if (activeId === c.id) newConversation();
      loadConversations();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const deleteAllConversations = async () => {
    const ok = await dialogs.confirm({ title: "刪除所有對話紀錄？", message: "所有 AI 對話都會永久刪除，無法復原。", confirmLabel: "全部刪除", danger: true });
    if (!ok) return;
    try {
      await api("DELETE", "/api/ai/conversations");
      newConversation();
      loadConversations();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || sending) return;
    if (!keyValue) {
      setAddOpen(true);
      return;
    }
    const direct = store.directTarget(keyValue);
    const params = direct ? null : store.keyParams(keyValue);
    if ((!direct && !params) || !model) {
      toast(model ? "找不到這把金鑰，請重新選擇" : "請先選擇模型", "error");
      return;
    }
    const persist = save && isUser;
    const history = persist ? undefined : messages.filter((m) => !m.error && m.content).map((m) => ({ role: m.role, content: m.content }));
    const userMsg: UiMessage = { id: `u${Date.now()}`, role: "user", content: message, sources: [] };
    const asstId = `a${Date.now()}`;
    setMessages((list) => [...list, userMsg, { id: asstId, role: "assistant", content: "", sources: [], pending: true, model }]);
    setInput("");
    setSending(true);
    const patch = (fn: (m: UiMessage) => UiMessage) => setMessages((list) => list.map((m) => (m.id === asstId ? fn(m) : m)));

    const controller = new AbortController();
    abortRef.current = controller;
    let convId = persist ? activeId : null;
    const common = {
      model,
      message,
      save: persist,
      conversationId: convId,
      history,
      contextWindow: currentModel?.contextWindow ?? null,
      references: { mode: refMode, amount: refAmount, ...selection },
    };

    // 瀏覽器直連本機服務：伺服器只整理參考資料與保存紀錄，模型由這台電腦的瀏覽器直接呼叫
    if (direct) {
      let text = "";
      let sources: ChatSource[] = [];
      let errorText = "";
      let aborted = false;
      let finish: string | null | undefined;
      try {
        const prep = await api<PreparedChat>("POST", "/api/ai/chat/prepare", {
          ...common,
          ...(direct.credentialId ? { credentialId: direct.credentialId } : { baseUrl: direct.baseUrl }),
        });
        if (prep.conversationId && !convId) {
          convId = prep.conversationId;
          setActiveId(prep.conversationId);
        }
        sources = prep.sources;
        patch((m) => ({ ...m, sources }));
        for await (const ev of streamChatDirect({
          baseUrl: direct.baseUrl,
          apiKey: direct.apiKey,
          model,
          system: prep.system,
          messages: prep.messages,
          maxTokens: prep.maxOutputTokens,
          signal: controller.signal,
        })) {
          if (ev.text) {
            const piece = ev.text;
            text += piece;
            patch((m) => ({ ...m, content: m.content + piece }));
          }
          if (ev.finish !== undefined) finish = ev.finish;
        }
      } catch (err) {
        aborted = (err as Error).name === "AbortError";
        if (!aborted) errorText = errorMessage(err);
      }
      const notice = aborted ? "已停止回答" : finish === "length" ? "回答已達長度上限，內容可能不完整。" : undefined;
      patch((m) => ({ ...m, pending: false, ...(errorText ? { error: errorText } : {}), ...(notice ? { notice } : {}) }));
      if (persist && convId && (text || errorText || aborted)) {
        await api("POST", "/api/ai/chat/complete", {
          conversationId: convId,
          content: text,
          note: errorText ? `錯誤：${errorText}` : notice,
          sources,
          model,
        }).catch(() => {});
      }
      abortRef.current = null;
      setSending(false);
      if (persist) loadConversations();
      return;
    }

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({ ...params, ...common }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `請求失敗（HTTP ${res.status}）`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as
            | { type: "meta"; conversationId: string | null; sources: ChatSource[] }
            | { type: "delta"; text: string }
            | { type: "reset"; note: string }
            | { type: "done"; notice?: string | null }
            | { type: "error"; message: string };
          if (ev.type === "meta") {
            if (ev.conversationId && !convId) {
              convId = ev.conversationId;
              setActiveId(ev.conversationId);
            }
            patch((m) => ({ ...m, sources: ev.sources }));
          } else if (ev.type === "delta") {
            patch((m) => ({ ...m, content: m.content + ev.text }));
          } else if (ev.type === "reset") {
            patch((m) => ({ ...m, content: "", notice: ev.note }));
          } else if (ev.type === "done") {
            patch((m) => ({ ...m, pending: false, notice: ev.notice ?? m.notice }));
          } else if (ev.type === "error") {
            patch((m) => ({ ...m, pending: false, error: ev.message }));
          }
        }
      }
      patch((m) => ({ ...m, pending: false }));
    } catch (err) {
      const aborted = (err as Error).name === "AbortError";
      patch((m) => ({ ...m, pending: false, ...(aborted ? { notice: "已停止回答" } : { error: errorMessage(err) }) }));
    } finally {
      abortRef.current = null;
      setSending(false);
      if (persist) loadConversations();
    }
  };

  const noKeys = store.loaded && store.options.length === 0;

  const historyList = (
    <div className="flex h-full flex-col">
      <div className="p-2">
        <button type="button" className="btn w-full" onClick={newConversation}>
          <MessageSquarePlus size={15} /> 新對話
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto thin-scroll px-2 pb-2">
        {!isUser ? (
          <p className="px-2 py-3 text-xs text-faint">後台管理員帳號不保存對話紀錄。</p>
        ) : conversations.length === 0 ? (
          <p className="px-2 py-3 text-xs text-faint">還沒有對話紀錄。</p>
        ) : (
          conversations.map((c) => (
            <div key={c.id} className={`group flex items-center gap-1 rounded-md pr-1 hover:bg-hover ${activeId === c.id ? "bg-active" : ""}`}>
              <button type="button" className="min-w-0 flex-1 px-2 py-1.5 text-left" onClick={() => openConversation(c.id)}>
                <div className="truncate text-sm">{c.title}</div>
                <div className="truncate text-[11px] text-faint">{formatDateTime(c.updatedAt)}</div>
              </button>
              <button type="button" className="icon-btn h-6 w-6 opacity-100 md:opacity-0 md:group-hover:opacity-100" onClick={() => renameConversation(c)} aria-label="重新命名">
                <Pencil size={13} />
              </button>
              <button type="button" className="icon-btn h-6 w-6 opacity-100 hover:text-danger md:opacity-0 md:group-hover:opacity-100" onClick={() => deleteConversation(c)} aria-label="刪除">
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>
      {isUser && conversations.length > 0 && (
        <div className="border-t border-line p-2">
          <button type="button" className="btn-ghost w-full justify-start text-xs text-danger" onClick={deleteAllConversations}>
            <Trash2 size={13} /> 刪除所有對話紀錄
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-60 shrink-0 border-r border-line md:block">{historyList}</aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {/* 工具列：金鑰、模型、參考資料 */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2 md:px-4">
          <button type="button" className="icon-btn md:hidden" onClick={() => setHistoryOpen(true)} aria-label="對話紀錄">
            <History size={17} />
          </button>
          <select
            className="input h-8 w-auto max-w-[46vw] py-1 text-sm md:max-w-[220px]"
            value={keyValue}
            onChange={(e) => {
              if (e.target.value === "__add") setAddOpen(true);
              else setKeyValue(e.target.value);
            }}
            aria-label="使用的金鑰"
          >
            {store.options.length === 0 && <option value="">尚未設定金鑰</option>}
            {store.options.map((o) => (
              <option key={o.value} value={o.value}>
                {PROVIDER_BY_ID.get(o.provider)?.icon} {o.label} {o.provider === "custom" ? "" : o.hint}
                {o.direct ? "（本機直連）" : ""}
                {o.kind === "session" ? "（未儲存）" : ""}
              </option>
            ))}
            <option value="__add">＋ 新增金鑰…</option>
          </select>
          <div className="flex min-w-0 items-center gap-1">
            {models.length > 25 && (
              <input className="input h-8 w-24 py-1 text-sm" placeholder="篩選模型" value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} aria-label="篩選模型" />
            )}
            <select className="input h-8 w-auto max-w-[60vw] py-1 text-sm md:max-w-[280px]" value={model} onChange={(e) => setModel(e.target.value)} disabled={!models.length} aria-label="模型">
              {!models.length && <option value="">{modelsLoading ? "載入模型中…" : "沒有模型"}</option>}
              {visibleModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name !== m.id ? `${m.name}（${m.id}）` : m.id}
                  {m.free ? " · 免費" : ""}
                  {m.contextWindow ? ` · ${Math.round(m.contextWindow / 1000)}K` : ""}
                </option>
              ))}
            </select>
            {modelsLoading && <Loader2 size={15} className="animate-spin text-faint" />}
            {keyValue && !modelsLoading && (
              <button
                type="button"
                className="icon-btn"
                title="重新載入模型清單"
                onClick={() => {
                  store.forgetModels(keyValue);
                  setReloadTick((n) => n + 1);
                }}
              >
                <RefreshCw size={14} />
              </button>
            )}
          </div>
          {provider === "openrouter" && (
            <label className="flex items-center gap-1 text-xs text-muted">
              <input
                type="checkbox"
                checked={freeOnly}
                onChange={(e) => {
                  setFreeOnly(e.target.checked);
                  writePrefs({ freeOnly: e.target.checked });
                }}
                className="accent-[var(--accent)]"
              />
              只顯示免費模型
            </label>
          )}
          <div className="flex-1" />
          <Link href="/ai/keys" className="btn-ghost h-8 text-sm">
            <KeyRound size={15} /> 金鑰
          </Link>
        </div>

        {modelsError && <p className="border-b border-line bg-danger-soft px-4 py-2 text-sm text-danger">{modelsError}</p>}

        {/* 對話內容 */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto thin-scroll">
          <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
            {messages.length === 0 && (
              <div className="py-6 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <Bot size={24} />
                </span>
                <h1 className="mt-3 text-xl font-bold">AI 助理</h1>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                  用你自己的 API 金鑰提問。可以自動引用網站上你看得到的筆記與互動教學{AI_REFERENCE_EXAMPLES}，並標示來源。
                </p>
                {noKeys ? (
                  <div className="card mx-auto mt-5 max-w-md p-4 text-left text-sm">
                    <p className="font-semibold">先設定一把 API 金鑰</p>
                    <p className="mt-1 text-muted">
                      沒有付費帳號也沒關係：Google Gemini、Groq、OpenRouter 等平台提供免費金鑰，跟著教學幾分鐘就能申請；
                      電腦上有 Ollama 也可以直接連接本機模型。
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href="/ai/keys#free" className="btn">
                        <BookOpen size={15} /> 免費金鑰申請教學
                      </Link>
                      <button type="button" className="btn-primary" onClick={() => setAddOpen(true)}>
                        <KeyRound size={15} /> 填入金鑰
                      </button>
                      <Link href="/ai/keys#custom" className="btn">
                        <Plug size={15} /> 連接 Ollama
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto mt-5 grid max-w-xl gap-2 sm:grid-cols-2">
                    {EXAMPLES.map((e) => (
                      <button key={e} type="button" className="card p-3 text-left text-sm text-muted hover:border-accent hover:text-fg" onClick={() => send(e)}>
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {messages.map((m) => (
              <MessageView key={m.id} m={m} />
            ))}
          </div>
        </div>

        {/* 輸入區 */}
        <div className="border-t border-line bg-bg px-3 pb-3 pt-2 md:px-4">
          <div className="mx-auto w-full max-w-3xl">
            <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span className="flex items-center gap-1">
                <Library size={13} />
                參考資料：
                <select
                  className="rounded border border-line bg-bg px-1 py-0.5"
                  value={refMode}
                  onChange={(e) => {
                    const v = e.target.value as ReferenceMode;
                    setRefMode(v);
                    writePrefs({ refMode: v });
                    if (v === "selected" && !selection.noteIds.length && !selection.categoryIds.length && !selection.guides.length) setPickerOpen(true);
                  }}
                  aria-label="參考資料模式"
                >
                  <option value="auto">自動搜尋網站內容</option>
                  <option value="selected">只用指定的內容</option>
                  <option value="none">不引用（只問 AI）</option>
                </select>
              </span>
              {refMode === "selected" && (
                <button type="button" className="text-accent hover:underline" onClick={() => setPickerOpen(true)}>
                  {selectionSummary(selection)}（變更）
                </button>
              )}
              {refMode !== "none" && (
                <span className="flex items-center gap-1">
                  數量：
                  <select
                    className="rounded border border-line bg-bg px-1 py-0.5"
                    value={refAmount}
                    onChange={(e) => {
                      const v = e.target.value as ReferenceAmount;
                      setRefAmount(v);
                      writePrefs({ refAmount: v });
                    }}
                    aria-label="參考資料數量"
                  >
                    {Object.entries(REFERENCE_AMOUNT).map(([v, o]) => (
                      <option key={v} value={v}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </span>
              )}
              <label className={`flex items-center gap-1 ${isUser ? "" : "opacity-50"}`} title={isUser ? "" : "後台管理員帳號不保存對話"}>
                <input
                  type="checkbox"
                  checked={save && isUser}
                  disabled={!isUser}
                  onChange={(e) => {
                    setSave(e.target.checked);
                    writePrefs({ save: e.target.checked });
                  }}
                  className="accent-[var(--accent)]"
                />
                保存對話紀錄
              </label>
            </div>
            <form
              className="flex items-end gap-2 rounded-xl border border-line bg-card p-2 focus-within:border-accent"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <textarea
                className="max-h-48 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-faint"
                rows={1}
                value={input}
                maxLength={8000}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 192)}px`;
                }}
                onKeyDown={(e) => {
                  // 中文輸入法選字時按 Enter 不送出
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder={noKeys ? "請先設定 API 金鑰" : "輸入問題（Enter 送出，Shift + Enter 換行）"}
                aria-label="輸入問題"
              />
              {sending ? (
                <button type="button" className="btn-danger h-10 w-10 shrink-0 px-0" onClick={() => abortRef.current?.abort()} aria-label="停止回答">
                  <Square size={15} />
                </button>
              ) : (
                <button type="submit" className="btn-primary h-10 w-10 shrink-0 px-0" disabled={!input.trim()} aria-label="送出">
                  <Send size={16} />
                </button>
              )}
            </form>
            <p className="mt-1.5 text-center text-[11px] text-faint">
              AI 可能出錯，指令請以原廠文件核對。引用的筆記內容會送給你選擇的 AI 供應商。
            </p>
          </div>
        </div>
      </section>

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="對話紀錄">
        <div className="-mx-5 -my-4 h-[60dvh]">{historyList}</div>
      </Modal>
      <AddKeyDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={(value) => {
          setKeyValue(value);
        }}
      />
      <ReferencePicker open={pickerOpen} onClose={() => setPickerOpen(false)} value={selection} onChange={setSelection} />
    </div>
  );
}
