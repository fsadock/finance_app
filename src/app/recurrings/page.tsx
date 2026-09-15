import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { formatBRL, formatDate } from "@/lib/format";
import { Sparkles, Receipt, TrendingUp, TrendingDown, AlertTriangle, Home, type LucideIcon } from "lucide-react";
import { getActiveRecurrings } from "@/lib/queries";
import { CADENCE_LABEL, type Cadence } from "@/lib/recurrence";
import { RecurringActions } from "@/components/recurrings/recurring-actions";
import { cn } from "@/lib/utils";

/** Categories treated as subscriptions (discretionary — the first place to look when cutting). */
const SUBSCRIPTION_CATEGORIES = new Set(["Streaming", "Assinaturas", "Academia", "Tecnologia & Software", "Educação", "Lazer", "Cuidados pessoais"]);
const HOUSING_CATEGORIES = new Set(["Aluguel", "Contas de casa"]);

type Item = Awaited<ReturnType<typeof getActiveRecurrings>>[number];

const sum = (items: Item[], f: (i: Item) => number) => items.filter((r) => !r.likelyInactive).reduce((s, r) => s + f(r), 0);
const shortMonth = (d: Date) => new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(d);

function RecurringSection({ title, icon: Icon, items, hint }: { title: string; icon: LucideIcon; items: Item[]; hint?: string }) {
  const sorted = [...items].sort((a, b) => b.yearly - a.yearly);
  return (
    <Card className="p-0 overflow-x-auto">
      <div className="px-6 pt-5 pb-3 flex items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4" /> {title} · {items.length}
        </CardTitle>
        <span className="text-sm text-fg-muted">
          {formatBRL(sum(items, (r) => r.monthly))}/mês · <span className="text-fg">{formatBRL(sum(items, (r) => r.yearly))}/ano</span>
        </span>
      </div>
      {hint && <p className="px-6 -mt-1 pb-3 text-xs text-fg-muted">{hint}</p>}
      {items.length === 0 ? (
        <div className="text-sm text-fg-muted py-6 text-center">Nenhuma recorrência detectada.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-fg-muted border-y border-border">
              <th className="px-6 py-2 font-medium">Item</th>
              <th className="px-6 py-2 font-medium text-right">Valor</th>
              <th className="px-6 py-2 font-medium text-right">Por ano</th>
              <th className="px-6 py-2 font-medium text-right" title="Soma do que foi realmente cobrado nos últimos 12 meses">Pago em 12 meses</th>
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
                        {Math.round(r.priceChange * 100)}% desde {shortMonth(r.firstCharge.date)}
                      </span>
                    )}
                    {r.likelyInactive && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded bg-warn/15 text-warn flex items-center gap-1"
                        title={r.lastDate ? `Última cobrança em ${formatDate(r.lastDate)}` : undefined}
                      >
                        <AlertTriangle className="size-3" /> sem cobrança recente
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-fg-muted">
                    {CADENCE_LABEL[r.cadence as Cadence] ?? r.cadence}
                    {r.lastDate && ` · última ${formatDate(r.lastDate)}`}
                    {r.category && ` · ${r.category.name}`}
                  </div>
                </td>
                <td className={cn("px-6 py-2.5 text-right whitespace-nowrap", r.amount > 0 && "text-accent")}>{formatBRL(r.amount)}</td>
                <td className="px-6 py-2.5 text-right whitespace-nowrap font-medium">{formatBRL(r.yearly)}</td>
                <td className="px-6 py-2.5 text-right whitespace-nowrap text-fg-muted">{formatBRL(r.paidLast12m)}</td>
                <td className="px-6 py-2.5 text-right whitespace-nowrap text-fg-muted">{formatDate(r.upcoming)}</td>
                <td className="px-2 py-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <RecurringActions id={r.id} active={r.active} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export default async function RecurringsPage() {
  const [recurrings, paused] = await Promise.all([
    getActiveRecurrings(),
    prisma.recurring.findMany({ where: { active: false }, orderBy: { lastDate: "desc" } }),
  ]);

  const outflows = recurrings.filter((r) => r.amount < 0);
  const subscriptions = outflows.filter((r) => SUBSCRIPTION_CATEGORIES.has(r.category?.name ?? ""));
  const housing = outflows.filter((r) => HOUSING_CATEGORIES.has(r.category?.name ?? ""));
  const bills = outflows.filter((r) => !subscriptions.includes(r) && !housing.includes(r));
  const incomes = recurrings.filter((r) => r.amount > 0);

  return (
    <>
      <PageHeader title="Recorrentes" subtitle="Assinaturas, contas fixas e receitas — ordenadas pelo custo anual" />

      <div className="grid grid-cols-12 gap-4 mb-6">
        <Card className="col-span-12 md:col-span-4">
          <CardHeader><CardTitle>Assinaturas</CardTitle></CardHeader>
          <CardValue className="text-danger">{formatBRL(sum(subscriptions, (r) => r.yearly))}<span className="text-base text-fg-muted">/ano</span></CardValue>
          <div className="text-xs text-fg-muted mt-3">{formatBRL(sum(subscriptions, (r) => r.monthly))}/mês · {subscriptions.length} ativas — onde cortar primeiro</div>
        </Card>
        <Card className="col-span-12 md:col-span-4">
          <CardHeader><CardTitle>Contas fixas</CardTitle></CardHeader>
          <CardValue>{formatBRL(sum(bills, (r) => r.yearly))}<span className="text-base text-fg-muted">/ano</span></CardValue>
          <div className="text-xs text-fg-muted mt-3">{formatBRL(sum(bills, (r) => r.monthly))}/mês · telefone, internet e similares</div>
        </Card>
        <Card className="col-span-12 md:col-span-4">
          <CardHeader><CardTitle>Moradia</CardTitle></CardHeader>
          <CardValue>{formatBRL(sum(housing, (r) => r.yearly))}<span className="text-base text-fg-muted">/ano</span></CardValue>
          <div className="text-xs text-fg-muted mt-3">{formatBRL(sum(housing, (r) => r.monthly))}/mês · aluguel, condomínio e energia</div>
        </Card>
      </div>

      <div className="space-y-4">
        <RecurringSection title="Assinaturas" icon={Sparkles} items={subscriptions} hint="Passe o mouse numa linha para pausar (cancelou) ou excluir." />
        <RecurringSection title="Contas fixas" icon={Receipt} items={bills} />
        <RecurringSection title="Moradia" icon={Home} items={housing} />
        {incomes.length > 0 && <RecurringSection title="Receitas" icon={TrendingUp} items={incomes} />}
        {paused.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Pausadas / encerradas · {paused.length}</CardTitle>
            </CardHeader>
            <ul className="divide-y divide-border">
              {paused.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2.5 text-sm text-fg-muted">
                  <span>
                    {r.name}
                    {r.lastDate && <span className="text-xs"> · última cobrança {formatDate(r.lastDate)}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    {formatBRL(r.amount)}
                    <RecurringActions id={r.id} active={false} />
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
