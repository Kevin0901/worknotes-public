import "server-only";
// 可以給 AI 助理當參考資料的互動教學頁（呼叫端會先確認使用者看得到該教學頁）。
// 目前沒有內建的教學頁；新增教學頁時，在這裡登記它的搜尋函式。
import type { KnowledgeChunk } from "./knowledge-types";

export interface GuideKnowledge {
  slug: string;
  /** 問題裡沒有可用的關鍵字時改用這個字搜尋 */
  fallbackQuery: string;
  search: (terms: string[], limit: number) => KnowledgeChunk[];
}

export const GUIDE_KNOWLEDGE: GuideKnowledge[] = [];
