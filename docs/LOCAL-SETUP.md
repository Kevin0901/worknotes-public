# 在本機開發

以下以 Windows 的 **PowerShell** 為例；macOS／Linux 的指令大致相同（`Copy-Item` 改為 `cp`、`notepad` 改為慣用的編輯器）。

## 1. 安裝工具（已安裝可略過）

| 工具 | 用途 | 下載 |
| --- | --- | --- |
| Git | 版本控制 | https://git-scm.com/ |
| Node.js 24 LTS | 執行專案（`package.json` 鎖定 24.x） | https://nodejs.org/ |
| Docker Desktop | 本機 PostgreSQL（也可改裝 PostgreSQL 16） | https://www.docker.com/products/docker-desktop/ |

```powershell
node -v; git --version; docker --version
```

## 2. 取得程式碼

在你想放專案的資料夾執行：

```powershell
git clone https://github.com/Kevin0901/worknotes-public.git worknotes
cd worknotes
npm ci
```

## 3. 本機資料庫

**方法 A：Docker（建議）**

```powershell
npm run db:up      # 建立 worknotes-db 容器（帳號 worknotes／密碼 localdev／資料庫 worknotes）
```

**方法 B：自行安裝 PostgreSQL 16**

```powershell
psql -U postgres -c "CREATE USER worknotes WITH PASSWORD 'localdev';"
psql -U postgres -c "CREATE DATABASE worknotes OWNER worknotes;"
```

## 4. 建立 `.env.local`

```powershell
Copy-Item .env.example .env.local
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # → 填到 AUTH_SECRET
npm run hash-password -- "自訂的本機後台密碼"                                     # → 填到 ADMIN_PASSWORD_HASH
notepad .env.local
```

`.env.local` 至少要有：

```ini
DATABASE_URL=postgres://worknotes:localdev@localhost:5432/worknotes
AUTH_SECRET=（上面產生的隨機字串）
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=（上面產生的 scrypt:… 字串）
ADMIN_TEST_PASSWORD=（同一組本機後台密碼，給端對端測試用）
```

- **不要**填入正式環境的 `AUTH_SECRET` 或後台密碼；`.env.local` 已在 `.gitignore` 中，不會被提交。
- Google 登入在本機是選用的：要用的話，在 Google Cloud Console 的 OAuth 用戶端加上
  `http://localhost:3000/api/auth/callback/google`，再把 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` 填入。
  不設定也可以：到 http://localhost:3000/admin/login 用本機後台帳號登入，就能使用前台所有功能。

## 5. 啟動與測試

```powershell
npm run dev                         # http://localhost:3000，第一次連線會自動建立資料表
```

另開一個終端機視窗：

```powershell
npm run typecheck
npm test                            # 單元測試
npx playwright install chromium     # 只需第一次（或設定 CHROMIUM_PATH 指向已安裝的 Chrome）
npm run test:e2e:access             # 權限端對端測試（需 dev server 執行中）
npm run test:e2e:ai                 # AI 助理的權限／資安測試（需 dev server，會用假金鑰連到 api.groq.com）
npm run test:e2e:editor             # 編輯器／地圖瀏覽器測試，截圖在 test-results/editor/
```

正式版建置前先停止 dev server（Ctrl+C），兩者共用 `.next` 資料夾：

```powershell
npm run build
```

## 6. 部署

部署到 Vercel 的步驟與環境變數見 README 的「部署到 Vercel 需要的設定」。
