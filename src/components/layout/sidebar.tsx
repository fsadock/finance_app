"use client";


import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/domain/format";
import { NAV, SETTINGS_NAV, isActive } from "./nav";
import { NavLinkPending } from "./nav-link-pending";

export function Sidebar({ appName, lastSync, setupPending }: { appName: string; lastSync: string | null; setupPending: boolean }) {
  const pathname = usePathname();
  return (
    <aside className="hidden lg:flex w-64 shrink-0 border-r border-border bg-bg-elev px-4 py-6 flex-col gap-2 sticky top-0 h-screen">
      <div className="px-3 mb-6 flex items-center gap-2">
        <div className="size-8 rounded-lg bg-accent grid place-items-center text-bg font-bold">F</div>
        <div>
          <div className="font-semibold leading-tight">{appName}</div>
          <div className="text-xs text-fg-muted">Personal</div>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                active
                  ? "bg-bg-hover text-fg"
                  : "text-fg-muted hover:text-fg hover:bg-bg-hover/60"
              )}
            >
              <NavLinkPending>
                <Icon className="size-[18px]" strokeWidth={1.75} />
              </NavLinkPending>
              <span>{item.label}</span>
              {active && <div className="ml-auto size-1.5 rounded-full bg-accent" />}
            </Link>
          );
        })}
      </nav>
      <Link
        href="/settings"
        className={cn(
          "mt-auto flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
          isActive(SETTINGS_NAV.href, pathname)
            ? "bg-bg-hover text-fg"
            : "text-fg-muted hover:text-fg hover:bg-bg-hover/60"
        )}
      >
        <SETTINGS_NAV.icon className="size-[18px]" strokeWidth={1.75} />
        <span>{SETTINGS_NAV.label}</span>
        {setupPending && <span className="ml-auto size-2 rounded-full bg-warn" title="Configuração pendente" />}
      </Link>
      <div className="px-3 pt-4 border-t border-border text-xs text-fg-subtle">
        <div>BRL · pt-BR</div>
        <div>
          {lastSync
            ? `Sincronizado ${formatDateTime(lastSync)}`
            : "Nenhuma sincronização ainda"}
        </div>
      </div>
    </aside>
  );
}
