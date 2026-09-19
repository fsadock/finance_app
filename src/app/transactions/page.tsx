import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { getTransactionFilterOptions, getTransactionsPage } from "@/lib/data/transactions";
import { getCategoryOptions } from "@/lib/data/categories";
import { formatBRL } from "@/lib/domain/format";
import { Search, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { TransactionList } from "@/components/transactions/transaction-list";
import { PeriodPicker } from "@/components/layout/period-picker";
import { buildTransactionWhere, filtersToSearchParams, TX_FILTER_KEYS, type TxFilterParams } from "@/lib/data/transaction-filters";
import Link from "next/link";

const PAGE_SIZE = 50;

type Props = { searchParams: Promise<TxFilterParams & { page?: string }> };

const selectClass = "px-3 py-2 rounded-lg bg-bg-elev border border-border focus:border-accent outline-none";

export default async function TransactionsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filters: TxFilterParams = Object.fromEntries(TX_FILTER_KEYS.map((k) => [k, sp[k] ?? null]));
  const where = buildTransactionWhere(filters);
  const page = Math.max(1, Number(sp.page) || 1);

  const [{ txs, count, outflow, inflow }, categories, { accounts, tags: allTags }] = await Promise.all([
    getTransactionsPage(where, page, PAGE_SIZE),
    getCategoryOptions(),
    getTransactionFilterOptions(),
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
        <form className="grid grid-cols-2 gap-2 items-center text-sm sm:flex sm:flex-wrap sm:gap-3">
          {filters.month && <input type="hidden" name="month" value={filters.month} />}
          <div className="relative col-span-2 flex-1 min-w-[220px]">
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
        <TransactionList txs={txs} categories={categories} allTags={allTags} />
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
