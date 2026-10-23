import "server-only";
// AI 助理的參考資料：從「目前使用者看得到的」筆記與互動教學中，挑出與問題相關的段落。
// 一律經由 loadWorkspace() 與 notes.ts 的函式取得內容，權限與搜尋、匯出相同。
import { requireGuide } from "../guides";
import { rankNotesForQuery, readNotesForAssistant } from "../notes";
import { extractTerms } from "../search-terms";
import { categoryLabel, descendantIds } from "../tree";
import type { Workspace } from "../workspace";
import type { ChatSource, ReferenceMode } from "./catalog";
import { GUIDE_KNOWLEDGE } from "./guide-knowledge";

export { extractTerms };

/** 把長筆記切成段落（依 Markdown 標題），挑出最相關的幾段 */
function relevantExcerpt(content: string, terms: string[], budget: number): string {
  if (content.length <= budget) return content;
  const sections = content.split(/\n(?=#{1,4}\s)/);
  const scored = sections.map((s, i) => {
    const lower = s.toLowerCase();
    let score = 0;
    for (const t of terms) if (lower.includes(t)) score += t.length >= 3 ? 2 : 1;
    return { i, s, score };
  });
  const picked: typeof scored = [];
  let used = 0;
  for (const x of [...scored].sort((a, b) => b.score - a.score || a.i - b.i)) {
    if (x.score === 0 && picked.length > 0) break;
    const piece = x.s.length > budget ? x.s.slice(0, budget) : x.s;
    if (used + piece.length > budget && picked.length > 0) continue;
    picked.push({ ...x, s: piece });
    used += piece.length;
    if (used >= budget) break;
  }
  return picked
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s.trim())
    .join("\n\n…\n\n");
}

export interface ReferenceRequest {
  mode: ReferenceMode;
  noteIds: string[];
  categoryIds: string[];
  /** 要納入的互動教學 slug（自動模式下為所有看得到的教學） */
  guides: string[];
  budgetChars: number;
}

export interface References {
  context: string;
  sources: ChatSource[];
}

/** 自動模式下，相關度（0～1.5）低於這個值的內容不送給 AI，避免塞入不相干的筆記 */
const MIN_SCORE = 0.35;

/**
 * @param previous 同一段對話中上一個問題：追問（例如「那要怎麼確認？」）時沿用前文的主題找資料
 */
export async function buildReferences(ws: Workspace, question: string, req: ReferenceRequest, previous = ""): Promise<References> {
  if (req.mode === "none" || req.budgetChars <= 0) return { context: "", sources: [] };
  const own = extractTerms(question);
  const terms = [...own, ...extractTerms(previous).filter((t) => !own.includes(t))].slice(0, 24);
  const budget = req.budgetChars;

  // 指定範圍：選取的筆記＋選取分類（含子分類）底下的筆記；只保留看得到的
  let within: string[] | undefined;
  let guides = ws.tree.guides.map((g) => g.slug);
  if (req.mode === "selected") {
    const ids = new Set(req.noteIds.filter((id) => ws.noteById.has(id)));
    for (const cid of req.categoryIds) {
      if (!ws.categoryById.has(cid)) continue;
      const cats = descendantIds(ws.tree.categories, cid);
      for (const n of ws.tree.notes) if (n.categoryId && cats.has(n.categoryId)) ids.add(n.id);
    }
    within = [...ids];
    guides = req.guides.filter((slug) => !!ws.guide(slug));
  }

  type Candidate = { title: string; href: string; kind: ChatSource["kind"]; text: string; score: number };
  const candidates: Candidate[] = [];

  // 筆記：指定範圍且數量不多時全部納入（依相關度排序）；否則取相關度最高的幾篇
  const ranked = await rankNotesForQuery(ws, terms, { within, limit: 8 });
  let noteIds = ranked.map((r) => r.id);
  if (within && within.length <= 12) noteIds = [...noteIds, ...within.filter((id) => !noteIds.includes(id))];
  const scoreOf = new Map(ranked.map((r) => [r.id, r.score]));
  const notes = await readNotesForAssistant(ws, noteIds);
  for (const n of notes) {
    candidates.push({
      title: n.meta.title,
      href: `/n/${n.meta.id}`,
      kind: "note",
      text: `位置：${ws.spaceName(n.meta.spaceUserId)} / ${categoryLabel(ws.tree.categories, n.meta.categoryId)}\n${n.content}`,
      // 指定範圍內但沒有關鍵字命中的筆記仍納入，排在後面
      score: scoreOf.get(n.meta.id) ?? (within ? 0.3 : 0),
    });
  }

  // 互動教學頁：確認看得到才取用
  for (const g of GUIDE_KNOWLEDGE) {
    if (!guides.includes(g.slug) || !ws.guide(g.slug)) continue;
    requireGuide(ws, g.slug);
    for (const c of g.search(terms.length ? terms : extractTerms(g.fallbackQuery), 4)) {
      candidates.push({ title: c.title, href: c.href, kind: "guide", text: c.text, score: c.score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  if (req.mode === "auto") {
    const kept = candidates.filter((c) => c.score >= MIN_SCORE);
    candidates.length = 0;
    candidates.push(...kept);
  }
  const sources: ChatSource[] = [];
  const blocks: string[] = [];
  let used = 0;
  for (const c of candidates) {
    if (sources.length >= 8 || used >= budget) break;
    const remaining = budget - used;
    // 每篇最多占一半預算，讓多個來源都有機會被引用
    const share = Math.max(1200, Math.min(remaining, Math.floor(budget / 2)));
    // 筆記內容是資料：避免其中的文字提前結束 <reference> 標籤
    const excerpt = relevantExcerpt(c.text, terms, share).replace(/<\/?reference/gi, "‹reference");
    if (excerpt.length < 40 && sources.length > 0) continue;
    const n = sources.length + 1;
    sources.push({ n, title: c.title, href: c.href, kind: c.kind });
    blocks.push(`<reference id="${n}" title="${c.title.replace(/"/g, "'")}" kind="${c.kind === "note" ? "筆記" : "互動教學"}">\n${excerpt}\n</reference>`);
    used += excerpt.length;
  }

  return { context: blocks.join("\n\n"), sources };
}
