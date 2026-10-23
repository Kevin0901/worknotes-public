import type { Metadata } from "next";
import { TransferPanel } from "@/components/transfer/TransferPanel";
import { requirePageViewer } from "@/lib/auth";
import { isUuid } from "@/lib/http";
import { trackPageView } from "@/lib/logs";

export const metadata: Metadata = { title: "匯入／匯出" };

export default async function TransferPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const viewer = await requirePageViewer("/transfer");
  await trackPageView("/transfer", viewer);
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 md:px-10 md:pt-10">
      <h1 className="text-2xl font-bold">匯入／匯出</h1>
      <p className="mt-2 text-sm text-muted">與 Notion 互相搬移筆記：支援 Notion 的「Markdown &amp; CSV」匯出檔，匯出的 ZIP 也能直接匯入 Notion。</p>
      <div className="mt-6">
        <TransferPanel initialCategory={category && isUuid(category) ? category : null} />
      </div>
    </div>
  );
}
