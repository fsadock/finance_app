"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn, errorMessage } from "@/lib/utils";
import { describeSync, syncAllAccounts } from "@/lib/client/sync";
import { formatDateTime } from "@/lib/domain/format";
import { Toast } from "@/components/ui/toast";

const TRIGGER = 70;
const MAX = 110;
/** A pull within this long after the last sync only reloads the page (Pluggy has nothing newer). */
const RESYNC_AFTER_MS = 5 * 60_000;

/**
 * Pull down at the top of the page to sync the banks and reload the page, like a bank app; within a
 * few minutes of the last sync it only reloads. Only in the installed app (standalone display mode):
 * a browser tab has its own pull-to-refresh.
 */
export function PullToRefresh({ lastSync }: { lastSync: string | null }) {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, startTransition] = useTransition();
  const pending = syncing || refreshing;
  const hideMessage = useCallback(() => setMessage(null), []);
  const lastSyncRef = useRef(lastSync);
  useEffect(() => {
    lastSyncRef.current = lastSync;
  }, [lastSync]);

  const refresh = useCallback(async () => {
    const last = lastSyncRef.current ? new Date(lastSyncRef.current) : null;
    if (last && Date.now() - last.getTime() < RESYNC_AFTER_MS) {
      startTransition(() => router.refresh());
      setMessage(`Atualizado · sincronizado às ${formatDateTime(last)}`);
      return;
    }
    setSyncing(true);
    try {
      const summary = await syncAllAccounts();
      startTransition(() => router.refresh());
      setMessage(describeSync(summary));
    } catch (e) {
      setMessage(`Falha ao sincronizar: ${errorMessage(e, "erro desconhecido")}`);
    } finally {
      setSyncing(false);
    }
  }, [router]);
  const start = useRef<number | null>(null);
  const distance = useRef(0);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;

    function onStart(e: TouchEvent) {
      start.current = window.scrollY <= 0 ? e.touches[0]!.clientY : null;
    }
    function onMove(e: TouchEvent) {
      if (start.current === null) return;
      const dy = e.touches[0]!.clientY - start.current;
      distance.current = dy > 0 ? Math.min(MAX, dy * 0.5) : 0;
      setPull(distance.current);
    }
    function onEnd() {
      if (start.current === null) return;
      start.current = null;
      if (distance.current >= TRIGGER) void refresh();
      distance.current = 0;
      setPull(0);
    }
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [refresh]);

  const visible = pending || pull > 8;
  if (!visible) return message ? <Toast message={message} onDone={hideMessage} className="lg:hidden" /> : null;
  const progress = pending ? 1 : Math.min(1, pull / TRIGGER);
  return (
    <div
      className="lg:hidden fixed inset-x-0 z-30 flex justify-center pointer-events-none"
      style={{ top: `calc(env(safe-area-inset-top) + 3.5rem + ${pending ? 8 : Math.min(pull, TRIGGER) / 2}px)` }}
      role="status"
      aria-label={pending ? (syncing ? "Sincronizando" : "Atualizando") : undefined}
    >
      <div className="grid size-9 place-items-center rounded-full border border-border bg-bg-card shadow-lg">
        <RefreshCw
          className={cn("size-4 text-accent", pending && "animate-spin")}
          style={pending ? undefined : { transform: `rotate(${progress * 270}deg)`, opacity: 0.4 + progress * 0.6 }}
        />
      </div>
    </div>
  );
}
