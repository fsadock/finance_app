"use client";

import { useState, useTransition } from "react";
import { Plus, X, Loader2, Pencil } from "lucide-react";
import { setGoal } from "@/app/actions/goals";
import { parseBRLInput } from "@/lib/domain/brazil";
import { toDateInput, parseDateInput } from "@/lib/domain/format";
import { Card } from "./ui/card";

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
const inputClass = "w-full bg-bg-elev border border-border rounded-lg px-4 py-2.5 focus:border-accent outline-none";
const labelClass = "block text-xs font-medium text-fg-muted mb-1.5 uppercase tracking-wider";

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
        setError(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute right-4 top-4 text-fg-muted hover:text-fg" aria-label="Fechar">
          <X className="size-5" />
        </button>
        <h2 className="text-xl font-bold mb-6">{goal ? "Editar meta" : "Nova meta"}</h2>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>Nome da meta</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Reserva de emergência" className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Conta vinculada (opcional)</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}>
              <option value="">Nenhuma — informar valor manualmente</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.institution}
                </option>
              ))}
            </select>
            {accountId && <p className="text-[11px] text-fg-muted mt-1">O progresso acompanha o saldo desta conta.</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Valor total</label>
              <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder="10.000,00" className={inputClass} />
            </div>
            {!accountId && (
              <div>
                <label className={labelClass}>Já guardado</label>
                <input value={current} onChange={(e) => setCurrent(e.target.value)} inputMode="decimal" placeholder="0,00" className={inputClass} />
              </div>
            )}
          </div>

          <div>
            <label className={labelClass}>Prazo (opcional)</label>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Cor</label>
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
          </div>
        </div>

        {error && <p className="text-sm text-danger mt-4">{error}</p>}
        <button
          onClick={handleSave}
          disabled={pending}
          className="w-full mt-6 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-accent text-bg font-bold hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {pending ? <Loader2 className="size-5 animate-spin" /> : "Salvar meta"}
        </button>
      </Card>
    </div>
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
