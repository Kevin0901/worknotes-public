"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Download, FileUp, FolderUp, Upload } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import { buildPlan, cleanName, type ImportPlan } from "@/lib/transfer/notion-import";
import { flattenCategories } from "@/lib/tree";
import type { Category, Space, Tree } from "@/lib/types";
import { useToast } from "../Providers";
import { useWorkspace } from "../workspace";
import { exportZip, readFilesToMap } from "./client";

const MAX_BATCH_NOTES = 100;
// Vercel 請求上限 4.5 MB；中文在 UTF-8 佔 3 bytes，每批控制在 100 萬字以內
const MAX_BATCH_CHARS = 1_000_000;

type Option = { value: string; label: string; disabled?: boolean };

/** 依空間分組的分類清單；editableOnly 時不能放入的分類會停用 */
function categoryOptions(tree: Tree, editableOnly: boolean): Option[] {
  const out: Option[] = [];
  for (const space of tree.spaces) {
    const cats = tree.categories.filter((c) => c.spaceUserId === space.userId);
    if (cats.length === 0 || (editableOnly && !cats.some((c) => c.canEdit))) continue;
    if (tree.spaces.length > 1) out.push({ value: `space:${space.key}`, label: `── ${space.name} ──`, disabled: true });
    for (const { category, depth } of flattenCategories(cats)) {
      out.push({
        value: category.id,
        label: `${"　".repeat(depth)}${category.icon ? category.icon + " " : ""}${category.name}`,
        disabled: editableOnly && !category.canEdit,
      });
    }
  }
  return out;
}

export function TransferPanel({ initialCategory }: { initialCategory: string | null }) {
  const { tree, viewer, siteTitle } = useWorkspace();
  const importOptions = useMemo(() => categoryOptions(tree, true), [tree]);
  const exportOptions = useMemo(() => categoryOptions(tree, false), [tree]);
  const spaces = tree.spaces.filter((s) => s.canCreate);

  return (
    <div className="space-y-6">
      {viewer.canEdit && <ImportCard options={importOptions} spaces={spaces} />}
      <ExportCard
        options={exportOptions}
        initialCategory={initialCategory}
        siteTitle={siteTitle}
        categories={tree.categories}
        spaces={tree.spaces}
      />
    </div>
  );
}

