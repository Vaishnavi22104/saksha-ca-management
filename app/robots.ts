import type { MetadataRoute } from "next";

/** Only the landing page is meant for search engines. Everything else is behind sign-in. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/$", disallow: ["/login", "/forgot-password", "/reset-password", "/api/", "/auth/"] }],
  };
}
