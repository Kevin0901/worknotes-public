// 解析 Notion「Markdown & CSV」匯出的 ZIP（或一般 Markdown 檔）成匯入計畫。
// 只做純資料轉換，不碰 DOM，方便在瀏覽器與測試中使用。

export interface PlanCategory {
  key: string;
  parentKey: string | null;
  name: string;
}

export interface PlanNote {
  categoryKey: string | null;
  title: string;
  content: string;
  sourcePath: string;
}

export interface ImportPlan {
  categories: PlanCategory[];
  notes: PlanNote[];
  /** 沒有匯入的附件（圖片、PDF…） */
  skipped: string[];
}

export type FileMap = Record<string, Uint8Array>;

const NOTION_ID = /[ _-]+[0-9a-f]{32}$/i;
const TEXT_EXT = /\.(md|markdown|txt)$/i;
const CSV_EXT = /\.csv$/i;
const IGNORED = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/i;

const decoder = new TextDecoder("utf-8");

/** 去掉 Notion 加在檔名後面的 32 碼 ID 與副檔名 */
export function cleanName(segment: string): string {
  const base = segment.replace(/\.(md|markdown|txt|csv)$/i, "").replace(/_all$/i, "");
  return base.replace(NOTION_ID, "").trim() || "未命名";
}

