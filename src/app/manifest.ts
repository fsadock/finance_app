import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Finanças",
    short_name: "Finanças",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0b0d",
    theme_color: "#0a0b0d",
    icons: [{ src: "/apple-icon", sizes: "180x180", type: "image/png" }],
  };
}
