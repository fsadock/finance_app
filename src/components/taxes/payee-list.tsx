import { ListRow, MobileList } from "@/components/ui/list-row";
import { formatBRL } from "@/lib/domain/format";

type Payee = { name: string; doc: string | null; total: number; count: number };

/** Payees of one IRPF deduction type: a table from md up, a compact list on phones. */
export function PayeeList({ payees }: { payees: Payee[] }) {
  return (
    <>
      <table className="hidden w-full text-sm md:table">
        <thead>
          <tr className="text-left text-xs text-fg-muted border-y border-border">
            <th className="px-6 py-2 font-medium">Beneficiário</th>
            <th className="px-6 py-2 font-medium">Documento</th>
            <th className="px-6 py-2 font-medium text-right">Lançamentos</th>
            <th className="px-6 py-2 font-medium text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {payees.map((p) => (
            <tr key={`${p.name}|${p.doc}`} className="border-b border-border last:border-b-0">
              <td className="px-6 py-2">{p.name}</td>
              <td className="px-6 py-2 text-fg-muted text-xs">{p.doc ?? "— informe no recibo"}</td>
              <td className="px-6 py-2 text-right text-fg-muted">{p.count}</td>
              <td className="px-6 py-2 text-right">{formatBRL(p.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <MobileList className="border-t border-border">
        {payees.map((p) => (
          <ListRow
            key={`${p.name}|${p.doc}`}
            title={<span className="truncate">{p.name}</span>}
            meta={<span>{p.doc ?? "— informe no recibo"} · {p.count} lançamentos</span>}
            value={formatBRL(p.total)}
          />
        ))}
      </MobileList>
    </>
  );
}
