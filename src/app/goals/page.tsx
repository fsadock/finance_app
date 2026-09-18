import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { getGoalsWithAccounts } from "@/lib/data/goals";
import { goalProgress } from "@/lib/domain/goals";
import { formatBRL, formatBRLCompact, startOfDay } from "@/lib/domain/format";
import { Link2, Target } from "lucide-react";
import { AddGoalButton, EditGoalButton } from "@/components/goals/goal-editor";
import { GoalDeleteButton } from "@/components/goals/goal-delete-button";

export default async function GoalsPage() {
  const { goals, accounts } = await getGoalsWithAccounts();

  const today = startOfDay(new Date());
  const rows = goals.map((g) => goalProgress(g, today));
  const totalSaved = rows.reduce((s, r) => s + r.saved, 0);
  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);

  return (
    <>
      <PageHeader
        title="Metas"
        subtitle={
          goals.length === 0
            ? "Nenhuma meta cadastrada"
            : `${goals.length} metas · ${formatBRLCompact(totalSaved)} de ${formatBRLCompact(totalTarget)} (${totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0}%)`
        }
        actions={<AddGoalButton accounts={accounts} />}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rows.map(({ goal: g, saved, remaining, pct, daysLeft, monthlyNeeded }) => {
          const color = g.color ?? "#00d28d";
          return (
            <Card key={g.id} className="p-6 relative group">
              <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <EditGoalButton
                  accounts={accounts}
                  goal={{
                    id: g.id,
                    name: g.name,
                    targetAmount: g.targetAmount,
                    currentAmount: g.currentAmount,
                    deadline: g.deadline,
                    color: g.color,
                    accountId: g.accountId,
                  }}
                />
                <GoalDeleteButton id={g.id} />
              </div>

              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="size-12 rounded-xl grid place-items-center" style={{ background: `${color}20` }}>
                    <Target className="size-5" style={{ color }} />
                  </div>
                  <div>
                    <div className="font-semibold text-lg">{g.name}</div>
                    <div className="text-xs text-fg-muted flex items-center gap-2">
                      {daysLeft !== null && (daysLeft > 0 ? `${daysLeft} dias restantes` : "Prazo vencido")}
                      {g.account && (
                        <span className="inline-flex items-center gap-1">
                          <Link2 className="size-3" /> {g.account.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right mr-14">
                  <div className="text-xs text-fg-muted">Progresso</div>
                  <div className="text-lg font-semibold">{Math.round(pct)}%</div>
                </div>
              </div>

              <div className="h-3 rounded-full bg-bg-hover overflow-hidden mb-3">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
              </div>

              <div className="flex items-baseline justify-between text-sm">
                <span className="text-fg-muted">{formatBRL(saved)} guardados</span>
                <span className="text-fg-muted">de {formatBRL(g.targetAmount)}</span>
              </div>

              <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="text-fg-muted">Faltam</div>
                  <div className="font-medium mt-0.5">{remaining > 0 ? formatBRL(remaining) : "Meta atingida 🎉"}</div>
                </div>
                {monthlyNeeded !== null && (
                  <div>
                    <div className="text-fg-muted">Por mês até o prazo</div>
                    <div className="font-medium mt-0.5">{formatBRL(monthlyNeeded)}</div>
                  </div>
                )}
              </div>
            </Card>
          );
        })}

        {goals.length === 0 && (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-2xl">
            <Target className="size-10 text-fg-muted mx-auto mb-4" />
            <h3 className="text-lg font-medium">Nenhuma meta definida</h3>
            <p className="text-sm text-fg-muted mb-6">Comece criando sua primeira meta financeira.</p>
            <div className="inline-block">
              <AddGoalButton accounts={accounts} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
