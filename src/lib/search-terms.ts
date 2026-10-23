// 從自然語言問題取出搜尋關鍵字（純函式，前後端與測試共用）

const STOPWORDS = [
  "為什麼", "請問", "如何", "怎麼", "怎樣", "什麼", "可以", "是否", "一下", "幫我", "告訴", "我要", "我想", "如果", "還是", "以及", "需要", "應該",
];
const EN_STOPWORDS = new Set(["the", "and", "for", "how", "what", "why", "can", "you", "with", "this", "that", "please", "does", "from", "into", "about"]);

/** 英數字且至少 3 個字元的關鍵字（產品名稱、指令等），比中文二字詞更能代表問題主題 */
export const isStrongTerm = (t: string) => /^[a-z0-9][a-z0-9_\-./]{2,}$/i.test(t);

/**
 * 英數字詞（含 - _ . /）整個保留；中文先去掉「如何、怎麼」等虛詞，再切成二字詞（bigram），
 * 這樣「驅動程式安裝」也能找到只寫「安裝驅動」的筆記。
 */
export function extractTerms(text: string, max = 24): string[] {
  const out: string[] = [];
  const add = (t: string) => {
    const v = t.toLowerCase();
    if (v.length >= 2 && !EN_STOPWORDS.has(v) && !STOPWORDS.includes(v) && !out.includes(v)) out.push(v);
  };
  for (const m of text.matchAll(/[A-Za-z0-9][A-Za-z0-9_\-./]*[A-Za-z0-9]|[A-Za-z0-9]{2,}/g)) add(m[0]);
  let cjk = text;
  for (const w of STOPWORDS) cjk = cjk.split(w).join(" ");
  for (const m of cjk.matchAll(/[㐀-鿿]+/g)) {
    const run = m[0];
    if (run.length <= 4) add(run);
    for (let i = 0; i + 2 <= run.length; i++) add(run.slice(i, i + 2));
  }
  return out.slice(0, max);
}
