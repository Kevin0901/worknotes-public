// 互動教學頁與 AI 助理的權限／資安端對端測試（需先 npm run dev，.env.local 要有 ADMIN_TEST_PASSWORD）
// 執行：npm run test:e2e:ai
// 不需要真的 API 金鑰：用明顯無效的假金鑰呼叫 Groq，確認錯誤處理、金鑰遮蔽與參考資料的權限過濾。
// （需要能連到 api.groq.com；連不到時「假金鑰」相關項目會失敗並顯示原因。）
import { createCipheriv, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { adminCookie, BASE, checker, client, ensureTestUsers, loadEnv, localDb, mintSession, page, TEST_USERS } from "./lib.mjs";

loadEnv();
const sql = localDb();
await ensureTestUsers(sql);
const ADM = await adminCookie();
if (!ADM) {
  console.error("請在 .env.local 設定 ADMIN_TEST_PASSWORD");
  process.exit(1);
}
const cookies = {
  A: `wn_session=${await mintSession(sql, TEST_USERS.A.email)}`,
  B: `wn_session=${await mintSession(sql, TEST_USERS.B.email)}`,
  V: `wn_session=${await mintSession(sql, TEST_USERS.V.email)}`,
  ADM,
};
const call = Object.fromEntries(Object.entries(cookies).map(([k, v]) => [k, client(v)]));
const anon = client("");
const { expect, done } = checker();
const [{ id: A_ID }] = await sql`SELECT id FROM app_users WHERE email = ${TEST_USERS.A.email}`;
const [{ id: B_ID }] = await sql`SELECT id FROM app_users WHERE email = ${TEST_USERS.B.email}`;
await sql`DELETE FROM ai_credentials WHERE user_id IN (${A_ID}, ${B_ID})`;
await sql`DELETE FROM ai_conversations WHERE user_id IN (${A_ID}, ${B_ID})`;
let p;
let r;

// 內建教學頁（公開版沒有，匯出時會移除這一段）

// ───── AI：登入與來源檢查 ─────
console.log("AI 助理：登入與來源");
r = await anon("GET", "/api/ai/credentials");
expect("未登入不能列金鑰 401", r.status === 401);
r = await anon("POST", "/api/ai/chat", { provider: "groq", apiKey: "gsk_" + "x".repeat(40), model: "m", message: "hi" });
expect("未登入不能對話 401", r.status === 401);
const cross = await fetch(`${BASE}/api/ai/credentials`, {
  method: "POST",
  headers: { cookie: cookies.A, origin: "https://evil.example", "content-type": "application/json" },
  body: JSON.stringify({ provider: "groq", apiKey: "gsk_" + "x".repeat(40), retention: "30d" }),
});
expect("跨站請求被擋 403", cross.status === 403);
const aiPage = await fetch(`${BASE}/ai`, { headers: { cookie: cookies.A } });
const csp = aiPage.headers.get("content-security-policy") ?? "";
expect("AI 頁面有 CSP（connect-src 限制）", aiPage.status === 200 && csp.includes("connect-src 'self'"), csp);

// ───── AI：金鑰儲存與隔離（直接寫入資料庫，格式與 src/lib/ai/crypto.ts 相同） ─────
console.log("AI 助理：金鑰儲存");
function encrypt(plain, aad) {
  const key = Buffer.from(hkdfSync("sha256", process.env.AUTH_SECRET, "worknotes:ai-credentials", "ai-api-key-encryption:v1", 32));
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["a1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}
const FAKE_KEY = "gsk_e2eFakeKey" + "0".repeat(30);
const credId = randomUUID();
await sql`
  INSERT INTO ai_credentials (id, user_id, provider, label, key_hint, secret, expires_at)
  VALUES (${credId}, ${A_ID}, 'groq', 'e2e', 'gsk_…0000', ${encrypt(FAKE_KEY, `worknotes-ai-credential:v1:${A_ID}:groq:${credId}`)}, now() + interval '1 day')`;
const expiredId = randomUUID();
await sql`
  INSERT INTO ai_credentials (id, user_id, provider, label, key_hint, secret, expires_at)
  VALUES (${expiredId}, ${A_ID}, 'groq', 'expired', 'x', 'a1.x.y.z', now() - interval '1 minute')`;
// 把 A 的密文複製到 B 名下（模擬資料庫被竄改）
const stolenId = randomUUID();
const [{ secret: aSecret }] = await sql`SELECT secret FROM ai_credentials WHERE id = ${credId}`;
await sql`
  INSERT INTO ai_credentials (id, user_id, provider, label, key_hint, secret)
  VALUES (${stolenId}, ${B_ID}, 'groq', 'stolen', 'x', ${aSecret})`;

r = await call.A("GET", "/api/ai/credentials");
const listed = JSON.stringify(r.data);
expect("A 看到自己的金鑰提示", r.status === 200 && r.data.credentials.some((c) => c.id === credId && c.hint === "gsk_…0000"));
expect("回應不含金鑰或密文", !listed.includes(FAKE_KEY) && !listed.includes(aSecret) && !listed.includes("secret"));
expect("到期的金鑰不列出且已刪除", !r.data.credentials.some((c) => c.id === expiredId) && (await sql`SELECT 1 FROM ai_credentials WHERE id = ${expiredId}`).length === 0);
r = await call.B("GET", "/api/ai/credentials");
expect("B 看不到 A 的金鑰", !r.data.credentials.some((c) => c.id === credId));
r = await call.B("POST", "/api/ai/models", { credentialId: credId });
expect("B 不能使用 A 的金鑰 404", r.status === 404);
r = await call.B("DELETE", `/api/ai/credentials/${credId}`);
expect("B 不能刪除 A 的金鑰 404", r.status === 404);
r = await call.B("POST", "/api/ai/models", { credentialId: stolenId });
expect("密文搬到別人名下無法解密 409", r.status === 409);
r = await call.ADM("POST", "/api/ai/models", { credentialId: credId });
expect("管理員不能使用使用者的金鑰 403", r.status === 403);
r = await call.ADM("POST", "/api/ai/credentials", { provider: "groq", apiKey: FAKE_KEY, retention: "30d" });
expect("管理員帳號不能儲存金鑰 403", r.status === 403);

r = await call.A("POST", "/api/ai/models", { credentialId: credId });
expect("A 用已儲存的金鑰：伺服器解密並向 Groq 驗證（假金鑰被拒 400）", r.status === 400, JSON.stringify(r.data));
expect("錯誤訊息不含金鑰", !JSON.stringify(r.data).includes(FAKE_KEY));
const [{ last_used_at }] = await sql`SELECT last_used_at FROM ai_credentials WHERE id = ${credId}`;
expect("記錄最後使用時間", !!last_used_at);
r = await call.A("POST", "/api/ai/credentials", { provider: "groq", apiKey: FAKE_KEY, retention: "30d" });
expect("無效的金鑰不會被儲存", r.status === 400 && (await sql`SELECT count(*)::int AS n FROM ai_credentials WHERE user_id = ${A_ID}`)[0].n === 1);
r = await call.A("POST", "/api/ai/credentials", { provider: "groq", apiKey: "short", retention: "session" });
expect("金鑰格式檢查 400", r.status === 400);

// ───── AI：參考資料只包含看得到的內容 ─────
console.log("AI 助理：參考資料權限");
const TERM = `zqx${Date.now()}`;
r = await call.B("POST", "/api/notes", { categoryId: null, space: "mine", title: `B 私人 ${TERM}`, content: `秘密 ${TERM}`, visibility: "private" });
const bNote = r.data.note;
r = await call.A("POST", "/api/notes", { categoryId: null, space: "mine", title: `A 筆記 ${TERM}`, content: `內容 ${TERM}` });
const aNote = r.data.note;

async function chat(who, body) {
  const res = await fetch(`${BASE}/api/ai/chat`, {
    method: "POST",
    headers: { cookie: cookies[who], origin: BASE, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const events = text.split("\n").filter(Boolean).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return { type: "raw", l };
    }
  });
  return { status: res.status, events, text };
}
let c = await chat("A", { credentialId: credId, model: "llama-3.3-70b-versatile", message: `請說明 ${TERM}`, save: true });
let meta = c.events.find((e) => e.type === "meta");
expect("對話以串流回應", c.status === 200 && !!meta, c.text.slice(0, 200));
expect("A 的參考資料包含自己的筆記", meta?.sources?.some((s) => s.href === `/n/${aNote.id}`));
expect("A 的參考資料不含 B 的私人筆記", !meta?.sources?.some((s) => s.href === `/n/${bNote.id}`));
expect("假金鑰回傳錯誤事件且不含金鑰", c.events.some((e) => e.type === "error") && !c.text.includes(FAKE_KEY));
const convId = meta?.conversationId;
expect("建立對話紀錄", !!convId);

c = await chat("B", { provider: "groq", apiKey: FAKE_KEY, model: "llama-3.3-70b-versatile", message: `請說明 ${TERM}`, save: true });
meta = c.events.find((e) => e.type === "meta");
expect("B 的參考資料包含自己的私人筆記", meta?.sources?.some((s) => s.href === `/n/${bNote.id}`));
c = await chat("B", { provider: "groq", apiKey: FAKE_KEY, model: "x", message: TERM, references: { mode: "selected", noteIds: [aNote.id] } });
meta = c.events.find((e) => e.type === "meta");
expect("指定範圍不能引用看不到的筆記（A 的私人筆記）", !meta?.sources?.some((s) => s.href === `/n/${aNote.id}`));
c = await chat("A", { credentialId: credId, model: "x", message: TERM, references: { mode: "none" }, save: false });
meta = c.events.find((e) => e.type === "meta");
expect("「不引用」時沒有參考資料", meta?.sources?.length === 0);
c = await chat("A", { credentialId: credId, model: "../../v1/files", message: "x" });
expect("不合法的模型 id 400", c.status === 400);

// ───── AI：對話紀錄隔離 ─────
console.log("AI 助理：對話紀錄");
r = await call.A("GET", "/api/ai/conversations");
expect("A 看到自己的對話", r.data.conversations.some((x) => x.id === convId));
r = await call.A("GET", `/api/ai/conversations/${convId}`);
expect("對話保存了問題與回答（含錯誤）", r.status === 200 && r.data.messages.length === 2 && r.data.messages[1].content.includes("錯誤"));
expect("保存的訊息不含參考資料全文", !JSON.stringify(r.data).includes("<references>"));
r = await call.B("GET", `/api/ai/conversations/${convId}`);
expect("B 讀不到 A 的對話 404", r.status === 404);
r = await call.B("DELETE", `/api/ai/conversations/${convId}`);
expect("B 不能刪除 A 的對話 404", r.status === 404);
r = await call.B("GET", "/api/ai/conversations");
expect("B 的列表沒有 A 的對話", !r.data.conversations.some((x) => x.id === convId));
c = await chat("B", { provider: "groq", apiKey: FAKE_KEY, model: "x", message: "hi", conversationId: convId, save: true });
expect("B 不能把訊息加到 A 的對話 404", c.status === 404);
r = await call.ADM("GET", "/api/ai/conversations");
expect("管理員不會看到使用者的對話", r.status === 200 && r.data.conversations.length === 0);
r = await call.A("DELETE", `/api/ai/conversations/${convId}`);
expect("A 刪除自己的對話", r.status === 200 && (await sql`SELECT count(*)::int AS n FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id WHERE c.id = ${convId}`)[0].n === 0);

// ───── AI：自訂端點（OpenAI 相容網址、Ollama） ─────
console.log("AI 助理：自訂端點");
for (const url of ["http://api.example.com/v1", "https://localhost:11434/v1", "https://10.0.0.5/v1", "https://169.254.169.254/latest", "https://gpu-server/v1"]) {
  r = await call.A("POST", "/api/ai/models", { provider: "custom", baseUrl: url });
  expect(`伺服器代連拒絕內網或非 https：${url}`, r.status === 400, JSON.stringify(r.data));
}
r = await call.A("POST", "/api/ai/credentials", { provider: "custom", baseUrl: "https://api.groq.com/openai/v1", apiKey: FAKE_KEY, retention: "session" });
expect("伺服器代連公開 https 端點（假金鑰被拒 400、不含金鑰）", r.status === 400 && !JSON.stringify(r.data).includes(FAKE_KEY), JSON.stringify(r.data));
r = await call.A("POST", "/api/ai/credentials", { provider: "custom", baseUrl: "http://192.168.1.20:11434/v1", direct: true, retention: "30d" });
expect("直連只允許本機網址", r.status === 400);
r = await call.A("POST", "/api/ai/credentials", { provider: "custom", baseUrl: "http://localhost:11434/v1", direct: true, apiKey: "secret-key-123", retention: "30d" });
expect("直連端點不能儲存金鑰", r.status === 400);
r = await call.A("POST", "/api/ai/credentials", { provider: "custom", baseUrl: "http://localhost:11434/v1/", direct: true, label: "Ollama", retention: "30d" });
const directId = r.data?.credential?.id;
expect("儲存直連端點（只存網址）", r.status === 200 && r.data.credential.direct === true && r.data.credential.hasKey === false && r.data.credential.baseUrl === "http://localhost:11434/v1", JSON.stringify(r.data));
r = await call.A("POST", "/api/ai/models", { credentialId: directId });
expect("伺服器不會代為呼叫直連端點", r.status === 400);
c = await chat("A", { credentialId: directId, model: "llama3.2", message: "hi" });
expect("伺服器對話路由拒絕直連端點", c.status === 400);

r = await call.A("POST", "/api/ai/chat/prepare", { credentialId: directId, model: "llama3.2", message: `請說明 ${TERM}`, save: true });
const prepConv = r.data?.conversationId;
expect("直連 prepare：回傳系統提示與訊息", r.status === 200 && r.data.system.includes("AI 助理") && r.data.messages.at(-1).role === "user" && !!prepConv, JSON.stringify(r.data).slice(0, 200));
expect("直連 prepare：參考資料只含看得到的內容", r.data.sources.some((s) => s.href === `/n/${aNote.id}`) && !r.data.sources.some((s) => s.href === `/n/${bNote.id}`));
r = await call.B("POST", "/api/ai/chat/prepare", { credentialId: directId, model: "llama3.2", message: "hi" });
expect("B 不能使用 A 的直連端點 404", r.status === 404);
r = await call.A("POST", "/api/ai/chat/prepare", { baseUrl: "https://api.openai.com/v1", model: "x", message: "hi" });
expect("直連 prepare 只接受本機網址", r.status === 400);
r = await call.A("POST", "/api/ai/chat/complete", {
  conversationId: prepConv,
  content: "本機模型的回答",
  model: "llama3.2",
  sources: [{ n: 1, title: "ok", href: `/n/${aNote.id}`, kind: "note" }, { n: 2, title: "x", href: "javascript:alert(1)", kind: "note" }],
});
expect("直連 complete：保存回答", r.status === 200);
r = await call.A("GET", `/api/ai/conversations/${prepConv}`);
const saved = r.data?.messages ?? [];
expect("保存的回答過濾掉非站內連結", saved.length === 2 && saved[1].content === "本機模型的回答" && saved[1].sources.length === 1, JSON.stringify(saved).slice(0, 300));
r = await call.B("POST", "/api/ai/chat/complete", { conversationId: prepConv, content: "竄改" });
expect("B 不能寫入 A 的對話 404", r.status === 404);
r = await call.ADM("POST", "/api/ai/chat/prepare", { baseUrl: "http://localhost:11434/v1", model: "x", message: "hi" });
expect("管理員可用直連（不保存）", r.status === 200 && r.data.conversationId === null);

// 自訂端點的金鑰：資料庫中的網址被改成別的伺服器 → 解密失敗，金鑰不會被送過去
const customId = randomUUID();
const CUSTOM_URL = "https://api.groq.com/openai/v1";
await sql`
  INSERT INTO ai_credentials (id, user_id, provider, label, key_hint, secret, base_url, direct)
  VALUES (${customId}, ${A_ID}, 'custom', 'custom', 'gsk_…0000', ${encrypt(FAKE_KEY, `worknotes-ai-credential:v1:${A_ID}:custom:${customId}:${CUSTOM_URL}`)}, ${CUSTOM_URL}, false)`;
r = await call.A("POST", "/api/ai/models", { credentialId: customId });
expect("已儲存的自訂端點：解密後由伺服器連線（假金鑰被拒 400）", r.status === 400 && !JSON.stringify(r.data).includes(FAKE_KEY), JSON.stringify(r.data));
await sql`UPDATE ai_credentials SET base_url = 'https://attacker.example.com/v1' WHERE id = ${customId}`;
r = await call.A("POST", "/api/ai/models", { credentialId: customId });
expect("網址被竄改後無法解密 409", r.status === 409, JSON.stringify(r.data));
await sql`UPDATE ai_credentials SET base_url = 'https://10.0.0.1/v1' WHERE id = ${customId}`;
r = await call.A("POST", "/api/ai/models", { credentialId: customId });
expect("網址改成內網也不會連線", r.status === 409 || r.status === 400);
r = await call.A("GET", "/api/ai/credentials");
expect("列表含端點網址但不含金鑰", r.data.credentials.some((x) => x.id === directId && x.baseUrl) && !JSON.stringify(r.data).includes(FAKE_KEY));
await call.A("DELETE", `/api/ai/credentials/${directId}`);
await call.A("DELETE", `/api/ai/credentials/${customId}`);
await call.A("DELETE", `/api/ai/conversations/${prepConv}`);

// ───── 刪除金鑰 ─────
r = await call.A("DELETE", `/api/ai/credentials/${credId}`);
expect("A 刪除自己的金鑰", r.status === 200 && (await sql`SELECT 1 FROM ai_credentials WHERE id = ${credId}`).length === 0);
r = await call.B("DELETE", "/api/ai/credentials");
expect("B 刪除全部金鑰", r.status === 200 && r.data.deleted === 1);

// 清理
await call.A("DELETE", `/api/notes/${aNote.id}?permanent=1`).catch(() => {});
await sql`DELETE FROM notes WHERE id IN (${aNote.id}, ${bNote.id})`;
await sql`DELETE FROM ai_conversations WHERE user_id IN (${A_ID}, ${B_ID})`;
await sql.end();
process.exit(done() ? 1 : 0);
