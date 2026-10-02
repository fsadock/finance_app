"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { addCryptoPurchase, removeCryptoPurchase } from "@/app/actions/crypto";
import { averageCost } from "@/lib/domain/crypto";
import { parseBRLInput } from "@/lib/domain/brazil";
import { formatBRL, formatCryptoAmount, formatDateNumeric } from "@/lib/domain/format";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Money } from "@/components/ui/money";

export type PurchaseRow = { id: string; date: Date; quantity: number; totalBrl: number };

const input = "w-full rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm outline-none focus:border-accent";
const label = "block text-xs font-medium text-fg-muted mb-1";

/**
 * Every purchase of one asset. Buying the same coin at different prices is normal, so the cost is the
 * weighted average of these rows — which is also the number the Brazilian tax return asks for.
 */
export function PurchasesDialog({ symbol, purchases, onClose }: { symbol: string; purchases: PurchaseRow[]; onClose: () => void }) {
  const router = useRouter();
  const [quantity, setQuantity] = useState("");
  const [total, setTotal] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const cost = averageCost(purchases);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await addCryptoPurchase({
        symbol,
        quantity: parseBRLInput(quantity) ?? 0,
        totalBrl: parseBRLInput(total) ?? 0,
        date,
      });
      if (!r.ok) return setError(r.error);
      setQuantity("");
      setTotal("");
      router.refresh();
    });
  };

  return (
    <Dialog title={`Aportes em ${symbol}`} description="O custo é a média ponderada de tudo que você comprou." onClose={onClose}>
      <div className="space-y-4">
        {purchases.length > 0 && (
          <>
            <ul className="divide-y divide-border">
              {purchases.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-fg-muted">{formatDateNumeric(p.date)}</span>
                  <span className="tabular-nums"><Money>{formatCryptoAmount(p.quantity)}</Money></span>
                  <span className="tabular-nums"><Money>{formatBRL(p.totalBrl)}</Money></span>
                  <span className="text-xs text-fg-subtle tabular-nums"><Money>{formatBRL(p.totalBrl / p.quantity)}</Money>/un</span>
                  <button
                    onClick={() =>
                      startTransition(async () => {
                        await removeCryptoPurchase(p.id);
                        router.refresh();
                      })
                    }
                    disabled={pending}
                    className="p-1 text-fg-muted hover:text-danger"
                    aria-label="Remover aporte"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between rounded-xl bg-bg-elev px-3 py-2 text-sm">
              <span className="text-fg-muted">
                <Money>{formatCryptoAmount(cost.quantity)}</Money> {symbol} · <Money>{formatBRL(cost.total)}</Money> investidos
              </span>
              <span className="font-medium tabular-nums">custo médio <Money>{formatBRL(cost.perUnit)}</Money></span>
            </div>
          </>
        )}

        <form onSubmit={submit} className="space-y-3 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="p-qtd">Quantidade</label>
              <input id="p-qtd" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0,05" inputMode="decimal" className={input} />
            </div>
            <div>
              <label className={label} htmlFor="p-total">Total pago R$</label>
              <input id="p-total" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="1.000,00" inputMode="decimal" className={input} />
            </div>
          </div>
          <div>
            <label className={label} htmlFor="p-data">Data da compra</label>
            <input id="p-data" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(input, "font-mono")} />
          </div>
          <Button size="lg" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Registrar aporte
          </Button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </form>
      </div>
    </Dialog>
  );
}
