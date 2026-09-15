import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { formatBRL, formatDate } from "@/lib/format";
import { Search, Download, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { PeriodPicker } from "@/components/period-picker";
import { CategoryPicker } from "@/components/category-picker";
import { TagPicker } from "@/components/tag-picker";
import { TransferBadge } from "@/components/transactions/unpair-button";
import { NotesEditor } from "@/components/transactions/notes-editor";
import { buildTransactionWhere, filtersToSearchParams, TX_FILTER_KEYS, type TxFilterParams } from "@/lib/transaction-filters";
import Link from "next/link";

const PAGE_SIZE = 50;
const COUNTERPARTY_LABEL: Record<string, string> = { SELF: "conta própria", CPF: "pessoa física", CNPJ: "empresa" };

type Props = { searchParams: Promise<TxFilterParams & { page?: string }> };

const selectClass = "px-3 py-2 rounded-lg bg-bg-elev border border-border focus:border-accent outline-none";

export default async function TransactionsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filters: TxFilterParams = Object.fromEntries(TX_FILTER_KEYS.map((k) => [k, sp[k] ?? null]));
  const where = buildTransactionWhere(filters);
  const page = Math.max(1, Number(sp.page) || 1);

  const [txs, count, outflow, inflow, categories, accounts, allTags] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { account: true, category: true, tags: true },
      orderBy: [{ date: "desc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.aggregate({ where: { AND: [where, { amount: { lt: 0 } }] }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { AND: [where, { amount: { gt: 0 } }] }, _sum: { amount: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true, group: true } }),
    prisma.account.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
  ]);

  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const pageHref = (p: number) => `/transactions?${filtersToSearchParams(filters, { page: String(p) })}`;
  const exportUrl = `/api/transactions/export?${filtersToSearchParams(filters)}`;

  return (
    <>
      <PageHeader
        title="Transações"
        subtitle={`${count} resultado(s) · saídas ${formatBRL(Math.abs(outflow._sum.amount ?? 0))} · entradas ${formatBRL(inflow._sum.amount ?? 0)}`}
        actions={
          <div className="flex items-center gap-2">
            <a
              href={exportUrl}
              download
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-fg-muted hover:text-fg hover:border-fg-muted transition-colors"
              title="Exportar CSV com os filtros atuais"
            >
              <Download className="size-3.5" />
              CSV
            </a>
            <PeriodPicker />
          </div>
        }
      />

      <Card className="mb-6 p-4">
        <form className="flex flex-wrap gap-3 items-center text-sm">
          {filters.month && <input type="hidden" name="month" value={filters.month} />}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="Buscar descrição, comerciante ou nota…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-elev border border-border focus:border-accent outline-none"
            />
          </div>
          <select name="cat" defaultValue={filters.cat ?? ""} className={selectClass}>
            <option value="">Todas categorias</option>
            <option value="none">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select name="account" defaultValue={filters.account ?? ""} className={selectClass}>
            <option value="">Todas contas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <select name="type" defaultValue={filters.type ?? ""} className={selectClass}>
            <option value="">Entradas e saídas</option>
            <option value="out">Saídas</option>
            <option value="in">Entradas</option>
            <option value="transfer">Transferências</option>
          </select>
          <select name="status" defaultValue={filters.status ?? ""} className={selectClass}>
            <option value="">Todos status</option>
            <option value="POSTED">Confirmado</option>
            <option value="PENDING">Pendente</option>
            <option value="REVIEW">Revisar</option>
          </select>
          <input type="date" name="from" defaultValue={filters.from ?? ""} className={selectClass} title="De" />
          <input type="date" name="to" defaultValue={filters.to ?? ""} className={selectClass} title="Até (inclusive)" />
          <button className="px-4 py-2 rounded-lg bg-accent text-bg font-medium hover:bg-accent-hover">Filtrar</button>
          <Link href="/transactions" className="text-xs text-fg-muted hover:text-fg">Limpar</Link>
        </form>
      </Card>

      <Card className="p-0 overflow-x-auto">
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
              <tr key={t.id} className="group border-b border-border hover:bg-bg-hover/40 align-top">
                <td className="px-6 py-3 text-fg-muted whitespace-nowrap">{formatDate(t.date)}</td>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.transferPairId && <TransferBadge txId={t.id} />}
                    {t.totalInstallments && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-warn/15 text-warn"
                        title={t.purchaseAmount ? `Compra de ${formatBRL(t.purchaseAmount)}` : "Compra parcelada"}
                      >
                        <Layers className="size-3" /> {t.installmentNumber ?? "?"}/{t.totalInstallments}
                      </span>
                    )}
                    <span className="font-medium">{t.merchantName ?? t.description}</span>
                  </div>
                  {(t.merchantName || t.counterpartyName || t.paymentMethod) && (
                    <div className="text-xs text-fg-muted mt-0.5">
                      {t.merchantName && t.merchantName !== t.description && <span>{t.description} · </span>}
                      {t.paymentMethod && <span>{t.paymentMethod}</span>}
                      {t.counterpartyName && (
                        <span>
                          {" "}→ {t.counterpartyName}
                          {t.counterpartyType && ` (${COUNTERPARTY_LABEL[t.counterpartyType] ?? t.counterpartyType})`}
                        </span>
                      )}
                    </div>
                  )}
                  <NotesEditor txId={t.id} notes={t.notes} />
                  <TagPicker txId={t.id} currentTags={t.tags} allTags={allTags} />
                </td>
                <td className="px-6 py-3">
                  <CategoryPicker
                    txId={t.id}
                    currentCategoryId={t.categoryId}
                    currentCategoryName={t.category?.name ?? null}
                    currentCategoryColor={t.category?.color ?? null}
                    needsReview={t.status === "REVIEW"}
                    categories={categories}
                  />
                </td>
                <td className="px-6 py-3 text-fg-muted whitespace-nowrap">{t.account.name}</td>
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

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6 text-sm">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="p-2 rounded-lg border border-border hover:bg-bg-hover" aria-label="Página anterior">
              <ChevronLeft className="size-4" />
            </Link>
          ) : (
            <span className="p-2 opacity-30"><ChevronLeft className="size-4" /></span>
          )}
          <span className="text-fg-muted">Página {page} de {pages}</span>
          {page < pages ? (
            <Link href={pageHref(page + 1)} className="p-2 rounded-lg border border-border hover:bg-bg-hover" aria-label="Próxima página">
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span className="p-2 opacity-30"><ChevronRight className="size-4" /></span>
          )}
        </div>
      )}
    </>
  );
}
