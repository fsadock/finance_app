import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import { prisma } from "@/lib/infra/db";
import { formatBRL, formatDate, lastMonthKeys, monthKey, formatMonthKeyShort } from "@/lib/domain/format";
import { INCOME_WHERE } from "@/lib/domain/flows";
import { IRPF_EDUCATION_CAP, IRPF_PENSION_CAP_RATE, IRPF_TYPES, isIrpfType, type IrpfType } from "@/lib/domain/irpf";
import { Info } from "lucide-react";
import Link from "next/link";

type Props = { searchParams: Promise<{ year?: string }> };

const DOC_LABEL: Record<string, string> = { CNPJ: "CNPJ", CPF: "CPF", SELF: "próprio" };

export default async function TaxesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const currentYear = new Date().getFullYear();
  const year = Number(sp.year) >= 2000 && Number(sp.year) <= currentYear ? Number(sp.year) : currentYear - 1;
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  const range = { date: { gte: start, lt: end } };

  const [incomeTx, deductibleTx] = await Promise.all([
    prisma.transaction.findMany({
      where: { AND: [range, INCOME_WHERE] },
      select: { amount: true, date: true, category: { select: { name: true } } },
    }),
    prisma.transaction.findMany({
      where: { ...range, category: { irpfType: { not: null } } },
      select: {
        id: true,
        date: true,
        amount: true,
        description: true,
        merchantName: true,
        merchantCnpj: true,
        counterpartyName: true,
        counterpartyType: true,
        category: { select: { name: true, irpfType: true } },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  // Income by category and month
  const incomeByCategory = new Map<string, number>();
  const incomeByMonth = new Map<string, number>();
  for (const t of incomeTx) {
    const name = t.category?.name ?? "Sem categoria";
    incomeByCategory.set(name, (incomeByCategory.get(name) ?? 0) + t.amount);
    incomeByMonth.set(monthKey(t.date), (incomeByMonth.get(monthKey(t.date)) ?? 0) + t.amount);
  }
  const totalIncome = [...incomeByCategory.values()].reduce((s, v) => s + v, 0);
  const months = lastMonthKeys(12, new Date(year, 11, 1));
  const peak = Math.max(1, ...months.map((m) => incomeByMonth.get(m) ?? 0));

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

  const medical = Math.max(0, groups.get("MEDICAL")?.total ?? 0);
  const education = Math.max(0, groups.get("EDUCATION")?.total ?? 0);
  const pension = Math.max(0, groups.get("PENSION")?.total ?? 0);
  const pensionCap = totalIncome * IRPF_PENSION_CAP_RATE;

  return (
    <>
      <PageHeader
        title="Imposto de Renda"
        subtitle={`Ano-calendário ${year} · declaração em ${year + 1}`}
        actions={
          <div className="flex items-center gap-1 bg-bg-elev border border-border rounded-lg p-1 text-sm">
            {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map((y) => (
              <Link
                key={y}
                href={`/taxes?year=${y}`}
                className={`px-3 py-1 rounded ${y === year ? "bg-bg-hover text-fg" : "text-fg-muted hover:text-fg"}`}
              >
                {y}
              </Link>
            ))}
          </div>
        }
      />

      <Card className="mb-6 p-4 flex gap-3 text-xs text-fg-muted">
        <Info className="size-4 shrink-0 text-info" />
        <p>
          Resumo a partir das suas transações categorizadas — um apoio para conferir, não substitui os informes de rendimentos
          do empregador/bancos nem os recibos. Deduções vêm das categorias marcadas como dedutíveis (Saúde, Educação,
          Previdência privada). Limites exibidos são valores de referência; confira as regras da Receita para {year}.
        </p>
      </Card>

      <div className="grid grid-cols-12 gap-4 mb-6">
        <Card className="col-span-12 md:col-span-3">
          <CardHeader><CardTitle>Entradas no ano</CardTitle></CardHeader>
          <CardValue className="text-accent">{formatBRL(totalIncome)}</CardValue>
          <div className="text-xs text-fg-muted mt-3">inclui não tributáveis (reembolsos, rendimentos isentos)</div>
        </Card>
        <Card className="col-span-12 md:col-span-3">
          <CardHeader><CardTitle>{IRPF_TYPES.MEDICAL.label}</CardTitle></CardHeader>
          <CardValue>{formatBRL(medical)}</CardValue>
          <div className="text-xs text-fg-muted mt-3">sem limite de dedução</div>
        </Card>
        <Card className="col-span-12 md:col-span-3">
          <CardHeader><CardTitle>{IRPF_TYPES.EDUCATION.label}</CardTitle></CardHeader>
          <CardValue>{formatBRL(education)}</CardValue>
          <div className={`text-xs mt-3 ${education > IRPF_EDUCATION_CAP ? "text-warn" : "text-fg-muted"}`}>
            limite de referência {formatBRL(IRPF_EDUCATION_CAP)} por pessoa
          </div>
        </Card>
        <Card className="col-span-12 md:col-span-3">
          <CardHeader><CardTitle>{IRPF_TYPES.PENSION.label}</CardTitle></CardHeader>
          <CardValue>{formatBRL(pension)}</CardValue>
          <div className={`text-xs mt-3 ${pension > pensionCap ? "text-warn" : "text-fg-muted"}`}>
            até 12% da renda tributável (≈ {formatBRL(pensionCap)} sobre as entradas)
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-4 mb-6">
        <Card className="col-span-12 lg:col-span-7">
          <CardHeader><CardTitle>Entradas por mês</CardTitle></CardHeader>
          <div className="flex items-end gap-2 h-40">
            {months.map((m) => {
              const v = incomeByMonth.get(m) ?? 0;
              return (
                <div key={m} className="flex-1 flex flex-col items-center gap-1 h-full justify-end" title={`${m}: ${formatBRL(v)}`}>
                  <div className="w-full rounded-t bg-accent/70" style={{ height: `${(v / peak) * 100}%`, minHeight: v > 0 ? 2 : 0 }} />
                  <span className="text-[10px] text-fg-muted capitalize">{formatMonthKeyShort(m).split("/")[0]}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-fg-muted mt-3">Picos em nov/dez costumam ser 13º; confira férias e PLR (tributação exclusiva).</p>
        </Card>
        <Card className="col-span-12 lg:col-span-5">
          <CardHeader><CardTitle>Entradas por categoria</CardTitle></CardHeader>
          <ul className="space-y-2 text-sm">
            {[...incomeByCategory.entries()].sort((a, b) => b[1] - a[1]).map(([name, v]) => (
              <li key={name} className="flex justify-between">
                <span>{name}</span>
                <span className="text-fg-muted">{formatBRL(v)}</span>
              </li>
            ))}
            {incomeByCategory.size === 0 && <li className="text-fg-muted">Sem entradas registradas em {year}.</li>}
          </ul>
        </Card>
      </div>

      <div className="space-y-4">
        {(Object.keys(IRPF_TYPES) as IrpfType[]).map((type) => {
          const g = groups.get(type);
          if (!g) return null;
          const payees = [...g.payees.values()].filter((p) => Math.abs(p.total) >= 0.01).sort((a, b) => b.total - a.total);
          return (
            <Card key={type} className="p-0 overflow-x-auto">
              <div className="px-6 pt-5 pb-3">
                <div className="font-medium">{IRPF_TYPES[type].label} · {formatBRL(g.total)}</div>
                <p className="text-xs text-fg-muted mt-1">{IRPF_TYPES[type].hint}</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-fg-muted border-y border-border">
                    <th className="px-6 py-2 font-medium">Beneficiário</th>
                    <th className="px-6 py-2 font-medium">Documento</th>
                    <th className="px-6 py-2 font-medium text-right">Lançamentos</th>
                    <th className="px-6 py-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {payees.map((p) => (
                    <tr key={`${p.name}|${p.doc}`} className="border-b border-border last:border-b-0">
                      <td className="px-6 py-2">{p.name}</td>
                      <td className="px-6 py-2 text-fg-muted text-xs">{p.doc ?? "— informe no recibo"}</td>
                      <td className="px-6 py-2 text-right text-fg-muted">{p.count}</td>
                      <td className="px-6 py-2 text-right">{formatBRL(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        })}
        {groups.size === 0 && (
          <Card className="text-center text-sm text-fg-muted py-12">
            Nenhuma despesa dedutível categorizada em {year}. Categorize consultas, plano de saúde e mensalidades escolares
            em Saúde / Educação para vê-las aqui.
          </Card>
        )}
      </div>
      {deductibleTx.length > 0 && (
        <p className="text-[11px] text-fg-subtle mt-4">
          {deductibleTx.length} lançamentos dedutíveis entre {formatDate(deductibleTx[0]!.date)} e{" "}
          {formatDate(deductibleTx[deductibleTx.length - 1]!.date)}.
        </p>
      )}
    </>
  );
}
