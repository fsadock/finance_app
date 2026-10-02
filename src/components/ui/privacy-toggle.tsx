"use client";

import { useSyncExternalStore } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/** Lido também por um script no <head>, que aplica o atributo antes da primeira pintura. */
const KEY = "financas_private";

/**
 * O estado real é o atributo no <html> — é ele que o CSS enxerga, e é ele que o script do <head> já
 * aplicou antes do React existir. Então o React lê de lá em vez de guardar uma cópia que pode divergir.
 */
const listeners = new Set<() => void>();
const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => void listeners.delete(notify);
};
const isHidden = () => document.documentElement.hasAttribute("data-private");
const onServer = () => false;

function setHidden(next: boolean) {
  document.documentElement.toggleAttribute("data-private", next);
  try {
    localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    // janela anônima pode bloquear o storage; a preferência vale só para esta sessão
  }
  for (const notify of listeners) notify();
}

/**
 * Esconde os valores da tela, como o olhinho dos apps de banco.
 *
 * A preferência é deste aparelho, não da conta: esconder no celular não deveria esconder no notebook de
 * casa. Por isso mora no localStorage e nunca vai para o servidor.
 */
export function PrivacyToggle({ className }: { className?: string }) {
  const hidden = useSyncExternalStore(subscribe, isHidden, onServer);
  const Icon = hidden ? EyeOff : Eye;
  const label = hidden ? "Mostrar valores" : "Esconder valores";

  return (
    <button
      onClick={() => setHidden(!hidden)}
      title={label}
      aria-label={label}
      aria-pressed={hidden}
      className={cn("rounded-lg p-2 text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg", className)}
    >
      <Icon className="size-[18px]" strokeWidth={1.75} />
    </button>
  );
}
