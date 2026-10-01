import {
  LayoutDashboard,
  Receipt,
  PieChart,
  TrendingUp,
  Wallet,
  Target,
  LineChart,
  Repeat,
  Layers,
  CalendarClock,
  Landmark,
  Bitcoin,
  ListChecks,
  Settings,
  type LucideIcon,
} from "lucide-react";

type NavItem = { href: string; label: string; short?: string; icon: LucideIcon };

/**
 * The pages, grouped by what the person came to do.
 *
 * Flat, every page carried the same weight: "Regras" looked as important as the dashboard, and finding
 * anything meant reading all fourteen. Grouping changes nothing about the pages — it just means searching
 * three or four names instead of fourteen.
 */
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Visão geral",
    items: [
      { href: "/", label: "Dashboard", short: "Início", icon: LayoutDashboard },
      { href: "/cashflow", label: "Fluxo de Caixa", icon: TrendingUp },
    ],
  },
  {
    label: "Dia a dia",
    items: [
      { href: "/transactions", label: "Transações", icon: Receipt },
      { href: "/categories", label: "Categorias", icon: PieChart },
    ],
  },
  {
    label: "Compromissos",
    items: [
      { href: "/next-month", label: "Próximo mês", short: "Próximo", icon: CalendarClock },
      { href: "/recurrings", label: "Recorrentes", icon: Repeat },
      { href: "/installments", label: "Parcelas", icon: Layers },
    ],
  },
  {
    label: "Patrimônio",
    items: [
      { href: "/accounts", label: "Contas", icon: Wallet },
      { href: "/investments", label: "Investimentos", icon: LineChart },
      { href: "/cripto", label: "Cripto", icon: Bitcoin },
      { href: "/goals", label: "Metas", icon: Target },
    ],
  },
  {
    label: "Ferramentas",
    items: [
      { href: "/taxes", label: "Imposto de Renda", icon: Landmark },
      { href: "/rules", label: "Regras", icon: ListChecks },
    ],
  },
];

/** Every page, in order — for lookups that don't care which group a page is in. */
export const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export const SETTINGS_NAV: NavItem = { href: "/settings", label: "Configurações", icon: Settings };

/** The four screens in the phone's bottom bar; everything else sits under "Mais". */
export const MOBILE_TABS = ["/", "/transactions", "/accounts", "/recurrings"];

export function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  if (href === "/settings") return pathname.startsWith("/settings") || pathname.startsWith("/setup");
  return pathname.startsWith(href);
}
