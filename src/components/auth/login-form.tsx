"use client";

import { useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, KeyRound, Loader2, Mail } from "lucide-react";
import { readJson } from "@/lib/client/api";
import { Button } from "@/components/ui/button";

const post = (step: string, body: object = {}) =>
  fetch(`/api/auth/${step}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(readJson);

function message(e: unknown) {
  if (e instanceof Error && e.name === "NotAllowedError") return "Cancelado ou o tempo acabou. Tente de novo.";
  if (e instanceof Error && e.name === "InvalidStateError") return "Este dispositivo já tem uma passkey cadastrada. Use Entrar.";
  return e instanceof Error ? e.message : String(e);
}

/** Sign in with a passkey, or register this device's passkey with a one-time code. */
export function LoginForm({ hasPasskeys, emailTo }: { hasPasskeys: boolean; emailTo: string | null }) {
  const [registering, setRegistering] = useState(!hasPasskeys);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function sendCode() {
    setError(null);
    setPending(true);
    post("send-code")
      .then((r: { to: string }) => {
        setSent(r.to);
        setRegistering(true);
      })
      .catch((e) => setError(message(e)))
      .finally(() => setPending(false));
  }

  async function run(ceremony: () => Promise<unknown>) {
    setError(null);
    setPending(true);
    try {
      await ceremony();
      window.location.assign("/");
    } catch (e) {
      setError(message(e));
      setPending(false);
    }
  }

  const signIn = () =>
    run(async () => {
      const optionsJSON = await post("login-options");
      await post("login", { response: await startAuthentication({ optionsJSON }) });
    });

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const optionsJSON = await post("register-options", { code });
      await post("register", { code, response: await startRegistration({ optionsJSON }) });
    });
  };

  const spinner = <Loader2 className="size-4 animate-spin" />;

  return (
    <div className="space-y-4">
      {registering ? (
        <form onSubmit={create} className="space-y-3">
          <p className="text-sm text-fg-muted">
            {sent
              ? `Código enviado para ${sent}. Ele vale 15 minutos.`
              : emailTo
                ? "Digite o código que você recebeu por e-mail, ou peça um novo abaixo."
                : hasPasskeys
                  ? "Em um dispositivo já conectado, abra Configurações → Dispositivos → Adicionar dispositivo e digite o código aqui."
                  : "Primeiro acesso: o código está no log do servidor (docker compose logs app, ou o terminal onde o app roda)."}
          </p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="XXXX-XXXX"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            className="w-full bg-bg-elev border border-border rounded-lg px-3 py-2.5 text-center font-mono text-lg tracking-widest outline-none focus:border-accent"
          />
          <Button size="lg" disabled={pending || code.trim().length < 8}>
            {pending ? spinner : <KeyRound className="size-4" />}
            Criar passkey
          </Button>
        </form>
      ) : (
        <Button size="lg" onClick={signIn} disabled={pending}>
          {pending ? spinner : <Fingerprint className="size-5" />}
          Entrar com passkey
        </Button>
      )}
      {error && <p className="text-sm text-danger text-center">{error}</p>}
      {emailTo && (
        <button
          type="button"
          onClick={sendCode}
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm hover:bg-bg-hover disabled:opacity-50"
        >
          {pending ? spinner : <Mail className="size-4" />}
          {sent ? "Enviar outro código" : `Receber código em ${emailTo}`}
        </button>
      )}
      {hasPasskeys && (
        <button
          type="button"
          onClick={() => (setRegistering(!registering), setError(null))}
          className="w-full text-center text-sm text-fg-muted hover:text-fg"
        >
          {registering ? "Já tenho passkey: entrar" : "Dispositivo novo? Use um código"}
        </button>
      )}
    </div>
  );
}
