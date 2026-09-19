/**
 * The "F" app mark, drawn for next/og ImageResponse (icons for the Home Screen and the manifest).
 * `maskable` keeps the letter inside the safe zone, since Android crops the edges into a circle or squircle.
 */
export function AppIconArt({ size, maskable = false }: { size: number; maskable?: boolean }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#00d28d",
        color: "#0a0b0d",
        fontSize: Math.round(size * (maskable ? 0.42 : 0.61)),
        fontWeight: 700,
      }}
    >
      F
    </div>
  );
}
