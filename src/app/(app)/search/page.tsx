import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { requirePageViewer } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { trackPageView } from "@/lib/logs";
import { searchNotes } from "@/lib/notes";
import { categoryLabel } from "@/lib/tree";
import { SEARCH_PLACEHOLDER } from "@/lib/site-content";
import { loadWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "搜尋" };

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-accent-soft px-0.5 text-fg">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = q.trim().slice(0, 100);
  const viewer = await requirePageViewer(`/search${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  await trackPageView(`/search${query ? `?q=${query}` : ""}`, viewer);
  const ws = await loadWorkspace();
  const tree = ws.tree;
  const results = query ? await searchNotes(ws, query) : [];
  const terms = query.split(/\s+/).filter(Boolean);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-6 md:px-10 md:pt-10">
      <h1 className="mb-4 text-2xl font-bold">全文搜尋</h1>
      <form action="/search" className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            name="q"
            defaultValue={query}
            autoFocus
            placeholder={SEARCH_PLACEHOLDER}
            className="input pl-9"
          />
        </div>
        <button type="submit" className="btn-primary">
          搜尋
        </button>
      </form>

      {query && (
        <p className="mt-4 text-sm text-muted">
          「{query}」共找到 {results.length} 篇筆記{results.length >= 100 ? "（只顯示前 100 篇）" : ""}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {results.map((r) => (
          <Link key={r.id} href={`/n/${r.id}`} className="card block p-4 transition-colors hover:bg-hover">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-semibold">
                {r.icon || "📄"} <Highlight text={r.title} terms={terms} />
              </span>
              <span className="text-xs text-faint">{formatDateTime(r.updatedAt)}</span>
            </div>
            <div className="mt-0.5 text-xs text-faint">{ws.spaceName(r.spaceUserId)} · {categoryLabel(tree.categories, r.categoryId)}</div>
            <p className="mt-2 break-all font-mono text-[13px] leading-relaxed text-muted">
              <Highlight text={r.snippet} terms={terms} />
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
