import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { formatBRL, formatMonthKeyLong, formatMonthKeyShort } from "@/lib/format";
import { buildInstallmentPlans, committedByMonth } from "@/lib/installments";
import { Layers } from "lucide-react";

export default async function InstallmentsPage() {
  const since = new Date();
  since.setMonth(since.getMonth() - 48);
  const txs = await prisma.transaction.findMany({
    where: {
      totalInstallments: { gt: 1 },
      amount: { lt: 0 },
      date: { gte: since },
      account: { type: "CREDIT_CARD", hidden: false },
    },
    select: {
      id: true,
      accountId: true,
      description: true,
      merchantName: true,
      amount: true,
      date: true,
      installmentNumber: true,
      totalInstallments: true,
      purchaseAmount: true,
      purchaseDate: true,
      account: { select: { name: true } },
    },
  });

  const plans = buildInstallmentPlans(
    txs.map((t) => ({ ...t, accountName: t.account.name, totalInstallments: t.totalInstallments! }))
  );
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
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-fg-muted border-b border-border">
              <th className="px-6 py-3 font-medium">Compra</th>
              <th className="px-6 py-3 font-medium">Cartão</th>
              <th className="px-6 py-3 font-medium">Progresso</th>
              <th className="px-6 py-3 font-medium text-right">Parcela</th>
              <th className="px-6 py-3 font-medium text-right">Total</th>
              <th className="px-6 py-3 font-medium text-right">Restante</th>
              <th className="px-6 py-3 font-medium text-right">Última</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.key} className="border-b border-border last:border-b-0 hover:bg-bg-hover/40">
                <td className="px-6 py-3">
                  <div className="font-medium">{p.label}</div>
                  <div className="text-xs text-fg-muted capitalize">comprado em {formatMonthKeyShort(p.purchaseMonth)}</div>
                </td>
                <td className="px-6 py-3 text-fg-muted">{p.accountName}</td>
                <td className="px-6 py-3 min-w-[140px]">
                  <div className="text-xs text-fg-muted mb-1">{p.paid}/{p.totalInstallments}</div>
                  <div className="h-1.5 rounded-full bg-bg-hover overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: `${(p.paid / p.totalInstallments) * 100}%` }} />
                  </div>
                </td>
                <td className="px-6 py-3 text-right whitespace-nowrap">{formatBRL(p.installmentAmount)}</td>
                <td className="px-6 py-3 text-right whitespace-nowrap text-fg-muted">{formatBRL(p.total)}</td>
                <td className="px-6 py-3 text-right whitespace-nowrap font-medium">{formatBRL(p.remainingAmount)}</td>
                <td className="px-6 py-3 text-right whitespace-nowrap capitalize text-fg-muted">{formatMonthKeyShort(p.endMonth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
