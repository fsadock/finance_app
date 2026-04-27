import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { formatBRL } from "@/lib/format";
import { Wallet, CreditCard, PiggyBank, TrendingUp, Coins, Banknote } from "lucide-react";
import { PluggyConnectButton } from "@/components/pluggy-connect-button";

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
  const accounts = await prisma.account.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] });

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

      <div className="grid grid-cols-12 gap-4 mb-6">
        <Card className="col-span-12 md:col-span-4">
          <CardHeader>
            <CardTitle>Ativos</CardTitle>
          </CardHeader>
          <CardValue className="text-accent">{formatBRL(totalAssets)}</CardValue>
        </Card>
        <Card className="col-span-12 md:col-span-4">
          <CardHeader>
            <CardTitle>Dívidas</CardTitle>
          </CardHeader>
          <CardValue className="text-danger">{formatBRL(totalDebts)}</CardValue>
        </Card>
        <Card className="col-span-12 md:col-span-4">
          <CardHeader>
            <CardTitle>Líquido</CardTitle>
          </CardHeader>
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
                {list.map((a) => (
                  <Card key={a.id} className="p-5">
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
                    {a.creditLimit && (
                      <div className="mt-3 text-xs text-fg-muted">
                        Limite: {formatBRL(a.creditLimit)} ·{" "}
                        {Math.round((Math.abs(a.balance) / a.creditLimit) * 100)}% usado
                      </div>
                    )}
                    {a.creditLimit && (
                      <div className="mt-2 h-1.5 rounded-full bg-bg-hover overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${Math.min(100, (Math.abs(a.balance) / a.creditLimit) * 100)}%` }}
                        />
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
