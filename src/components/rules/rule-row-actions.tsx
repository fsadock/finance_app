"use client";

import { useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { deleteMerchantRule, setMerchantRuleCategory } from "@/app/actions/rules";

type Category = { id: string; name: string };

export function RuleCategorySelect({ id, categoryId, categories }: { id: string; categoryId: string; categories: Category[] }) {
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <select
        defaultValue={categoryId}
        disabled={pending}
        onChange={(e) => {
          const value = e.target.value;
          startTransition(async () => void (await setMerchantRuleCategory(id, value)));
        }}
        className="bg-bg-elev border border-border rounded-md px-2 py-1 text-sm outline-none focus:border-accent"
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {pending && <Loader2 className="size-3.5 animate-spin text-fg-muted" />}
    </span>
  );
}

export function DeleteRuleButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!confirm("Excluir esta regra? Transações futuras deste comerciante voltam para a IA.")) return;
        startTransition(async () => void (await deleteMerchantRule(id)));
      }}
      className="p-1 rounded text-fg-muted hover:text-danger hover:bg-bg-hover"
      title="Excluir regra"
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
    </button>
  );
}
