// 權限端對端測試（需先啟動 npm run dev，並在 .env.local 設定 ADMIN_TEST_PASSWORD）
// 執行：npm run test:e2e:access
// 角色：A、B = 可編輯帳號，V = 僅檢視帳號，ADM = 後台管理員。只會在本機資料庫建立 e2e-*@example.test 測試帳號。
import { adminCookie, BASE, ensureTestUsers, loadEnv, localDb, mintSession, TEST_USERS } from "./lib.mjs";

loadEnv();
const sql = localDb();
await ensureTestUsers(sql);
const ADM_COOKIE = await adminCookie();
if (!ADM_COOKIE) {
  console.error("請在 .env.local 設定 ADMIN_TEST_PASSWORD（本機後台密碼，對應 ADMIN_PASSWORD_HASH）");
  process.exit(1);
}
const H = {
  A: `wn_session=${await mintSession(sql, TEST_USERS.A.email)}`,
  B: `wn_session=${await mintSession(sql, TEST_USERS.B.email)}`,
  V: `wn_session=${await mintSession(sql, TEST_USERS.V.email)}`,
  ADM: ADM_COOKIE,
};
const B = BASE;
let fails = 0;
async function call(who, method, path, body) {
  const res = await fetch(B + path, {
    method,
    redirect: "manual",
    headers: { cookie: H[who], origin: B, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* 非 JSON */
  }
  return { status: res.status, data, location: res.headers.get("location") };
}
function expect(name, cond, extra = "") {
  if (cond) console.log("  ok  ", name);
  else {
    fails++;
    console.log("  FAIL", name, extra);
  }
}
async function page(who, path) {
  const res = await fetch(B + path, { headers: { cookie: H[who] }, redirect: "manual" });
  return { status: res.status, text: await res.text() };
}

// 1. A 在自己空間建立分類 → 預設僅自己可見
let r = await call("A", "POST", "/api/categories", { name: "A私人", icon: "🔒", parentId: null, space: "mine" });
expect("A 建立我的空間分類 201", r.status === 201, JSON.stringify(r.data));
const catA = r.data.category;
expect("預設可見度 private", catA.visibility === "private");
const A_ID = catA.spaceUserId;
r = await call("A", "POST", "/api/notes", { categoryId: catA.id, title: "A秘密筆記 XYZZY" });
const noteA = r.data.note;
expect("A 建立筆記 201，繼承 private", r.status === 201 && noteA.visibility === "private");

// 2. B 看不到
r = await call("B", "GET", `/api/notes/${noteA.id}`);
expect("B 讀取 A 私人筆記 404", r.status === 404);
let p = await page("B", `/c/${catA.id}`);
expect("B 開啟 A 私人分類頁 404", p.status === 404);
p = await page("B", `/`);
expect("B 首頁看不到 A私人", !p.text.includes("A私人"));
p = await page("B", `/search?q=XYZZY`);
expect("B 搜尋不到 A 私人筆記", !p.text.includes("A秘密筆記"));
r = await fetch(B + `/go?t=${encodeURIComponent("A秘密筆記 XYZZY")}`, { headers: { cookie: H.B }, redirect: "manual" });
expect("B 的 [[連結]] 不會導到 A 私人筆記", !(r.headers.get("location") || "").includes(noteA.id));
p = await page("A", `/search?q=XYZZY`);
expect("A 自己搜尋得到", p.text.includes("A秘密筆記"));
r = await call("B", "GET", "/api/export?limit=500");
expect("B 匯出不含 A 私人筆記", r.status === 200 && !r.data.notes.some((n) => n.id === noteA.id) && !r.data.categories.some((c) => c.id === catA.id));
r = await call("B", "GET", `/api/notes/${noteA.id}/revisions`);
expect("B 讀不到 A 私人筆記版本紀錄", r.status === 404);
r = await call("B", "PATCH", `/api/notes/${noteA.id}`, { title: "hack" });
expect("B 修改 A 私人筆記 404", r.status === 404);
r = await call("B", "POST", "/api/notes", { categoryId: catA.id, title: "insert" });
expect("B 在 A 私人分類新增 404", r.status === 404);
r = await call("B", "POST", "/api/categories", { name: "x", parentId: null, space: A_ID });
expect("B 在 A 的空間最上層新增被拒", r.status === 400 || r.status === 403, String(r.status));

// 3. 分類改成他人可看（不套用子項目）→ 筆記仍是 private
r = await call("A", "PATCH", `/api/categories/${catA.id}`, { visibility: "read" });
expect("A 改分類為 read", r.status === 200);
r = await call("B", "GET", `/api/notes/${noteA.id}`);
expect("筆記本身 private → B 仍看不到", r.status === 404);
p = await page("B", `/c/${catA.id}`);
expect("B 可開啟分類頁（read）", p.status === 200 && p.text.includes("A私人"));
r = await call("A", "PATCH", `/api/categories/${catA.id}`, { visibility: "read", applyToChildren: true });
r = await call("B", "GET", `/api/notes/${noteA.id}`);
expect("套用到子項目後 B 可讀", r.status === 200 && r.data.note.canEdit === false && r.data.note.canManage === false);
r = await call("B", "PATCH", `/api/notes/${noteA.id}`, { content: "B 改的" });
expect("B 不能改 read 筆記 403", r.status === 403);
r = await call("B", "DELETE", `/api/notes/${noteA.id}`);
expect("B 不能刪 read 筆記 403", r.status === 403);

// 4. 分類 edit → B 可編輯；但不能改可見度、不能移到別的空間
r = await call("A", "PATCH", `/api/categories/${catA.id}`, { visibility: "edit", applyToChildren: true });
r = await call("B", "PATCH", `/api/notes/${noteA.id}`, { content: "B 改的內容" });
expect("B 可改 edit 筆記", r.status === 200 && r.data.note.content === "B 改的內容");
r = await call("B", "PATCH", `/api/notes/${noteA.id}`, { visibility: "private" });
expect("B 不能改 A 筆記可見度 403", r.status === 403);
r = await call("B", "PATCH", `/api/categories/${catA.id}`, { visibility: "private" });
expect("B 不能改 A 分類可見度 403", r.status === 403);
r = await call("B", "PATCH", `/api/notes/${noteA.id}`, { categoryId: null, space: "public" });
expect("B 不能把 A 的筆記移到公共區 403", r.status === 403);
r = await call("B", "POST", "/api/notes", { categoryId: catA.id, title: "B 在 A 分類的筆記" });
expect("B 在 A 的 edit 分類新增筆記", r.status === 201 && r.data.note.spaceUserId === A_ID && r.data.note.visibility === "edit");
const noteB_inA = r.data.note;

// 5. B 不能把別人的東西藏進自己的私人分類（同空間）
r = await call("B", "POST", "/api/categories", { name: "B私人公共區", parentId: null, space: "public", visibility: "private" });
const catBpriv = r.data.category;
expect("B 在公共區建立私人分類", r.status === 201 && catBpriv.visibility === "private" && catBpriv.spaceUserId === null);
const tree0 = await call("B", "GET", `/api/export?limit=1`);
let publicCat = tree0.data.categories.find((c) => c.spaceUserId === null && c.visibility === "edit" && !c.ownerId);
// 全新安裝（例如公開版）沒有預設分類：由管理員建立一個公共分類（擁有者為管理員），測試結束時刪除
let tempPublicCat = null;
if (!publicCat) {
  r = await call("ADM", "POST", "/api/categories", { name: "公共分類（權限測試）", parentId: null, space: "public", visibility: "edit" });
  publicCat = tempPublicCat = r.data.category;
}
r = await call("B", "PATCH", `/api/categories/${publicCat.id}`, { parentId: catBpriv.id });
expect("B 不能把公共分類移進自己的私人分類 403", r.status === 403, JSON.stringify(r.data));
r = await call("A", "GET", `/api/export?limit=1`);
expect("A 看不到 B 的私人分類", !r.data.categories.some((c) => c.id === catBpriv.id));

// 6. 隱藏空間
r = await call("A", "PATCH", "/api/account/space", { hidden: true });
expect("A 隱藏空間", r.status === 200);
r = await call("B", "GET", `/api/notes/${noteA.id}`);
expect("隱藏後 B 讀不到 A 空間的筆記", r.status === 404);
r = await call("B", "GET", `/api/notes/${noteB_inA.id}`);
expect("隱藏後 B 也讀不到自己放在 A 空間的筆記", r.status === 404);
r = await call("ADM", "GET", `/api/notes/${noteA.id}`);
expect("管理員仍讀得到隱藏空間", r.status === 200 && r.data.note.canEdit && r.data.note.canManage);
r = await call("A", "PATCH", "/api/account/space", { hidden: false });

// 7. 刪除保護：B 在 A 分類放私人筆記 → A 不能刪分類
r = await call("B", "PATCH", `/api/notes/${noteB_inA.id}`, { visibility: "private" });
expect("B 把自己的筆記設 private", r.status === 200);
r = await call("A", "GET", `/api/notes/${noteB_inA.id}`);
expect("A 看不到 B 的私人筆記", r.status === 404);
r = await call("A", "DELETE", `/api/categories/${catA.id}`);
expect("A 不能刪除含他人私人內容的分類 403", r.status === 403);

// 8. 僅檢視帳號
r = await call("V", "GET", `/api/notes/${noteA.id}`);
expect("viewer 可讀 edit 筆記", r.status === 200 && r.data.note.canEdit === false);
r = await call("V", "PATCH", `/api/notes/${noteA.id}`, { content: "v" });
expect("viewer 不能修改 403", r.status === 403);

// 9. 垃圾桶隔離
r = await call("B", "DELETE", `/api/notes/${noteB_inA.id}`);
expect("B 把自己的筆記移到垃圾桶", r.status === 200);
p = await page("A", "/trash");
expect("A 的垃圾桶看不到 B 的私人筆記", !p.text.includes("B 在 A 分類的筆記"));
r = await call("A", "DELETE", "/api/trash");
r = await call("B", "POST", `/api/notes/${noteB_inA.id}/restore`);
expect("A 清空垃圾桶不影響 B 的筆記（B 可還原）", r.status === 200);

// 10. 擁有者把分類移到公共區：整個子樹一起搬
r = await call("ADM", "PATCH", `/api/notes/${noteB_inA.id}`, { visibility: "edit" });
r = await call("A", "PATCH", `/api/categories/${catA.id}`, { parentId: null, space: "public" });
expect("A 把分類移到公共區", r.status === 200 && r.data.category.spaceUserId === null);
r = await call("A", "GET", `/api/notes/${noteA.id}`);
expect("子筆記一起移到公共區", r.data.note.spaceUserId === null);
r = await call("B", "GET", `/api/notes/${noteB_inA.id}`);
expect("B 的筆記也一起搬過去", r.data.note.spaceUserId === null);

// 11. 清理
r = await call("ADM", "DELETE", `/api/categories/${catA.id}`);
expect("管理員可刪除", r.status === 200);
r = await call("B", "DELETE", `/api/categories/${catBpriv.id}`);
if (tempPublicCat) await call("ADM", "DELETE", `/api/categories/${tempPublicCat.id}`);
r = await call("ADM", "DELETE", "/api/trash");
await sql.end();
console.log(fails ? `\n${fails} 項失敗` : "\n全部通過");
process.exit(fails ? 1 : 0);
