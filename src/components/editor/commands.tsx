import type { Editor, Range } from "@tiptap/core";
import {
  Bold, CheckSquare, Code, Heading1, Heading2, Heading3, Image as ImageIcon, Italic, Link2, List, ListOrdered, MapPin,
  Minus, Pilcrow, Quote, RemoveFormatting, SquareCode, SquareTerminal, Strikethrough, Table, FileText,
} from "lucide-react";
import type { ReactNode } from "react";

/** 需要使用者輸入的動作（由編輯器外層提供對話框） */
export interface EditorUi {
  askLink(current: string): Promise<string | null>;
  pickNote(): Promise<string | null>;
  askImage(): Promise<{ src: string; alt: string } | null>;
  /** 回傳 ```map 區塊的內容 */
  pickMap(current?: string): Promise<string | null>;
}

export interface EditorAction {
  key: string;
  label: string;
  icon: ReactNode;
  /** slash 選單搜尋用關鍵字 */
  keywords?: string;
  shortcut?: string;
  run: (editor: Editor, ui: EditorUi) => unknown;
  isActive?: (editor: Editor) => boolean;
}

const chain = (editor: Editor) => editor.chain().focus();

/** 允許的連結：http(s)、mailto、tel、站內路徑 */
export function normalizeHref(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.startsWith("/") || v.startsWith("#")) return v;
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v)) return `https://${v}`;
  return null;
}

/** 文字樣式（粗體、斜體…） */
export const MARK_ACTIONS: EditorAction[] = [
  {
    key: "bold",
    label: "粗體",
    icon: <Bold size={16} />,
    shortcut: "Ctrl+B",
    run: (e) => chain(e).toggleBold().run(),
    isActive: (e) => e.isActive("bold"),
  },
  {
    key: "italic",
    label: "斜體",
    icon: <Italic size={16} />,
    shortcut: "Ctrl+I",
    run: (e) => chain(e).toggleItalic().run(),
    isActive: (e) => e.isActive("italic"),
  },
  {
    key: "strike",
    label: "刪除線",
    icon: <Strikethrough size={16} />,
    shortcut: "Ctrl+Shift+S",
    run: (e) => chain(e).toggleStrike().run(),
    isActive: (e) => e.isActive("strike"),
  },
  {
    key: "code",
    label: "行內程式碼",
    icon: <Code size={16} />,
    shortcut: "Ctrl+E",
    run: (e) => chain(e).toggleCode().run(),
    isActive: (e) => e.isActive("code"),
  },
  {
    key: "link",
    label: "連結",
    icon: <Link2 size={16} />,
    shortcut: "Ctrl+K",
    run: async (e, ui) => {
      const current = (e.getAttributes("link").href as string | undefined) ?? "";
      const value = await ui.askLink(current);
      if (value === null) return;
      const href = normalizeHref(value);
      if (!href) {
        chain(e).extendMarkRange("link").unsetLink().run();
        return;
      }
      if (e.state.selection.empty && !e.isActive("link")) {
        chain(e).insertContent({ type: "text", text: value, marks: [{ type: "link", attrs: { href } }] }).run();
      } else {
        chain(e).extendMarkRange("link").setLink({ href }).run();
      }
    },
    isActive: (e) => e.isActive("link"),
  },
  {
    key: "clear",
    label: "清除格式",
    icon: <RemoveFormatting size={16} />,
    run: (e) => chain(e).unsetAllMarks().run(),
  },
];

