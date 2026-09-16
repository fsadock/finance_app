"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";

/** Shown on every page while Pluggy isn't configured (except the setup and settings pages themselves). */
export function SetupBanner() {
  const pathname = usePathname();
  if (pathname.startsWith("/setup") || pathname.startsWith("/settings")) return null;
  return (
    <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
      <span className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-warn" />
        A Pluggy não está configurada — não é possível conectar nem sincronizar bancos.
      </span>
      <Link href="/setup" className="px-3 py-1 rounded-md bg-warn text-bg font-medium">
        Configurar
      </Link>
    </div>
  );
}
