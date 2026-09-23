import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import { formatBRL, formatDate } from "@/lib/domain/format";
import { Sparkles, Receipt, TrendingUp, Home } from "lucide-react";
import { getActiveRecurrings, getPausedRecurrings } from "@/lib/data/recurrings";
import { getCategoryOptions } from "@/lib/data/categories";
import { RecurringActions } from "@/components/recurrings/recurring-actions";
import { RecurringSection, sum } from "@/components/recurrings/recurring-section";

/** Categories treated as subscriptions (discretionary — the first place to look when cutting). */
const SUBSCRIPTION_CATEGORIES = new Set(["Streaming", "Assinaturas", "Academia", "Tecnologia & Software", "Educação", "Lazer", "Cuidados pessoais"]);
const HOUSING_CATEGORIES = new Set(["Aluguel", "Contas de casa"]);

export default async function RecurringsPage() {
  const [recurrings, paused, categories] = await Promise.all([
    getActiveRecurrings(),
    getPausedRecurrings(),
    getCategoryOptions(),
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
        <RecurringSection
          title="Assinaturas"
          icon={Sparkles}
          items={subscriptions}
          categories={categories}
        />
        <RecurringSection title="Contas fixas" icon={Receipt} items={bills} categories={categories} />
        <RecurringSection title="Moradia" icon={Home} items={housing} categories={categories} />
        {incomes.length > 0 && <RecurringSection title="Receitas" icon={TrendingUp} items={incomes} categories={categories} />}
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
                    <RecurringActions recurring={r} active={false} categories={categories} />
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
