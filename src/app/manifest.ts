import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pub Crawl",
    short_name: "Pub Crawl",
    description: "Ruten, omgangene og holdet til J-dag.",
    start_url: "/",
    display: "standalone",
    background_color: "#1F3B2D",
    theme_color: "#1F3B2D",
    lang: "da",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
