import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { formatBRL, formatDate } from "@/lib/format";
import { Wallet, CreditCard, PiggyBank, TrendingUp, Coins, Banknote, CalendarClock, Zap } from "lucide-react";
import { PluggyConnectButton } from "@/components/pluggy-connect-button";
import { getNetWorthHistory } from "@/lib/queries";
import { NetWorthChart } from "@/components/dashboard/net-worth-chart";

const ACCOUNT_ICON = {
  CHECKING: Wallet,
  SAVINGS: PiggyBank,
  CREDIT_CARD: CreditCard,
  INVESTMENT: TrendingUp,
  CASH: Banknote,
  LOAN: Coins,
} as const;

const ACCOUNT_LABEL = {
  CHECKING: "Conta corrente",
  SAVINGS: "Poupança",
  CREDIT_CARD: "Cartão de crédito",
  INVESTMENT: "Investimento",
  CASH: "Dinheiro",
  LOAN: "Empréstimo",
} as const;

export default async function AccountsPage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [accounts, history, bills] = await Promise.all([
    prisma.account.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] }),
    getNetWorthHistory(12),
    prisma.creditCardBill.findMany({ orderBy: { dueDate: "desc" } }),
  ]);

  // Pluggy never returns the current open bill. Derive it from transactions
  // within the current billing cycle: billingStart ≈ lastClosedBill.dueDate - 7 days.
  const openBillMap = new Map<string, number>();
  const ccAccountIds = accounts.filter(a => a.type === "CREDIT_CARD").map(a => a.id);
  if (ccAccountIds.length > 0) {
    const latestBillPerAccount = await prisma.creditCardBill.findMany({
      where: { accountId: { in: ccAccountIds } },
      orderBy: { dueDate: "desc" },
      distinct: ["accountId"],
    });
    if (latestBillPerAccount.length > 0) {
      const billingStarts = latestBillPerAccount.map(b => {
        const s = new Date(b.dueDate);
        s.setDate(s.getDate() - 7);
        s.setHours(0, 0, 0, 0);
        return { id: b.accountId, billingStart: s };
      });
      const earliestStart = billingStarts.reduce((min, x) => x.billingStart < min ? x.billingStart : min, billingStarts[0].billingStart);
      const ccTxs = await prisma.transaction.findMany({
        where: {
          accountId: { in: ccAccountIds },
          date: { gte: earliestStart },
          amount: { lt: 0 },
          excludeFromBudget: false,
        },
        select: { accountId: true, amount: true, date: true },
      });
      for (const { id, billingStart } of billingStarts) {
        const total = ccTxs
          .filter(t => t.accountId === id && new Date(t.date) >= billingStart)
          .reduce((s, t) => s + Math.abs(t.amount), 0);
        openBillMap.set(id, total);
      }
    }
  }

  // Closed bills from DB (past only — Pluggy never returns open bills)
  const closedBillMap = new Map<string, typeof bills>();
  for (const b of bills) {
    if (!closedBillMap.has(b.accountId)) closedBillMap.set(b.accountId, []);
    const list = closedBillMap.get(b.accountId)!;
    if (list.length < 2) list.push(b);
  }

  const groups = new Map<string, typeof accounts>();
  for (const a of accounts) {
    if (!groups.has(a.type)) groups.set(a.type, []);
    groups.get(a.type)!.push(a);
  }

  const totalAssets = accounts.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0);
  const totalDebts = accounts.filter((a) => a.balance < 0).reduce((s, a) => s + Math.abs(a.balance), 0);

  return (
    <>
      <PageHeader title="Contas" subtitle="Todas as suas contas e cartões" actions={<PluggyConnectButton />} />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Evolução do Patrimônio</CardTitle>
        </CardHeader>
        <NetWorthChart data={history} />
      </Card>

      <div className="grid grid-cols-12 gap-4 mb-6">
        <Card className="col-span-12 md:col-span-4">
          <CardHeader><CardTitle>Ativos</CardTitle></CardHeader>
          <CardValue className="text-accent">{formatBRL(totalAssets)}</CardValue>
        </Card>
        <Card className="col-span-12 md:col-span-4">
          <CardHeader><CardTitle>Dívidas</CardTitle></CardHeader>
          <CardValue className="text-danger">{formatBRL(totalDebts)}</CardValue>
        </Card>
        <Card className="col-span-12 md:col-span-4">
          <CardHeader><CardTitle>Líquido</CardTitle></CardHeader>
          <CardValue>{formatBRL(totalAssets - totalDebts)}</CardValue>
        </Card>
      </div>

      <div className="space-y-6">
        {Array.from(groups.entries()).map(([type, list]) => {
          const Icon = ACCOUNT_ICON[type as keyof typeof ACCOUNT_ICON] ?? Wallet;
          const groupTotal = list.reduce((s, a) => s + a.balance, 0);
          return (
            <div key={type}>
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2 text-fg-muted text-sm">
                  <Icon className="size-4" strokeWidth={1.75} />
                  <span>{ACCOUNT_LABEL[type as keyof typeof ACCOUNT_LABEL]}</span>
                  <span className="text-fg-subtle">· {list.length}</span>
                </div>
                <span className="text-sm font-medium">{formatBRL(groupTotal)}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {list.map((a) => {
                  const isCC = a.type === "CREDIT_CARD";
                  const openBillTotal = openBillMap.get(a.id);
                  const closedBills = closedBillMap.get(a.id) ?? [];
                  const hasOpenBill = openBillTotal !== undefined;

                  return (
                    <Card key={a.id} className="p-5 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium">{a.name}</div>
                            <div className="text-xs text-fg-muted mt-0.5">{a.institution}</div>
                          </div>
                          <Icon className="size-5 text-fg-muted" strokeWidth={1.5} />
                        </div>
                        <div className={`mt-5 text-2xl font-semibold ${a.balance < 0 ? "text-danger" : ""}`}>
                          {formatBRL(a.balance)}
                        </div>
                      </div>

                      <div className="mt-6 pt-4 border-t border-border space-y-3">
                        {/* Current open bill — computed from billing-cycle transactions */}
                        {isCC && hasOpenBill && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-bold text-fg-muted">
                              <span>Fatura aberta</span>
                              <span className="text-fg font-semibold text-sm">{formatBRL(openBillTotal)}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-fg-muted">
                              {a.balanceDueDate && (
                                <span className="flex items-center gap-1">
                                  <CalendarClock className="size-3" />
                                  Vence {formatDate(a.balanceDueDate)}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Fallback: last closed bill when no open bill data */}
                        {isCC && !hasOpenBill && closedBills[0] && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-bold text-fg-muted">
                              <span>Última fatura</span>
                              <span className="text-fg font-semibold text-sm">{formatBRL(closedBills[0].totalAmount)}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-fg-muted">
                              <span className="flex items-center gap-1">
                                <CalendarClock className="size-3" />
                                Venceu {formatDate(closedBills[0].dueDate)}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Available credit */}
                        {isCC && a.availableCreditLimit != null && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-fg-muted">Limite disponível</span>
                            <span className="text-accent font-medium">{formatBRL(a.availableCreditLimit)}</span>
                          </div>
                        )}

                        {/* Credit utilization bar (fallback when no bill data at all) */}
                        {a.creditLimit && !hasOpenBill && closedBills.length === 0 && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[10px] text-fg-muted uppercase tracking-wider font-bold">
                              <span>Limite utilizado</span>
                              <span>{Math.round((Math.abs(a.balance) / a.creditLimit) * 100)}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-bg-hover overflow-hidden">
                              <div
                                className="h-full rounded-full bg-fg-muted/30"
                                style={{ width: `${Math.min(100, (Math.abs(a.balance) / a.creditLimit) * 100)}%` }}
                              />
                            </div>
                            <div className="text-[10px] text-fg-muted italic">
                              Limite: {formatBRL(a.creditLimit)}
                            </div>
                          </div>
                        )}

                        {/* Closed bills */}
                        {isCC && closedBills.length > 0 && (
                          <div className="space-y-1">
                            <div className="text-[10px] uppercase tracking-wider font-bold text-fg-muted mb-1.5">Faturas fechadas</div>
                            {closedBills.map((b) => (
                              <div key={b.id} className="flex items-center justify-between text-xs text-fg-muted">
                                <span>{formatDate(b.dueDate)}</span>
                                <span>{formatBRL(b.totalAmount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
