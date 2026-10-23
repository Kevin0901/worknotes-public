// 時間格式化：伺服器（Node）與瀏覽器輸出必須逐字相同，否則 React hydration 會失敗
import assert from "node:assert/strict";
import { formatDate, formatDateTime } from "../../src/lib/format";

// 台灣時間 2026-10-18 13:05:09（UTC 05:05:09）
assert.equal(formatDateTime("2026-10-18T05:05:09Z"), "2026/10/18 13:05");
assert.equal(formatDateTime("2026-10-18T05:05:09Z", true), "2026/10/18 13:05:09");
assert.equal(formatDate("2026-10-18T05:05:09Z"), "2026/10/18");
// 只用一般空白（Node 24 的 ICU 原本會輸出 U+2009 細空白，與 Chrome 不同）
assert.ok(/^[0-9/: ]+$/.test(formatDateTime("2026-10-18T05:05:09Z", true)));
// 台灣午夜是 00 時，不是 24 時；跨日以台灣時區計算
assert.equal(formatDateTime("2026-10-17T16:00:00Z"), "2026/10/18 00:00");
assert.equal(formatDate("2026-10-17T15:59:59Z"), "2026/10/17");
assert.equal(formatDateTime(null), "—");
assert.equal(formatDateTime("not a date"), "—");
assert.equal(formatDate(undefined), "—");

console.log("ALL ASSERTIONS PASSED");
