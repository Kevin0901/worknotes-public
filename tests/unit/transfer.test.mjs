import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { buildPlan, parseCsv } from "../../src/lib/transfer/notion-import";
import { buildExportFiles, safeFileName } from "../../src/lib/transfer/export";
import assert from "node:assert/strict";

const id = (n) => n.toString(16).padStart(32, "a");
const inner = zipSync({
  "Private & Shared": {
    [`工作 ${id(1)}.md`]: strToU8(`# 工作\n\n總覽頁，見 [伺服器清單](%E5%B7%A5%E4%BD%9C%20${id(1)}/%E4%BC%BA%E6%9C%8D%E5%99%A8%E6%B8%85%E5%96%AE%20${id(2)}.md)\n\n<aside>\n💡 重要提示\n第二行\n</aside>\n`),
    [`工作 ${id(1)}`]: {
      [`伺服器清單 ${id(2)}.md`]: strToU8(`# 伺服器清單\n\n![架構圖](Untitled.png)\n\n回到 [工作](../%E5%B7%A5%E4%BD%9C%20${id(1)}.md)\n\n\`\`\`bash\nuptime\n\`\`\`\n`),
      [`客戶 ${id(3)}.csv`]: strToU8(`Name,Status\nA公司,進行中\n`),
      [`客戶 ${id(3)}_all.csv`]: strToU8(`﻿Name,Status,Note\nA公司,進行中,"含,逗號"\nB公司,完成,"多行\n內容 | 管線"\n`),
      "Untitled.png": new Uint8Array([1, 2, 3]),
    },
    ".DS_Store": new Uint8Array([0]),
  },
});
const outer = zipSync({ "Export-abc-Part-1.zip": inner });

// 模擬瀏覽器端：解開外層，再把內層 zip 展開
const files = {};
const expand = (data) => {
  for (const [p, v] of Object.entries(unzipSync(data))) {
    if (p.toLowerCase().endsWith(".zip")) expand(v);
    else files[p] = v;
  }
};
expand(outer);
const plan = buildPlan(files);
console.log(JSON.stringify(plan.categories));
for (const n of plan.notes) console.log("---", n.categoryKey, "|", n.title, "\n" + n.content);
console.log("skipped:", plan.skipped);

assert.deepEqual(plan.categories.map((c) => c.name), ["工作"]);
const byTitle = Object.fromEntries(plan.notes.map((n) => [n.title, n]));
assert.ok(byTitle["工作"].content.includes("[[伺服器清單]]"));
assert.ok(byTitle["工作"].content.includes("> 💡 重要提示"));
assert.equal(byTitle["工作"].categoryKey, plan.categories[0].key, "parent page goes into its own folder category");
assert.ok(byTitle["伺服器清單"].content.includes("［圖片未匯入：架構圖］"));
assert.ok(byTitle["伺服器清單"].content.includes("[[工作]]"));
assert.ok(byTitle["客戶"].content.includes("| B公司 | 完成 | 多行 / 內容 \\| 管線 |"));
assert.equal(plan.notes.filter((n) => n.title === "客戶").length, 1, "only _all csv imported");
assert.deepEqual(plan.skipped.map((s) => s.split("/").pop()), ["Untitled.png"]);
assert.deepEqual(parseCsv('a,"b ""q"""\n'), [["a", 'b "q"']]);

// 匯出
const cats = [
  { id: "c1", parentId: null, name: "團隊", icon: null, sortOrder: 0 },
  { id: "c2", parentId: "c1", name: "驅動/安裝", icon: null, sortOrder: 0 },
];
const notes = [
  { id: "n1", categoryId: "c2", title: "Ubuntu：安裝", content: "見 [[指令 查詢]] 與 [[不存在]]\n\n```\n[[程式碼內不轉換]]\n```\n" },
  { id: "n2", categoryId: "c1", title: "指令 查詢", content: "回到 [[Ubuntu：安裝]]" },
  { id: "n3", categoryId: null, title: "未分類?", content: "x" },
];
const out = buildExportFiles(cats, notes, "匯出");
console.log(out);
assert.ok(out["匯出/團隊/驅動／安裝/Ubuntu：安裝.md"].includes("[指令 查詢](../%E6%8C%87%E4%BB%A4%20%E6%9F%A5%E8%A9%A2.md)"));
assert.ok(out["匯出/團隊/驅動／安裝/Ubuntu：安裝.md"].includes("與 不存在"));
assert.ok(out["匯出/團隊/驅動／安裝/Ubuntu：安裝.md"].includes("[[程式碼內不轉換]]"));
assert.ok(out["匯出/團隊/指令 查詢.md"].includes("](%E9%A9%85%E5%8B%95%EF%BC%8F%E5%AE%89%E8%A3%9D/Ubuntu%EF%BC%9A%E5%AE%89%E8%A3%9D.md)"));
assert.ok("匯出/未分類？.md" in out);
assert.equal(safeFileName("a/b:c"), "a／b：c");

// 往返：匯出的 zip 再匯入
const zipped = zipSync(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, strToU8(v)])));
const back = {};
for (const [p, v] of Object.entries(unzipSync(zipped))) back[p] = v;
const plan2 = buildPlan(back);
const t2 = Object.fromEntries(plan2.notes.map((n) => [n.title, n]));
assert.ok(t2["Ubuntu：安裝"].content.includes("[[指令 查詢]]"), "round trip restores wiki links");
assert.deepEqual(plan2.categories.map((c) => c.name).sort(), ["團隊", "驅動／安裝"].sort());
console.log("ALL ASSERTIONS PASSED");
