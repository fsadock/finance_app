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
