import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { formatBRL, formatDate } from "@/lib/format";
import { Search, AlertCircle } from "lucide-react";
import { TxStatus, type Prisma } from "@/generated/prisma/client";

type Props = {
  searchParams: Promise<{ status?: string; q?: string; cat?: string; from?: string; to?: string }>;
};

export default async function TransactionsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const where: Prisma.TransactionWhereInput = {};
  if (sp.status === "REVIEW") where.status = TxStatus.REVIEW;
  if (sp.cat) where.categoryId = sp.cat;
  if (sp.q) where.description = { contains: sp.q };
  if (sp.from || sp.to) {
    where.date = {};
    if (sp.from) where.date.gte = new Date(sp.from);
    if (sp.to) where.date.lte = new Date(sp.to);
  }

  const [txs, categories, accounts] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { account: true, category: true },
      orderBy: { date: "desc" },
      take: 200,
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.account.findMany({ orderBy: { name: "asc" } }),
  ]);

  const totalSpend = txs.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalIncome = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);

  return (
    <>
      <PageHeader
        title="Transações"
        subtitle={`${txs.length} resultado(s) · saída ${formatBRL(totalSpend)} · entrada ${formatBRL(totalIncome)}`}
      />

      <Card className="mb-6 p-4">
        <form className="flex flex-wrap gap-3 items-center text-sm">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              name="q"
              defaultValue={sp.q}
              placeholder="Buscar descrição…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-elev border border-border focus:border-accent outline-none"
            />
          </div>
          <select
            name="cat"
            defaultValue={sp.cat ?? ""}
            className="px-3 py-2 rounded-lg bg-bg-elev border border-border focus:border-accent outline-none"
          >
            <option value="">Todas categorias</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={sp.status ?? ""}
            className="px-3 py-2 rounded-lg bg-bg-elev border border-border focus:border-accent outline-none"
          >
            <option value="">Todos status</option>
            <option value="POSTED">Confirmado</option>
            <option value="PENDING">Pendente</option>
            <option value="REVIEW">Revisar</option>
          </select>
          <input
            type="date"
            name="from"
            defaultValue={sp.from}
            className="px-3 py-2 rounded-lg bg-bg-elev border border-border focus:border-accent outline-none"
          />
          <input
            type="date"
            name="to"
            defaultValue={sp.to}
            className="px-3 py-2 rounded-lg bg-bg-elev border border-border focus:border-accent outline-none"
          />
          <button className="px-4 py-2 rounded-lg bg-accent text-bg font-medium hover:bg-accent-hover">
            Filtrar
          </button>
        </form>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-fg-muted border-b border-border">
              <th className="px-6 py-3 font-medium">Data</th>
              <th className="px-6 py-3 font-medium">Descrição</th>
              <th className="px-6 py-3 font-medium">Categoria</th>
              <th className="px-6 py-3 font-medium">Conta</th>
              <th className="px-6 py-3 font-medium text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.id} className="border-b border-border hover:bg-bg-hover/40">
                <td className="px-6 py-3 text-fg-muted whitespace-nowrap">{formatDate(t.date)}</td>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    {t.status === "REVIEW" && <AlertCircle className="size-4 text-warn" />}
                    <span className="font-medium">{t.description}</span>
                  </div>
                </td>
                <td className="px-6 py-3">
                  {t.category ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ background: t.category.color ?? "#6b7280" }} />
                      {t.category.name}
                    </span>
                  ) : (
                    <span className="text-fg-muted italic">Sem categoria</span>
                  )}
                </td>
                <td className="px-6 py-3 text-fg-muted">{t.account.name}</td>
                <td className={`px-6 py-3 text-right whitespace-nowrap ${t.amount > 0 ? "text-accent" : ""}`}>
                  {formatBRL(t.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {txs.length === 0 && (
          <div className="p-12 text-center text-fg-muted">Sem transações para os filtros selecionados.</div>
        )}
      </Card>
    </>
  );
}
