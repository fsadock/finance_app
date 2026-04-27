"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  PieChart,
  TrendingUp,
  Wallet,
  Target,
  LineChart,
  Repeat,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transações", icon: Receipt },
  { href: "/categories", label: "Categorias", icon: PieChart },
  { href: "/cashflow", label: "Fluxo de Caixa", icon: TrendingUp },
  { href: "/accounts", label: "Contas", icon: Wallet },
  { href: "/goals", label: "Metas", icon: Target },
  { href: "/investments", label: "Investimentos", icon: LineChart },
  { href: "/recurrings", label: "Recorrentes", icon: Repeat },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-64 shrink-0 border-r border-border bg-bg-elev px-4 py-6 flex flex-col gap-2 sticky top-0 h-screen">
      <div className="px-3 mb-6 flex items-center gap-2">
        <div className="size-8 rounded-lg bg-accent grid place-items-center text-bg font-bold">F</div>
        <div>
          <div className="font-semibold leading-tight">Finanças</div>
          <div className="text-xs text-fg-muted">Personal</div>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
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
              <Icon className="size-[18px]" strokeWidth={1.75} />
              <span>{item.label}</span>
              {active && <div className="ml-auto size-1.5 rounded-full bg-accent" />}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-3 pt-4 border-t border-border text-xs text-fg-subtle">
        <div>BRL · pt-BR</div>
        <div>Mock data (Pluggy off)</div>
      </div>
    </aside>
  );
}
