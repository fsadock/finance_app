import type { MetadataRoute } from "next";

/** Nothing here is public: an install reachable from the internet shouldn't show up in search results. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
