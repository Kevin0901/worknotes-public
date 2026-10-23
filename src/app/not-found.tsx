import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[70dvh] items-center justify-center p-6">
      <div className="text-center">
        <div className="text-5xl">🔍</div>
        <h1 className="mt-4 text-xl font-semibold">找不到這個頁面</h1>
        <p className="mt-2 text-sm text-muted">筆記或分類可能已被刪除或移動。</p>
        <Link href="/" className="btn mt-6">
          回到首頁
        </Link>
      </div>
    </div>
  );
}
