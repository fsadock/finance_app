"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { setBudget } from "@/app/actions/budgets";
import { formatBRL } from "@/lib/domain/format";
import { errorMessage } from "@/lib/utils";

/**
 * Applies the suggested limit from next month on. Budgets carry forward from the month they start in, so
 * writing it against `month` leaves every closed month with the limit it was actually judged by.
 */
export function ApplyLimitButton({ categoryId, month, suggested }: { categoryId: string; month: string; suggested: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function apply() {
    setBusy(true);
    setError(null);
    startTransition(async () => {
      try {
        await setBudget({ categoryId, monthlyLimit: suggested, startMonth: month });
        router.refresh();
      } catch (e) {
        setError(errorMessage(e, "Erro ao salvar"));
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <span className="flex min-w-0 flex-wrap items-center justify-end gap-2">
      <button
        onClick={apply}
        disabled={busy || isPending}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-2.5 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {busy || isPending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
        Usar {formatBRL(suggested)}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
