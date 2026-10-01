import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://monad-six-sooty.vercel.app");

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/trade", "/credit", "/underwrite"].map((path) => ({
    url: `${SITE}${path}`,
    changeFrequency: path === "" ? "weekly" : "daily",
    priority: path === "" ? 1 : 0.8,
  }));
}