function ImportCard({ options, spaces }: { options: Option[]; spaces: Space[] }) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [source, setSource] = useState("");
  const [target, setTarget] = useState<"new" | "existing">("new");
  const [newName, setNewName] = useState("");
  const [existingId, setExistingId] = useState(options.find((o) => !o.disabled)?.value ?? "");
  const [space, setSpace] = useState(spaces.find((s) => s.isMine)?.key ?? spaces[0]?.key ?? "public");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ categoryId: string; count: number } | null>(null);
  const [reading, setReading] = useState(false);

  const load = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setReading(true);
    setResult(null);
    try {
      const files = Array.from(list);
      const map = await readFilesToMap(files);
      const p = buildPlan(map);
      if (p.notes.length === 0) {
        toast("找不到可匯入的 Markdown（.md）或 CSV 檔案", "error");
        setPlan(null);
        return;
      }
      const label = files.length === 1 ? files[0].name.replace(/\.(zip|md|markdown|txt|csv)$/i, "") : `${files.length} 個檔案`;
      setSource(label);
      const d = new Date();
      setNewName(`Notion 匯入 ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      setPlan(p);
    } catch (err) {
      toast(`讀取檔案失敗：${errorMessage(err)}`, "error");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (folderRef.current) folderRef.current.value = "";
    }
  };

  const run = async () => {
    if (!plan) return;
    if (target === "existing" && !existingId) return toast("請選擇要放入的分類", "error");
    setProgress({ done: 0, total: plan.notes.length });
    try {
      let rootId: string;
      if (target === "new") {
        const res = await api<{ category: Category }>("POST", "/api/categories", {
          name: newName.trim() || "Notion 匯入",
          icon: "📥",
          parentId: null,
          space,
        });
        rootId = res.category.id;
      } else {
        rootId = existingId;
      }
      const { map } = await api<{ map: Record<string, string> }>("POST", "/api/import/categories", {
        parentId: rootId,
        categories: plan.categories,
      });

      const notes = plan.notes.map((n) => ({
        categoryId: n.categoryKey ? map[n.categoryKey] : rootId,
        title: n.title,
        content: n.content,
        tags: ["匯入"],
      }));
      let done = 0;
      while (done < notes.length) {
        const batch: typeof notes = [];
        let chars = 0;
        while (done + batch.length < notes.length && batch.length < MAX_BATCH_NOTES) {
          const next = notes[done + batch.length];
          if (batch.length > 0 && chars + next.content.length > MAX_BATCH_CHARS) break;
          batch.push(next);
          chars += next.content.length;
        }
        const last = done + batch.length >= notes.length;
        await api("POST", "/api/import/notes", { notes: batch, last, source, total: notes.length });
        done += batch.length;
        setProgress({ done, total: notes.length });
      }
      setResult({ categoryId: rootId, count: notes.length });
      setPlan(null);
      toast(`已匯入 ${notes.length} 篇筆記`);
      router.refresh();
    } catch (err) {
      toast(`匯入失敗：${errorMessage(err)}（已匯入的部分會保留）`, "error");
    } finally {
      setProgress(null);
    }
  };

  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Upload size={18} /> 從 Notion 匯入
      </h2>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>
          在 Notion 頁面右上角 <b>⋯</b> → <b>匯出（Export）</b>，格式選 <b>Markdown &amp; CSV</b>，開啟「包含子頁面」與「為子頁面建立資料夾」。
        </li>
        <li>把下載的 ZIP 直接選進來即可（不用解壓縮）。也可以選單一或多個 .md、.csv 檔案。</li>
        <li>子頁面會變成子分類；資料庫（CSV）會轉成表格筆記；頁面之間的連結會轉成 [[筆記連結]]。圖片與附件目前不會匯入。</li>
      </ol>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".zip,.md,.markdown,.txt,.csv"
          multiple
          className="hidden"
          onChange={(e) => load(e.target.files)}
        />
        <input
          ref={folderRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => load(e.target.files)}
          {...({ webkitdirectory: "" } as Record<string, string>)}
        />
        <button type="button" className="btn-primary" disabled={reading || !!progress} onClick={() => fileRef.current?.click()}>
          <FileUp size={15} /> {reading ? "讀取中…" : "選擇 ZIP 或 Markdown 檔"}
        </button>
        <button type="button" className="btn" disabled={reading || !!progress} onClick={() => folderRef.current?.click()}>
          <FolderUp size={15} /> 選擇已解壓縮的資料夾
        </button>
      </div>

      {plan && (
        <div className="mt-5 rounded-lg border border-line p-4">
          <div className="text-sm">
            <b>{source}</b>：{plan.categories.length} 個資料夾（子分類）、{plan.notes.length} 篇筆記
            {plan.skipped.length > 0 && <span className="text-warn">，{plan.skipped.length} 個附件不會匯入</span>}
          </div>
          <ul className="mt-2 max-h-48 overflow-y-auto thin-scroll rounded-md bg-subtle p-2 font-mono text-xs text-muted">
            {plan.notes.slice(0, 200).map((n) => (
              <li key={n.sourcePath} className="truncate">
                {n.sourcePath.split("/").map(cleanName).join(" / ")}
              </li>
            ))}
            {plan.notes.length > 200 && <li>…還有 {plan.notes.length - 200} 篇</li>}
          </ul>

          <fieldset className="mt-4 space-y-2 text-sm">
            <legend className="mb-1 font-medium">匯入到</legend>
            <label className="flex flex-wrap items-center gap-2">
              <input type="radio" checked={target === "new"} onChange={() => setTarget("new")} className="accent-[var(--accent)]" />
              建立新分類
              <input
                className="input ml-1 max-w-xs py-1"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={target !== "new"}
                maxLength={80}
              />
              {spaces.length > 1 && (
                <>
                  放在
                  <select
                    className="input w-auto py-1"
                    value={space}
                    onChange={(e) => setSpace(e.target.value)}
                    disabled={target !== "new"}
                  >
                    {spaces.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </label>
            {options.some((o) => !o.disabled) && (
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={target === "existing"}
                  onChange={() => setTarget("existing")}
                  className="accent-[var(--accent)]"
                />
                放到現有分類底下
                <select
                  className="input ml-1 max-w-xs py-1"
                  value={existingId}
                  onChange={(e) => setExistingId(e.target.value)}
                  disabled={target !== "existing"}
                >
                  {options.map((o) => (
                    <option key={o.value} value={o.value} disabled={o.disabled}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="text-xs text-muted">匯入的分類與筆記沿用所在位置的可見度（我的空間預設「僅自己可見」）。</p>
          </fieldset>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary" onClick={run} disabled={!!progress}>
              <Upload size={15} /> 開始匯入
            </button>
            <button type="button" className="btn" onClick={() => setPlan(null)} disabled={!!progress}>
              取消
            </button>
            {progress && <Progress done={progress.done} total={progress.total} />}
          </div>
        </div>
      )}

      {result && (
        <p className="mt-4 rounded-md bg-accent-soft px-3 py-2 text-sm">
          已匯入 {result.count} 篇筆記，
          <Link href={`/c/${result.categoryId}`} className="font-medium text-accent underline">
            前往查看
          </Link>
          。
        </p>
      )}
    </section>
  );
}

function ExportCard({
  options,
  initialCategory,
  siteTitle,
  categories,
  spaces,
}: {
  options: Option[];
  initialCategory: string | null;
  siteTitle: string;
  categories: Category[];
  spaces: Space[];
}) {
  const toast = useToast();
  const [scope, setScope] = useState(
    initialCategory && options.some((o) => o.value === initialCategory && !o.disabled) ? initialCategory : "",
  );
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const run = async () => {
    setProgress({ done: 0, total: 0 });
    try {
      const cat = categories.find((c) => c.id === scope);
      const count = await exportZip({
        categoryId: scope || null,
        label: cat ? cat.name : siteTitle,
        spaces,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      toast(`已匯出 ${count} 篇筆記`);
    } catch (err) {
      toast(`匯出失敗：${errorMessage(err)}`, "error");
    } finally {
      setProgress(null);
    }
  };

  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Download size={18} /> 匯出（可匯入 Notion）
      </h2>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>選擇要匯出的範圍，下載 ZIP（分類 → 資料夾、筆記 → Markdown 檔，筆記之間的連結會一併保留）。</li>
        <li>
          在 Notion 左側選單 <b>設定（Settings）</b> → <b>匯入（Import）</b> → <b>Text &amp; Markdown</b>，選擇這個 ZIP。
        </li>
        <li>單篇筆記也可以在筆記右上角 <b>⋯</b> → <b>下載 Markdown</b>。</li>
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select className="input w-auto max-w-full py-1.5" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="">全部看得到的筆記</option>
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="button" className="btn-primary" onClick={run} disabled={!!progress}>
          <Download size={15} /> {progress ? "產生中…" : "下載 ZIP"}
        </button>
        {progress && progress.total > 0 && <Progress done={progress.done} total={progress.total} />}
      </div>
    </section>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex min-w-48 flex-1 items-center gap-2 text-xs text-muted">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-hover">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      {done}/{total}
    </div>
  );
}
