import { Layers } from "lucide-react";
import { formatBRL, formatDate } from "@/lib/domain/format";
import { CategoryPicker } from "@/components/transactions/category-picker";
import { TagPicker } from "@/components/transactions/tag-picker";
import { TransferBadge } from "@/components/transactions/unpair-button";
import { NotesEditor } from "@/components/transactions/notes-editor";
import { PassThroughToggle } from "@/components/transactions/pass-through-toggle";
import { ListRow, MobileList } from "@/components/ui/list-row";
import type { getTransactionsPage, getTransactionFilterOptions } from "@/lib/data/transactions";
import type { getCategoryOptions } from "@/lib/data/categories";

type Tx = Awaited<ReturnType<typeof getTransactionsPage>>["txs"][number];
type Props = {
  txs: Tx[];
  categories: Awaited<ReturnType<typeof getCategoryOptions>>;
  allTags: Awaited<ReturnType<typeof getTransactionFilterOptions>>["tags"];
};

const COUNTERPARTY_LABEL: Record<string, string> = { SELF: "conta própria", CPF: "pessoa física", CNPJ: "empresa" };

function Badges({ t }: { t: Tx }) {
  return (
    <>
      {t.transferPairId && <TransferBadge txId={t.id} />}
      {!t.transferPairId && <PassThroughToggle txId={t.id} isPassThrough={t.excludeOverride === true} />}
      {t.totalInstallments && (
        <span
          className="inline-flex shrink-0 items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-warn/15 text-warn"
          title={t.purchaseAmount ? `Compra de ${formatBRL(t.purchaseAmount)}` : "Compra parcelada"}
        >
          <Layers className="size-3" /> {t.installmentNumber ?? "?"}/{t.totalInstallments}
        </span>
      )}
    </>
  );
}

/** The bank's date, plus when it's charged if that's another day (installments some banks date with the purchase day). */
function TxDate({ t }: { t: Tx }) {
  const differs = t.chargeDate.getTime() !== t.date.getTime();
  return (
    <>
      {formatDate(t.date)}
      {differs && <span className="block text-[11px] text-fg-subtle">cobrada em {formatDate(t.chargeDate)}</span>}
    </>
  );
}

function Category({ t, categories }: { t: Tx; categories: Props["categories"] }) {
  return (
    <CategoryPicker
      txId={t.id}
      currentCategoryId={t.categoryId}
      currentCategoryName={t.category?.name ?? null}
      currentCategoryColor={t.category?.color ?? null}
      needsReview={t.status === "REVIEW"}
      categories={categories}
    />
  );
}

/** The transaction list: a table from md up, a compact list on phones. */
export function TransactionList({ txs, categories, allTags }: Props) {
  return (
    <>
      <table className="hidden w-full text-sm md:table">
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
              <td className="px-6 py-3 text-fg-muted whitespace-nowrap">
                <TxDate t={t} />
              </td>
              <td className="px-6 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badges t={t} />
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
                <Category t={t} categories={categories} />
              </td>
              <td className="px-6 py-3 text-fg-muted whitespace-nowrap">{t.account.name}</td>
              <td className={`px-6 py-3 text-right whitespace-nowrap ${t.amount > 0 ? "text-accent" : ""}`}>
                {formatBRL(t.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <MobileList>
        {txs.map((t) => (
          <ListRow
            key={t.id}
            title={
              <>
                <Badges t={t} />
                <span className="truncate font-medium">{t.merchantName ?? t.description}</span>
              </>
            }
            meta={
              <>
                <Category t={t} categories={categories} />
                <span>
                  <TxDate t={t} />
                </span>
                <span>{t.account.name}</span>
                {t.notes && <span className="w-full italic">{t.notes}</span>}
              </>
            }
            value={<span className={t.amount > 0 ? "text-accent" : ""}>{formatBRL(t.amount)}</span>}
          />
        ))}
      </MobileList>
    </>
  );
}
