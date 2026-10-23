# 工作筆記（WorkNotes）

需要 Google 帳號登入、並經管理員核准才能使用的 Notion 風格工作筆記系統，附行事曆、Notion 匯入／匯出，
以及可以使用自己的 API 金鑰、引用網站筆記的 AI 助理。

> 這是作者私人專案的公開版：不含作者的筆記內容與內建教學頁，也不含部署設定與開發日誌。

## 功能

**前台（筆記）**
- Google 帳號登入；第一次登入會建立「待審核」申請，管理員核准後才能使用
- 側邊欄第一層是「空間」：公共區＋每位使用者的個人空間，可收合／展開；可以把自己的空間對其他人隱藏
- 分類可多層巢狀；筆記可新增、修改、刪除（垃圾桶可還原）、移動（含跨空間）、排序、釘選、加標籤
- 分類與筆記可設定可見度：僅自己可見／他人可看／他人可看可編輯（見下方「權限規則」）
- 所見即所得編輯器（類似 Notion）：直接打字就是排版後的樣子
  - 選取文字會出現樣式工具列；按滑鼠右鍵有剪下／複製／貼上、文字樣式、轉換成標題／清單／引用、插入表格等
  - 輸入「/」插入區塊（標題、清單、待辦、指令區塊、表格、地圖…），輸入「[[」搜尋並連結其他筆記
  - 貼上 Markdown 文字會自動轉成格式；內容仍以 Markdown 保存，也可以切換到「Markdown」原始碼模式
  - Ctrl+S 儲存、自動暫存草稿；無法完整保留的特殊寫法會自動改用 Markdown 模式，避免內容遺失
- 互動地圖：插入地點（搜尋地址、貼上 Google 地圖連結或座標、點地圖、目前位置），可直接開啟 Google／Apple 地圖導航
- 指令區塊有語法上色與「複製」按鈕；`[[筆記標題]]` 可連結到其他筆記
- 每次修改自動保留歷史版本（最多 30 版），可預覽與還原
- 全文搜尋、Ctrl+K 快速搜尋、目錄（TOC）、深色模式；等待網路時畫面上方會顯示轉圈提示
- 手機 RWD：側邊欄改為抽屜選單，編輯器工具列可左右滑動，地圖點一下才會拖曳（不影響頁面捲動）
- 也支援在程式中加入「互動教學頁」（權限與筆記相同，可給 AI 助理引用）；公開版沒有內建任何教學頁

**手機掃碼登入（適合客戶或公用電腦）**
- 電腦開啟登入頁 →「用手機掃碼登入」顯示 QR Code 與 8 碼代碼（3 分鐘內有效、只能使用一次）
- 用已登入的手機掃描（或在手機「核准電腦登入」輸入代碼），確認電腦的位置與瀏覽器後核准，並選擇登入 1／4／8／24 小時
- 電腦不需要輸入任何密碼；臨時登入期間畫面上方會提示到期時間
- 「我的帳號 → 登入裝置」可以遠端登出任一裝置；後台也能強制登出某個帳號的所有裝置

**Notion 匯入／匯出（`/transfer`）**
- 匯入 Notion「Markdown & CSV」匯出的 ZIP（含大型匯出的分割 ZIP）或 .md／.csv 檔：子頁面 → 子分類、資料庫 CSV → 表格筆記、頁面連結 → [[筆記連結]]（圖片與附件不匯入）
- 匯出全部或指定分類為 ZIP（分類 → 資料夾、筆記 → Markdown），可在 Notion「設定 → 匯入 → Text & Markdown」直接匯入；單篇筆記可下載 .md
- 檔案在瀏覽器端解壓縮與壓縮，分批上傳，不受 Vercel 4.5 MB 請求上限影響

**行事曆（`/calendar`）**
- 行程（可全天、跨日、跨午夜）與待辦事項（可不填日期），月曆與清單兩種檢視
- 待辦面板：逾期、今天、之後、未排日期，勾選即完成，可快速新增
- 每個項目可設定顏色、地點、說明（Markdown）、相關筆記，以及「僅自己可見／共用」
- 首頁顯示今天的行程與到期待辦；可匯出 .ics（Google／Outlook 行事曆）與 CSV（Notion 資料庫）

**AI 助理（`/ai`）**
- 使用自己的 API 金鑰對話：Claude、ChatGPT、Gemini，以及 Groq、OpenRouter、Mistral、NVIDIA NIM 等免費平台；
  輸入金鑰後自動列出可用模型，可自由選擇
- 可自動引用網站上「你看得到的」筆記（或指定分類／筆記、或不引用），回答會標示 [1]、[2] 來源連結
- 對話紀錄可保存、重新命名、刪除（只有本人看得到）；也可以不保存
- 金鑰保護：只經 HTTPS 送到伺服器、不回傳瀏覽器（只顯示前後 4 碼）；儲存時以 AES-256-GCM 加密並綁定帳號；
  可選「不儲存」（只在分頁記憶體）或加密保存 7／30／90 天、直到刪除，隨時可永久刪除
- 也可以用 API 網址連接 OpenAI 相容服務：電腦上的 Ollama、LM Studio 由瀏覽器直連（資料不經本站伺服器送到模型），
  公開的 https 服務（OpenAI、DeepSeek、自架 vLLM…）由伺服器代連並阻擋內網位址
- 「API 金鑰與連線」頁（`/ai/keys`）分成我的金鑰、免費金鑰申請教學、連接 Ollama／自訂端點、安全說明四個分頁

**後台（`/admin`，獨立帳號密碼）**
- 總覽：帳號、筆記、瀏覽量統計，系統設定狀態檢查（資料庫、Google OAuth）
- 帳號審核：核准（可編輯／僅檢視）、拒絕、停用、刪除、預先加入 Email、強制登出所有裝置
- 訪問紀錄：頁面瀏覽、登入、筆記異動、後台操作；可篩選、分頁、匯出 CSV、清除舊紀錄
- 系統設定：前台是否需要登入、是否開放新帳號申請、是否記錄頁面瀏覽、紀錄保留天數、網站名稱、變更後台密碼
- 後台登入連續失敗 5 次會暫停 15 分鐘

## 權限規則（空間與可見度）

- **公共區**：所有可編輯的帳號都能在最上層新增；**個人空間**：只有本人（與管理員）能在最上層新增
- 每個分類、筆記都有擁有者與可見度：
  - 僅自己可見：只有擁有者（與管理員）看得到
  - 他人可看：其他已核准的帳號可以查看，不能修改
  - 他人可看可編輯：其他「可編輯」帳號也能修改內容、在底下新增
- 實際權限取「空間 → 各層上層分類 → 項目本身」中最嚴格的一個：上層設為僅自己可見，底下的東西別人就看不到
- 新增項目時預設沿用上層的可見度；直接放在空間最上層時，個人空間預設「僅自己可見」、公共區預設「他人可看可編輯」
- 只有擁有者或管理員可以變更可見度、把項目移到其他空間；別人的項目只能在同一個空間內移到「他人可看可編輯」的分類
- 個人空間設為「隱藏」後，其他人完全看不到該空間（包含設為他人可看的內容）；管理員一律看得到全部內容
- 刪除帳號時，該帳號個人空間的內容會移到公共區並改為僅管理員可見，由管理員決定保留或刪除

## 技術架構

- Next.js 16（App Router）＋ React 19 ＋ Tailwind CSS 4，Node.js 24
- PostgreSQL（建議使用 Vercel Marketplace 的 Neon，免費方案即可）
- Google OAuth 2.0（Authorization Code ＋ PKCE），Session 以簽章 Cookie（JWT）保存
- 編輯器：TipTap（ProseMirror）＋ @tiptap/markdown，內容以 Markdown 保存，檢視時以 react-markdown 顯示
- 地圖：Leaflet ＋ OpenStreetMap 圖磚、Nominatim 地址搜尋（皆免費、不需 API 金鑰）；地圖以 ```map 程式碼區塊保存座標
- AI：Claude 使用官方 `@anthropic-ai/sdk`；ChatGPT、Gemini 與免費平台以 fetch 呼叫官方 API（網址寫死、不跟隨轉址）
- 第一次連上資料庫時會自動建立資料表；之後的資料表變更以版本號自動升級

## 部署到 Vercel 需要的設定

### 1. 建立資料庫（Neon Postgres）

Vercel 專案 → **Storage** → **Create Database** → 選 **Neon** → 建立後 **Connect Project** 選擇此專案。
系統會自動加入 `DATABASE_URL` 環境變數。

### 2. 建立 Google OAuth 用戶端

1. 前往 [Google Cloud Console](https://console.cloud.google.com/) → 建立（或選擇）專案
2. **API 和服務 → OAuth 同意畫面**（Google Auth Platform）：使用者類型選「外部」，填寫應用程式名稱與聯絡信箱；完成後在「目標對象」把發布狀態改為「**正式版**」（只使用 email／profile 基本範圍，不需要 Google 審查）
3. **API 和服務 → 憑證 → 建立憑證 → OAuth 用戶端 ID**，應用程式類型選「**網頁應用程式**」
   - 已授權的 JavaScript 來源：`https://<你的網域>`
   - 已授權的重新導向 URI：`https://<你的網域>/api/auth/callback/google`
   - （後台「總覽」頁面會顯示這兩個網址，可直接複製）
4. 把產生的用戶端 ID 與密碼設定到 Vercel 環境變數 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`

### 3. 環境變數一覽

| 變數 | 說明 |
| --- | --- |
| `DATABASE_URL` | Postgres 連線字串（Neon 整合會自動設定） |
| `AUTH_SECRET` | 簽署 Cookie 的隨機字串（至少 32 字元） |
| `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` | Google OAuth 用戶端 |
| `ADMIN_USERNAME` | 後台帳號（未設定時為 `admin`，正式環境請自訂） |
| `ADMIN_PASSWORD_HASH` | 後台密碼的 scrypt 雜湊（不存明碼），產生方式：`npm run hash-password -- '密碼'` |
| `APP_URL`（選填） | 網站正式網址，OAuth 回呼網址以此為準 |
| `AI_KEY_ENCRYPTION_KEY`（選填） | 加密使用者 AI 金鑰的專用主金鑰（32 bytes，base64）；未設定時由 `AUTH_SECRET` 以 HKDF 衍生。產生：`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |

設定或修改環境變數後，需要到 **Deployments → Redeploy** 才會生效。
機密的環境變數只設定在需要的環境（例如只給 Production），不要讓預覽部署共用正式資料庫與金鑰。

### 4. 第一次使用

1. 用 Google 帳號登入前台 → 會顯示「等待審核」
2. 到 `/admin` 用後台帳號密碼登入 → **帳號審核** → 核准自己的帳號
3. 回到前台重新以 Google 登入即可使用

## 本機開發

完整步驟（含 Windows、資料庫、測試）請見 [docs/LOCAL-SETUP.md](docs/LOCAL-SETUP.md)。

```bash
npm ci
npm run db:up                # Docker 啟動本機 PostgreSQL
cp .env.example .env.local   # 填入 AUTH_SECRET、ADMIN_PASSWORD_HASH 等
npm run dev                  # http://localhost:3000
npm test                     # 單元測試；端對端測試：npm run test:e2e:access、test:e2e:ai、test:e2e:editor
```

範例文字（搜尋提示、AI 助理的範例問題等）集中在 `src/lib/site-content.ts`；第一次啟動時要匯入的預設筆記放在
`src/lib/seed/default.ts`（目前是空的）。

## 商標聲明

文中提到的產品與服務名稱（例如 Google、Notion、Claude、ChatGPT、Gemini）為各自公司的商標；本專案與這些公司沒有任何關係。

## 授權

本儲存庫沒有附開放原始碼授權，著作權保留（All rights reserved）。
