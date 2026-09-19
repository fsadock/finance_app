import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import { getInstallmentPlans } from "@/lib/data/installments";
import { formatBRL, formatMonthKeyLong, formatMonthKeyShort } from "@/lib/domain/format";
import { committedByMonth } from "@/lib/domain/installments";
import { Layers } from "lucide-react";
import { InstallmentList } from "@/components/installments/installment-list";

export default async function InstallmentsPage() {
  const plans = await getInstallmentPlans();
  const upcoming = committedByMonth(plans, 12);
  const totalRemaining = plans.reduce((s, p) => s + p.remainingAmount, 0);
  const nextMonth = upcoming.find((m) => m.total > 0);
  const peak = Math.max(1, ...upcoming.map((m) => m.total));
  const lastEnd = plans.reduce<string | null>((max, p) => (!max || p.endMonth > max ? p.endMonth : max), null);

  return (
    <>
      <PageHeader title="Parcelas" subtitle="Compras parceladas no cartão e quanto das próximas faturas já está comprometido" />

      <div className="grid grid-cols-12 gap-4 mb-6">
        <Card className="col-span-12 md:col-span-4">
          <CardHeader><CardTitle>Total a pagar em parcelas</CardTitle></CardHeader>
          <CardValue className="text-danger">{formatBRL(totalRemaining)}</CardValue>
          <div className="text-xs text-fg-muted mt-3">{plans.length} compra(s) em andamento</div>
        </Card>
        <Card className="col-span-12 md:col-span-4">
          <CardHeader><CardTitle>Próxima fatura já comprometida</CardTitle></CardHeader>
          <CardValue>{formatBRL(nextMonth?.total ?? 0)}</CardValue>
          <div className="text-xs text-fg-muted mt-3 capitalize">{nextMonth ? formatMonthKeyLong(nextMonth.month) : "—"}</div>
        </Card>
        <Card className="col-span-12 md:col-span-4">
          <CardHeader><CardTitle>Livre de parcelas em</CardTitle></CardHeader>
          <CardValue className="capitalize">{lastEnd ? formatMonthKeyShort(lastEnd) : "—"}</CardValue>
          <div className="text-xs text-fg-muted mt-3">considerando só as compras atuais</div>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle>Comprometido por mês · próximos 12 meses</CardTitle></CardHeader>
        <div className="flex items-end gap-2 h-44">
          {upcoming.map((m) => (
            <div key={m.month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end" title={`${formatMonthKeyLong(m.month)}: ${formatBRL(m.total)}`}>
              <span className="text-[10px] text-fg-muted">{m.total > 0 ? formatBRL(m.total).replace(/,\d{2}$/, "") : ""}</span>
              <div className="w-full rounded-t bg-warn/70" style={{ height: `${(m.total / peak) * 100}%`, minHeight: m.total > 0 ? 2 : 0 }} />
              <span className="text-[10px] text-fg-muted capitalize">{formatMonthKeyShort(m.month)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <InstallmentList plans={plans} />
        {plans.length === 0 && (
          <div className="p-12 text-center text-fg-muted">
            <Layers className="size-8 mx-auto mb-3" />
            Nenhuma compra parcelada em andamento. Parcelas são identificadas pelos dados do cartão (Open Finance) ou por
            &quot;PARC 03/12&quot; na descrição.
          </div>
        )}
      </Card>
    </>
  );
}
