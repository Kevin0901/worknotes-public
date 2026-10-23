// 產生模擬 Notion 匯出的測試 ZIP（含分割 ZIP、子頁面、CSV 資料庫、圖片附件）
// 用法：node tests/fixtures/make-notion-zip.mjs test-results/notion-export.zip
import { zipSync, strToU8 } from "fflate";
import { writeFileSync } from "node:fs";
const id = (n) => n.toString(16).padStart(32, "b");
const inner = zipSync({
  [`客戶專案 ${id(1)}.md`]: strToU8(`# 客戶專案\n\n專案總覽，詳見 [伺服器規格](%E5%AE%A2%E6%88%B6%E5%B0%88%E6%A1%88%20${id(1)}/%E4%BC%BA%E6%9C%8D%E5%99%A8%E8%A6%8F%E6%A0%BC%20${id(2)}.md)\n\n<aside>\n💡 交機前先跑完整檢查\n</aside>\n`),
  [`客戶專案 ${id(1)}`]: {
    [`伺服器規格 ${id(2)}.md`]: strToU8(`# 伺服器規格\n\n| 項目 | 規格 |\n| --- | --- |\n| CPU | 2x 32 核心 |\n\n![拓樸](topo.png)\n`),
    [`設備清單 ${id(3)}_all.csv`]: strToU8(`Name,序號,狀態\nGPU-01,SN123,正常\nGPU-02,SN124,待測\n`),
    "topo.png": new Uint8Array([1, 2, 3]),
  },
});
writeFileSync(process.argv[2], zipSync({ "Export-test-Part-1.zip": inner }));
