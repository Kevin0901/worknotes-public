// AI 金鑰的加密、遮蔽，以及呼叫供應商時的安全行為（以假的 fetch 驗證，不會連到外部）
import assert from "node:assert/strict";

process.env.AUTH_SECRET = "unit-test-auth-secret-0123456789abcdefghijklmnop";
delete process.env.AI_KEY_ENCRYPTION_KEY;

const crypto = await import("../../src/lib/ai/crypto");
const { credentialAad, decryptSecret, encryptSecret, keyHint, redactSecrets, canEncrypt } = crypto;

// ── 加密／解密 ──
const key = "sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef";
const aad = credentialAad("user-1", "anthropic", "cred-1");
assert.equal(canEncrypt(), true);
const blob = encryptSecret(key, aad);
assert.ok(blob.startsWith("a1."), "沒有 AI_KEY_ENCRYPTION_KEY 時用 AUTH_SECRET 衍生的子金鑰（版本 a1）");
assert.ok(!blob.includes(key) && !blob.includes("ABCDEFGHIJ"), "密文不含明文");
assert.equal(decryptSecret(blob, aad), key, "可以解密");
assert.notEqual(encryptSecret(key, aad), blob, "每次加密使用不同 IV");
assert.equal(decryptSecret(blob, credentialAad("user-2", "anthropic", "cred-1")), null, "換成別的使用者 → 解密失敗");
assert.equal(decryptSecret(blob, credentialAad("user-1", "openai", "cred-1")), null, "換成別的供應商 → 解密失敗");
assert.equal(decryptSecret(blob, credentialAad("user-1", "anthropic", "cred-2")), null, "搬到別筆資料 → 解密失敗");
const parts = blob.split(".");
const tampered = [parts[0], parts[1], parts[2], parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA")].join(".");
assert.equal(decryptSecret(tampered, aad), null, "竄改密文 → 解密失敗");
assert.equal(decryptSecret("garbage", aad), null);
assert.equal(decryptSecret(encryptSecret("", aad), aad), "", "沒有金鑰的端點（空字串）也能正確加解密");
assert.equal(decryptSecret(encryptSecret("", aad), credentialAad("user-2", "anthropic", "cred-1")), null, "空字串同樣綁定 AAD");

// 專用主金鑰（k1）
process.env.AI_KEY_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
const k1 = encryptSecret(key, aad);
assert.ok(k1.startsWith("k1."), "設定 AI_KEY_ENCRYPTION_KEY 後改用 k1");
assert.equal(decryptSecret(k1, aad), key);
assert.equal(decryptSecret(blob, aad), key, "舊的 a1 資料仍可解密");
process.env.AI_KEY_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
assert.equal(decryptSecret(k1, aad), null, "主金鑰更換後舊資料無法解密（不會拋出例外）");
process.env.AI_KEY_ENCRYPTION_KEY = "too-short";
assert.equal(canEncrypt(), false, "主金鑰長度錯誤時不允許儲存");
delete process.env.AI_KEY_ENCRYPTION_KEY;

// ── 提示與遮蔽 ──
assert.equal(keyHint(key), "sk-a…cdef");
assert.ok(!keyHint(key).includes("ABCD"));
const leaked = `Incorrect API key provided: ${key}. Also AIzaSyA1234567890abcdefghijklmn and gsk_abcdef1234567890 and Bearer abcdefghijklmnop123`;
const red = redactSecrets(leaked, key);
assert.ok(!red.includes(key) && !red.includes("AIzaSy") && !red.includes("gsk_abc") && !red.includes("abcdefghijklmnop123"), red);

// ── 呼叫供應商：金鑰只放在標頭、不跟隨轉址、錯誤訊息遮蔽金鑰 ──
const providers = await import("../../src/lib/ai/providers");
const { listModels, streamChat, isValidModelId, ProviderError } = providers;

type Captured = { url: string; init: RequestInit };
const calls: Captured[] = [];
let next: () => Response = () => new Response("{}");
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  calls.push({ url: String(url), init: init ?? {} });
  return next();
}) as typeof fetch;

const sse = (events: string[]) =>
  new Response(new ReadableStream({
    start(c) {
      const enc = new TextEncoder();
      // 故意切成不完整的片段，驗證 SSE 解析能跨片段組回
      const all = events.map((e) => `data: ${e}\r\n\r\n`).join("");
      for (let i = 0; i < all.length; i += 7) c.enqueue(enc.encode(all.slice(i, i + 7)));
      c.close();
    },
  }), { headers: { "Content-Type": "text/event-stream" } });

async function collect(gen: AsyncGenerator<{ type: string; text?: string }>) {
  let text = "";
  for await (const ev of gen) if (ev.type === "text") text += ev.text;
  return text;
}

