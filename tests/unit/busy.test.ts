// 等待提示：哪些請求要顯示轉圈、顯示哪一種
import assert from "node:assert/strict";
import { beginBusy, classifyRequest, getBusySnapshot, SILENT_HEADER } from "../../src/lib/busy";

const ORIGIN = "https://worknotes.example";
const kind = (path: string, method = "GET", headers: Record<string, string> = {}) =>
  classifyRequest(new URL(path, ORIGIN), ORIGIN, method, new Headers(headers));

// 按鈕送出、儲存、刪除 → 處理中；讀取資料、換頁、router.refresh() → 載入中
assert.equal(kind("/api/notes", "POST"), "action");
assert.equal(kind("/api/notes/abc", "PATCH"), "action");
assert.equal(kind("/api/notes/abc", "delete"), "action");
assert.equal(kind("/api/notes/abc/revisions"), "page");
assert.equal(kind("/n/abc?_rsc=1", "GET", { RSC: "1" }), "page");
assert.equal(kind("/guides/demo", "POST", { "Next-Action": "x" }), "action");

// 不顯示：連結預先載入、背景輪詢、AI 串流（有自己的提示）、其他網站、明確標記為背景
assert.equal(kind("/n/abc", "GET", { RSC: "1", "Next-Router-Prefetch": "1" }), null);
assert.equal(kind("/n/abc", "GET", { RSC: "1", "Next-Router-Segment-Prefetch": "/_tree" }), null);
assert.equal(kind("/api/auth/qr/poll"), null);
assert.equal(kind("/api/ai/chat", "POST"), null);
assert.equal(kind("/api/ai/chat/prepare", "POST"), null);
assert.equal(kind("/api/ai/chats", "POST"), "action");
assert.equal(kind("/api/health"), null);
assert.equal(kind("/_next/static/chunks/x.js"), null);
assert.equal(kind("https://nominatim.openstreetmap.org/search?q=x"), null);
assert.equal(kind("http://localhost:11434/v1/models"), null);
assert.equal(kind("/api/notes", "POST", { [SILENT_HEADER]: "1" }), null);

// 計數：處理中優先於載入中；全部結束後歸零，結束函式重複呼叫無害
assert.equal(getBusySnapshot().count, 0);
const endPage = beginBusy("page");
assert.deepEqual([getBusySnapshot().count, getBusySnapshot().kind], [1, "page"]);
const since = getBusySnapshot().since;
assert.ok(since > 0);
const endAction = beginBusy("action");
assert.deepEqual([getBusySnapshot().count, getBusySnapshot().kind, getBusySnapshot().since], [2, "action", since]);
endAction();
endAction();
assert.deepEqual([getBusySnapshot().count, getBusySnapshot().kind], [1, "page"]);
endPage();
assert.deepEqual(getBusySnapshot(), { count: 0, kind: null, since: 0 });

console.log("ALL ASSERTIONS PASSED");
