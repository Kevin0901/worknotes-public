import assert from "node:assert/strict";
import { categoryLevel, noteLevel, canEditLevel, canManage, canCreateInSpace, defaultVisibility } from "../../src/lib/access";

const ALICE = "alice", BOB = "bob";
const cat = (id, parentId, ownerId, spaceUserId, visibility) => ({ id, parentId, ownerId, spaceUserId, visibility });
const cats = [
  cat("pub", null, null, null, "edit"),          // 公共區舊資料（無擁有者）
  cat("pubRead", null, ALICE, null, "read"),      // Alice 在公共區，他人唯讀
  cat("pubReadChildEdit", "pubRead", ALICE, null, "edit"), // 子分類設可編輯，但上層唯讀 → 他人仍唯讀
  cat("aPriv", null, ALICE, ALICE, "private"),    // Alice 個人空間私人
  cat("aShared", null, ALICE, ALICE, "edit"),     // Alice 個人空間共用可編輯
  cat("aSharedPrivChild", "aShared", ALICE, ALICE, "private"),
];
const ctx = (hidden = []) => ({ categories: new Map(cats.map((c) => [c.id, c])), hiddenSpaces: new Set(hidden) });
const alice = { userId: ALICE, isAdmin: false, canEditRole: true };
const bob = { userId: BOB, isAdmin: false, canEditRole: true };
const bobViewer = { userId: BOB, isAdmin: false, canEditRole: false };
const admin = { userId: null, isAdmin: true, canEditRole: true };
const anon = { userId: null, isAdmin: false, canEditRole: false };
const c = ctx();

assert.equal(categoryLevel(bob, "pub", c), 2, "legacy public = editable by others");
assert.equal(categoryLevel(bob, "pubRead", c), 1);
assert.equal(categoryLevel(bob, "pubReadChildEdit", c), 1, "most restrictive along chain");
assert.equal(categoryLevel(alice, "pubReadChildEdit", c), 2, "owner keeps edit");
assert.equal(categoryLevel(bob, "aPriv", c), 0, "private hidden from others");
assert.equal(categoryLevel(alice, "aPriv", c), 2);
assert.equal(categoryLevel(bob, "aShared", c), 2);
assert.equal(categoryLevel(bob, "aSharedPrivChild", c), 0);
assert.equal(categoryLevel(bob, "aShared", ctx([ALICE])), 0, "hidden space blocks others");
assert.equal(categoryLevel(alice, "aShared", ctx([ALICE])), 2, "owner sees own hidden space");
assert.equal(categoryLevel(admin, "aPriv", ctx([ALICE])), 2, "admin sees all");
assert.equal(categoryLevel(anon, "pubRead", c), 1, "anonymous can read public read items");
assert.equal(categoryLevel(anon, "aPriv", c), 0);

// 筆記
const note = (id, categoryId, ownerId, spaceUserId, visibility) => ({ id, categoryId, ownerId, spaceUserId, visibility });
assert.equal(noteLevel(bob, note("n1", "aShared", BOB, ALICE, "private"), c), 2, "my own note inside someone's shared category");
assert.equal(noteLevel(bob, note("n2", "aPriv", BOB, ALICE, "edit"), c), 0, "my note under a private parent becomes invisible to me");
assert.equal(noteLevel(bob, note("n3", null, ALICE, ALICE, "read"), c), 1, "uncategorized note in personal space");
assert.equal(noteLevel(bob, note("n4", null, ALICE, ALICE, "read"), ctx([ALICE])), 0);
assert.equal(noteLevel(bob, note("n5", "pub", null, null, "edit"), c), 2);
assert.equal(noteLevel(bob, note("n6", "pub", ALICE, null, "read"), c), 1);

assert.equal(canEditLevel(bobViewer, 2), false, "viewer role never edits");
assert.equal(canEditLevel(bob, 2), true);
assert.equal(canManage(bob, { ownerId: ALICE }), false);
assert.equal(canManage(alice, { ownerId: ALICE }), true);
assert.equal(canManage(bob, { ownerId: null }), false, "ownerless public items: admin only");
assert.equal(canManage(admin, { ownerId: null }), true);
assert.equal(canCreateInSpace(bob, null), true);
assert.equal(canCreateInSpace(bob, ALICE), false);
assert.equal(canCreateInSpace(bobViewer, null), false);
assert.equal(defaultVisibility(null, ALICE), "private");
assert.equal(defaultVisibility(null, null), "edit");
assert.equal(defaultVisibility("read", ALICE), "read");

// 循環資料不應無限遞迴
const loop = { categories: new Map([["x", cat("x", "y", null, null, "edit")], ["y", cat("y", "x", null, null, "edit")]]), hiddenSpaces: new Set() };
assert.equal(categoryLevel(bob, "x", loop), 0);
console.log("ACCESS TESTS PASSED");
