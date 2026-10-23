// 與網站筆記主題有關的範例文字（輸入框提示、AI 助理的範例問題、教學頁說明等）。
// 要換成自己的主題時，只要修改這個檔案；其他程式不要直接寫死跟筆記主題有關的文字。

export const SEARCH_PLACEHOLDER = "輸入關鍵字，例如：安裝、設定、檢查清單（多個關鍵字以空白分隔）";

export const MARKDOWN_PLACEHOLDER = "使用 Markdown 撰寫內容…\n\n## 標題\n\n- 重點一\n- 重點二";

export const LINK_PLACEHOLDER = "https://example.com/…";

export const TASK_TITLE_PLACEHOLDER = "要做什麼？例如：回覆客戶報價";

export const EVENT_TITLE_PLACEHOLDER = "行程名稱，例如：A 公司設備交機";

/** 第一次連上資料庫時的說明，接在「系統會自動建立資料表」後面 */
export const SEED_DESCRIPTION = "";

/** AI 助理首頁的範例問題 */
export const AI_EXAMPLES = [
  "幫我整理筆記裡提到的待辦事項",
  "用三點摘要我的安裝檢查清單",
  "這個錯誤訊息可能是什麼原因？要怎麼排查？",
  "把這段步驟改寫成給客戶看的說明",
];

/** AI 助理說明「可以引用筆記與互動教學」後面的例子 */
export const AI_REFERENCE_EXAMPLES = "";

/** 選擇參考資料時，各教學頁名稱後面的補充說明（key 為教學頁的 slug） */
export const GUIDE_HINTS: Record<string, string> = {};
