import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import { getNextMonthPlan } from "@/lib/data/next-month";
import { formatBRL, formatDayMonth, formatMonthKeyLong } from "@/lib/domain/format";
import { ApplyLimitButton } from "@/components/next-month/apply-limit-button";
import { Breakdown } from "@/components/ui/breakdown";
import { MobileList, ListRow } from "@/components/ui/list-row";
import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Money } from "@/components/ui/money";

export default async function NextMonthPage() {
  const { month, outlook, installments, duePlans, recurrings, limits } = await getNextMonthPlan();

  return (
    <>
      <PageHeader
        title="Próximo mês"
        subtitle={`O que ${formatMonthKeyLong(month)} já deve antes de começar, e o que a história diz para ajustar`}
      />

      <div className="grid grid-cols-12 gap-4 mb-6">
        <Card className="col-span-12 md:col-span-4">
          <CardHeader><CardTitle>Já comprometido</CardTitle></CardHeader>
          <Breakdown
            title={`Comprometido em ${formatMonthKeyLong(month)}`}
            description="Parcelas que ainda vão cair e recorrentes com vencimento no mês."
            total={outlook.total}
            parts={[
              ...duePlans.map((p) => ({ id: p.key, label: p.label, value: p.amount, hint: `${p.account} · até ${p.endMonth}`, href: "/installments" })),
              ...recurrings.map((r) => ({ id: r.id, label: r.name, value: Math.abs(r.amount), hint: `dia ${formatDayMonth(r.upcoming)}`, href: "/recurrings" })),
            ]}
          >
            <CardValue className="text-danger"><Money>{formatBRL(outlook.total)}</Money></CardValue>
          </Breakdown>
          <div className="text-xs text-fg-muted mt-3">
            <Money>{formatBRL(installments)}</Money> em parcelas · <Money>{formatBRL(outlook.total - installments)}</Money> em recorrentes
          </div>
        </Card>
        <Card className="col-span-12 md:col-span-4">
          <CardHeader><CardTitle>Sobra de um mês típico</CardTitle></CardHeader>
          <CardValue className={outlook.left >= 0 ? undefined : "text-danger"}><Money>{formatBRL(outlook.left)}</Money></CardValue>
          <div data-money className="text-xs text-fg-muted mt-3">
            {outlook.typicalIncome > 0
              ? `entra ${formatBRL(outlook.typicalIncome)} num mês mediano`
              : "sem histórico de receita suficiente"}
          </div>
        </Card>
        <Card className="col-span-12 md:col-span-4">
          <CardHeader><CardTitle>Do que entra, já está preso</CardTitle></CardHeader>
          <CardValue>{outlook.typicalIncome > 0 ? `${Math.round(outlook.share * 100)}%` : "—"}</CardValue>
          <div className="text-xs text-fg-muted mt-3">antes de qualquer escolha sua</div>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Limites que a história contradiz</CardTitle>
          <Link href="/categories" className="text-xs text-fg-muted hover:text-fg">Ver todos →</Link>
        </CardHeader>
        {limits.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-muted">
            Nenhum limite fora da realidade — o que você definiu bate com o que costuma gastar.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {limits.map((l) => (
              <li key={l.category.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{l.category.name}</div>
                  <div className="text-xs text-fg-muted">
                    limite <Money>{formatBRL(l.limit)}</Money> · costuma gastar{" "}
                    <span className={cn("tabular-nums", l.verdict === "low" ? "text-danger" : "text-fg-muted")}>
                      <Money>{formatBRL(l.typical)}</Money>
                    </span>{" "}
                    {l.verdict === "low" ? "— o limite é que está errado" : "— o limite nunca freia nada"}
                  </div>
                </div>
                <ApplyLimitButton categoryId={l.category.id} month={month} suggested={l.suggested} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <CardHeader className="px-6 pt-6">
          <CardTitle>Recorrentes que caem em {formatMonthKeyLong(month)}</CardTitle>
          <Link href="/recurrings" className="text-xs text-fg-muted hover:text-fg">Ver todos →</Link>
        </CardHeader>
        <MobileList>
          {recurrings.map((r) => (
            <ListRow
              key={r.id}
              title={<span className="truncate font-medium">{r.name}</span>}
              meta={
                <>
                  <span>{formatDayMonth(r.upcoming)}</span>
                  {r.category && <span className="truncate">{r.category.name}</span>}
                </>
              }
              value={formatBRL(Math.abs(r.amount))}
            />
          ))}
        </MobileList>
        {recurrings.length === 0 && (
          <div className="p-12 text-center text-fg-muted">
            <CalendarClock className="size-8 mx-auto mb-3" />
            Nenhuma cobrança recorrente prevista para o mês que vem.
          </div>
        )}
      </Card>
    </>
  );
}
