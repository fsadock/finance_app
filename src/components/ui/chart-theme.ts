// Shared Recharts styling. Colors are the theme tokens from globals.css.

/**
 * Spread into <Tooltip>. All three styles are needed, not just the box: Recharts writes an inline colour
 * on every entry (`entry.color`, falling back to black) which beats anything inherited from the box, and
 * `itemStyle` is the only one it merges last. On a line or a bar the entry borrows its series colour and
 * the omission never shows; a Sankey flow has no series colour, so its text came out black on a dark card.
 */
export const CHART_TOOLTIP_PROPS = {
  contentStyle: {
    background: "var(--color-bg-card)",
    border: "1px solid var(--color-border)",
    borderRadius: 12,
    fontSize: 12,
  },
  itemStyle: { color: "var(--color-fg)" },
  labelStyle: { color: "var(--color-fg-muted)" },
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
