import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Megamind",
    short_name: "Megamind",
    description:
      "Life decisions with dual-self reasoning — temptation vs long-run welfare.",
    start_url: "/decide",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0c1016",
    theme_color: "#0c1016",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
