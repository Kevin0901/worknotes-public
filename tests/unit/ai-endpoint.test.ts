// 自訂 AI 端點：網址檢查、SSRF 防護（私有位址、DNS 解析到內網）、來源清單過濾
import assert from "node:assert/strict";
import { isPublicAddress, normalizeBaseUrl, safeFetch } from "../../src/lib/ai/endpoint";
import { sanitizeSources } from "../../src/lib/ai/chat";
import { credentialAad } from "../../src/lib/ai/crypto";
import { isLocalBaseUrl } from "../../src/lib/ai/catalog";

// ── 公開位址判斷 ──
for (const ip of ["8.8.8.8", "1.1.1.1", "104.18.0.1", "2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8"]) {
  assert.equal(isPublicAddress(ip), true, `${ip} 應為公開位址`);
}
for (const ip of [
  "127.0.0.1", "127.1.2.3", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.10", "169.254.169.254", "100.64.0.1",
  "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1", "192.0.2.1",
  "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:169.254.169.254",
  "64:ff9b::a9fe:a9fe", "2002:c0a8:0101::1", "2001:db8::1", "not-an-ip",
]) {
  assert.equal(isPublicAddress(ip), false, `${ip} 不應被視為公開位址`);
}

// ── 網址檢查（伺服器代連）──
assert.equal(normalizeBaseUrl("https://api.openai.com/v1/", "server"), "https://api.openai.com/v1");
assert.equal(normalizeBaseUrl(" https://api.deepseek.com/v1 ", "server"), "https://api.deepseek.com/v1");
assert.equal(normalizeBaseUrl("https://llm.example.com:8443/v1", "server"), "https://llm.example.com:8443/v1");
for (const bad of [
  "http://api.example.com/v1", // 不是 https
  "https://localhost:11434/v1",
  "https://127.0.0.1/v1",
  "https://10.0.0.5/v1",
  "https://[::1]/v1",
  "https://169.254.169.254/latest",
  "https://gpu-server/v1", // 單一名稱（內網）
  "https://ollama.local/v1",
  "https://svc.internal/v1",
  "https://user:pass@api.example.com/v1",
  "https://api.example.com/v1?key=1",
  "ftp://api.example.com",
  "not a url",
  "",
]) {
  assert.throws(() => normalizeBaseUrl(bad, "server"), Error, `伺服器代連應拒絕：${bad}`);
}

// ── 網址檢查（瀏覽器直連：只允許本機）──
assert.equal(normalizeBaseUrl("http://localhost:11434/v1/", "direct"), "http://localhost:11434/v1");
assert.equal(normalizeBaseUrl("http://127.0.0.1:1234/v1", "direct"), "http://127.0.0.1:1234/v1");
assert.equal(normalizeBaseUrl("http://[::1]:8000/v1", "direct"), "http://[::1]:8000/v1");
for (const bad of ["http://192.168.1.20:11434/v1", "https://api.openai.com/v1", "http://localhost.evil.com/v1", "file:///etc/passwd"]) {
  assert.throws(() => normalizeBaseUrl(bad, "direct"), Error, `瀏覽器直連應拒絕：${bad}`);
}
assert.equal(isLocalBaseUrl("http://localhost:11434/v1"), true);
assert.equal(isLocalBaseUrl("http://localhost.evil.com/v1"), false);

// ── safeFetch：主機名稱解析到內部位址時，在連線前就拒絕（不送出任何請求）──
await assert.rejects(safeFetch("https://localhost:9/v1/models"), /內部|保留/);
await assert.rejects(safeFetch("https://127.0.0.1:9/v1/models"), /內部|保留/);
await assert.rejects(safeFetch("https://[::ffff:127.0.0.1]:9/v1/models"), /內部|保留/);
await assert.rejects(safeFetch("http://example.com/"), /https/);

// ── 自訂端點的網址納入 AAD：網址被改掉時解密會失敗 ──
assert.notEqual(credentialAad("u", "custom", "id", "https://a.example.com/v1"), credentialAad("u", "custom", "id", "https://b.example.com/v1"));
assert.equal(credentialAad("u", "groq", "id"), "worknotes-ai-credential:v1:u:groq:id", "既有金鑰的 AAD 不變");

// ── 瀏覽器直連完成後送回的來源：只接受站內連結 ──
const sources = sanitizeSources([
  { n: 1, title: "筆記", href: "/n/0d8e5b2c-1111-4222-8333-944455556666", kind: "note" },
  { n: 2, title: "教學", href: "/guides/demo#/guide/intro", kind: "guide" },
  { n: 3, title: "壞", href: "javascript:alert(1)", kind: "note" },
  { n: 4, title: "外站", href: "https://evil.example.com", kind: "note" },
  { n: 5, title: "協定相對", href: "//evil.example.com", kind: "note" },
  { n: "6", title: "格式錯誤", href: "/n/x", kind: "note" },
]);
assert.deepEqual(sources.map((s) => s.n), [1, 2]);
assert.deepEqual(sanitizeSources("nope"), []);

console.log("ALL ASSERTIONS PASSED");
