import type { Metadata } from "next";
import { TrashList } from "@/components/TrashList";
import { requirePageViewer } from "@/lib/auth";
import { trackPageView } from "@/lib/logs";
import { listTrash } from "@/lib/notes";
import { loadWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "垃圾桶" };

export default async function TrashPage() {
  const viewer = await requirePageViewer("/trash");
  await trackPageView("/trash", viewer);
  const notes = await listTrash(await loadWorkspace());
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-6 md:px-10 md:pt-10">
      <h1 className="text-2xl font-bold">🗑️ 垃圾桶</h1>
      <p className="mt-2 text-sm text-muted">刪除的筆記會先放在這裡，可以還原或永久刪除。</p>
      <TrashList notes={notes} />
    </div>
  );
}
