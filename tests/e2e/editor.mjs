// 編輯器與地圖的瀏覽器測試（Playwright）。需先啟動 npm run dev。
// 執行：npm run test:e2e:editor   截圖輸出到 test-results/editor/
// 第一次使用請先安裝瀏覽器：npx playwright install chromium（或設定 CHROMIUM_PATH 指向既有的 Chromium）
// 地圖圖磚與 Nominatim 地址查詢會以假資料取代，不會連到外部服務。
import { mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright";
import { BASE, checker, client, ensureTestUsers, loadEnv, localDb, mintSession, TEST_USERS } from "./lib.mjs";

loadEnv();
const OUT = "test-results/editor";
mkdirSync(OUT, { recursive: true });
const sql = localDb();
await ensureTestUsers(sql);
const token = await mintSession(sql, TEST_USERS.A.email);
await sql.end();
const call = client(`wn_session=${token}`);
const { expect, done } = checker();
const created = [];

/** 產生單色 PNG 當作地圖圖磚 */
function png(w, h, rgb) {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3).map((_, i) => rgb[i % 3])]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const TILE = png(256, 256, [232, 236, 228]);
const TAIPEI101 = { country_code: "tw", postcode: "110", city: "臺北市", suburb: "信義區", road: "信義路五段", house_number: "7" };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];

