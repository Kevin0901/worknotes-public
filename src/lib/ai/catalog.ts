// AI 供應商目錄（前後端共用，不可放任何金鑰）
// 免費方案資訊於 2026 年 10 月查證，各家額度經常調整，以供應商主控台顯示的為準。

export type ProviderId = "anthropic" | "openai" | "gemini" | "groq" | "openrouter" | "mistral" | "nvidia" | "custom";

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  /** 側邊與選單上的短名稱 */
  short: string;
  vendor: string;
  group: "main" | "free" | "custom";
  icon: string;
  /** 申請／管理金鑰的頁面（只連到供應商官方網址） */
  keyUrl: string;
  keyPlaceholder: string;
  /** 金鑰常見開頭，用來提醒「是不是貼錯供應商」，不作為唯一判斷 */
  keyPrefixes: string[];
  free: {
    available: boolean;
    /** 一句話摘要 */
    summary: string;
    quota: string;
    context: string;
    card: string;
    /** 資料是否可能被用於訓練等隱私注意事項 */
    privacy: string;
  };
  steps: string[];
  tips: string[];
  /** 預設優先選擇的模型（依序比對模型 id 是否包含） */
  preferredModels: string[];
  /** 送給模型的參考資料上限（字元），依供應商的上下文與每分鐘 tokens 限制調整 */
  referenceChars: number;
  /** 回答長度上限（tokens） */
  maxOutputTokens: number;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "gemini",
    name: "Google Gemini（Google AI Studio）",
    short: "Gemini",
    vendor: "Google",
    group: "main",
    icon: "✦",
    keyUrl: "https://aistudio.google.com/app/apikey",
    keyPlaceholder: "AIza…",
    keyPrefixes: ["AIza"],
    free: {
      available: true,
      summary: "推薦首選：免信用卡、上下文最大（約 100 萬 tokens），適合引用大量筆記與手冊。",
      quota: "依模型與專案而定，在 AI Studio 的「Rate limit」頁面查看；Flash／Flash-Lite 系列每日額度最多（約數百到上千次），Pro 系列多半不在免費方案。",
      context: "Flash 系列約 100 萬 tokens",
      card: "不需要",
      privacy: "免費方案的提示與回答可能被 Google 用來改進產品（歐盟、英國等地區除外）。請勿送出客戶機密；需要保密時改用付費方案。",
    },
    steps: [
      "用 Google 帳號登入 Google AI Studio，第一次會要求同意服務條款。",
      "點左側「Get API key」，再按「Create API key」（可建立新的 Google Cloud 專案或選既有專案）。",
      "複製以 AIza 開頭的金鑰，回到本頁按「填入金鑰」貼上。",
      "在 AI Studio 的「Usage & Billing → Rate limit」可以看到每個模型目前的免費額度。",
    ],
    tips: ["日常查詢建議選 gemini-*-flash 或 flash-lite 模型，額度多、速度快。"],
    preferredModels: ["gemini-2.5-flash", "flash"],
    referenceChars: 80_000,
    maxOutputTokens: 16_384,
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    short: "Claude",
    vendor: "Anthropic",
    group: "main",
    icon: "✳",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPlaceholder: "sk-ant-…",
    keyPrefixes: ["sk-ant-"],
    free: {
      available: false,
      summary: "付費（預付點數）。Claude 系列上下文最高約 100 萬 tokens，擅長長文件與指令說明。",
      quota: "依帳號用量等級（Tier）而定，在 Claude Console 的 Limits 頁面查看。",
      context: "目前模型最高約 100 萬 tokens",
      card: "需要（預付點數）",
      privacy: "API 送出的資料預設不會用於訓練模型。",
    },
    steps: [
      "登入 Claude Console（console.anthropic.com），在 Billing 購買點數。",
      "到「API Keys」按「Create Key」，命名後複製以 sk-ant- 開頭的金鑰（只會顯示一次）。",
      "回到本頁按「填入金鑰」貼上。",
    ],
    tips: ["預設選 Claude Opus 5.5；想省費用可改選 Sonnet 或 Haiku（較便宜、較快）。"],
    preferredModels: ["claude-opus-5-5", "claude-opus", "claude-sonnet"],
    referenceChars: 60_000,
    maxOutputTokens: 16_000,
  },
  {
    id: "openai",
    name: "OpenAI ChatGPT",
    short: "ChatGPT",
    vendor: "OpenAI",
    group: "main",
    icon: "◎",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-…",
    keyPrefixes: ["sk-"],
    free: {
      available: false,
      summary: "付費（預付點數）。注意：ChatGPT Plus 訂閱不包含 API 額度，API 需另外在 OpenAI Platform 儲值。",
      quota: "依帳號用量等級（Tier）而定，在 OpenAI Platform 的 Limits 頁面查看。",
      context: "依模型而定（常見 12.8 萬到 100 萬 tokens）",
      card: "需要（預付點數）",
      privacy: "API 送出的資料預設不會用於訓練模型。",
    },
    steps: [
      "登入 OpenAI Platform（platform.openai.com），在 Billing 儲值。",
      "到「API keys」按「Create new secret key」，權限可選 Restricted 並只開放 Model capabilities。",
      "複製以 sk- 開頭的金鑰（只會顯示一次），回到本頁按「填入金鑰」貼上。",
    ],
    tips: ["建立金鑰時選「Restricted」只開放需要的權限，外洩時影響較小。"],
    preferredModels: ["gpt-5-mini", "gpt-5", "gpt-4.1-mini", "gpt-4o-mini"],
    referenceChars: 60_000,
    maxOutputTokens: 16_000,
  },
  {
    id: "groq",
    name: "Groq",
    short: "Groq",
    vendor: "Groq",
    group: "free",
    icon: "⚡",
    keyUrl: "https://console.groq.com/keys",
    keyPlaceholder: "gsk_…",
    keyPrefixes: ["gsk_"],
    free: {
      available: true,
      summary: "永久免費方案、免信用卡、回應速度非常快；但每分鐘 tokens 有上限，不適合一次引用大量資料。",
      quota: "多數模型每分鐘約 30 次、每日約 1,000 次（llama-3.1-8b-instant 每日約 14,400 次）；每分鐘約 6,000–12,000 tokens。",
      context: "常見模型 13.1 萬 tokens",
      card: "不需要",
      privacy: "Groq 表示不會用 API 資料訓練模型。",
    },
    steps: [
      "到 console.groq.com 用 Google／GitHub 帳號或 Email 註冊登入。",
      "左側「API Keys」→「Create API Key」，命名後複製以 gsk_ 開頭的金鑰。",
      "回到本頁按「填入金鑰」貼上；額度可在「Settings → Limits」查看。",
    ],
    tips: ["每分鐘 tokens 有限，本站會自動減少送出的參考資料量；若出現額度錯誤，請稍等一分鐘再試。"],
    preferredModels: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "llama-3.1-8b-instant"],
    referenceChars: 8_000,
    maxOutputTokens: 4_096,
  },
  {
    id: "openrouter",
    name: "OpenRouter（免費模型）",
    short: "OpenRouter",
    vendor: "OpenRouter",
    group: "free",
    icon: "⇄",
    keyUrl: "https://openrouter.ai/settings/keys",
    keyPlaceholder: "sk-or-…",
    keyPrefixes: ["sk-or-"],
    free: {
      available: true,
      summary: "一把金鑰可用多家模型；模型 id 結尾為 :free 的免費。上下文大，但每日次數較少。",
      quota: "免費模型每分鐘 20 次、每日 50 次；累計購買 10 美元點數後，每日提高到 1,000 次。",
      context: "依模型而定，部分免費模型可達 100 萬 tokens",
      card: "不需要",
      privacy: "免費模型由不同供應商提供，部分供應商可能記錄或使用提示內容；可在 OpenRouter 的 Privacy 設定關閉會訓練資料的免費端點。",
    },
    steps: [
      "到 openrouter.ai 用 Google／GitHub 帳號登入。",
      "右上角選單 →「Keys」→「Create Key」，可設定額度上限（Credit limit）避免意外扣款。",
      "複製以 sk-or- 開頭的金鑰，回到本頁按「填入金鑰」貼上；選模型時勾選「只顯示免費模型」。",
    ],
    tips: ["建立金鑰時把 Credit limit 設為 0，就只能使用免費模型，不會產生費用。"],
    preferredModels: [":free"],
    referenceChars: 30_000,
    maxOutputTokens: 4_096,
  },
  {
    id: "mistral",
    name: "Mistral AI（Experiment 免費方案）",
    short: "Mistral",
    vendor: "Mistral AI",
    group: "free",
    icon: "◆",
    keyUrl: "https://console.mistral.ai/api-keys",
    keyPlaceholder: "Mistral API key",
    keyPrefixes: [],
    free: {
      available: true,
      summary: "免費 Experiment 方案：需驗證手機號碼、免信用卡，每月 tokens 額度相當多。",
      quota: "以組織為單位，實際上限在 Admin Console 的「Limits」查看（每秒請求數有限制）。",
      context: "依模型 3.2 萬到 25.6 萬 tokens",
      card: "不需要（需驗證手機號碼）",
      privacy: "Experiment 免費方案的 API 請求可能被用於訓練 Mistral 的模型。",
    },
    steps: [
      "到 console.mistral.ai 註冊並登入，在「Subscription」選擇 Experiment（免費）方案並驗證手機號碼。",
      "左側「API Keys」→「Create new key」，複製金鑰（只會顯示一次）。",
      "回到本頁按「填入金鑰」貼上。",
    ],
    tips: ["一般問答選 mistral-small-latest；需要較強推理選 mistral-medium 或 mistral-large。"],
    preferredModels: ["mistral-small-latest", "mistral-medium-latest", "mistral-large-latest"],
    referenceChars: 30_000,
    maxOutputTokens: 4_096,
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM（build.nvidia.com）",
    short: "NVIDIA",
    vendor: "NVIDIA",
    group: "free",
    icon: "▣",
    keyUrl: "https://build.nvidia.com/",
    keyPlaceholder: "nvapi-…",
    keyPrefixes: ["nvapi-"],
    free: {
      available: true,
      summary: "加入免費的 NVIDIA Developer Program 即可使用上百個開放模型（Llama、DeepSeek、Qwen 等）。",
      quota: "約每分鐘 40 次（帳號層級），依模型與流量調整；僅限開發與測試用途，不可用於正式服務。",
      context: "依模型而定（常見 12.8 萬 tokens）",
      card: "不需要",
      privacy: "僅限開發／測試用途；請勿送出客戶機密資料。",
    },
    steps: [
      "到 build.nvidia.com 用 NVIDIA 帳號登入（沒有帳號可免費註冊，會一併加入 Developer Program）。",
      "任選一個模型頁面，點右上角「Get API Key」→「Generate Key」。",
      "複製以 nvapi- 開頭的金鑰，回到本頁按「填入金鑰」貼上。",
    ],
    tips: ["模型清單很長，可在選擇模型時輸入關鍵字（例如 llama、qwen、deepseek）篩選。"],
    preferredModels: ["meta/llama-3.3-70b-instruct", "llama-3.3-70b", "qwen", "llama"],
    referenceChars: 20_000,
    maxOutputTokens: 4_096,
  },
  {
    id: "custom",
    name: "自訂 API 端點（OpenAI 相容：Ollama、LM Studio、vLLM 等）",
    short: "自訂端點",
    vendor: "自訂端點",
    group: "custom",
    icon: "⚙",
    keyUrl: "",
    keyPlaceholder: "選填（Ollama、LM Studio 不需要）",
    keyPrefixes: [],
    free: {
      available: false,
      summary: "輸入 API 網址（例如 http://localhost:11434/v1）即可載入該服務的模型；本機服務由瀏覽器直接連線。",
      quota: "依你的服務而定",
      context: "依模型與伺服器設定而定（Ollama 預設約 4K tokens，可調大）",
      card: "不需要",
      privacy: "本機模型的資料不會離開你的電腦；自架或第三方服務依該服務的政策。",
    },
    steps: [],
    tips: [],
    preferredModels: [],
    // 本機模型的上下文通常較小（Ollama 預設約 4K tokens），參考資料預設少一點
    referenceChars: 6_000,
    maxOutputTokens: 4_096,
  },
];

