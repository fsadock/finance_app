"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { testCurrentSettings } from "@/app/actions/settings";
import { Feedback } from "@/components/setup/credential-forms";

export function TestSettingsButton() {
  const [pending, startTransition] = useTransition();
  const [results, setResults] = useState<{ ok: boolean; text: string }[] | null>(null);

  function run() {
    startTransition(async () => {
      const r = await testCurrentSettings();
      setResults([
        r.pluggyError ? { ok: false, text: `Pluggy: ${r.pluggyError}` } : { ok: true, text: "Pluggy: funcionando." },
        !r.aiConfigured
          ? { ok: true, text: "IA: não configurada (app funciona sem IA)." }
          : r.aiError
            ? { ok: false, text: r.aiError }
            : { ok: true, text: "IA: funcionando." },
      ]);
    });
  }

  return (
    <div className="space-y-2">
      <button
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-elev border border-border hover:border-accent hover:text-accent text-sm disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
        Testar configuração atual
      </button>
      {results?.map((r) => <Feedback key={r.text} result={r} />)}
    </div>
  );
}
