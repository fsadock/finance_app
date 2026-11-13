/**
 * An amount of money on screen. The CSS blurs `[data-money]` in private mode; an amount not wrapped here
 * stays visible when the owner asked to hide it.
 */
export function Money({ children }: { children: React.ReactNode }) {
  return <span data-money>{children}</span>;
}