function normalizePath(path: string): string {
  const out: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

const dirname = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const basename = (p: string) => p.slice(p.lastIndexOf("/") + 1);

/** 移除所有檔案共同的最外層資料夾（例如 Export-xxxx/、Private & Shared/） */
function stripCommonRoot(paths: string[]): string {
  let prefix = "";
  for (;;) {
    const rest = paths.map((p) => p.slice(prefix.length));
    const first = rest[0]?.split("/")[0];
    if (!first || rest.some((p) => !p.startsWith(first + "/"))) return prefix;
    prefix += first + "/";
  }
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function csvToMarkdownTable(text: string): string {
  const rows = parseCsv(text);
  if (rows.length === 0) return "（空白表格）";
  const width = Math.max(...rows.map((r) => r.length));
  const cell = (v: string | undefined) => (v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " / ").trim();
  const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => cell(r[i]) || " ").join(" | ")} |`;
  return [line(rows[0]), `| ${Array.from({ length: width }, () => "---").join(" | ")} |`, ...rows.slice(1).map(line)].join("\n");
}

/** Notion 匯出的部分 HTML（callout、toggle）轉成一般 Markdown */
function convertNotionHtml(md: string): string {
  return md
    .replace(/<aside>\s*([\s\S]*?)\s*<\/aside>/gi, (_m, inner: string) =>
      inner
        .trim()
        .split("\n")
        .map((l) => `> ${l}`.trimEnd())
        .join("\n"),
    )
    .replace(/<details>\s*<summary>([\s\S]*?)<\/summary>/gi, (_m, s: string) => `**${s.trim()}**\n`)
    .replace(/<\/details>/gi, "")
    .replace(/<br\s*\/?>/gi, "  \n");
}

/** 讀取 ZIP 後的檔案清單 → 匯入計畫 */
export function buildPlan(files: FileMap): ImportPlan {
  const paths = Object.keys(files)
    .map((p) => p.replace(/\\/g, "/"))
    .filter((p) => !p.endsWith("/") && !IGNORED.test(p));
  const prefix = stripCommonRoot(paths);
  const rel = (p: string) => p.slice(prefix.length);
  const raw = new Map(Object.entries(files).map(([k, v]) => [k.replace(/\\/g, "/"), v]));

  // CSV：Notion 會同時輸出「目前檢視」與「_all」兩份，優先使用 _all
  const csvPaths = paths.filter((p) => CSV_EXT.test(p));
  const csvChosen = csvPaths.filter((p) => /_all\.csv$/i.test(p) || !csvPaths.includes(p.replace(/\.csv$/i, "_all.csv")));
  const textPaths = paths.filter((p) => TEXT_EXT.test(p));
  const skipped = paths.filter((p) => !TEXT_EXT.test(p) && !CSV_EXT.test(p)).map(rel);

  // 資料夾 → 分類
  const folderSet = new Set<string>();
  for (const p of [...textPaths, ...csvChosen]) {
    const parts = rel(p).split("/").slice(0, -1);
    for (let i = 1; i <= parts.length; i++) folderSet.add(parts.slice(0, i).join("/"));
  }
  const folders = [...folderSet].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  const categories: PlanCategory[] = folders.map((f) => ({
    key: f,
    parentKey: dirname(f) || null,
    name: cleanName(basename(f)),
  }));

  /** 頁面若有同名子資料夾（Notion 的子頁面），頁面本身放進該資料夾的分類 */
  const categoryKeyFor = (relPath: string): string | null => {
    const own = relPath.replace(/\.(md|markdown|txt|csv)$/i, "").replace(/_all$/i, "");
    if (folderSet.has(own)) return own;
    return dirname(relPath) || null;
  };

  // 先決定每個檔案的標題，供連結轉換使用
  const titleOf = new Map<string, string>();
  const textOf = new Map<string, string>();
  for (const p of textPaths) {
    const text = decoder.decode(raw.get(p)!).replace(/^﻿/, "").replace(/\r\n/g, "\n");
    textOf.set(p, text);
    const h1 = /^\s*#\s+(.+?)\s*#*\s*$/m.exec(text.split("\n").find((l) => l.trim() !== "") ?? "");
    titleOf.set(rel(p), (h1?.[1] ?? cleanName(basename(p))).slice(0, 200));
  }
  for (const p of csvChosen) titleOf.set(rel(p), cleanName(basename(p)));
  // 「目前檢視」那份 CSV 的連結也指向同一篇
  for (const p of csvPaths) {
    if (!csvChosen.includes(p)) titleOf.set(rel(p), cleanName(basename(p)));
  }

  const convertLinks = (md: string, fromRel: string) =>
    md.replace(/(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (whole, bang: string, text: string, url: string) => {
      if (/^(https?:|mailto:|tel:|#)/i.test(url)) return whole;
      let decoded = url;
      try {
        decoded = decodeURIComponent(url);
      } catch {
        /* 保留原字串 */
      }
      const target = normalizePath(`${dirname(fromRel)}/${decoded.split("#")[0]}`);
      const title = titleOf.get(target);
      if (title && !bang) return `[[${title}]]`;
      const label = text || basename(decoded);
      return bang ? `［圖片未匯入：${label}］` : `${label}（附件未匯入）`;
    });

  const notes: PlanNote[] = [];
  for (const p of textPaths) {
    const r = rel(p);
    const lines = textOf.get(p)!.split("\n");
    // 第一個非空行是 H1 標題時移除（標題另外存）
    const firstIdx = lines.findIndex((l) => l.trim() !== "");
    if (firstIdx >= 0 && /^\s*#\s+/.test(lines[firstIdx])) lines.splice(0, firstIdx + 1);
    const body = convertLinks(convertNotionHtml(lines.join("\n")), r).replace(/^\n+/, "").trimEnd();
    notes.push({ categoryKey: categoryKeyFor(r), title: titleOf.get(r)!, content: body + "\n", sourcePath: r });
  }
  for (const p of csvChosen) {
    const r = rel(p);
    const table = csvToMarkdownTable(decoder.decode(raw.get(p)!));
    notes.push({
      categoryKey: categoryKeyFor(r),
      title: titleOf.get(r)!,
      content: `> 由 Notion 資料庫（CSV）匯入的表格\n\n${table}\n`,
      sourcePath: r,
    });
  }

  // 只保留真的有內容的分類（避免只有附件的空資料夾）
  const used = new Set<string>();
  for (const n of notes) {
    let k = n.categoryKey;
    while (k) {
      used.add(k);
      k = dirname(k) || null;
    }
  }
  return { categories: categories.filter((c) => used.has(c.key)), notes, skipped };
}
