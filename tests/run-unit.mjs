// 單元測試：node tests/run-unit.mjs [檔名關鍵字]
// 每個 tests/unit/*.test.(ts|mjs) 各自用一個子行程執行（以 jiti 直接載入 TypeScript）。
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const filter = process.argv[2] ?? "";

if (process.argv[2] === "--one") {
  const { createJiti } = await import("jiti");
  const root = join(here, "..");
  const jiti = createJiti(import.meta.url, {
    alias: { "server-only": join(here, "stubs", "server-only.mjs"), "@": join(root, "src") },
  });
  await jiti.import(process.argv[3]);
} else {
  const files = readdirSync(join(here, "unit")).filter((f) => /\.test\.(ts|mjs)$/.test(f) && f.includes(filter));
  let failed = 0;
  for (const f of files) {
    console.log(`\n▶ ${f}`);
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--one", join(here, "unit", f)], { stdio: "inherit" });
    if (r.status !== 0) failed++;
  }
  console.log(failed ? `\n✗ ${failed} 個測試檔失敗` : `\n✓ ${files.length} 個測試檔全部通過`);
  process.exit(failed ? 1 : 0);
}
