import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { formatBRL, formatDate, formatDateTime, startOfDay } from "@/lib/format";
import { Wallet, CreditCard, PiggyBank, TrendingUp, Coins, Banknote, CalendarClock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { PluggyConnectButton, ReconnectButton } from "@/components/pluggy-connect-button";
import { HideAccountToggle } from "@/components/accounts/hide-toggle";
import { getNetWorthHistory } from "@/lib/queries";
import { getConfigNumber } from "@/lib/config";
import { resolveBillingCycle } from "@/lib/billing";
import { FLOW_SELECT, SPEND_WHERE, spendDelta } from "@/lib/flows";
import { NetWorthChart } from "@/components/dashboard/net-worth-chart";
import { differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";

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

const ITEM_STATUS: Record<string, { label: string; ok: boolean }> = {
  UPDATED: { label: "Atualizada", ok: true },
  UPDATING: { label: "Atualizando", ok: true },
  MERGING: { label: "Atualizando", ok: true },
  OUTDATED: { label: "Falhou na última atualização", ok: false },
  LOGIN_ERROR: { label: "Credenciais inválidas — reconecte", ok: false },
  WAITING_USER_INPUT: { label: "Aguardando ação no banco", ok: false },
  WAITING_USER_ACTION: { label: "Aguardando ação no banco", ok: false },
};

export default async function AccountsPage() {
  const today = startOfDay(new Date());

  const [accounts, history, items, closeDay] = await Promise.all([
    prisma.account.findMany({
      orderBy: [{ type: "asc" }, { name: "asc" }],
      include: { creditCardBills: { orderBy: { dueDate: "desc" }, take: 2 } },
    }),
    getNetWorthHistory(12),
    prisma.pluggyItem.findMany({ orderBy: { createdAt: "asc" } }),
    getConfigNumber("ccCycleCloseDay"),
  ]);

  // Open fatura per card = net spend inside the current billing cycle
  const openBill = new Map<string, { total: number; start: Date; end: Date }>();
  const cards = accounts.filter((a) => a.type === "CREDIT_CARD");
  const cycles = cards
    .map((a) => ({
      id: a.id,
      cycle: resolveBillingCycle({
        today,
        closeDay,
        balanceCloseDate: a.balanceCloseDate,
        lastBillDueDate: a.creditCardBills[0]?.dueDate,
      }),
    }))
    .filter((c): c is { id: string; cycle: NonNullable<typeof c.cycle> } => c.cycle !== null);
  if (cycles.length > 0) {
    const earliest = cycles.reduce((min, c) => (c.cycle.start < min ? c.cycle.start : min), cycles[0]!.cycle.start);
    const txs = await prisma.transaction.findMany({
      where: { AND: [{ accountId: { in: cycles.map((c) => c.id) }, date: { gte: earliest } }, SPEND_WHERE] },
      select: { ...FLOW_SELECT, accountId: true, date: true },
    });
    for (const { id, cycle } of cycles) {
      const total = txs
        .filter((t) => t.accountId === id && t.date >= cycle.start && t.date < cycle.end)
        .reduce((s, t) => s + spendDelta(t), 0);
      openBill.set(id, { total, ...cycle });
    }
  }

  const visible = accounts.filter((a) => !a.hidden);
  const totalAssets = visible.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0);
  const totalDebts = visible.filter((a) => a.balance < 0).reduce((s, a) => s + Math.abs(a.balance), 0);

  const groups = new Map<string, typeof accounts>();
  for (const a of accounts) {
    if (!groups.has(a.type)) groups.set(a.type, []);
    groups.get(a.type)!.push(a);
  }

  const estimated = history.some((h) => h.estimated);

  return (
    <>
      <PageHeader title="Contas" subtitle="Todas as suas contas e cartões" actions={<PluggyConnectButton />} />

      {items.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Conexões Open Finance</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-border">
            {items.map((it) => {
              const status = ITEM_STATUS[it.status] ?? { label: it.status, ok: false };
              const consentDays = it.consentExpiresAt ? differenceInCalendarDays(it.consentExpiresAt, today) : null;
              const consentWarning = consentDays !== null && consentDays <= 30;
              const needsAction = !status.ok || Boolean(it.lastError) || consentWarning;
              return (
                <li key={it.id} className="py-3 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    {needsAction ? (
                      <AlertTriangle className="size-4 text-warn shrink-0" />
                    ) : (
                      <CheckCircle2 className="size-4 text-accent shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-medium">{it.connector}</div>
                      <div className="text-xs text-fg-muted">
                        {status.label}
                        {it.lastSyncedAt && ` · sincronizada ${formatDateTime(it.lastSyncedAt)}`}
                        {consentDays !== null && (
                          <span className={cn(consentWarning && "text-warn")}>
                            {" · "}
                            {consentDays < 0
                              ? "consentimento expirado"
                              : `consentimento expira em ${consentDays} dia(s) (${formatDate(it.consentExpiresAt!)})`}
                          </span>
                        )}
                      </div>
                      {it.lastError && <div className="text-xs text-danger mt-0.5 truncate">{it.lastError}</div>}
                    </div>
                  </div>
                  {needsAction && <ReconnectButton itemId={it.pluggyId} />}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Evolução do patrimônio</CardTitle>
          {estimated && (
            <span className="text-xs text-fg-muted" title="Meses antes do primeiro snapshot de saldo são estimados a partir do fluxo de caixa">
              meses iniciais estimados
            </span>
          )}
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
          {accounts.length !== visible.length && (
            <div className="text-xs text-fg-muted mt-3">{accounts.length - visible.length} conta(s) oculta(s) fora dos totais</div>
          )}
        </Card>
      </div>

      <div className="space-y-6">
        {Array.from(groups.entries()).map(([type, list]) => {
          const Icon = ACCOUNT_ICON[type as keyof typeof ACCOUNT_ICON] ?? Wallet;
          const groupTotal = list.filter((a) => !a.hidden).reduce((s, a) => s + a.balance, 0);
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
                  const bill = openBill.get(a.id);
                  const usedPct = a.creditLimit ? Math.min(100, (Math.abs(a.balance) / a.creditLimit) * 100) : null;

                  return (
                    <Card key={a.id} className={cn("p-5 flex flex-col justify-between", a.hidden && "opacity-50")}>
                      <div>
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium">{a.name}</div>
                            <div className="text-xs text-fg-muted mt-0.5">
                              {a.institution}
                              {a.hidden && " · oculta"}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <HideAccountToggle accountId={a.id} hidden={a.hidden} />
                            <Icon className="size-5 text-fg-muted" strokeWidth={1.5} />
                          </div>
                        </div>
                        <div className={`mt-5 text-2xl font-semibold ${a.balance < 0 ? "text-danger" : ""}`}>
                          {formatBRL(a.balance)}
                        </div>
                      </div>

                      {isCC && (
                        <div className="mt-6 pt-4 border-t border-border space-y-3">
                          {bill && (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-bold text-fg-muted">
                                <span>Fatura aberta</span>
                                <span className="text-fg font-semibold text-sm normal-case">{formatBRL(bill.total)}</span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-fg-muted">
                                <span>fecha {formatDate(bill.end)}</span>
                                {a.balanceDueDate && (
                                  <span className="flex items-center gap-1">
                                    <CalendarClock className="size-3" /> vence {formatDate(a.balanceDueDate)}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {a.availableCreditLimit != null && (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-fg-muted">Limite disponível</span>
                              <span className="text-accent font-medium">{formatBRL(a.availableCreditLimit)}</span>
                            </div>
                          )}

                          {usedPct !== null && (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-[10px] text-fg-muted uppercase tracking-wider font-bold">
                                <span>Limite utilizado</span>
                                <span>{Math.round(usedPct)}% de {formatBRL(a.creditLimit!)}</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-bg-hover overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${usedPct}%`,
                                    background: usedPct > 80 ? "var(--color-danger)" : usedPct > 50 ? "var(--color-warn)" : "var(--color-accent)",
                                  }}
                                />
                              </div>
                            </div>
                          )}

                          {a.creditCardBills.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-[10px] uppercase tracking-wider font-bold text-fg-muted mb-1.5">Faturas fechadas</div>
                              {a.creditCardBills.map((b) => (
                                <div key={b.id} className="flex items-center justify-between text-xs text-fg-muted">
                                  <span>venc. {formatDate(b.dueDate)}</span>
                                  <span>{formatBRL(b.totalAmount)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
        {accounts.length === 0 && (
          <Card className="text-center py-16 text-fg-muted">
            Nenhuma conta ainda. Use <span className="text-fg">Conectar conta</span> para trazer seus bancos e cartões via Open Finance.
          </Card>
        )}
      </div>
    </>
  );
}
