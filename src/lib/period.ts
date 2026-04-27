export type Period = { year: number; month: number; date: Date; key: string };

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function parsePeriod(value: string | undefined | null): Period {
  const now = new Date();
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split("-").map(Number);
    if (y && m && m >= 1 && m <= 12) {
      const date = new Date(y, m - 1, 1);
      return { year: y, month: m, date, key: value };
    }
  }
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return {
    year: y,
    month: m,
    date: new Date(y, m - 1, 1),
    key: `${y}-${String(m).padStart(2, "0")}`,
  };
}

export function formatPeriodLabel(p: Period) {
  return `${MONTHS_PT[p.month - 1]} de ${p.year}`;
}

export function shiftPeriod(p: Period, deltaMonths: number): Period {
  const d = new Date(p.year, p.month - 1 + deltaMonths, 1);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return { year: y, month: m, date: d, key: `${y}-${String(m).padStart(2, "0")}` };
}
