import "server-only";
import { isVisibility } from "./access";
import { HttpError, isUuid, str } from "./http";
import type { Visibility } from "./types";

export function optionalUuid(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (!isUuid(value)) throw new HttpError(400, `欄位格式錯誤：${field}`);
  return value;
}

export function iconValue(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const v = str(value, "圖示", { max: 16 });
  return v ? v : null;
}

export function tagsValue(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new HttpError(400, "標籤格式錯誤");
  const tags = value
    .map((t) => (typeof t === "string" ? t.trim().replace(/^#/, "") : ""))
    .filter((t) => t.length > 0 && t.length <= 40);
  return [...new Set(tags)].slice(0, 20);
}

export function directionValue(value: unknown): "up" | "down" | undefined {
  if (value === undefined) return undefined;
  if (value !== "up" && value !== "down") throw new HttpError(400, "移動方向錯誤");
  return value;
}

export function visibilityValue(value: unknown): Visibility | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isVisibility(value)) throw new HttpError(400, "可見度設定錯誤");
  return value;
}
