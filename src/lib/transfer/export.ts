// 匯出成 Markdown／ZIP（Notion「匯入 → Text & Markdown」可直接讀取）。
// 純資料轉換；實際壓縮與下載在 components/transfer 中進行。

import type { Category } from "../types";

export interface ExportNoteInput {
  id: string;
  categoryId: string | null;
  title: string;
  content: string;
}

/** 檔名不能用的字元換成全形，避免 Windows／macOS 解壓縮失敗 */
export function safeFileName(name: string): string {
  const map: Record<string, string> = { "/": "／", "\\": "＼", ":": "：", "*": "＊", "?": "？", '"': "＂", "<": "＜", ">": "＞", "|": "｜" };
  const cleaned = name
    .replace(/[/\\:*?"<>|]/g, (c) => map[c])
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/[. ]+$/, "")
    .trim();
  return (cleaned || "未命名").slice(0, 120);
}

function unique(name: string, used: Set<string>): string {
  let candidate = name;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${name} (${i})`;
  used.add(candidate.toLowerCase());
  return candidate;
}

function relativePath(fromFile: string, toFile: string): string {
  const from = fromFile.split("/").slice(0, -1);
  const to = toFile.split("/");
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
  return [...Array(from.length - i).fill(".."), ...to.slice(i)].join("/");
}

const encodeLink = (path: string) => path.split("/").map(encodeURIComponent).join("/");

/** 單篇筆記的 Markdown：[[筆記]] 連結改成純文字（單一檔案無法連到其他頁面） */
export function noteToMarkdown(content: string): string {
  return content.replace(/\[\[([^\]\n]+)\]\]/g, "$1");
}

/**
 * 產生 ZIP 內的檔案清單（路徑 → 內容）。
 * 分類 → 資料夾、筆記 → .md；[[筆記標題]] 轉成相對路徑連結，Notion 匯入時可對應到頁面。
 */
export function buildExportFiles(
  categories: Category[],
  notes: ExportNoteInput[],
  rootFolder: string,
): Record<string, string> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const folderOf = new Map<string, string>();
  const usedNames = new Map<string, Set<string>>(); // 資料夾 → 已使用的名稱

  const namesIn = (folder: string) => {
    if (!usedNames.has(folder)) usedNames.set(folder, new Set());
    return usedNames.get(folder)!;
  };

  const folderFor = (id: string): string => {
    const cached = folderOf.get(id);
    if (cached) return cached;
    const cat = byId.get(id)!;
    const parent = cat.parentId && byId.has(cat.parentId) ? folderFor(cat.parentId) : rootFolder;
    const folder = `${parent}/${unique(safeFileName(cat.name), namesIn(parent))}`;
    folderOf.set(id, folder);
    return folder;
  };

  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  for (const c of sorted) folderFor(c.id);

  const pathOf = new Map<string, string>();
  const pathByTitle = new Map<string, string>();
  for (const n of notes) {
    const folder = n.categoryId && byId.has(n.categoryId) ? folderFor(n.categoryId) : rootFolder;
    const path = `${folder}/${unique(safeFileName(n.title), namesIn(folder))}.md`;
    pathOf.set(n.id, path);
    if (!pathByTitle.has(n.title.toLowerCase())) pathByTitle.set(n.title.toLowerCase(), path);
  }

  const files: Record<string, string> = {};
  for (const n of notes) {
    const path = pathOf.get(n.id)!;
    const body = n.content
      .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
      .map((part, i) =>
        i % 2 === 1
          ? part
          : part.replace(/\[\[([^\]\n]+)\]\]/g, (_m, t: string) => {
              const target = pathByTitle.get(t.trim().toLowerCase());
              return target ? `[${t.trim()}](${encodeLink(relativePath(path, target))})` : t.trim();
            }),
      )
      .join("");
    files[path] = body;
  }
  // 沒有筆記的空分類不輸出（Notion 文件提醒：隱藏檔如 .keep 可能造成匯入失敗）
  return files;
}
