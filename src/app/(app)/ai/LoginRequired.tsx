import Link from "next/link";
import { Bot } from "lucide-react";

/** 網站設定為「不需登入即可瀏覽」時，訪客仍不能使用 AI 助理 */
export function LoginRequired({ next }: { next: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Bot size={24} />
      </span>
      <h1 className="mt-3 text-xl font-bold">AI 助理需要登入</h1>
      <p className="mt-1 text-sm text-muted">登入後才能使用自己的 API 金鑰與 AI 對話。</p>
      <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn-primary mt-4">
        登入
      </Link>
    </div>
  );
}
