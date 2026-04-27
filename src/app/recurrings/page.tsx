import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { formatBRL, formatDate } from "@/lib/format";
import { Sparkles, Repeat } from "lucide-react";

const CADENCE_LABEL: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
  QUARTERLY: "Trimestral",
  YEARLY: "Anual",
};

const CADENCE_TO_MONTHLY: Record<string, number> = {
  WEEKLY: 4.33,
  BIWEEKLY: 2.17,
  MONTHLY: 1,
  QUARTERLY: 1 / 3,
  YEARLY: 1 / 12,
};

export default async function RecurringsPage() {
  const recurrings = await prisma.recurring.findMany({
    where: { active: true },
    include: { account: true, category: true },
    orderBy: { nextDate: "asc" },
  });

  const subscriptions = recurrings.filter((r) => r.amount < 0 && (r.category?.name === "Streaming" || r.category?.name === "Assinaturas" || r.category?.name === "Academia"));
  const bills = recurrings.filter((r) => r.amount < 0 && !subscriptions.includes(r));
  const incomes = recurrings.filter((r) => r.amount > 0);

  const monthlySubs = subscriptions.reduce((s, r) => s + Math.abs(r.amount) * (CADENCE_TO_MONTHLY[r.cadence] ?? 1), 0);
  const monthlyBills = bills.reduce((s, r) => s + Math.abs(r.amount) * (CADENCE_TO_MONTHLY[r.cadence] ?? 1), 0);
  const monthlyIncome = incomes.reduce((s, r) => s + r.amount * (CADENCE_TO_MONTHLY[r.cadence] ?? 1), 0);

  const Section = ({ title, icon: Icon, items }: { title: string; icon: typeof Repeat; items: typeof recurrings }) => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4" /> {title} · {items.length}
        </CardTitle>
      </CardHeader>
      {items.length === 0 ? (
        <div className="text-sm text-fg-muted py-4 text-center">Nenhuma recorrência detectada.</div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-lg bg-bg-elev grid place-items-center">
                  <Repeat className="size-4 text-fg-muted" />
                </div>
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {r.name}
                    {r.detectedByAI && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-info/20 text-info flex items-center gap-1">
                        <Sparkles className="size-3" /> AI
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-fg-muted">
                    {CADENCE_LABEL[r.cadence] ?? r.cadence} · próxima: {formatDate(r.nextDate)}
                    {r.category && ` · ${r.category.name}`}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className={r.amount > 0 ? "text-accent" : ""}>{formatBRL(r.amount)}</div>
                {r.account && <div className="text-xs text-fg-muted">{r.account.name}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  return (
    <>
      <PageHeader
        title="Recorrentes"
        subtitle="Assinaturas, contas fixas e receitas detectadas"
      />

      <div className="grid grid-cols-12 gap-4 mb-6">
        <Card className="col-span-12 md:col-span-4">
          <CardHeader>
            <CardTitle>Assinaturas (mês)</CardTitle>
          </CardHeader>
          <CardValue className="text-danger">{formatBRL(monthlySubs)}</CardValue>
          <div className="text-xs text-fg-muted mt-3">{subscriptions.length} ativas</div>
        </Card>
        <Card className="col-span-12 md:col-span-4">
          <CardHeader>
            <CardTitle>Contas fixas (mês)</CardTitle>
          </CardHeader>
          <CardValue className="text-danger">{formatBRL(monthlyBills)}</CardValue>
          <div className="text-xs text-fg-muted mt-3">{bills.length} ativas</div>
        </Card>
        <Card className="col-span-12 md:col-span-4">
          <CardHeader>
            <CardTitle>Receitas recorrentes (mês)</CardTitle>
          </CardHeader>
          <CardValue className="text-accent">{formatBRL(monthlyIncome)}</CardValue>
          <div className="text-xs text-fg-muted mt-3">{incomes.length} ativas</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Assinaturas" icon={Sparkles} items={subscriptions} />
        <Section title="Contas fixas" icon={Repeat} items={bills} />
        <Section title="Receitas" icon={Repeat} items={incomes} />
      </div>
    </>
  );
}
