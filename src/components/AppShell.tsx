"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LogIn, LogOut, Menu, QrCode, Search, Shield, ShieldAlert, UserRound, X } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { Tree, ViewerInfo } from "@/lib/types";
import { CommandPalette } from "./CommandPalette";
import { DropdownMenu } from "./DropdownMenu";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { WorkspaceProvider } from "./workspace";
import { Logo } from "./Logo";

function Avatar({ viewer }: { viewer: ViewerInfo }) {
  if (viewer.picture) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={viewer.picture} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
      {viewer.kind === "admin" ? <Shield size={14} /> : viewer.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function logout(kind: ViewerInfo["kind"]) {
  if (kind === "admin") {
    fetch("/api/admin/logout", { method: "POST" }).finally(() => (window.location.href = "/admin/login"));
    return;
  }
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/auth/logout";
  document.body.appendChild(form);
  form.submit();
}

export function AppShell({
  tree,
  viewer,
  siteTitle,
  children,
}: {
  tree: Tree;
  viewer: ViewerInfo;
  siteTitle: string;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => setDrawerOpen(false), [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 編輯器內的 Ctrl+K 是「插入連結」（編輯器已處理並 preventDefault）
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && !e.defaultPrevented) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
  }, [drawerOpen]);

  const openSearch = () => {
    setDrawerOpen(false);
    setPaletteOpen(true);
  };

  return (
    <WorkspaceProvider value={{ tree, viewer, siteTitle }}>
      <div className="flex h-dvh overflow-hidden">
        <aside className="hidden w-[264px] shrink-0 border-r border-line bg-subtle md:flex">
          <Sidebar onOpenSearch={openSearch} />
        </aside>

        {drawerOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-[86vw] max-w-[310px] bg-subtle shadow-pop">
              <Sidebar onOpenSearch={openSearch} />
              <button
                type="button"
                className="icon-btn absolute right-2 top-3"
                onClick={() => setDrawerOpen(false)}
                aria-label="關閉選單"
              >
                <X size={18} />
              </button>
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-bg/90 px-2 backdrop-blur md:px-4">
            <button type="button" className="icon-btn md:hidden" onClick={() => setDrawerOpen(true)} aria-label="開啟選單">
              <Menu size={20} />
            </button>
            <Link href="/" className="flex min-w-0 items-center gap-2 px-1 font-semibold md:hidden">
              <Logo size={24} />
              <span className="truncate">{siteTitle}</span>
            </Link>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden items-center gap-2 rounded-md border border-line px-2.5 py-1 text-sm text-faint hover:text-muted md:flex"
            >
              <Search size={14} />
              搜尋
              <kbd className="rounded border border-line px-1 text-[10px]">Ctrl K</kbd>
            </button>
            <button type="button" className="icon-btn md:hidden" onClick={() => setPaletteOpen(true)} aria-label="搜尋">
              <Search size={18} />
            </button>
            <ThemeToggle />
            {viewer.kind === "anonymous" ? (
              <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="btn-ghost">
                <LogIn size={16} />
                登入
              </Link>
            ) : (
              <DropdownMenu
                label={viewer.name}
                align="right"
                triggerClassName="ml-1 flex items-center rounded-full hover:opacity-80"
                trigger={<Avatar viewer={viewer} />}
                items={[
                  { label: viewer.email ?? viewer.name, onSelect: () => {}, disabled: true },
                  ...(viewer.kind === "user"
                    ? [
                        { label: "我的帳號與登入裝置", icon: <UserRound size={15} />, onSelect: () => router.push("/account") },
                        { label: "核准電腦登入", icon: <QrCode size={15} />, onSelect: () => router.push("/qr") },
                      ]
                    : []),
                  ...(viewer.isAdmin
                    ? [{ label: "管理後台", icon: <Shield size={15} />, onSelect: () => (window.location.href = "/admin") }]
                    : []),
                  { label: "", onSelect: () => {}, divider: true },
                  { label: "登出", icon: <LogOut size={15} />, onSelect: () => logout(viewer.kind) },
                ]}
              />
            )}
          </header>
          {viewer.sessionMethod === "qr" && (
            <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-warn/30 bg-warn-soft px-3 py-1.5 text-xs md:px-5">
              <ShieldAlert size={14} className="shrink-0 text-warn" />
              <span className="min-w-0 flex-1">
                這台電腦是用手機核准的臨時登入，將於 {formatDateTime(viewer.sessionExpiresAt)} 自動登出。
              </span>
              <button type="button" className="font-medium text-warn underline" onClick={() => logout(viewer.kind)}>
                立即登出
              </button>
            </div>
          )}
          <main id="main" className="min-h-0 flex-1 overflow-y-auto thin-scroll">
            {children}
          </main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </WorkspaceProvider>
  );
}
