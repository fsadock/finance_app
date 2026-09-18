"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { updateRecurring } from "@/app/actions/recurrings";
import { parseBRLInput } from "@/lib/domain/brazil";
import { formatBRL, toDateInput } from "@/lib/domain/format";
import { CADENCES, CADENCE_LABEL, CADENCE_TO_MONTHLY, type Cadence } from "@/lib/domain/recurrence";
import { errorMessage } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { Field, INPUT_CLASS } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export type RecurringFormValue = {
  id: string;
  name: string;
  amount: number;
  cadence: string;
  nextDate: Date;
  categoryId: string | null;
};

export type CategoryOption = { id: string; name: string };


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
        setError(errorMessage(e, "Erro ao salvar"));
      }
    });
  }

  return (
    <Dialog
      title="Editar recorrência"
      description="Seus valores valem até chegar uma cobrança nova; depois o app volta a acompanhar sozinho."
      onClose={onClose}
    >
      <div className="space-y-4">
        <Field label="Nome">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor por cobrança">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" className={INPUT_CLASS} />
          </Field>
          <Field label="Frequência">
            <select value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)} className={INPUT_CLASS}>
              {CADENCES.map((c) => (
                <option key={c} value={c}>
                  {CADENCE_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {yearly !== null && <p className="-mt-2 text-xs text-fg-muted">= {formatBRL(yearly)} por ano</p>}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Próxima cobrança">
            <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className={INPUT_CLASS} />
          </Field>
          <Field label="Categoria">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={INPUT_CLASS}>
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>

      <Button size="lg" className="mt-6" onClick={handleSave} disabled={pending}>
        {pending ? <Loader2 className="size-5 animate-spin" /> : "Salvar"}
      </Button>
    </Dialog>
  );
}