async function newPage({ mobile = false } = {}) {
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    isMobile: mobile,
    hasTouch: mobile,
    locale: "zh-TW",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await ctx.addCookies([{ name: "wn_session", value: token, url: BASE }]);
  await ctx.route("https://tile.openstreetmap.org/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: TILE }));
  await ctx.route("https://nominatim.openstreetmap.org/**", (r) => {
    if (r.request().url().includes("/reverse")) {
      return r.fulfill({ json: { lat: "25.03", lon: "121.56", display_name: "7, 信義路五段, 信義區, 臺北市, 110, 臺灣", address: TAIPEI101 } });
    }
    return r.fulfill({
      json: [
        { lat: "25.0339639", lon: "121.5644722", name: "台北101", display_name: "台北101, 7, 信義路五段, 信義區, 臺北市, 110, 臺灣", address: TAIPEI101 },
        { lat: "25.0400", lon: "121.5600", name: "台北101 購物中心", display_name: "台北101 購物中心, 臺北市, 臺灣" },
      ],
    });
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  p.on("console", (m) => m.type() === "error" && !m.text().includes("Failed to load resource") && errors.push("console: " + m.text().slice(0, 300)));
  return p;
}

async function newNote(title, content = "") {
  const r = await call("POST", "/api/notes", { categoryId: null, space: "mine", title, content });
  created.push(r.data.note.id);
  return r.data.note;
}

async function openEditor(p, id) {
  await p.goto(`${BASE}/n/${id}?edit=1`);
  await p.waitForSelector(".wn-editor", { timeout: 60000 });
  await p.waitForTimeout(600);
}

const savedContent = async (id) => (await call("GET", `/api/notes/${id}`)).data.note.content;

try {
  let p = await newPage();

  // 2. 打字、slash 選單、[[ 連結、右鍵選單、地圖、儲存
  console.log("▶ 編輯流程");
  await newNote("燒機測試範例", "連結目標\n");
  const note = await newNote("編輯器測試");
  await openEditor(p, note.id);
  await p.click(".wn-editor");
  await p.keyboard.type("## 安裝步驟");
  await p.keyboard.press("Enter");
  await p.keyboard.type("先執行 `uptime` 確認系統");
  await p.keyboard.press("Enter");
  await p.keyboard.type("/表格");
  await p.waitForSelector("text=插入區塊");
  await p.screenshot({ path: `${OUT}/02-slash.png` });
  await p.keyboard.press("Enter");
  await p.waitForTimeout(300);
  await p.keyboard.type("項目");
  await p.keyboard.press("Tab");
  await p.keyboard.type("狀態");
  await p.keyboard.press("Control+End");
  await p.keyboard.type("相關：[[燒機");
  await p.waitForSelector("text=連結到筆記");
  await p.screenshot({ path: `${OUT}/03-wiki.png` });
  await p.keyboard.press("Enter");
  await p.keyboard.press("Enter");
  await p.keyboard.type("請選取這段文字");
  await p.locator(".wn-editor p:has-text('請選取這段文字')").selectText();
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/04-bubble.png` });
  const line = await p.locator(".wn-editor p:has-text('請選取這段文字')").boundingBox();
  await p.mouse.click(line.x + 30, line.y + line.height / 2, { button: "right" });
  await p.waitForSelector("[role=menu] >> text=轉換成");
  await p.screenshot({ path: `${OUT}/05-context-menu.png` });
  await p.click("[role=menu] button[aria-label='粗體']");
  await p.waitForTimeout(200); // 選單關閉後編輯器在下一個畫面才取回焦點
  await p.mouse.click(line.x + 30, line.y + line.height / 2, { button: "right" });
  await p.click("[role=menu] button[aria-label='引用／提示']");
  await p.waitForTimeout(200);
  await p.keyboard.press("Control+End");
  await p.keyboard.press("Enter");
  await p.keyboard.type("/地圖");
  await p.waitForSelector("text=插入區塊");
  await p.keyboard.press("Enter");
  await p.waitForSelector("text=插入地圖");
  await p.fill("input[placeholder^='搜尋地址或地點']", "台北101");
  await p.click("[role=dialog] button[type=submit]");
  await p.waitForSelector("text=台北101 購物中心");
  await p.click("[role=dialog] li button >> nth=0");
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/06-map-picker.png` });
  await p.click("button.primary-action:has-text('確定')");
  await p.waitForSelector(".map-block-view .leaflet-container");
  await p.keyboard.press("Control+s");
  await p.waitForSelector("text=已儲存");
  await p.waitForTimeout(1000);
  await p.screenshot({ path: `${OUT}/07-view.png`, fullPage: true });
  const md = await savedContent(note.id);
  expect("標題", md.includes("## 安裝步驟"));
  expect("行內程式碼", md.includes("`uptime`"));
  expect("表格", /\| 項目\s*\| 狀態/.test(md));
  expect("[[筆記連結]] 未被跳脫", /\[\[[^\]]+\]\]/.test(md) && !md.includes("\\[\\["));
  expect("粗體＋引用", md.includes("> **請選取這段文字**"), md);
  expect("地圖區塊", md.includes("```map") && md.includes("title: 台北101") && md.includes("address: 110臺北市信義區信義路五段7號"));
  expect("檢視頁顯示地圖與導航按鈕", (await p.locator(".map-card >> text=Google 導航").count()) === 1);

  // 3. 右鍵選單的剪下／複製／貼上，以及貼上 Markdown
  console.log("▶ 剪貼簿");
  const clipNote = await newNote("剪貼簿測試");
  await openEditor(p, clipNote.id);
  await p.click(".wn-editor");
  await p.keyboard.type("第一行文字");
  await p.locator(".wn-editor p").first().selectText();
  await p.waitForTimeout(200);
  const b1 = await p.locator(".wn-editor p").first().boundingBox();
  await p.mouse.click(b1.x + 20, b1.y + b1.height / 2, { button: "right" });
  await p.click("[role=menu] >> text=複製");
  await p.waitForTimeout(300);
  expect("複製到剪貼簿", (await p.evaluate(() => navigator.clipboard.readText())) === "第一行文字");
  await p.keyboard.press("End");
  await p.keyboard.press("Enter");
  await p.keyboard.type("第二行");
  const b2 = await p.locator(".wn-editor p").nth(1).boundingBox();
  await p.mouse.click(b2.x + b2.width - 5, b2.y + b2.height / 2, { button: "right" });
  await p.click("[role=menu] >> text=貼上 >> nth=0");
  await p.waitForTimeout(400);
  expect("從選單貼上", (await p.locator(".wn-editor").innerText()).includes("第二行第一行文字"));
  await p.keyboard.press("Control+a");
  await p.mouse.click(b1.x + 20, b1.y + b1.height / 2, { button: "right" });
  await p.click("[role=menu] >> text=剪下");
  await p.waitForTimeout(300);
  expect("從選單剪下", (await p.locator(".wn-editor").innerText()).trim() === "");
  await p.evaluate(() => navigator.clipboard.writeText("## 標題\n\n- 項目一\n- 項目二"));
  const b3 = await p.locator(".wn-editor p").first().boundingBox();
  await p.mouse.click(b3.x + 5, b3.y + b3.height / 2, { button: "right" });
  await p.click("[role=menu] >> text=貼上 >> nth=0");
  await p.waitForTimeout(400);
  const html = await p.locator(".wn-editor").innerHTML();
  expect("貼上 Markdown 轉成格式", html.includes("<h2>標題</h2>") && html.includes("<li>"));
  await p.keyboard.press("Control+End");
  await p.keyboard.press("Enter");
  await p.evaluate(() => navigator.clipboard.writeText("**粗體** 與 [[燒機測試範例]]"));
  await p.keyboard.press("Control+v");
  await p.waitForTimeout(400);
  const html2 = await p.locator(".wn-editor").innerHTML();
  expect("Ctrl+V 貼上 Markdown", html2.includes("<strong>粗體</strong>") && html2.includes("data-wiki-link"));

  // 4. 地圖區塊不會被打字改壞
  console.log("▶ 地圖保護");
  const mapNote = await newNote("地圖保護測試", "前言\n");
  await openEditor(p, mapNote.id);
  await p.click(".wn-editor p");
  await p.keyboard.press("End");
  await p.keyboard.press("Enter");
  await p.keyboard.type("/地圖");
  await p.waitForSelector("text=插入區塊");
  await p.keyboard.press("Enter");
  await p.waitForSelector("text=插入地圖");
  await p.fill("input[placeholder^='搜尋地址或地點']", "https://www.google.com/maps/@24.7869,120.9968,15z");
  await p.click("[role=dialog] button[type=submit]");
  await p.waitForTimeout(400);
  await p.fill("[role=dialog] input[placeholder^='例如']", "新竹客戶");
  await p.click("button.primary-action:has-text('確定')");
  await p.waitForSelector(".map-block-view");
  await p.keyboard.type("地圖後面的文字");
  await p.keyboard.press("ArrowUp");
  await p.keyboard.press("ArrowUp");
  await p.keyboard.type("XYZ");
  await p.keyboard.press("Control+s");
  await p.waitForSelector("text=已儲存");
  const mapMd = await savedContent(mapNote.id);
  expect("Google 地圖連結解析座標", mapMd.includes("lat: 24.7869") && mapMd.includes("zoom: 15"));
  expect("插入後打字在地圖下方", /```\n\n地圖後面的文字/.test(mapMd));
  expect("地圖座標未被改壞", !/lat:[^\n]*XYZ|XYZ\nlng/.test(mapMd));

  // 5. 地圖標題不會被當成 HTML 執行
  console.log("▶ XSS");
  const xssNote = await newNote(
    "XSS 測試",
    '```map\nlat: 25\nlng: 121.5\nzoom: 12\ntitle: <img src=x onerror="window.__xss=1">\n```\n',
  );
  for (const path of [`/n/${xssNote.id}`, `/n/${xssNote.id}?edit=1`]) {
    await p.goto(BASE + path);
    await p.waitForSelector(".leaflet-marker-icon", { timeout: 60000 });
    await p.hover(".leaflet-marker-icon");
    await p.waitForTimeout(400);
    expect(`地圖標題以純文字顯示（${path.includes("edit") ? "編輯" : "檢視"}）`, (await p.evaluate(() => window.__xss)) === undefined);
  }

  // 6. 手機版
  console.log("▶ 手機版");
  p = await newPage({ mobile: true });
  await openEditor(p, note.id);
  await p.screenshot({ path: `${OUT}/08-mobile-edit.png` });
  await p.goto(`${BASE}/n/${note.id}`);
  await p.waitForSelector(".map-card");
  await p.locator(".map-card").scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/09-mobile-view.png` });
  // 地圖元件是動態載入的（dev server 第一次還要編譯），先等遮罩出現再判斷
  await p.locator("text=點一下即可移動地圖").waitFor({ timeout: 15000 }).catch(() => {});
  expect("手機地圖需點一下才可拖曳", (await p.locator("text=點一下即可移動地圖").count()) === 1);

  // 7. 對話框逐字輸入時焦點不會跳回第一個欄位（Modal 曾因 onClose 每次渲染都不同，每打一個字就重新聚焦）
  console.log("▶ 對話框輸入");
  p = await newPage();
  await p.goto(`${BASE}/ai/keys`);
  await p.click("button:has-text('連接端點（Ollama 等）')");
  const urlInput = p.locator("[role=dialog] input[placeholder='http://localhost:11434/v1']");
  await urlInput.waitFor();
  await p.waitForTimeout(300);
  await urlInput.fill("");
  await urlInput.pressSequentially("http://localhost:11434/v1", { delay: 60 });
  const nameInput = p.locator("[role=dialog] input[placeholder='例如：我的 Ollama']");
  await nameInput.click();
  await p.keyboard.type("my ollama", { delay: 60 });
  expect("逐字輸入網址不會跳到供應商欄位", (await urlInput.inputValue()) === "http://localhost:11434/v1", await urlInput.inputValue());
  expect("逐字輸入名稱不會跳到供應商欄位", (await nameInput.inputValue()) === "my ollama", await nameInput.inputValue());
  expect("輸入後焦點仍在名稱欄位", await nameInput.evaluate((el) => el === document.activeElement));
  await p.keyboard.press("Escape");

  // 8. 等待網路時畫面上方出現轉圈提示（把請求刻意延遲 1.5 秒）
  console.log("▶ 等待提示");
  p = await newPage();
  let busy = p.locator("[data-busy-indicator]");
  const slowNote = await newNote("等待提示測試", "內容\n");
  await openEditor(p, slowNote.id);
  await p.route(`**/api/notes/${slowNote.id}`, async (route) => {
    if (route.request().method() === "PATCH") await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await p.click(".wn-editor p");
  await p.keyboard.press("End");
  await p.keyboard.type("！");
  await p.keyboard.press("Control+s");
  await busy.waitFor({ timeout: 1200 }).catch(() => {});
  expect("儲存時顯示「處理中」轉圈提示", (await busy.textContent({ timeout: 1000 }).catch(() => ""))?.includes("處理中"));
  await p.waitForSelector("text=已儲存");
  await busy.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
  expect("儲存完成後提示消失", (await busy.count()) === 0);
  await p.unroute(`**/api/notes/${slowNote.id}`);

  // 換頁用新的分頁並等它載入完成，避免中斷前一頁儲存後仍在傳輸的畫面更新
  p = await newPage();
  await p.goto(`${BASE}/n/${slowNote.id}`, { waitUntil: "networkidle" });
  busy = p.locator("[data-busy-indicator]");
  await p.route("**/calendar**", async (route) => {
    const h = route.request().headers();
    if (h.rsc && !h["next-router-prefetch"]) await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await p.click("a[href='/calendar']");
  await busy.waitFor({ timeout: 1200 }).catch(() => {});
  expect("換頁時顯示「載入中」轉圈提示", (await busy.textContent({ timeout: 1000 }).catch(() => ""))?.includes("載入中"));
  await p.waitForURL("**/calendar");
  await busy.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
  expect("換頁完成後提示消失", (await busy.count()) === 0);
} finally {
  for (const id of created) await call("DELETE", `/api/notes/${id}`);
  await browser.close();
}

expect("頁面沒有 JavaScript 錯誤", errors.length === 0, errors.join("\n"));
process.exit(done() ? 1 : 0);
