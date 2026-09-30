// Investment projection math. Pure — rates come from data/rates.ts.

/** Annual → monthly compounding rate. */
export const monthlyRate = (annual: number) => Math.pow(1 + annual, 1 / 12) - 1;

/** Future value of `initial` plus a monthly contribution after `months`. */
export function futureValue(initial: number, monthlyContribution: number, annualRate: number, months: number) {
  const r = monthlyRate(annualRate);
  if (r === 0) return initial + monthlyContribution * months;
  const g = Math.pow(1 + r, months);
  return initial * g + monthlyContribution * ((g - 1) / r);
}

/** Real (inflation-adjusted) rate: (1 + nominal) / (1 + inflation) − 1. */
export const realRate = (nominal: number, inflation: number) => (1 + nominal) / (1 + inflation) - 1;

/**
 * Open Finance reports fixed income *net* of tax — the value is what would reach the account on a
 * redemption today. The bank's own app shows the amount before income tax, so the two screens only line
 * up once the withholding is added back. IOF only exists while a position is under 30 days old.
 *
 * Each position comes in as the institution reports it: the value already net of tax, plus what it withheld.
 */
export function grossUp(positions: { value: number; incomeTax: number; iof: number }[]) {
  const net = positions.reduce((s, p) => s + p.value, 0);
  const incomeTax = positions.reduce((s, p) => s + p.incomeTax, 0);
  const iof = positions.reduce((s, p) => s + p.iof, 0);
  return { net, incomeTax, iof, withheld: incomeTax + iof, gross: net + incomeTax + iof };
}