// Gemini：金鑰放在 x-goog-api-key 標頭，網址不含金鑰
const gKey = "AIzaSyTESTKEY000000000000000000000000";
next = () => sse([
  JSON.stringify({ candidates: [{ content: { parts: [{ text: "思考", thought: true }, { text: "你好" }] } }] }),
  JSON.stringify({ candidates: [{ content: { parts: [{ text: "，世界" }] }, finishReason: "STOP" }] }),
]);
const gText = await collect(streamChat({
  provider: "gemini", apiKey: gKey, model: "gemini-2.5-flash", system: "s", messages: [{ role: "user", content: "hi" }],
  maxOutputTokens: 100, signal: new AbortController().signal,
}));
assert.equal(gText, "你好，世界", "略過 thought 部分");
let c = calls.at(-1)!;
assert.ok(c.url.startsWith("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent"));
assert.ok(!c.url.includes(gKey), "金鑰不在網址");
assert.equal((c.init.headers as Record<string, string>)["x-goog-api-key"], gKey);
assert.equal(c.init.redirect, "error", "不跟隨轉址");

// OpenAI 相容（Groq）：Bearer 標頭、固定網址、[DONE] 結束
const qKey = "gsk_TESTKEY0000000000000000000000000000";
next = () => sse([
  JSON.stringify({ choices: [{ delta: { content: "A" } }] }),
  JSON.stringify({ choices: [{ delta: { content: "B" }, finish_reason: "stop" }] }),
  "[DONE]",
]);
const qText = await collect(streamChat({
  provider: "groq", apiKey: qKey, model: "llama-3.3-70b-versatile", system: "s", messages: [{ role: "user", content: "hi" }],
  maxOutputTokens: 100, signal: new AbortController().signal,
}));
assert.equal(qText, "AB");
c = calls.at(-1)!;
assert.equal(c.url, "https://api.groq.com/openai/v1/chat/completions");
assert.equal((c.init.headers as Record<string, string>).Authorization, `Bearer ${qKey}`);
const sent = JSON.parse(String(c.init.body));
assert.equal(sent.messages[0].role, "system");
assert.equal(sent.max_tokens, 100);

// OpenAI 官方用 max_completion_tokens
next = () => sse(["[DONE]"]);
await collect(streamChat({
  provider: "openai", apiKey: "sk-proj-TESTKEY00000000000000000000", model: "gpt-5-mini", system: "s", messages: [{ role: "user", content: "hi" }],
  maxOutputTokens: 123, signal: new AbortController().signal,
}));
assert.equal(JSON.parse(String(calls.at(-1)!.init.body)).max_completion_tokens, 123);

// 錯誤訊息中的金鑰會被遮蔽
next = () => new Response(JSON.stringify({ error: { message: `Incorrect API key provided: ${qKey}` } }), { status: 401 });
await assert.rejects(listModels("groq", qKey), (err: unknown) => {
  assert.ok(err instanceof ProviderError);
  assert.equal(err.status, 401);
  assert.ok(!err.message.includes(qKey), err.message);
  return true;
});

// 模型清單：過濾非對話模型
next = () => new Response(JSON.stringify({ data: [{ id: "llama-3.3-70b-versatile", context_window: 131072 }, { id: "whisper-large-v3" }, { id: "x", active: false }] }));
const models = await listModels("groq", qKey);
assert.deepEqual(models.map((m) => m.id), ["llama-3.3-70b-versatile"]);
assert.equal(models[0].contextWindow, 131072);

// OpenRouter：先驗證金鑰（/key），再取公開模型清單；標示免費模型
calls.length = 0;
let n = 0;
next = () => (n++ === 0
  ? new Response(JSON.stringify({ data: { label: "x" } }))
  : new Response(JSON.stringify({ data: [{ id: "a/b:free", name: "B", context_length: 1000 }, { id: "a/c", pricing: { prompt: "0.1", completion: "0.2" } }] })));
const or = await listModels("openrouter", "sk-or-v1-TESTKEY0000000000000000");
assert.equal(calls[0].url, "https://openrouter.ai/api/v1/key");
assert.equal(or[0].id, "a/b:free");
assert.equal(or[0].free, true);
assert.equal(or[1].free, false);

// 模型 id 不能用來組出其他路徑
assert.equal(isValidModelId("gemini-2.5-flash"), true);
assert.equal(isValidModelId("meta/llama-3.3-70b-instruct"), true);
assert.equal(isValidModelId("../../v1/files"), false);
assert.equal(isValidModelId("a b"), false);
assert.equal(isValidModelId("x?key=1"), false);

console.log("ALL ASSERTIONS PASSED");
