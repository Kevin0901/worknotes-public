"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, LayoutDashboard, LogOut, ScrollText, Settings, Users } from "lucide-react";
import { ThemeToggle } from "../ThemeToggle";
import { Logo } from "../Logo";

const TABS = [
  { href: "/admin", label: "總覽", icon: LayoutDashboard },
  { href: "/admin/users", label: "帳號審核", icon: Users },
  { href: "/admin/logs", label: "訪問紀錄", icon: ScrollText },
  { href: "/admin/settings", label: "系統設定", icon: Settings },
];

export function AdminNav({ username, siteTitle }: { username: string; siteTitle: string }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-2 px-4 md:px-8">
        <Link href="/admin" className="flex items-center gap-2 font-semibold">
          <Logo size={28} />
          <span className="hidden sm:inline">{siteTitle}</span>
          <span className="rounded bg-hover px-1.5 py-0.5 text-xs font-medium text-muted">管理後台</span>
        </Link>
        <div className="flex-1" />
        <Link href="/" className="btn-ghost">
          <BookOpen size={16} />
          <span className="hidden sm:inline">前往筆記</span>
        </Link>
        <ThemeToggle />
        <button
          type="button"
          className="btn-ghost"
          title={`登出 ${username}`}
          onClick={() => fetch("/api/admin/logout", { method: "POST" }).finally(() => (window.location.href = "/admin/login"))}
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">登出</span>
        </button>
      </div>
      <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 md:px-7">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${
                active ? "border-accent font-medium text-fg" : "border-transparent text-muted hover:text-fg"
              }`}
            >
              <Icon size={15} />
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
