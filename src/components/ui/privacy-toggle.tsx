"use client";

import { useSyncExternalStore } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/** Also read by a script in <head>, which applies the attribute before the first paint. */
const KEY = "financas_private";

/**
 * The state is the attribute on <html>: it is what the CSS sees and what the <head> script already set before
 * React ran. React reads it there instead of keeping a copy that could disagree.
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
    // a private window may block storage; then the preference lasts for this session only
  }
  for (const notify of listeners) notify();
}

/**
 * Hides the amounts on screen, like the eye toggle in banking apps.
 *
 * The preference belongs to this device, not the account: hiding on a phone shouldn't hide on the laptop at
 * home. So it lives in localStorage and never reaches the server.
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