/** 區塊類型（轉換成…） */
export const BLOCK_ACTIONS: EditorAction[] = [
  {
    key: "paragraph",
    label: "內文",
    icon: <Pilcrow size={16} />,
    keywords: "text paragraph 內文 段落 文字 p",
    run: (e) => chain(e).clearNodes().run(),
    isActive: (e) =>
      e.isActive("paragraph") && !e.isActive("bulletList") && !e.isActive("orderedList") && !e.isActive("taskList") && !e.isActive("blockquote"),
  },
  {
    key: "h1",
    label: "大標題",
    icon: <Heading1 size={16} />,
    keywords: "h1 heading title 標題 大標題",
    run: (e) => chain(e).toggleHeading({ level: 1 }).run(),
    isActive: (e) => e.isActive("heading", { level: 1 }),
  },
  {
    key: "h2",
    label: "標題",
    icon: <Heading2 size={16} />,
    keywords: "h2 heading 標題 章節",
    run: (e) => chain(e).toggleHeading({ level: 2 }).run(),
    isActive: (e) => e.isActive("heading", { level: 2 }),
  },
  {
    key: "h3",
    label: "小標題",
    icon: <Heading3 size={16} />,
    keywords: "h3 heading 標題 小標題",
    run: (e) => chain(e).toggleHeading({ level: 3 }).run(),
    isActive: (e) => e.isActive("heading", { level: 3 }),
  },
  {
    key: "bulletList",
    label: "項目清單",
    icon: <List size={16} />,
    keywords: "ul list bullet 清單 項目",
    run: (e) => chain(e).toggleBulletList().run(),
    isActive: (e) => e.isActive("bulletList"),
  },
  {
    key: "orderedList",
    label: "編號清單",
    icon: <ListOrdered size={16} />,
    keywords: "ol number ordered 清單 編號 步驟",
    run: (e) => chain(e).toggleOrderedList().run(),
    isActive: (e) => e.isActive("orderedList"),
  },
  {
    key: "taskList",
    label: "待辦清單",
    icon: <CheckSquare size={16} />,
    keywords: "todo task check 待辦 勾選 檢查",
    run: (e) => chain(e).toggleTaskList().run(),
    isActive: (e) => e.isActive("taskList"),
  },
  {
    key: "blockquote",
    label: "引用／提示",
    icon: <Quote size={16} />,
    keywords: "quote callout 引用 提示 注意",
    run: (e) => chain(e).toggleBlockquote().run(),
    isActive: (e) => e.isActive("blockquote"),
  },
  {
    key: "codeBlock",
    label: "程式碼區塊",
    icon: <SquareCode size={16} />,
    keywords: "code block 程式碼 區塊",
    run: (e) => chain(e).toggleCodeBlock().run(),
    isActive: (e) => e.isActive("codeBlock"),
  },
];

/** 插入 */
export const INSERT_ACTIONS: EditorAction[] = [
  {
    key: "command",
    label: "指令區塊（Bash）",
    icon: <SquareTerminal size={16} />,
    keywords: "bash shell command terminal 指令 終端機 命令",
    run: (e) => chain(e).setCodeBlock({ language: "bash" }).run(),
  },
  {
    key: "table",
    label: "表格",
    icon: <Table size={16} />,
    keywords: "table 表格 欄位",
    run: (e) => chain(e).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    key: "divider",
    label: "分隔線",
    icon: <Minus size={16} />,
    keywords: "hr divider line 分隔線",
    run: (e) => chain(e).setHorizontalRule().run(),
  },
  {
    key: "wikiLink",
    label: "連結到筆記",
    icon: <FileText size={16} />,
    keywords: "link page note wiki 連結 筆記 頁面",
    run: async (e, ui) => {
      const title = await ui.pickNote();
      if (title) chain(e).insertContent([{ type: "wikiLink", attrs: { title } }, { type: "text", text: " " }]).run();
    },
  },
  {
    key: "map",
    label: "地圖（客戶位置）",
    icon: <MapPin size={16} />,
    keywords: "map location 地圖 位置 地址 導航 客戶",
    run: async (e, ui) => {
      const body = await ui.pickMap();
      if (body) {
        chain(e)
          .insertContent([
            { type: "codeBlock", attrs: { language: "map" }, content: [{ type: "text", text: body }] },
            { type: "paragraph" },
          ])
          .run();
      }
    },
  },
  {
    key: "image",
    label: "圖片（網址）",
    icon: <ImageIcon size={16} />,
    keywords: "image picture 圖片 照片",
    run: async (e, ui) => {
      const img = await ui.askImage();
      if (img) chain(e).setImage({ src: img.src, alt: img.alt }).run();
    },
  },
];

/** slash 選單：區塊類型 + 插入 */
export const SLASH_ACTIONS: EditorAction[] = [...BLOCK_ACTIONS, ...INSERT_ACTIONS];

export function filterActions(actions: EditorAction[], query: string): EditorAction[] {
  const q = query.trim().toLowerCase();
  if (!q) return actions;
  return actions.filter((a) => `${a.label} ${a.keywords ?? ""} ${a.key}`.toLowerCase().includes(q));
}

/** 在 slash 選單選擇後：先刪掉「/關鍵字」再執行 */
export function runFromRange(editor: Editor, range: Range, action: EditorAction, ui: EditorUi) {
  editor.chain().focus().deleteRange(range).run();
  return action.run(editor, ui);
}
