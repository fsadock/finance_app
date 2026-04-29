"use client";

import { useState, useTransition } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { setGoal } from "@/app/actions/goals";
import { Card } from "./ui/card";

export function GoalEditor({
  goal,
  onClose,
}: {
  goal?: { id: string; name: string; targetAmount: number; currentAmount: number; deadline?: Date | null; color?: string | null };
  onClose: () => void;
}) {
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(goal?.targetAmount ? String(goal.targetAmount) : "");
  const [current, setCurrent] = useState(goal?.currentAmount ? String(goal.currentAmount) : "");
  const [deadline, setDeadline] = useState(goal?.deadline ? new Date(goal.deadline).toISOString().split("T")[0] : "");
  const [color, setColor] = useState(goal?.color ?? "#00d28d");
  const [pending, startTransition] = useTransition();

  async function handleSave() {
    if (!name) return;
    startTransition(async () => {
      await setGoal({
        id: goal?.id,
        name,
        targetAmount: parseFloat(target.replace(",", ".")),
        currentAmount: parseFloat(current.replace(",", ".")),
        deadline: deadline ? new Date(deadline) : undefined,
        color,
      });
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in">
      <Card className="w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute right-4 top-4 text-fg-muted hover:text-fg">
          <X className="size-5" />
        </button>
        <h2 className="text-xl font-bold mb-6">{goal ? "Editar Meta" : "Nova Meta"}</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-fg-muted mb-1.5 uppercase tracking-wider">Nome da meta</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Reserva de Emergência"
              className="w-full bg-bg-elev border border-border rounded-lg px-4 py-2.5 focus:border-accent outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-fg-muted mb-1.5 uppercase tracking-wider">Valor total</label>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="R$ 0,00"
                className="w-full bg-bg-elev border border-border rounded-lg px-4 py-2.5 focus:border-accent outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-fg-muted mb-1.5 uppercase tracking-wider">Já guardado</label>
              <input
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                placeholder="R$ 0,00"
                className="w-full bg-bg-elev border border-border rounded-lg px-4 py-2.5 focus:border-accent outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-fg-muted mb-1.5 uppercase tracking-wider">Prazo (opcional)</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full bg-bg-elev border border-border rounded-lg px-4 py-2.5 focus:border-accent outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-fg-muted mb-1.5 uppercase tracking-wider">Cor</label>
            <div className="flex gap-2">
              {["#00d28d", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#eab308"].map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`size-8 rounded-full border-2 transition-all ${color === c ? "border-fg scale-110" : "border-transparent"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={pending || !name}
          className="w-full mt-8 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-accent text-bg font-bold hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {pending ? <Loader2 className="size-5 animate-spin" /> : "Salvar Meta"}
        </button>
      </Card>
    </div>
  );
}

export function AddGoalButton() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-bg font-semibold hover:bg-accent-hover transition-colors text-sm"
      >
        <Plus className="size-4" /> Nova Meta
      </button>
      {isOpen && <GoalEditor onClose={() => setIsOpen(false)} />}
    </>
  );
}
