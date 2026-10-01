"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { saveLockMinutes } from "@/app/actions/settings";
import { LOCK_CHOICES, lockLabel } from "@/lib/domain/auth-lock";
import { INPUT_CLASS } from "@/components/ui/field";
import { errorMessage } from "@/lib/utils";

/** How long the app may sit idle before it asks for the passkey again. */
export function LockSetting({ minutes }: { minutes: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(minutes);
  const [message, setMessage] = useState<string | null>(null);

  function change(next: number) {
    setValue(next);
    setMessage(null);
    startTransition(async () => {
      try {
        const r = await saveLockMinutes(next);
        setMessage(r.ok ? r.message : r.error);
        router.refresh();
      } catch (e) {
        setMessage(errorMessage(e, "Erro ao salvar"));
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-sm text-fg-muted" htmlFor="lock-minutes">
        Pedir a passkey de novo
      </label>
      <select
        id="lock-minutes"
        value={value}
        onChange={(e) => change(Number(e.target.value))}
        disabled={isPending}
        className={`${INPUT_CLASS} w-auto`}
      >
        {LOCK_CHOICES.map((m) => (
          <option key={m} value={m}>
            {lockLabel(m)}
          </option>
        ))}
      </select>
      {isPending && <Loader2 className="size-4 animate-spin text-fg-muted" />}
      {message && !isPending && <span className="text-xs text-fg-muted">{message}</span>}
    </div>
  );
}
