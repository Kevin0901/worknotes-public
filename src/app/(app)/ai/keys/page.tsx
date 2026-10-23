import type { Metadata } from "next";
import { AiKeysPage } from "@/components/ai/AiKeysPage";
import { requirePageViewer } from "@/lib/auth";
import { trackPageView } from "@/lib/logs";
import { LoginRequired } from "../LoginRequired";

export const metadata: Metadata = { title: "AI API 金鑰" };

export default async function AiKeys() {
  const viewer = await requirePageViewer("/ai/keys");
  await trackPageView("/ai/keys", viewer);
  if (!viewer.user && !viewer.admin) return <LoginRequired next="/ai/keys" />;
  return <AiKeysPage isUser={!!viewer.user} />;
}
