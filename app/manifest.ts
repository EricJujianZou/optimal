import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Megamind",
    short_name: "Megamind",
    description:
      "Speak a situation. Get a clear recommendation — calm counsel for everyday calls and heavier choices.",
    start_url: "/decide",
    display: "standalone",
    orientation: "portrait",
    background_color: "#2a241c",
    theme_color: "#2a241c",
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
