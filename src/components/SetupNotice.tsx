import Link from "next/link";
import { SEED_DESCRIPTION } from "@/lib/site-content";

/** 尚未設定資料庫時顯示的引導頁 */
export function SetupNotice() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="card w-full max-w-lg p-6 md:p-8">
        <h1 className="text-xl font-bold">系統尚未完成設定</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          找不到資料庫連線（<code className="font-mono">DATABASE_URL</code>）。請到 Vercel 專案的
          <b> Storage </b>頁面建立 <b>Neon Postgres</b> 並連結到此專案，完成後重新部署即可。
        </p>
        <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-muted">
          <li>Vercel → 專案 → Storage → Create Database → 選擇 Neon（免費方案即可）</li>
          <li>Connect Project 選擇此專案（會自動加入 DATABASE_URL 環境變數）</li>
          <li>Deployments → 最新部署 → Redeploy</li>
        </ol>
        <p className="mt-4 text-sm text-muted">
          第一次連上資料庫時，系統會自動建立資料表{SEED_DESCRIPTION}。
        </p>
        <div className="mt-6">
          <Link href="/admin" className="btn">
            前往管理後台
          </Link>
        </div>
      </div>
    </div>
  );
}
