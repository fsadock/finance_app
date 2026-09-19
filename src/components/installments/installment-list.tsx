import { ListRow, MobileList } from "@/components/ui/list-row";
import { formatBRL, formatMonthKeyShort } from "@/lib/domain/format";
import type { getInstallmentPlans } from "@/lib/data/installments";

type Plan = Awaited<ReturnType<typeof getInstallmentPlans>>[number];

function Progress({ p }: { p: Plan }) {
  return (
    <>
    <div className="text-xs text-fg-muted mb-1">{p.paid}/{p.totalInstallments}</div>
    <div className="h-1.5 rounded-full bg-bg-hover overflow-hidden">
      <div className="h-full bg-accent" style={{ width: `${(p.paid / p.totalInstallments) * 100}%` }} />
    </div>
    </>
  );
}

/** Installment purchases: a table from md up, a compact list on phones. */
export function InstallmentList({ plans }: { plans: Plan[] }) {
  return (
    <>
      <table className="hidden w-full text-sm md:table">
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
                <Progress p={p} />
              </td>
              <td className="px-6 py-3 text-right whitespace-nowrap">{formatBRL(p.installmentAmount)}</td>
              <td className="px-6 py-3 text-right whitespace-nowrap text-fg-muted">{formatBRL(p.total)}</td>
              <td className="px-6 py-3 text-right whitespace-nowrap font-medium">{formatBRL(p.remainingAmount)}</td>
              <td className="px-6 py-3 text-right whitespace-nowrap capitalize text-fg-muted">{formatMonthKeyShort(p.endMonth)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <MobileList>
        {plans.map((p) => (
          <ListRow
            key={p.key}
            title={<span className="truncate font-medium">{p.label}</span>}
            meta={
              <div className="w-full space-y-1.5">
                <div>
                  {p.accountName} · {formatBRL(p.installmentAmount)}/mês · até <span className="capitalize">{formatMonthKeyShort(p.endMonth)}</span>
                </div>
                <Progress p={p} />
              </div>
            }
            value={
              <>
                <div>{formatBRL(p.remainingAmount)}</div>
                <div className="text-xs font-normal text-fg-muted">restante</div>
              </>
            }
          />
        ))}
      </MobileList>
    </>
  );
}
