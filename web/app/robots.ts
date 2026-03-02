import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/login", "/waitlist"],
        disallow: ["/command-center/", "/api/", "/auth/"],
      },
    ],
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL || "https://vidbolt.app"}/sitemap.xml`,
  };
}
