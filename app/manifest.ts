import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EB Studio Pro",
    short_name: "EB Studio Pro",
    description:
      "Create, preview, and export complete fiction and non-fiction ebooks.",
    start_url: "/",
    display: "standalone",
    background_color: "#101a17",
    theme_color: "#10201a",
    icons: [
      {
        src: "/brand/ebstudio-pro-app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/brand/ebstudio-pro-app-icon.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
