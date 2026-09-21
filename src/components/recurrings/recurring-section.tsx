import { Card, CardTitle } from "@/components/ui/card";
import { ListRow, MobileList } from "@/components/ui/list-row";
import { formatBRL, formatDate, formatDateNumeric, formatMonthShort } from "@/lib/domain/format";
import { TrendingUp, TrendingDown, AlertTriangle, type LucideIcon } from "lucide-react";
import type { getActiveRecurrings } from "@/lib/data/recurrings";
import { CADENCE_LABEL, type Cadence } from "@/lib/domain/recurrence";
import { AutoChangeBadge, RecurringActions } from "@/components/recurrings/recurring-actions";
import type { CategoryOption } from "@/components/recurrings/recurring-editor";
import { cn } from "@/lib/utils";

type Item = Awaited<ReturnType<typeof getActiveRecurrings>>[number];

export const sum = (items: Item[], f: (i: Item) => number) => items.filter((r) => !r.likelyInactive).reduce((s, r) => s + f(r), 0);
/** Every charge the "Pago em 12 meses" sum includes, oldest first. */
const chargesTooltip = (charges: { date: Date; amount: number }[]) =>
  charges.length === 0
    ? "Nenhuma cobrança ligada nos últimos 12 meses"
    : charges.map((c) => `${formatDateNumeric(c.date)}  ${formatBRL(Math.abs(c.amount))}`).join("\n");

export function RecurringSection({
  title,
  icon: Icon,
  items,
  categories,
  hint,
}: {
  title: string;
  icon: LucideIcon;
  items: Item[];
  categories: CategoryOption[];
  hint?: string;
}) {
  const sorted = [...items].sort((a, b) => b.yearly - a.yearly);
  return (
    <Card className="p-0 overflow-x-auto">
      <div className="px-4 pt-5 pb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 sm:px-6">
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4" /> {title} · {items.length}
        </CardTitle>
        <span className="text-sm text-fg-muted">
          {formatBRL(sum(items, (r) => r.monthly))}/mês · <span className="text-fg">{formatBRL(sum(items, (r) => r.yearly))}/ano</span>
        </span>
      </div>
      {hint && <p className="px-4 -mt-1 pb-3 text-xs text-fg-muted sm:px-6">{hint}</p>}
      {items.length === 0 ? (
        <div className="text-sm text-fg-muted py-6 text-center">Nenhuma recorrência detectada.</div>
      ) : (
        <table className="hidden w-full text-sm md:table">
          <thead>
            <tr className="text-left text-xs text-fg-muted border-y border-border">
              <th className="px-6 py-2 font-medium">Item</th>
              <th className="px-6 py-2 font-medium text-right">Valor</th>
              <th className="px-6 py-2 font-medium text-right">Por ano</th>
              <th className="px-6 py-2 font-medium text-right" title="Soma das cobranças ligadas a esta recorrência nos últimos 12 meses. Passe o mouse no valor para ver cada uma.">Pago em 12 meses</th>
              <th className="px-6 py-2 font-medium text-right">Próxima</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className="group border-b border-border last:border-b-0 hover:bg-bg-hover/40">
                <td className="px-6 py-2.5">
                  <div className="font-medium flex items-center gap-2 flex-wrap">
                    {r.name}
                    <RecurringBadges r={r} />
                  </div>
                  <div className="text-xs text-fg-muted">
                    {CADENCE_LABEL[r.cadence as Cadence] ?? r.cadence}
                    {r.lastDate && ` · última ${formatDate(r.lastDate)}`}
                    {r.category && ` · ${r.category.name}`}
                  </div>
                </td>
                <td className={cn("px-6 py-2.5 text-right whitespace-nowrap", r.amount > 0 && "text-accent")}>{formatBRL(r.amount)}</td>
                <td className="px-6 py-2.5 text-right whitespace-nowrap font-medium">{formatBRL(r.yearly)}</td>
                <td
                  className="px-6 py-2.5 text-right whitespace-nowrap text-fg-muted"
                  title={chargesTooltip(r.chargesLast12m)}
                >
                  {formatBRL(r.paidLast12m)}
                  <div className="text-[11px]">
                    {r.chargesLast12m.length} {r.chargesLast12m.length === 1 ? "cobrança" : "cobranças"}
                  </div>
                </td>
                <td className="px-6 py-2.5 text-right whitespace-nowrap text-fg-muted">{formatDate(r.upcoming)}</td>
                <td className="px-2 py-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <RecurringActions recurring={r} active={r.active} categories={categories} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {items.length > 0 && (
        <MobileList className="border-t border-border">
          {sorted.map((r) => (
            <ListRow
              key={r.id}
              title={
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  <RecurringBadges r={r} />
                </span>
              }
              meta={
                <>
                  <span>{CADENCE_LABEL[r.cadence as Cadence] ?? r.cadence}</span>
                  <span>próxima {formatDate(r.upcoming)}</span>
                  <RecurringActions recurring={r} active={r.active} categories={categories} />
                </>
              }
              value={
                <>
                  <div className={cn(r.amount > 0 && "text-accent")}>{formatBRL(r.yearly)}/ano</div>
                  <div className="text-xs font-normal text-fg-muted">{formatBRL(r.amount)}</div>
                </>
              }
            />
          ))}
        </MobileList>
      )}
    </Card>
  );
}

function RecurringBadges({ r }: { r: Item }) {
  return (
    <>
      {r.firstCharge && Math.abs(r.priceChange) >= 0.05 && (
        <span
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1",
            r.priceChange > 0 ? "bg-danger/15 text-danger" : "bg-accent/15 text-accent"
          )}
          title={`Primeira cobrança: ${formatBRL(r.firstCharge.amount)} em ${formatDate(r.firstCharge.date)}`}
        >
          {r.priceChange > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
          {r.priceChange > 0 ? "+" : ""}
          {Math.round(r.priceChange * 100)}% desde {formatMonthShort(r.firstCharge.date)}
        </span>
      )}
      {r.autoChange && <AutoChangeBadge id={r.id} change={r.autoChange} />}
      {r.likelyInactive && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded bg-warn/15 text-warn flex items-center gap-1"
          title={r.lastDate ? `Última cobrança em ${formatDate(r.lastDate)}` : undefined}
        >
          <AlertTriangle className="size-3" /> sem cobrança recente
        </span>
      )}
    </>
  );
}
