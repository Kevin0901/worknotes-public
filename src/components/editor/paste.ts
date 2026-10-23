import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { looksLikeMarkdown } from "./markdown-utils";

/** 插入 Markdown 文字（轉成對應的格式） */
export function insertMarkdown(editor: Editor, text: string): boolean {
  const doc = editor.markdown?.parse(text);
  if (!doc?.content?.length) return false;
  return editor.chain().focus().insertContent(doc.content).run();
}

/**
 * 貼上純文字的 Markdown（例如從其他地方複製的筆記）時，自動轉成格式。
 * 從網頁複製（有 HTML）時交給預設處理；Ctrl+Shift+V 則貼上純文字。
 */
export const MarkdownPaste = Extension.create({
  name: "markdownPaste",

  addProseMirrorPlugins() {
    const editor = this.editor;
    let plainNext = false;
    return [
      new Plugin({
        key: new PluginKey("markdownPaste"),
        props: {
          handleKeyDown(_view, event) {
            if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "v") {
              plainNext = true;
              setTimeout(() => (plainNext = false), 1000);
            }
            return false;
          },
          handlePaste(_view, event) {
            const plain = plainNext;
            plainNext = false;
            const data = event.clipboardData;
            if (plain || !data || data.types.includes("text/html") || data.files.length > 0) return false;
            if (editor.isActive("codeBlock") || editor.isActive("code")) return false;
            const text = data.getData("text/plain");
            if (!text || !looksLikeMarkdown(text)) return false;
            return insertMarkdown(editor, text);
          },
        },
      }),
    ];
  },
});