export const PROVIDER_BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === "string" && PROVIDER_BY_ID.has(v as ProviderId);
}

/** 免費方案查證日期與參考來源（顯示在申請教學頁） */
export const FREE_TIER_CHECKED = "2026 年 10 月";
export const FREE_TIER_SOURCES = [
  { label: "Google Gemini API：Rate limits", url: "https://ai.google.dev/gemini-api/docs/rate-limits" },
  { label: "Groq：Rate limits", url: "https://console.groq.com/docs/rate-limits" },
  { label: "OpenRouter：API limits", url: "https://openrouter.ai/docs/api-reference/limits" },
  { label: "Mistral：免費 Experiment 方案說明", url: "https://help.mistral.ai/en/articles/455206-how-can-i-try-the-api-for-free-with-the-experiment-plan" },
  { label: "OpenRouter：Free LLM API 比較（2026）", url: "https://openrouter.ai/blog/tutorials/free-llm-apis-compared/" },
];

/** 評估過但沒有加入的平台與原因 */
export const EXCLUDED_FREE = [
  { name: "GitHub Models", reason: "GitHub 已於 2026 年 7 月 30 日停止 GitHub Models 推論 API。" },
  { name: "Cerebras", reason: "2026 年起取消永久免費方案，改為需綁信用卡、30 天到期的一次性 5 美元試用。" },
  { name: "Cloudflare Workers AI", reason: "每日免費額度小、多數模型上下文只有 2K–8K，且需另外設定帳號 ID。" },
  { name: "Cohere", reason: "試用金鑰僅限非商業用途，每月約 1,000 次呼叫。" },
];

