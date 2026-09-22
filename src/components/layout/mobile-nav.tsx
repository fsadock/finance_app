"use client";


import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/domain/format";
import { MOBILE_TABS, NAV, SETTINGS_NAV, isActive } from "./nav";
import { NavLinkPending } from "./nav-link-pending";

/** Phone navigation (below lg): top bar, bottom tab bar and a "Mais" sheet with the other pages. */
export function MobileNav({ appName, lastSync, setupPending }: { appName: string; lastSync: string | null; setupPending: boolean }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const tabs = MOBILE_TABS.map((href) => NAV.find((n) => n.href === href)!);
  const more = [...NAV.filter((n) => !MOBILE_TABS.includes(n.href)), SETTINGS_NAV];
  const moreActive = more.some((n) => isActive(n.href, pathname));

  return (
    <>
      <header className="lg:hidden sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="h-12 px-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-accent grid place-items-center text-bg text-sm font-bold">F</div>
            <span className="font-semibold">{appName}</span>
          </Link>
          <span className="text-[11px] text-fg-subtle">
            {lastSync ? `Sincronizado ${formatDateTime(lastSync)}` : "Nenhuma sincronização ainda"}
          </span>
        </div>
      </header>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-bg-elev/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {tabs.map((item) => (
            <TabLink key={item.href} href={item.href} label={item.short ?? item.label} icon={item.icon} active={isActive(item.href, pathname)} />
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px]", moreActive ? "text-accent" : "text-fg-muted")}
          >
            <span className="relative">
              <MoreHorizontal className="size-5" strokeWidth={1.75} />
              {setupPending && <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-warn" />}
            </span>
            Mais
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/60" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute bottom-0 inset-x-0 rounded-t-2xl border-t border-border bg-bg-card px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" />
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-sm font-medium">Mais</span>
              <button onClick={() => setMoreOpen(false)} className="p-1 text-fg-muted" aria-label="Fechar">
                <X className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {more.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border px-2 py-3 text-xs text-center",
                      active ? "border-accent/40 bg-accent-soft text-accent" : "border-border bg-bg-elev text-fg"
                    )}
                  >
                    <span className="relative">
                      <Icon className="size-5" strokeWidth={1.75} />
                      {item.href === SETTINGS_NAV.href && setupPending && (
                        <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-warn" />
                      )}
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TabLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof MoreHorizontal; active: boolean }) {
  return (
    <Link href={href} className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px]", active ? "text-accent" : "text-fg-muted")}>
      <NavLinkPending>
        <Icon className="size-5" strokeWidth={1.75} />
      </NavLinkPending>
      {label}
    </Link>
  );
}
