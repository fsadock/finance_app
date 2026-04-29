import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { Target } from "lucide-react";
import { AddGoalButton } from "@/components/goal-editor";
import { GoalDeleteButton } from "@/components/goal-delete-button";

export default async function GoalsPage() {
  const goals = await prisma.goal.findMany({ orderBy: [{ createdAt: "asc" }] });
  const totalSaved = goals.reduce((s, g) => s + g.currentAmount, 0);
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
        actions={<AddGoalButton />}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {goals.map((g) => {
          const pct = Math.min(100, (g.currentAmount / g.targetAmount) * 100);
          const remaining = g.targetAmount - g.currentAmount;
          const daysToDeadline = g.deadline ? Math.ceil((g.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
          const monthlyNeeded = daysToDeadline && daysToDeadline > 0 ? (remaining / daysToDeadline) * 30 : null;
          
          return (
            <Card key={g.id} className="p-6 relative group">
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <GoalDeleteButton id={g.id} />
              </div>

              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="size-12 rounded-xl grid place-items-center" style={{ background: `${g.color}20` }}>
                    <Target className="size-5" style={{ color: g.color ?? "var(--color-accent)" }} />
                  </div>
                  <div>
                    <div className="font-semibold text-lg">{g.name}</div>
                    {g.deadline && (
                      <div className="text-xs text-fg-muted">
                        {daysToDeadline! > 0 ? `${daysToDeadline} dias restantes` : "Prazo vencido"}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-fg-muted">Progresso</div>
                  <div className="text-lg font-semibold">{Math.round(pct)}%</div>
                </div>
              </div>

              <div className="h-3 rounded-full bg-bg-hover overflow-hidden mb-3">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: g.color ?? "var(--color-accent)" }}
                />
              </div>

              <div className="flex items-baseline justify-between text-sm">
                <span className="text-fg-muted">{formatBRL(g.currentAmount)} guardados</span>
                <span className="text-fg-muted">de {formatBRL(g.targetAmount)}</span>
              </div>

              <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="text-fg-muted">Faltam</div>
                  <div className="font-medium mt-0.5">{formatBRL(remaining)}</div>
                </div>
                {monthlyNeeded && (
                  <div>
                    <div className="text-fg-muted">Por mês</div>
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
            <AddGoalButton />
          </div>
        )}
      </div>
    </>
  );
}
