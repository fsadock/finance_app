"use client";

import { useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { setAccountHidden } from "@/app/actions/accounts";

/** Hidden accounts are left out of net worth, dashboards and card pacing. */
export function HideAccountToggle({ accountId, hidden }: { accountId: string; hidden: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(async () => void (await setAccountHidden(accountId, !hidden)))}
      disabled={pending}
      className="p-1 rounded text-fg-muted hover:text-fg hover:bg-bg-hover"
      title={hidden ? "Mostrar nos totais" : "Ocultar dos totais"}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );
}
