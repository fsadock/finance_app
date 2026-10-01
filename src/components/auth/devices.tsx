"use client";

import { useState, useTransition } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { readJson } from "@/lib/client/api";
import { errorMessage } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, Plus, Trash2 } from "lucide-react";
import { createDeviceCode, removeDevice, signOut } from "@/app/actions/auth";
import { formatDate } from "@/lib/domain/format";
import { Button } from "@/components/ui/button";

type Device = { id: string; name: string; rpId: string | null; createdAt: Date; lastUsedAt: Date | null; current: boolean };

/** Registered passkeys: add a device with a one-time code, remove one, sign out. */
export function Devices({ devices }: { devices: Device[] }) {
  const router = useRouter();
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  /**
   * A second passkey on the device already in your hand — a phone keeping one in a password manager and
   * one in the platform keychain, say. No code: being signed in here is the proof.
   */
  async function addHere() {
    setAdding(true);
    setError(null);
    try {
      const post = (step: string, body: object = {}) =>
        fetch(`/api/auth/${step}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(readJson);
      const optionsJSON = await post("add-options");
      await post("add", { response: await startRegistration({ optionsJSON }) });
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error && e.name === "InvalidStateError"
          ? "Este autenticador já guarda uma passkey deste app. Escolha outro lugar para salvar."
          : errorMessage(e, "Não foi possível criar a passkey")
      );
    } finally {
      setAdding(false);
    }
  }

  function remove(d: Device) {
    const warning = d.current ? " Este é o dispositivo que você está usando: você sairá do app." : "";
    if (confirm(`Remover a passkey de ${d.name}?${warning}`)) startTransition(() => removeDevice(d.id));
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border">
        {devices.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {d.name}
                {d.current && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent">este dispositivo</span>}
              </p>
              <p className="text-xs text-fg-muted">
                {d.rpId && `${d.rpId} · `}Criada em {formatDate(d.createdAt)}
                {d.lastUsedAt && ` · último acesso ${formatDate(d.lastUsedAt)}`}
              </p>
            </div>
            <button onClick={() => remove(d)} disabled={pending} className="p-2 text-fg-muted hover:text-danger" aria-label={`Remover ${d.name}`}>
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>

      {error && <p className="text-sm text-danger">{error}</p>}
      {code && (
        <div className="rounded-xl border border-accent/40 bg-accent/10 p-4 text-center">
          <p className="font-mono text-2xl font-semibold tracking-widest">{code.code}</p>
          <p className="mt-1 text-xs text-fg-muted">
            No outro dispositivo, abra o app e toque em &quot;Dispositivo novo? Use um código&quot;. Vale até{" "}
            {new Date(code.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={addHere}
          disabled={pending || adding}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {adding ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Adicionar neste dispositivo
        </button>
        <Button size="sm" disabled={pending || adding} onClick={() => startTransition(async () => setCode(await createDeviceCode()))}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Adicionar dispositivo
        </Button>
        <button
          onClick={() => startTransition(() => signOut())}
          disabled={pending}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-border hover:bg-bg-hover"
        >
          <LogOut className="size-4" />
          Sair
        </button>
      </div>
    </div>
  );
}
