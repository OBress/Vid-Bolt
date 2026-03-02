import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vid-Bolt",
    short_name: "VidBolt",
    description: "AI Video Production Platform",
    start_url: "/command-center",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#f97316",
    icons: [
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
    ],
  };
}
