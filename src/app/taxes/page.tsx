import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import { getTaxYear } from "@/lib/data/taxes";
import { formatBRL, formatDate, lastMonthKeys, formatMonthKeyShort } from "@/lib/domain/format";
import { IRPF_EDUCATION_CAP, IRPF_PENSION_CAP_RATE, IRPF_TYPES, groupDeductions, summarizeIncome, type IrpfType } from "@/lib/domain/irpf";
import { Info } from "lucide-react";
import Link from "next/link";
import { PayeeList } from "@/components/taxes/payee-list";

type Props = { searchParams: Promise<{ year?: string }> };

export default async function TaxesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const currentYear = new Date().getFullYear();
  const year = Number(sp.year) >= 2000 && Number(sp.year) <= currentYear ? Number(sp.year) : currentYear - 1;
  const { incomeTx, deductibleTx } = await getTaxYear(year);

  const { incomeByCategory, incomeByMonth, totalIncome } = summarizeIncome(incomeTx);
  const months = lastMonthKeys(12, new Date(year, 11, 1));
  const peak = Math.max(1, ...months.map((m) => incomeByMonth.get(m) ?? 0));

  const groups = groupDeductions(deductibleTx);

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
              <PayeeList payees={payees} />
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
