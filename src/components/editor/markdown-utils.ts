import { Marked } from "marked";

/** 整理編輯器輸出的 Markdown：程式碼區塊以外的連續空行縮成一行、去掉結尾空白 */
export function tidyMarkdown(md: string): string {
  return md
    .split(/(^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)[ \t]*$)/m)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/\n{3,}/g, "\n\n")))
    .join("")
    .replace(/\s+$/, "")
    .concat("\n");
}

let checker: Marked | null = null;

/** 兩份 Markdown 轉成 HTML 後是否相同（用來檢查視覺編輯器會不會改掉原本的內容） */
export function sameRendering(a: string, b: string): boolean {
  checker ??= new Marked({ gfm: true });
  const html = (md: string) =>
    (checker!.parse(md, { async: false }) as string)
      .replace(/<\/?p>/g, "")
      .replace(/\s+/g, " ")
      .replace(/> </g, "><")
      .replace(/ align="[^"]*"/g, "")
      .trim();
  return html(a) === html(b);
}

/** 貼上的純文字看起來像 Markdown（標題、清單、表格、程式碼區塊、引用、[[連結]]） */
export function looksLikeMarkdown(text: string): boolean {
  if (!text.includes("\n") && !/\[\[.+\]\]|\*\*.+\*\*|`[^`]+`/.test(text)) return false;
  return /^(#{1,6} |[-*+] |\d+\. |> |```|~~~|\|.*\|)|\[\[.+\]\]|\*\*.+\*\*|`[^`\n]+`/m.test(text);
}
