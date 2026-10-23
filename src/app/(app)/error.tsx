"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold">發生錯誤</h1>
        <p className="mt-2 text-sm text-muted">
          無法載入資料，可能是資料庫暫時無法連線。請稍後再試。
          {error.digest && <span className="mt-1 block font-mono text-xs text-faint">代碼：{error.digest}</span>}
        </p>
        <button type="button" className="btn mt-4" onClick={reset}>
          重新嘗試
        </button>
      </div>
    </div>
  );
}
