"use client";

import { useState, useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { updateRecurring } from "@/app/actions/recurrings";
import { parseBRLInput } from "@/lib/domain/brazil";
import { formatBRL, toDateInput } from "@/lib/domain/format";
import { CADENCES, CADENCE_LABEL, CADENCE_TO_MONTHLY, type Cadence } from "@/lib/domain/recurrence";
import { Card } from "@/components/ui/card";

export type RecurringFormValue = {
  id: string;
  name: string;
  amount: number;
  cadence: string;
  nextDate: Date;
  categoryId: string | null;
};

export type CategoryOption = { id: string; name: string };

const inputClass = "w-full bg-bg-elev border border-border rounded-lg px-4 py-2.5 focus:border-accent outline-none";
const labelClass = "block text-xs font-medium text-fg-muted mb-1.5 uppercase tracking-wider";

export function RecurringEditor({
  recurring,
  categories,
  onClose,
}: {
  recurring: RecurringFormValue;
  categories: CategoryOption[];
  onClose: () => void;
}) {
  const [name, setName] = useState(recurring.name);
  const [amount, setAmount] = useState(Math.abs(recurring.amount).toFixed(2).replace(".", ","));
  const [cadence, setCadence] = useState(recurring.cadence as Cadence);
  const [nextDate, setNextDate] = useState(toDateInput(new Date(recurring.nextDate)));
  const [categoryId, setCategoryId] = useState(recurring.categoryId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const parsed = parseBRLInput(amount);
  const yearly = parsed !== null && parsed > 0 ? parsed * CADENCE_TO_MONTHLY[cadence] * 12 : null;

  function handleSave() {
    setError(null);
    if (!name.trim()) return setError("Informe um nome");
    if (parsed === null || parsed <= 0) return setError("Valor inválido");
    if (!nextDate) return setError("Informe a próxima cobrança");
    startTransition(async () => {
      try {
        await updateRecurring({ id: recurring.id, name, amount: parsed, cadence, nextDate, categoryId: categoryId || null });
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md p-6 relative text-left">
        <button onClick={onClose} className="absolute right-4 top-4 text-fg-muted hover:text-fg" aria-label="Fechar">
          <X className="size-5" />
        </button>
        <h2 className="text-xl font-bold mb-1">Editar recorrência</h2>
        <p className="text-sm text-fg-muted mb-6">Seus valores valem até chegar uma cobrança nova; depois o app volta a acompanhar sozinho.</p>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>Nome</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Valor por cobrança</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Frequência</label>
              <select value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)} className={inputClass}>
                {CADENCES.map((c) => (
                  <option key={c} value={c}>
                    {CADENCE_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {yearly !== null && <p className="-mt-2 text-xs text-fg-muted">= {formatBRL(yearly)} por ano</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Próxima cobrança</label>
              <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Categoria</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <button
          onClick={handleSave}
          disabled={pending}
          className="w-full mt-6 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-accent text-bg font-bold hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {pending ? <Loader2 className="size-5 animate-spin" /> : "Salvar"}
        </button>
      </Card>
    </div>
  );
}
