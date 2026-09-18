import { monthKey } from "@/lib/domain/format";

/**
 * IRPF (Brazilian income tax) reference data. Values are the ones in force for recent
 * ano-calendário years — confirm against the Receita Federal rules for the year you declare.
 */
export const IRPF_TYPES = {
  MEDICAL: { label: "Despesas médicas", hint: "Sem limite. Planos de saúde, consultas, exames, hospitais, dentistas, psicólogos. Farmácia não é dedutível (salvo em conta hospitalar)." },
  EDUCATION: { label: "Instrução", hint: "Limite anual por pessoa (titular e cada dependente). Ensino infantil a pós-graduação e técnico. Cursos livres, idiomas e material escolar não entram." },
  PENSION: { label: "Previdência privada (PGBL)", hint: "Dedutível até 12% da renda tributável, só no modelo completo e para quem contribui ao INSS. VGBL não é dedutível." },
  ALIMONY: { label: "Pensão alimentícia judicial", hint: "Sem limite quando fixada judicialmente ou por escritura pública." },
} as const;

export type IrpfType = keyof typeof IRPF_TYPES;

/** Reference cap for education per person (R$/ano). */
export const IRPF_EDUCATION_CAP = 3561.5;
/** PGBL deduction cap as a share of taxable income. */
export const IRPF_PENSION_CAP_RATE = 0.12;

function isIrpfType(v: string | null | undefined): v is IrpfType {
  return !!v && v in IRPF_TYPES;
}

const DOC_LABEL: Record<string, string> = { CNPJ: "CNPJ", CPF: "CPF", SELF: "próprio" };

/** Income per category and per month ("YYYY-MM"). */
export function summarizeIncome(incomeTx: { amount: number; date: Date; category: { name: string } | null }[]) {
  // Income by category and month
  const incomeByCategory = new Map<string, number>();
  const incomeByMonth = new Map<string, number>();
  for (const t of incomeTx) {
    const name = t.category?.name ?? "Sem categoria";
    incomeByCategory.set(name, (incomeByCategory.get(name) ?? 0) + t.amount);
    incomeByMonth.set(monthKey(t.date), (incomeByMonth.get(monthKey(t.date)) ?? 0) + t.amount);
  }
  const totalIncome = [...incomeByCategory.values()].reduce((s, v) => s + v, 0);
  return { incomeByCategory, incomeByMonth, totalIncome };
}

type DeductibleTx = {
  amount: number;
  description: string;
  merchantName: string | null;
  merchantCnpj: string | null;
  counterpartyName: string | null;
  counterpartyType: string | null;
  category: { irpfType: string | null } | null;
};

/** Deductible spending per IRPF type, net of refunds, grouped by payee. */
export function groupDeductions(deductibleTx: DeductibleTx[]) {
  // Deductions: net of refunds, grouped by payee
  const groups = new Map<IrpfType, { total: number; payees: Map<string, { name: string; doc: string | null; total: number; count: number }> }>();
  for (const t of deductibleTx) {
    const type = t.category?.irpfType;
    if (!isIrpfType(type)) continue;
    if (!groups.has(type)) groups.set(type, { total: 0, payees: new Map() });
    const g = groups.get(type)!;
    const value = -t.amount; // outflows positive, refunds subtract
    g.total += value;
    const name = t.merchantName ?? t.counterpartyName ?? t.description;
    const doc = t.merchantCnpj ? `CNPJ ${t.merchantCnpj}` : t.counterpartyType ? DOC_LABEL[t.counterpartyType] ?? null : null;
    const key = `${name}|${doc ?? ""}`;
    const p = g.payees.get(key) ?? { name, doc, total: 0, count: 0 };
    p.total += value;
    p.count++;
    g.payees.set(key, p);
  }
  return groups;
}

