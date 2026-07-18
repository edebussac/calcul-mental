import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Calcul mental",
    short_name: "Calcul",
    description: "Entraînement au calcul mental",
    start_url: "/",
    display: "standalone",
    background_color: "#eceef2",
    theme_color: "#eceef2",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