export type KeyRetention = "session" | "7d" | "30d" | "90d" | "forever";

export const RETENTION_OPTIONS: { value: KeyRetention; label: string; description: string }[] = [
  { value: "session", label: "不儲存（建議在公用電腦使用）", description: "金鑰只留在這個分頁的記憶體，離開 AI 助理頁面、重新整理或關閉分頁就消失；每次提問時經 HTTPS 轉送，伺服器不保存。" },
  { value: "7d", label: "加密儲存 7 天", description: "以 AES-256-GCM 加密後存在伺服器，7 天後自動刪除。" },
  { value: "30d", label: "加密儲存 30 天", description: "30 天後自動刪除，期間可隨時手動刪除。" },
  { value: "90d", label: "加密儲存 90 天", description: "90 天後自動刪除，期間可隨時手動刪除。" },
  { value: "forever", label: "加密儲存，直到我刪除", description: "不會自動刪除；不再使用時請到「API 金鑰」頁刪除。" },
];

export const RETENTION_DAYS: Record<KeyRetention, number | null> = { session: null, "7d": 7, "30d": 30, "90d": 90, forever: null };

/** 公開給前端的模型資訊 */
export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number | null;
  maxOutput: number | null;
  free?: boolean;
}

/** 已儲存的金鑰（永遠不含金鑰本身） */
export interface CredentialInfo {
  id: string;
  provider: ProviderId;
  label: string | null;
  hint: string;
  /** 自訂端點的 API 網址 */
  baseUrl: string | null;
  /** true：由瀏覽器直接連線（本機服務），伺服器不會代為呼叫 */
  direct: boolean;
  hasKey: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

/** 瀏覽器直連只允許這台電腦上的服務 */
export const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"];

export function isLocalBaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return LOCAL_HOSTS.includes(u.hostname.replace(/^\[|\]$/g, "").toLowerCase());
  } catch {
    return false;
  }
}

