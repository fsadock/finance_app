"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PluggyConnectButton } from "@/components/pluggy-connect-button";
import type { SetupStatus } from "@/lib/settings";
import { AiForm, PluggyForm, SourceBadge } from "./credential-forms";
import { cn } from "@/lib/utils";

const STEPS = ["Pluggy", "IA (opcional)", "Conectar bancos"];

export function SetupWizard({ status }: { status: SetupStatus }) {
  const [step, setStep] = useState(status.pluggy.configured ? (status.connections > 0 ? 2 : 1) : 0);
  const done = [status.pluggy.configured, status.ai.configured, status.connections > 0];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Bem-vindo ao Finanças</h1>
        <p className="text-fg-muted mt-1 text-sm">
          Três passos para conectar seus bancos. Tudo fica salvo só neste computador.
        </p>
      </div>

      <ol className="flex items-center gap-2 text-sm">
        {STEPS.map((name, i) => (
          <li key={name} className="flex items-center gap-2">
            <button
              onClick={() => (i === 0 || status.pluggy.configured) && setStep(i)}
              disabled={i > 0 && !status.pluggy.configured}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40",
                step === i ? "border-accent text-fg" : "border-border text-fg-muted hover:text-fg"
              )}
            >
              <span className={cn("size-5 rounded-full grid place-items-center text-[11px]", done[i] ? "bg-accent text-bg" : "bg-bg-hover")}>
                {done[i] ? <Check className="size-3" /> : i + 1}
              </span>
              {name}
            </button>
            {i < STEPS.length - 1 && <span className="text-fg-subtle">→</span>}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">1 · Conectar o app à Pluggy</h2>
            <SourceBadge source={status.pluggy.configured ? status.pluggy.source : null} />
          </div>
          <p className="text-sm text-fg-muted">
            A Pluggy busca os dados dos seus bancos via Open Finance. Para uso pessoal (conectando pelo Meu Pluggy) o acesso é gratuito —
            confira os planos atuais no site da Pluggy.
          </p>
          <PluggyForm status={status.pluggy} onSaved={() => setStep(1)} />
        </Card>
      )}

      {step === 1 && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">2 · Inteligência artificial (opcional)</h2>
            <SourceBadge source={status.ai.source} />
          </div>
          <AiForm status={status.ai} onSaved={() => setStep(2)} />
          <div className="pt-2 border-t border-border flex justify-end">
            <button onClick={() => setStep(2)} className="text-sm text-fg-muted hover:text-fg">
              {status.ai.configured ? "Continuar →" : "Pular — usar sem IA →"}
            </button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-4">
          <h2 className="font-semibold">3 · Conectar seus bancos</h2>
          <ol className="text-sm text-fg-muted space-y-1.5 list-decimal list-inside">
            <li>
              Crie sua conta em{" "}
              <a href="https://meu.pluggy.ai" target="_blank" rel="noreferrer" className="text-accent hover:underline inline-flex items-center gap-0.5">
                meu.pluggy.ai <ExternalLink className="size-3" />
              </a>{" "}
              e conecte lá seus bancos e cartões (Open Finance)
            </li>
            <li>
              Clique em <strong className="text-fg">Conectar conta</strong> abaixo e escolha <strong className="text-fg">MeuPluggy</strong>
            </li>
            <li>A primeira sincronização traz contas, faturas, até 5 anos de transações e investimentos</li>
          </ol>
          <div className="flex justify-start">
            <PluggyConnectButton />
          </div>
          <p className="text-sm text-fg-muted">
            {status.connections > 0
              ? `✓ ${status.connections} conexão(ões) configurada(s).`
              : "Nenhuma conexão ainda."}{" "}
            Você pode conectar mais bancos depois em <Link href="/accounts" className="text-accent hover:underline">Contas</Link>.
          </p>
          <div className="pt-2 border-t border-border flex justify-end">
            <Link
              href="/"
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium",
                status.connections > 0 ? "bg-accent text-bg hover:bg-accent-hover" : "border border-border text-fg-muted hover:text-fg"
              )}
            >
              {status.connections > 0 ? "Ir para o Dashboard →" : "Fazer isso depois →"}
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
