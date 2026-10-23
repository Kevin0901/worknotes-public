import type { MetadataRoute } from "next";

// 私人筆記：禁止搜尋引擎索引
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
