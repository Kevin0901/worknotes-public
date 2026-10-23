import type { Metadata } from "next";
import { AiChat } from "@/components/ai/AiChat";
import { requirePageViewer } from "@/lib/auth";
import { trackPageView } from "@/lib/logs";
import { LoginRequired } from "./LoginRequired";

export const metadata: Metadata = { title: "AI 助理" };

export default async function AiPage() {
  const viewer = await requirePageViewer("/ai");
  await trackPageView("/ai", viewer);
  if (!viewer.user && !viewer.admin) return <LoginRequired next="/ai" />;
  return (
    <div className="h-full">
      <AiChat isUser={!!viewer.user} />
    </div>
  );
}
