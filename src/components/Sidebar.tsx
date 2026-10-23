"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, ArrowLeftRight, BookOpen, Bot, CalendarDays, ChevronRight, Ellipsis, EyeOff, FilePlus, FileText, FolderInput,
  FolderPlus, Globe, House, Inbox, Pencil, Pin, PinOff, Plus, Search, Share2, Shield, Trash2, UserRound,
} from "lucide-react";
import { childrenMap, notesByCategory, spaceRoots, UNCATEGORIZED, uncategorizedHref } from "@/lib/tree";
import type { Category, GuideMeta, NoteMeta, Space, Tree } from "@/lib/types";
import { DropdownMenu, type MenuItem } from "./DropdownMenu";
import { VisibilityIcon } from "./Visibility";
import { useWorkspace, useWorkspaceActions, visibilityChanged } from "./workspace";
import { Logo } from "./Logo";

const EXPANDED_KEY = "wn:expanded";

function useExpanded(defaults: string[]) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(defaults));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_KEY);
      if (raw) setExpanded(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
    } catch {
      /* ignore */
    }
  }, [expanded, loaded]);

  return [expanded, setExpanded] as const;
}

const COLLAPSED_SPACES_KEY = "wn:collapsed-spaces";

/** 第一層（空間）預設展開，只記住收合的 */
function useCollapsedSpaces() {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_SPACES_KEY);
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(COLLAPSED_SPACES_KEY, JSON.stringify([...collapsed]));
    } catch {
      /* ignore */
    }
  }, [collapsed, loaded]);
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return [collapsed, toggle, setCollapsed] as const;
}

