import { join } from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { Editor } from "@tiptap/core";
import { editorExtensions } from "../../src/components/editor/extensions";
import { sameRendering, tidyMarkdown } from "../../src/components/editor/markdown-utils";

const roundTrip = (md: string) => {
  const editor = new Editor({ element: null, extensions: editorExtensions(), content: md, contentType: "markdown" });
  const out = tidyMarkdown(editor.getMarkdown());
  editor.destroy();
  return out;
};

// 預設筆記的原始檔（content/ 下所有 Markdown；公開版沒有，只跑下面的特殊案例）
const contentDir = join(process.cwd(), "content");
const markdownFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? markdownFiles(join(dir, e.name)) : e.name.endsWith(".md") ? [join(dir, e.name)] : [],
  );
const cases: [string, string][] = (existsSync(contentDir) ? markdownFiles(contentDir) : []).map((f) => [
  f.slice(contentDir.length + 1),
  readFileSync(f, "utf8").replace(/^---[\s\S]*?---\n/, ""),
]);
cases.push(
  ["wiki", "前往 [[安裝前檢查]] 與 [[設定步驟]]。\n\n- 清單裡 [[錯誤代碼速查]]\n"],
  ["nested", "1. 第一\n   - 子項目 `code`\n   - 子項目二\n2. 第二\n\n- [ ] 待辦\n- [x] 完成\n  - [ ] 子待辦\n"],
  ["table", "| 指令 | 說明 |\n| --- | --- |\n| `journalctl -b \\| grep error` | 查錯誤 |\n| **粗體** | [連結](https://example.org/docs) |\n"],
  ["quote", "> 💡 提示：先確認 **Secure Boot**\n>\n> - 第一點\n> - 第二點\n"],
  ["map", "客戶位置：\n\n```map\nlat: 25.0330\nlng: 121.5654\nzoom: 16\ntitle: 台北 101\n```\n"],
  ["image", "![架構圖](https://example.com/a.png)\n\n文字 *斜體* ~~刪除~~ 與 <https://example.org>\n"],
  ["heading", "# H1\n\n## H2\n\n### H3\n\n#### H4\n\n---\n\n段落一\n段落一第二行\n"],
);

let bad = 0;
for (const [name, md] of cases) {
  const out = roundTrip(md);
  const ok = sameRendering(md, out);
  const wikiOk = (md.match(/\[\[[^\]]+\]\]/g) ?? []).every((w) => out.includes(w));
  const stable = roundTrip(out) === out;
  if (!ok || !wikiOk || !stable) {
    bad++;
    console.log(`✗ ${name} same=${ok} wiki=${wikiOk} stable=${stable}`);
    console.log("---- out ----\n" + out.slice(0, 600));
  } else console.log(`✓ ${name}`);
}
console.log(`${cases.length - bad}/${cases.length} OK`);
process.exit(bad ? 1 : 0);
