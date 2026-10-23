"use client";

import { strToU8, unzip, unzipSync, zip, type Zippable } from "fflate";
import { api } from "@/lib/client-api";
import { buildExportFiles, noteToMarkdown, safeFileName, type ExportNoteInput } from "@/lib/transfer/export";
import type { FileMap } from "@/lib/transfer/notion-import";
import type { Category, Space } from "@/lib/types";

function unzipAsync(data: Uint8Array): Promise<FileMap> {
  return new Promise((resolve) => {
    try {
      unzip(data, (err, files) => (err ? resolve(unzipSync(data)) : resolve(files)));
    } catch {
      resolve(unzipSync(data));
    }
  });
}

/** 讀取使用者選擇的檔案；ZIP（含 Notion 大型匯出的分割 ZIP）會自動展開 */
export async function readFilesToMap(files: File[]): Promise<FileMap> {
  const out: FileMap = {};
  const expand = async (data: Uint8Array, prefix = "") => {
    const entries = await unzipAsync(data);
    for (const [path, content] of Object.entries(entries)) {
      if (path.toLowerCase().endsWith(".zip")) await expand(content, prefix);
      else out[prefix + path] = content;
    }
  };
  for (const file of files) {
    const data = new Uint8Array(await file.arrayBuffer());
    if (file.name.toLowerCase().endsWith(".zip")) await expand(data);
    else out[(file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name] = data;
  }
  return out;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  // 等瀏覽器開始下載後再移除，避免部分瀏覽器忽略檔名
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 30_000);
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
};

export function downloadNoteMarkdown(note: { title: string; content: string }) {
  const blob = new Blob([noteToMarkdown(note.content)], { type: "text/markdown;charset=utf-8" });
  downloadBlob(blob, `${safeFileName(note.title)}.md`);
}

interface ExportPage {
  categories: Category[];
  notes: (ExportNoteInput & { tags: string[]; spaceUserId: string | null })[];
  total: number;
}

/** 匯出全部且內容分散在多個空間時，每個空間各放一個資料夾 */
function groupBySpace(categories: Category[], notes: ExportPage["notes"], spaces: Space[]) {
  const used = new Set([...categories.map((c) => c.spaceUserId), ...notes.map((n) => n.spaceUserId)]);
  if (used.size <= 1) return { categories, notes };
  const folderId = (spaceUserId: string | null) => `space:${spaceUserId ?? "public"}`;
  const folders: Category[] = spaces
    .filter((s) => used.has(s.userId))
    .map((s, i) => ({
      id: folderId(s.userId),
      parentId: null,
      name: s.name,
      icon: null,
      sortOrder: i,
      ownerId: null,
      spaceUserId: s.userId,
      visibility: "edit",
      canEdit: false,
      canManage: false,
    }));
  return {
    categories: [...folders, ...categories.map((c) => (c.parentId ? c : { ...c, parentId: folderId(c.spaceUserId) }))],
    notes: notes.map((n) => (n.categoryId ? n : { ...n, categoryId: folderId(n.spaceUserId) })),
  };
}

/** 取得資料（分頁）→ 產生 ZIP → 下載；回傳筆記數量 */
export async function exportZip(options: {
  categoryId: string | null;
  label: string;
  spaces: Space[];
  onProgress?: (done: number, total: number) => void;
}): Promise<number> {
  const pageSize = 200;
  let offset = 0;
  let categories: Category[] = [];
  let notes: ExportPage["notes"] = [];
  for (;;) {
    const q = new URLSearchParams({ offset: String(offset), limit: String(pageSize) });
    if (options.categoryId) q.set("category", options.categoryId);
    const page = await api<ExportPage>("GET", `/api/export?${q}`);
    if (offset === 0) categories = page.categories;
    notes.push(...page.notes);
    options.onProgress?.(notes.length, page.total);
    offset += page.notes.length;
    if (page.notes.length === 0 || offset >= page.total) break;
  }
  if (!options.categoryId) ({ categories, notes } = groupBySpace(categories, notes, options.spaces));
  const root = safeFileName(`${options.label}_${today()}`);
  const files = buildExportFiles(categories, notes, root);
  const zippable: Zippable = {};
  for (const [path, text] of Object.entries(files)) zippable[path] = strToU8(text);
  const data = await new Promise<Uint8Array>((resolve, reject) =>
    zip(zippable, { level: 6 }, (err, out) => (err ? reject(err) : resolve(out))),
  );
  downloadBlob(new Blob([data as BlobPart], { type: "application/zip" }), `${root}.zip`);
  return notes.length;
}