export function Sidebar({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { tree, viewer, siteTitle } = useWorkspace();
  const actions = useWorkspaceActions();
  const pathname = usePathname();
  const kids = useMemo(() => childrenMap(tree.categories), [tree.categories]);
  const notesMap = useMemo(() => notesByCategory(tree.notes), [tree.notes]);
  const [expanded, setExpanded] = useExpanded((kids.get(null) ?? []).map((c) => c.id));
  const [collapsedSpaces, toggleSpace, setCollapsedSpaces] = useCollapsedSpaces();

  // 進入筆記或分類時自動展開其上層（含所在空間）
  useEffect(() => {
    const m = pathname.match(/^\/(n|c)\/([0-9a-f-]{36})/);
    if (!m) return;
    const byId = new Map(tree.categories.map((c) => [c.id, c]));
    const item = m[1] === "n" ? tree.notes.find((n) => n.id === m[2]) : byId.get(m[2]);
    if (!item) return;
    let catId: string | null | undefined = "categoryId" in item ? item.categoryId : item.parentId;
    const toOpen: string[] = [];
    while (catId) {
      toOpen.push(catId);
      catId = byId.get(catId)?.parentId;
    }
    if (toOpen.length) {
      setExpanded((prev) => {
        if (toOpen.every((id) => prev.has(id))) return prev;
        const next = new Set(prev);
        toOpen.forEach((id) => next.add(id));
        return next;
      });
    }
    const key = item.spaceUserId ?? "public";
    setCollapsedSpaces((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, [pathname, tree, setExpanded, setCollapsedSpaces]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const navItem = (href: string, icon: React.ReactNode, label: string) => (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-hover ${
        pathname === href ? "bg-active font-medium text-fg" : "text-muted"
      }`}
    >
      {icon}
      {label}
    </Link>
  );

  return (
    <div className="flex h-full w-full flex-col">
      <div className="px-3 pb-2 pt-3">
        <Link href="/" className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover">
          <Logo size={28} />
          <span className="truncate text-[15px] font-semibold tracking-wide">{siteTitle}</span>
        </Link>
        <button
          type="button"
          onClick={onOpenSearch}
          className="mt-2 flex w-full items-center gap-2 rounded-md border border-line bg-bg px-2.5 py-1.5 text-sm text-faint hover:text-muted"
        >
          <Search size={15} />
          <span className="flex-1 text-left">搜尋筆記…</span>
          <kbd className="hidden rounded border border-line px-1 text-[10px] md:inline">Ctrl K</kbd>
        </button>
      </div>

      <nav className="space-y-0.5 px-3">
        {navItem("/", <House size={16} />, "首頁")}
        {navItem("/calendar", <CalendarDays size={16} />, "行事曆")}
        {navItem("/search", <Search size={16} />, "全文搜尋")}
        {navItem("/ai", <Bot size={16} />, "AI 助理")}
      </nav>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto thin-scroll px-2 pb-3">
        {tree.spaces.map((space) => (
          <SpaceSection
            key={space.key}
            space={space}
            tree={tree}
            kids={kids}
            notesMap={notesMap}
            open={!collapsedSpaces.has(space.key)}
            onToggle={() => toggleSpace(space.key)}
            expanded={expanded}
            toggle={toggle}
            pathname={pathname}
          />
        ))}
      </div>

      <div className="space-y-0.5 border-t border-line px-3 py-2">
        {navItem("/transfer", <ArrowLeftRight size={16} />, "匯入／匯出")}
        {navItem("/trash", <Trash2 size={16} />, "垃圾桶")}
        {viewer.isAdmin && navItem("/admin", <Shield size={16} />, "管理後台")}
      </div>
    </div>
  );
}

function SpaceSection({
  space,
  tree,
  kids,
  notesMap,
  open,
  onToggle,
  expanded,
  toggle,
  pathname,
}: {
  space: Space;
  tree: Tree;
  kids: Map<string | null, Category[]>;
  notesMap: Map<string | null, NoteMeta[]>;
  open: boolean;
  onToggle: () => void;
  expanded: Set<string>;
  toggle: (id: string) => void;
  pathname: string;
}) {
  const actions = useWorkspaceActions();
  const searchParams = useSearchParams();
  const roots = spaceRoots(tree.categories, space.userId);
  const guides = tree.guides.filter((g) => g.spaceUserId === space.userId);
  const uncategorized = (notesMap.get(null) ?? []).filter((n) => n.spaceUserId === space.userId);
  const uncategorizedActive =
    pathname === `/c/${UNCATEGORIZED}` && (searchParams.get("space") ?? null) === (space.userId ?? null);

  const menu: MenuItem[] = [
    ...(space.canCreate
      ? [
          { label: "新增分類", icon: <FolderPlus size={15} />, onSelect: () => actions.createCategory(null, space.userId) },
          { label: "新增筆記", icon: <FilePlus size={15} />, onSelect: () => actions.createNote(null, space.userId) },
        ]
      : []),
    ...(space.isMine
      ? [
          { label: "", onSelect: () => {}, divider: true },
          space.hidden
            ? { label: "公開我的空間", icon: <Share2 size={15} />, onSelect: () => actions.setSpaceHidden(false) }
            : { label: "對其他人隱藏我的空間", icon: <EyeOff size={15} />, onSelect: () => actions.setSpaceHidden(true) },
        ]
      : []),
  ];

  return (
    <div className="mb-2">
      <div className="group flex items-center gap-0.5 rounded-md pr-1 hover:bg-hover">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1.5 text-left text-xs font-semibold tracking-wide text-faint hover:text-muted"
          aria-expanded={open}
        >
          <ChevronRight size={13} className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
          {space.userId ? <UserRound size={13} className="shrink-0" /> : <Globe size={13} className="shrink-0" />}
          <span className="truncate">{space.name}</span>
          {space.hidden && (
            <span className="flex shrink-0 items-center gap-0.5 rounded bg-hover px-1 py-px text-[10px] font-normal" title="其他使用者看不到這個空間">
              <EyeOff size={10} /> 已隱藏
            </span>
          )}
        </button>
        {menu.length > 0 && (
          <div className="flex shrink-0 items-center opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
            <DropdownMenu label={`${space.name}操作`} trigger={<Ellipsis size={15} />} items={menu} triggerClassName="icon-btn h-6 w-6" />
            {space.canCreate && (
              <button
                type="button"
                className="icon-btn h-6 w-6"
                title={`在${space.name}新增分類`}
                onClick={() => actions.createCategory(null, space.userId)}
              >
                <Plus size={15} />
              </button>
            )}
          </div>
        )}
      </div>

      {open && (
        <div>
          {guides.map((g) => (
            <GuideRow key={g.slug} guide={g} active={pathname === g.href} />
          ))}
          {roots.length === 0 && uncategorized.length === 0 && guides.length === 0 && (
            <p className="py-1 pl-8 pr-2 text-xs text-faint">
              {space.canCreate ? "還沒有內容，按右側的 ＋ 新增分類" : "沒有內容"}
            </p>
          )}
          {roots.map((cat) => (
            <CategoryNode
              key={cat.id}
              category={cat}
              depth={0}
              tree={tree}
              kids={kids}
              notesMap={notesMap}
              expanded={expanded}
              toggle={toggle}
              pathname={pathname}
            />
          ))}
          {uncategorized.length > 0 && (
            <Link
              href={uncategorizedHref(space.userId)}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm hover:bg-hover ${
                uncategorizedActive ? "bg-active font-medium" : "text-muted"
              }`}
            >
              <Inbox size={15} className="ml-5" />
              <span className="flex-1 truncate">未分類</span>
              <span className="text-xs text-faint">{uncategorized.length}</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/** 互動教學頁：內容在程式中，只能開啟，權限由擁有者或管理員在教學頁設定 */
function GuideRow({ guide, active }: { guide: GuideMeta; active: boolean }) {
  return (
    <Link
      href={guide.href}
      className={`flex items-center gap-1.5 rounded-md py-1.5 pl-[30px] pr-2 text-sm hover:bg-hover ${active ? "bg-active font-medium text-fg" : "text-muted hover:text-fg"}`}
      title="互動教學"
    >
      <span className="w-5 shrink-0 text-center">{guide.icon || <BookOpen size={14} className="inline text-faint" />}</span>
      <span className="flex-1 truncate">{guide.title}</span>
      {guide.visibility === "private" && <VisibilityIcon visibility="private" size={12} className="shrink-0 text-faint" />}
      <span className="shrink-0 rounded bg-accent-soft px-1 py-px text-[10px] text-accent">教學</span>
    </Link>
  );
}

function CategoryNode({
  category,
  depth,
  kids,
  notesMap,
  expanded,
  toggle,
  pathname,
  tree,
}: {
  category: Category;
  depth: number;
  tree: Tree;
  kids: Map<string | null, Category[]>;
  notesMap: Map<string | null, NoteMeta[]>;
  expanded: Set<string>;
  toggle: (id: string) => void;
  pathname: string;
}) {
  const actions = useWorkspaceActions();
  const children = kids.get(category.id) ?? [];
  const notes = notesMap.get(category.id) ?? [];
  const isOpen = expanded.has(category.id);
  const active = pathname === `/c/${category.id}`;
  const pad = 6 + depth * 14;

  const canEdit = category.canEdit;
  const menu: MenuItem[] = [
    { label: "新增筆記", icon: <FilePlus size={15} />, onSelect: () => actions.createNote(category.id) },
    { label: "新增子分類", icon: <FolderPlus size={15} />, onSelect: () => actions.createCategory(category.id) },
    { label: "", onSelect: () => {}, divider: true },
    { label: "重新命名／圖示", icon: <Pencil size={15} />, onSelect: () => actions.editCategory(category) },
    ...(category.canManage
      ? [{ label: "分享與權限", icon: <Share2 size={15} />, onSelect: () => actions.shareCategory(category) }]
      : []),
    { label: "移動到…", icon: <FolderInput size={15} />, onSelect: () => actions.moveCategoryTo(category) },
    { label: "上移", icon: <ArrowUp size={15} />, onSelect: () => actions.reorderCategory(category, "up") },
    { label: "下移", icon: <ArrowDown size={15} />, onSelect: () => actions.reorderCategory(category, "down") },
    { label: "", onSelect: () => {}, divider: true },
    { label: "刪除分類", icon: <Trash2 size={15} />, danger: true, onSelect: () => actions.deleteCategory(category) },
  ];

  return (
    <div>
      <div
        className={`group flex items-center gap-0.5 rounded-md pr-1 hover:bg-hover ${active ? "bg-active" : ""}`}
        style={{ paddingLeft: pad }}
      >
        <button
          type="button"
          onClick={() => toggle(category.id)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-faint hover:bg-active hover:text-fg"
          aria-label={isOpen ? "收合" : "展開"}
        >
          <ChevronRight size={14} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
        </button>
        <Link
          href={`/c/${category.id}`}
          className={`flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-sm ${active ? "font-medium" : ""}`}
        >
          <span className="w-5 shrink-0 text-center">{category.icon || "📁"}</span>
          <span className="truncate">{category.name}</span>
          {visibilityChanged(tree, category, category.parentId) && (
            <VisibilityIcon visibility={category.visibility} size={12} className="shrink-0 text-faint" />
          )}
        </Link>
        {canEdit && (
          <div className="flex shrink-0 items-center opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
            <DropdownMenu label="分類操作" trigger={<Ellipsis size={15} />} items={menu} triggerClassName="icon-btn h-6 w-6" />
            <button
              type="button"
              className="icon-btn h-6 w-6"
              title="在此分類新增筆記"
              onClick={() => actions.createNote(category.id)}
            >
              <Plus size={15} />
            </button>
          </div>
        )}
      </div>

      {isOpen && (
        <div>
          {children.map((child) => (
            <CategoryNode
              key={child.id}
              category={child}
              depth={depth + 1}
              tree={tree}
              kids={kids}
              notesMap={notesMap}
              expanded={expanded}
              toggle={toggle}
              pathname={pathname}
            />
          ))}
          {notes.map((note) => (
            <NoteRow key={note.id} note={note} depth={depth + 1} pathname={pathname} tree={tree} />
          ))}
          {children.length === 0 && notes.length === 0 && (
            <div className="py-1 text-xs text-faint" style={{ paddingLeft: pad + 34 }}>
              沒有內容
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NoteRow({ note, depth, pathname, tree }: { note: NoteMeta; depth: number; pathname: string; tree: Tree }) {
  const actions = useWorkspaceActions();
  const active = pathname === `/n/${note.id}`;
  const canEdit = note.canEdit;
  const menu: MenuItem[] = [
    { label: "重新命名／圖示", icon: <Pencil size={15} />, onSelect: () => actions.renameNote(note) },
    ...(note.canManage ? [{ label: "分享與權限", icon: <Share2 size={15} />, onSelect: () => actions.shareNote(note) }] : []),
    { label: "移動到…", icon: <FolderInput size={15} />, onSelect: () => actions.moveNoteTo(note) },
    {
      label: note.pinned ? "取消釘選" : "釘選",
      icon: note.pinned ? <PinOff size={15} /> : <Pin size={15} />,
      onSelect: () => actions.togglePin(note),
    },
    { label: "上移", icon: <ArrowUp size={15} />, onSelect: () => actions.reorderNote(note, "up") },
    { label: "下移", icon: <ArrowDown size={15} />, onSelect: () => actions.reorderNote(note, "down") },
    { label: "", onSelect: () => {}, divider: true },
    { label: "移到垃圾桶", icon: <Trash2 size={15} />, danger: true, onSelect: () => actions.trashNote(note) },
  ];

  return (
    <div
      className={`group flex items-center gap-0.5 rounded-md pr-1 hover:bg-hover ${active ? "bg-active" : ""}`}
      style={{ paddingLeft: 6 + depth * 14 + 24 }}
    >
      <Link
        href={`/n/${note.id}`}
        className={`flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-sm ${active ? "font-medium text-fg" : "text-muted hover:text-fg"}`}
      >
        <span className="w-5 shrink-0 text-center">
          {note.icon || <FileText size={14} className="inline text-faint" />}
        </span>
        <span className="truncate">{note.title}</span>
        {note.pinned && <Pin size={11} className="shrink-0 text-faint" />}
        {visibilityChanged(tree, note, note.categoryId) && (
          <VisibilityIcon visibility={note.visibility} size={12} className="shrink-0 text-faint" />
        )}
      </Link>
      {canEdit && (
        <div className="shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <DropdownMenu label="筆記操作" trigger={<Ellipsis size={15} />} items={menu} triggerClassName="icon-btn h-6 w-6" />
        </div>
      )}
    </div>
  );
}
