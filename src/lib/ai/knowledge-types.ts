/** 互動教學頁提供給 AI 助理的一段參考資料 */
export interface KnowledgeChunk {
  title: string;
  href: string;
  text: string;
  score: number;
}
