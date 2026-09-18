// Shared Recharts styling. Colors are the theme tokens from globals.css.

export const CHART_TOOLTIP_STYLE = {
  background: "var(--color-bg-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  fontSize: 12,
} as const;

/** Spread into <XAxis> / <YAxis>: muted labels, no tick marks or axis line. */
export const CHART_AXIS_PROPS = {
  stroke: "var(--color-fg-muted)",
  tickLine: false,
  axisLine: false,
  fontSize: 11,
} as const;

/** Spread into <CartesianGrid>: dashed horizontal lines only. */
export const CHART_GRID_PROPS = {
  stroke: "var(--color-border)",
  strokeDasharray: "3 3",
  vertical: false,
} as const;
