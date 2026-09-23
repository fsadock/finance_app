"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import { removeAnthropicKey, removeEmailSettings, saveAnthropicKey, saveEmailSettings, savePluggyCredentials } from "@/app/actions/settings";
import type { SetupStatus } from "@/lib/infra/settings";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const input =
  "w-full bg-bg-elev border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent font-mono placeholder:font-sans";
const label = "block text-xs font-medium text-fg-muted mb-1.5";

export function Feedback({ result }: { result: { ok: boolean; text: string } | null }) {
  if (!result) return null;
  return (
    <p className={cn("flex items-start gap-1.5 text-sm", result.ok ? "text-accent" : "text-danger")}>
      {result.ok ? <CheckCircle2 className="size-4 mt-0.5 shrink-0" /> : <XCircle className="size-4 mt-0.5 shrink-0" />}
      {result.text}
    </p>
  );
}

export function SourceBadge({ source }: { source: "app" | "env" | null }) {
  if (!source) return null;
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-hover text-fg-muted">
      {source === "app" ? "salva no app" : "vinda do .env"}
    </span>
  );
}

export function PluggyForm({ status, onSaved }: { status: SetupStatus["pluggy"]; onSaved?: () => void }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(status.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const keepingSecret = status.configured && !clientSecret;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const r = await savePluggyCredentials(clientId, clientSecret);
      setResult(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      if (r.ok) {
        setClientSecret("");
        router.refresh();
        onSaved?.();
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ol className="text-sm text-fg-muted space-y-1.5 list-decimal list-inside">
        <li>
          Crie uma conta em{" "}
          <a href="https://dashboard.pluggy.ai" target="_blank" rel="noreferrer" className="text-accent hover:underline inline-flex items-center gap-0.5">
            dashboard.pluggy.ai <ExternalLink className="size-3" />
          </a>
        </li>
        <li>
          Vá em <strong className="text-fg">Applications</strong> e crie uma aplicação
        </li>
        <li>Copie o Client ID e o Client Secret para os campos abaixo</li>
      </ol>
      <div>
        <label className={label} htmlFor="pluggy-id">Client ID</label>
        <input
          id="pluggy-id"
          className={input}
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="3f8e2a1c-1234-4abc-9def-0123456789ab"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div>
        <label className={label} htmlFor="pluggy-secret">Client Secret</label>
        <input
          id="pluggy-secret"
          type="password"
          className={input}
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder={status.clientSecretMasked ? `${status.clientSecretMasked} (deixe vazio para manter)` : "Cole o Client Secret"}
          autoComplete="off"
        />
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Button type="submit" disabled={pending || !clientId.trim() || (!clientSecret.trim() && !status.configured)}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {keepingSecret ? "Testar e salvar Client ID" : "Testar e salvar"}
        </Button>
        <Feedback result={result} />
      </div>
    </form>
  );
}

export function AiForm({ status, onSaved }: { status: SetupStatus["ai"]; onSaved?: () => void }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const r = await saveAnthropicKey(key);
      setResult(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      if (r.ok) {
        setKey("");
        router.refresh();
        onSaved?.();
      }
    });
  }

  function remove() {
    if (!confirm("Remover a chave da Anthropic? O app continua funcionando sem IA.")) return;
    startTransition(async () => {
      const r = await removeAnthropicKey();
      setResult(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-fg-muted">
        A IA categoriza comerciantes que o app ainda não conhece e detecta assinaturas. Sem ela, as regras automáticas e as suas
        escolhas continuam funcionando — o resto fica em <em>Revisar</em>. Uma assinatura do Claude.ai <strong className="text-fg">não</strong>{" "}
        inclui créditos da API: crie a chave e adicione créditos em{" "}
        <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="text-accent hover:underline inline-flex items-center gap-0.5">
          console.anthropic.com <ExternalLink className="size-3" />
        </a>
        .
      </p>
      <div>
        <label className={label} htmlFor="anthropic-key">Chave da API Anthropic</label>
        <input
          id="anthropic-key"
          type="password"
          className={input}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={status.keyMasked ? `${status.keyMasked} (configurada)` : "sk-ant-..."}
          autoComplete="off"
        />
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Button type="submit" disabled={pending || !key.trim()}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Testar e salvar
        </Button>
        {status.configured && status.source === "app" && (
          <button type="button" onClick={remove} disabled={pending} className="text-sm text-fg-muted hover:text-danger">
            Remover chave
          </button>
        )}
        <Feedback result={result} />
      </div>
    </form>
  );
}

/** The address that receives a sign-in code when no device is at hand, through Resend. */
export function EmailForm({ status }: { status: SetupStatus["email"] }) {
  const router = useRouter();
  const [email, setEmail] = useState(status.to ?? "");
  const [key, setKey] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const r = await saveEmailSettings(email, key);
      setResult(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      if (r.ok) {
        setKey("");
        router.refresh();
      }
    });
  }

  function remove() {
    if (!confirm("Remover? Sem e-mail, o código de acesso só aparece no log do servidor.")) return;
    startTransition(async () => {
      const r = await removeEmailSettings();
      setResult(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ol className="text-sm text-fg-muted space-y-1.5 list-decimal list-inside">
        <li>
          Crie uma conta em{" "}
          <a href="https://resend.com" target="_blank" rel="noreferrer" className="text-accent hover:underline inline-flex items-center gap-0.5">
            resend.com <ExternalLink className="size-3" />
          </a>{" "}
          (grátis até 3.000 e-mails por mês)
        </li>
        <li>Em <strong className="text-fg">API Keys</strong>, crie uma chave e cole abaixo</li>
        <li>Sem domínio próprio verificado no Resend, o e-mail só chega no endereço dono da conta</li>
      </ol>
      <div>
        <label className={label} htmlFor="recovery-email">E-mail que recebe o código</label>
        <input
          id="recovery-email"
          type="email"
          className={input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@exemplo.com"
          autoComplete="email"
        />
      </div>
      <div>
        <label className={label} htmlFor="resend-key">API key do Resend</label>
        <input
          id="resend-key"
          type="password"
          className={input}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={status.keyMasked ? `${status.keyMasked} (deixe vazio para manter)` : "re_..."}
          autoComplete="off"
        />
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Button type="submit" disabled={pending || !email.trim() || (!key.trim() && !status.configured)}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Salvar e enviar teste
        </Button>
        {status.configured && (
          <button type="button" onClick={remove} disabled={pending} className="text-sm text-fg-muted hover:text-danger">
            Remover
          </button>
        )}
        <Feedback result={result} />
      </div>
    </form>
  );
}
