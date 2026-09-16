/**
 * Brazilian benchmark rates from the Banco Central's public SGS API (no key needed).
 * Cached for a day; returns null values when BCB is unreachable so pages still render.
 */
const SERIES = {
  cdi: 4389, // CDI anualizado base 252 (% a.a.)
  selic: 432, // meta Selic (% a.a.)
  ipca12m: 13522, // IPCA acumulado 12 meses (%)
} as const;

export type Rate = { value: number; date: string } | null;
export type BenchmarkRates = { cdi: Rate; selic: Rate; ipca12m: Rate };

async function fetchSeries(code: number): Promise<Rate> {
  try {
    const res = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/1?formato=json`, {
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const [row] = (await res.json()) as { data: string; valor: string }[];
    const value = Number(row?.valor);
    return row && Number.isFinite(value) ? { value: value / 100, date: row.data } : null;
  } catch {
    return null;
  }
}

export async function getBenchmarkRates(): Promise<BenchmarkRates> {
  const [cdi, selic, ipca12m] = await Promise.all([
    fetchSeries(SERIES.cdi),
    fetchSeries(SERIES.selic),
    fetchSeries(SERIES.ipca12m),
  ]);
  return { cdi, selic, ipca12m };
}

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
