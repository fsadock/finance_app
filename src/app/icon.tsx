import { ImageResponse } from "next/og";
import { AppIconArt } from "@/components/brand/app-icon";

/** Icons the manifest lists for Android and desktop installs (the iPhone uses apple-icon). */
const ICONS = {
  "192": { size: 192, maskable: false },
  "512": { size: 512, maskable: false },
  maskable: { size: 512, maskable: true },
} as const;

export function generateImageMetadata() {
  return Object.entries(ICONS).map(([id, icon]) => ({
    id,
    contentType: "image/png",
    size: { width: icon.size, height: icon.size },
  }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const icon = ICONS[String(await id) as keyof typeof ICONS];
  return new ImageResponse(<AppIconArt size={icon.size} maskable={icon.maskable} />, {
    width: icon.size,
    height: icon.size,
  });
}
