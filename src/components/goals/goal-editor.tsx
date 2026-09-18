"use client";

import { useState, useTransition } from "react";
import { Plus, Loader2, Pencil } from "lucide-react";
import { setGoal } from "@/app/actions/goals";
import { parseBRLInput } from "@/lib/domain/brazil";
import { toDateInput, parseDateInput } from "@/lib/domain/format";
import { errorMessage } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { Field, INPUT_CLASS } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

type GoalFormValue = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: Date | null;
  color: string | null;
  accountId: string | null;
};

type AccountOption = { id: string; name: string; institution: string };

const COLORS = ["#00d28d", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#eab308"];

function GoalEditor({ goal, accounts, onClose }: { goal?: GoalFormValue; accounts: AccountOption[]; onClose: () => void }) {
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(goal ? String(goal.targetAmount).replace(".", ",") : "");
  const [current, setCurrent] = useState(goal?.currentAmount ? String(goal.currentAmount).replace(".", ",") : "");
  const [deadline, setDeadline] = useState(goal?.deadline ? toDateInput(new Date(goal.deadline)) : "");
  const [color, setColor] = useState(goal?.color ?? COLORS[0]!);
  const [accountId, setAccountId] = useState(goal?.accountId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    const targetAmount = parseBRLInput(target);
    const currentAmount = current.trim() ? parseBRLInput(current) : 0;
    if (!name.trim()) return setError("Informe um nome");
    if (targetAmount === null || targetAmount <= 0) return setError("Valor total inválido");
    if (currentAmount === null || currentAmount < 0) return setError("Valor guardado inválido");
    startTransition(async () => {
      try {
        await setGoal({
          id: goal?.id,
          name,
          targetAmount,
          currentAmount,
          deadline: parseDateInput(deadline),
          color,
          accountId: accountId || null,
        });
        onClose();
      } catch (e) {
        setError(errorMessage(e, "Erro ao salvar"));
      }
    });
  }

  return (
    <Dialog title={goal ? "Editar meta" : "Nova meta"} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Nome da meta">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Reserva de emergência" className={INPUT_CLASS} />
        </Field>

        <Field label="Conta vinculada (opcional)">
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={INPUT_CLASS}>
            <option value="">Nenhuma — informar valor manualmente</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.institution}
              </option>
            ))}
          </select>
          {accountId && <p className="text-[11px] text-fg-muted mt-1">O progresso acompanha o saldo desta conta.</p>}
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Valor total">
            <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder="10.000,00" className={INPUT_CLASS} />
          </Field>
          {!accountId && (
            <Field label="Já guardado">
              <input value={current} onChange={(e) => setCurrent(e.target.value)} inputMode="decimal" placeholder="0,00" className={INPUT_CLASS} />
            </Field>
          )}
        </div>

        <Field label="Prazo (opcional)">
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={INPUT_CLASS} />
        </Field>

        <Field label="Cor">
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`size-8 rounded-full border-2 transition-all ${color === c ? "border-fg scale-110" : "border-transparent"}`}
                style={{ background: c }}
                aria-label={`Cor ${c}`}
              />
            ))}
          </div>
        </Field>
      </div>

      {error && <p className="text-sm text-danger mt-4">{error}</p>}
      <Button size="lg" className="mt-6" onClick={handleSave} disabled={pending}>
        {pending ? <Loader2 className="size-5 animate-spin" /> : "Salvar meta"}
      </Button>
    </Dialog>
  );
}

export function AddGoalButton({ accounts }: { accounts: AccountOption[] }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-bg font-semibold hover:bg-accent-hover transition-colors text-sm"
      >
        <Plus className="size-4" /> Nova meta
      </button>
      {isOpen && <GoalEditor accounts={accounts} onClose={() => setIsOpen(false)} />}
    </>
  );
}

export function EditGoalButton({ goal, accounts }: { goal: GoalFormValue; accounts: AccountOption[] }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="p-1 rounded hover:bg-bg-hover text-fg-muted hover:text-fg transition-colors"
        title="Editar meta"
      >
        <Pencil className="size-4" />
      </button>
      {isOpen && <GoalEditor goal={goal} accounts={accounts} onClose={() => setIsOpen(false)} />}
    </>
  );
}