export interface EndpointPreset {
  name: string;
  baseUrl: string;
  /** direct：瀏覽器直連（本機）；server：本站伺服器代連（公開 HTTPS） */
  mode: "direct" | "server";
  needsKey: boolean;
  note: string;
}

/** 自訂端點的常用預設值（只是幫忙填入網址，使用者可以修改） */
export const ENDPOINT_PRESETS: EndpointPreset[] = [
  { name: "Ollama（本機）", baseUrl: "http://localhost:11434/v1", mode: "direct", needsKey: false, note: "需設定 OLLAMA_ORIGINS 允許本站" },
  { name: "LM Studio（本機）", baseUrl: "http://localhost:1234/v1", mode: "direct", needsKey: false, note: "在 Developer 頁開啟伺服器並啟用 CORS" },
  { name: "vLLM／llama.cpp（本機）", baseUrl: "http://localhost:8000/v1", mode: "direct", needsKey: false, note: "啟動時需允許本站的 CORS 來源" },
  { name: "OpenAI", baseUrl: "https://api.openai.com/v1", mode: "server", needsKey: true, note: "官方 API" },
  { name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", mode: "server", needsKey: true, note: "官方 API" },
  { name: "xAI（Grok）", baseUrl: "https://api.x.ai/v1", mode: "server", needsKey: true, note: "官方 API" },
  { name: "Together AI", baseUrl: "https://api.together.xyz/v1", mode: "server", needsKey: true, note: "官方 API" },
  { name: "自架服務（公開 HTTPS）", baseUrl: "https://", mode: "server", needsKey: false, note: "例如經 Cloudflare Tunnel 公開的 Ollama" },
];

/** 直連請求時給前端的設定：伺服器整理好的提示與參考資料（伺服器不會碰到本機服務） */
export interface PreparedChat {
  conversationId: string | null;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  sources: ChatSource[];
  maxOutputTokens: number;
}

export interface ChatSource {
  n: number;
  title: string;
  href: string;
  kind: "note" | "guide";
}

export type ReferenceMode = "auto" | "selected" | "none";
export type ReferenceAmount = "small" | "normal" | "large";

export const REFERENCE_AMOUNT: Record<ReferenceAmount, { label: string; factor: number }> = {
  small: { label: "少（省額度）", factor: 0.35 },
  normal: { label: "標準", factor: 1 },
  large: { label: "多（需要大上下文）", factor: 2 },
};
