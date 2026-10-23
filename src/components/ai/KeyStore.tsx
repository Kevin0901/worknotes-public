"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/client-api";
import { PROVIDER_BY_ID, type CredentialInfo, type ModelInfo, type ProviderId } from "@/lib/ai/catalog";
import { listModelsDirect } from "@/lib/ai/direct-client";

/**
 * 「不儲存」模式的金鑰只放在這個分頁的記憶體（React state），不寫入 localStorage／Cookie；
 * 離開 /ai 頁面（這個 Provider 卸載）、重新整理或關閉分頁就消失。已儲存的金鑰只會拿到提示（前後 4 碼），金鑰本身留在伺服器。
 * 瀏覽器直連的本機端點（Ollama 等）由瀏覽器自己連線；伺服器只可能保存它的網址。
 */
interface SessionKey {
  id: string;
  provider: ProviderId;
  apiKey: string;
  label: string | null;
  hint: string;
  baseUrl: string | null;
  direct: boolean;
}

export interface KeyOption {
  /** "c:<credentialId>" 或 "s:<sessionId>" */
  value: string;
  provider: ProviderId;
  label: string;
  hint: string;
  kind: "stored" | "session";
  expiresAt: string | null;
  baseUrl: string | null;
  /** true：由瀏覽器直接連線（本機服務） */
  direct: boolean;
}

/** 瀏覽器直連時需要的資訊（金鑰只會是本分頁記憶體中的「不儲存」金鑰） */
export interface DirectTarget {
  baseUrl: string;
  apiKey: string;
  credentialId: string | null;
}

interface StoreValue {
  options: KeyOption[];
  credentials: CredentialInfo[];
  canStore: boolean;
  loaded: boolean;
  refresh: () => Promise<void>;
  addSessionKey: (
    key: { provider: ProviderId; apiKey: string; label: string | null; baseUrl?: string | null; direct?: boolean },
    models: ModelInfo[],
  ) => string;
  removeSessionKey: (id: string) => void;
  /** 由伺服器代連時，呼叫 API 要附上的金鑰參數 */
  keyParams: (value: string) => Record<string, unknown> | null;
  /** 瀏覽器直連的目標；不是直連時為 null */
  directTarget: (value: string) => DirectTarget | null;
  models: (value: string) => Promise<ModelInfo[]>;
  rememberModels: (value: string, list: ModelInfo[]) => void;
  forgetModels: (value: string) => void;
}

const Ctx = createContext<StoreValue | null>(null);

const hintOf = (k: string) => (!k ? "（無金鑰）" : k.length <= 12 ? "••••" : `${k.slice(0, 4)}…${k.slice(-4)}`);
const hostOf = (url: string | null) => {
  try {
    return url ? new URL(url).host : "";
  } catch {
    return "";
  }
};

function optionLabel(provider: ProviderId, label: string | null, baseUrl: string | null) {
  if (label) return label;
  if (provider === "custom") return hostOf(baseUrl) || "自訂端點";
  return PROVIDER_BY_ID.get(provider)?.short || provider;
}

export function AiKeyStoreProvider({ children }: { children: ReactNode }) {
  const [credentials, setCredentials] = useState<CredentialInfo[]>([]);
  const [canStore, setCanStore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sessionKeys, setSessionKeys] = useState<SessionKey[]>([]);
  const modelCache = useRef(new Map<string, ModelInfo[]>());

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ credentials: CredentialInfo[]; canStore: boolean }>("GET", "/api/ai/credentials");
      setCredentials(res.credentials);
      setCanStore(res.canStore);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const options = useMemo<KeyOption[]>(
    () => [
      ...credentials.map((c) => ({
        value: `c:${c.id}`,
        provider: c.provider,
        label: optionLabel(c.provider, c.label, c.baseUrl),
        hint: c.hint,
        kind: "stored" as const,
        expiresAt: c.expiresAt,
        baseUrl: c.baseUrl,
        direct: c.direct,
      })),
      ...sessionKeys.map((k) => ({
        value: `s:${k.id}`,
        provider: k.provider,
        label: optionLabel(k.provider, k.label, k.baseUrl),
        hint: k.hint,
        kind: "session" as const,
        expiresAt: null,
        baseUrl: k.baseUrl,
        direct: k.direct,
      })),
    ],
    [credentials, sessionKeys],
  );

  const keyParams = useCallback(
    (value: string): Record<string, unknown> | null => {
      if (value.startsWith("c:")) return { credentialId: value.slice(2) };
      const k = sessionKeys.find((x) => `s:${x.id}` === value);
      if (!k) return null;
      return k.provider === "custom" ? { provider: k.provider, apiKey: k.apiKey, baseUrl: k.baseUrl } : { provider: k.provider, apiKey: k.apiKey };
    },
    [sessionKeys],
  );

  const directTarget = useCallback(
    (value: string): DirectTarget | null => {
      const opt = options.find((o) => o.value === value);
      if (!opt?.direct || !opt.baseUrl) return null;
      const session = sessionKeys.find((x) => `s:${x.id}` === value);
      return { baseUrl: opt.baseUrl, apiKey: session?.apiKey ?? "", credentialId: value.startsWith("c:") ? value.slice(2) : null };
    },
    [options, sessionKeys],
  );

  const store: StoreValue = {
    options,
    credentials,
    canStore,
    loaded,
    refresh,
    addSessionKey: (key, models) => {
      const id = crypto.randomUUID();
      setSessionKeys((prev) => [
        ...prev,
        { id, provider: key.provider, apiKey: key.apiKey, label: key.label, hint: hintOf(key.apiKey), baseUrl: key.baseUrl ?? null, direct: !!key.direct },
      ]);
      modelCache.current.set(`s:${id}`, models);
      return `s:${id}`;
    },
    removeSessionKey: (id) => {
      setSessionKeys((prev) => prev.filter((k) => k.id !== id));
      modelCache.current.delete(`s:${id}`);
    },
    keyParams,
    directTarget,
    models: async (value) => {
      const hit = modelCache.current.get(value);
      if (hit) return hit;
      const direct = directTarget(value);
      let list: ModelInfo[];
      if (direct) {
        list = await listModelsDirect(direct.baseUrl, direct.apiKey);
      } else {
        const params = keyParams(value);
        if (!params) return [];
        list = (await api<{ models: ModelInfo[] }>("POST", "/api/ai/models", params)).models;
      }
      modelCache.current.set(value, list);
      return list;
    },
    rememberModels: (value, list) => modelCache.current.set(value, list),
    forgetModels: (value) => modelCache.current.delete(value),
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useAiKeys(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAiKeys 必須在 AiKeyStoreProvider 內使用");
  return v;
}

/** 依供應商建議挑選預設模型 */
export function pickDefaultModel(provider: ProviderId, models: ModelInfo[]): string {
  const prefs = PROVIDER_BY_ID.get(provider)?.preferredModels ?? [];
  const list = provider === "openrouter" ? models.filter((m) => m.free) : models;
  for (const p of prefs) {
    const exact = list.find((m) => m.id === p);
    if (exact) return exact.id;
  }
  for (const p of prefs) {
    const partial = list.find((m) => m.id.includes(p));
    if (partial) return partial.id;
  }
  return list[0]?.id ?? models[0]?.id ?? "";
}
