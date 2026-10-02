"use client";

import { useState } from "react";
import { ListRow, MobileList } from "@/components/ui/list-row";
import { InstallmentDialog } from "@/components/installments/installment-dialog";
import { formatBRL, formatMonthKeyShort } from "@/lib/domain/format";
import type { getInstallmentPlans } from "@/lib/data/installments";
import { Money } from "@/components/ui/money";

type Plan = Awaited<ReturnType<typeof getInstallmentPlans>>[number];

/** The progress is the way in: it is the part of the row that is about the instalments themselves. */
function Progress({ p, onOpen }: { p: Plan; onOpen: () => void }) {
  const byHand = p.installments.filter((i) => i.byHand).length;
  return (
    <button onClick={onOpen} className="block w-full text-left" title="Ver e marcar parcelas">
      <div className="mb-1 text-xs text-fg-muted">
        {p.paid}/{p.totalInstallments}
        {byHand > 0 && <span className="text-accent"> · {byHand} marcada(s) por você</span>}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-bg-hover">
        <div className="h-full bg-accent" style={{ width: `${(p.paid / p.totalInstallments) * 100}%` }} />
      </div>
    </button>
  );
}

/** Installment purchases: a table from md up, a compact list on phones. */
export function InstallmentList({ plans }: { plans: Plan[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const current = plans.find((p) => p.key === open);
  return (
    <>
      {current && (
        <InstallmentDialog
          planKey={current.key}
          label={current.label}
          amount={current.installmentAmount}
          installments={current.installments}
          onClose={() => setOpen(null)}
        />
      )}
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
                <Progress p={p} onOpen={() => setOpen(p.key)} />
              </td>
              <td className="px-6 py-3 text-right whitespace-nowrap"><Money>{formatBRL(p.installmentAmount)}</Money></td>
              <td className="px-6 py-3 text-right whitespace-nowrap text-fg-muted"><Money>{formatBRL(p.total)}</Money></td>
              <td className="px-6 py-3 text-right whitespace-nowrap font-medium"><Money>{formatBRL(p.remainingAmount)}</Money></td>
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
                  {p.accountName} · <Money>{formatBRL(p.installmentAmount)}</Money>/mês · até <span className="capitalize">{formatMonthKeyShort(p.endMonth)}</span>
                </div>
                <Progress p={p} onOpen={() => setOpen(p.key)} />
              </div>
            }
            value={
              <>
                <div><Money>{formatBRL(p.remainingAmount)}</Money></div>
                <div className="text-xs font-normal text-fg-muted">restante</div>
              </>
            }
          />
        ))}
      </MobileList>
    </>
  );
}
