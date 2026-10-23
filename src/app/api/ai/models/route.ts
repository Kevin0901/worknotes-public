import type { NextRequest } from "next/server";
import { rateLimit, requireAiViewer, resolveKey } from "@/lib/ai/api";
import { listModels, ProviderError } from "@/lib/ai/providers";
import { HttpError, json, readJson, route } from "@/lib/http";

/** 依金鑰列出可用模型（用 POST，金鑰不會出現在網址或記錄檔） */
export const POST = route(async (req: NextRequest) => {
  const { viewer, userId } = await requireAiViewer();
  rateLimit(viewer.actor ?? "anon", 20, "ai-models");
  const body = await readJson(req, 10_000);
  const { provider, apiKey, baseUrl } = await resolveKey(userId, body);
  try {
    return json({ provider, models: await listModels(provider, apiKey, baseUrl) });
  } catch (err) {
    if (err instanceof ProviderError) throw new HttpError(err.status === 401 ? 400 : err.status, err.message);
    throw err;
  }
});
