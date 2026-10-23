import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Pin, Tag } from "lucide-react";
import { CategoryActions } from "@/components/CategoryActions";
import { AccessBadge } from "@/components/AccessBadge";
import { VisibilityIcon } from "@/components/Visibility";
import { requirePageViewer } from "@/lib/auth";
import { formatDateTime, plainExcerpt } from "@/lib/format";
import { isUuid } from "@/lib/http";
import { trackPageView } from "@/lib/logs";
import { notesInCategory } from "@/lib/notes";
import { categoryPath, childrenMap, countNotesDeep, spaceOf, UNCATEGORIZED } from "@/lib/tree";
import { loadWorkspace } from "@/lib/workspace";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ space?: string }> };

export default async function CategoryPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { space: spaceParam } = await searchParams;
  const isUncategorized = id === UNCATEGORIZED;
  const viewer = await requirePageViewer(`/c/${id}${isUncategorized && spaceParam ? `?space=${spaceParam}` : ""}`);
  if (!isUncategorized && !isUuid(id)) notFound();

  const ws = await loadWorkspace();
  const tree = ws.tree;
  const category = isUncategorized ? null : ws.categoryById.get(id);
  if (!isUncategorized && !category) notFound();
  const spaceUserId = category ? category.spaceUserId : isUuid(spaceParam) ? spaceParam : null;
  const space = spaceOf(tree, spaceUserId);
  if (!space) notFound();
  await trackPageView(`/c/${id}`, viewer);

  const notes = await notesInCategory(ws, category?.id ?? null, spaceUserId);
  const subs = category ? childrenMap(tree.categories).get(category.id) ?? [] : [];
  const path = category ? categoryPath(tree.categories, category.id) : [];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-5 md:px-10 md:pt-8">
      <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted">
        <Link href="/" className="hover:text-fg">
          首頁
        </Link>
        <ChevronRight size={14} className="text-faint" />
        <span>{space.name}</span>
        {path.slice(0, -1).map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <ChevronRight size={14} className="text-faint" />
            <Link href={`/c/${c.id}`} className="hover:text-fg">
              {c.icon} {c.name}
            </Link>
          </span>
        ))}
      </nav>

      <header className="mb-8 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.75rem] font-bold leading-tight md:text-[2.1rem]">
            <span className="mr-2">{category?.icon || (isUncategorized ? "📥" : "📁")}</span>
            {category?.name ?? "未分類"}
          </h1>
          {category && (
            <div className="mt-2 text-xs text-faint">
              <AccessBadge item={category} parentId={category.parentId} />
            </div>
          )}
        </div>
        <CategoryActions category={category ?? null} spaceUserId={spaceUserId} canCreate={space.canCreate} />
      </header>

      {subs.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-muted">子分類</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subs.map((s) => (
              <Link key={s.id} href={`/c/${s.id}`} className="card flex items-center gap-3 p-4 transition-colors hover:bg-hover">
                <span className="text-xl">{s.icon || "📁"}</span>
                <div className="min-w-0">
                  <div className="truncate font-medium">{s.name}</div>
                  <div className="text-xs text-faint">{countNotesDeep(tree, s.id)} 篇筆記</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">筆記（{notes.length}）</h2>
        {notes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-faint">
            這個分類目前沒有筆記
          </p>
        ) : (
          <div className="card divide-y divide-[var(--border)]">
            {notes.map((n) => (
              <Link key={n.id} href={`/n/${n.id}`} className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-hover">
                <span className="pt-0.5 text-lg leading-none">{n.icon || "📄"}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="flex items-center gap-1.5 font-medium">
                      {n.title}
                      {n.pinned && <Pin size={12} className="text-faint" />}
                      {n.visibility !== (category?.visibility ?? n.visibility) && (
                        <VisibilityIcon visibility={n.visibility} size={12} className="text-faint" />
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-faint">{formatDateTime(n.updatedAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{plainExcerpt(n.excerpt, 180)}</p>
                  {n.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {n.tags.slice(0, 6).map((t) => (
                        <span key={t} className="chip">
                          <Tag size={10} />
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
