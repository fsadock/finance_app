import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home Screen icon: the sidebar's "F" mark. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#00d28d",
          color: "#0a0b0d",
          fontSize: 110,
          fontWeight: 700,
        }}
      >
        F
      </div>
    ),
    size
  );
}
