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
  Landmark,
  Bitcoin,
  ListChecks,
  Settings,
  type LucideIcon,
} from "lucide-react";

/** `requires` hides the item until that part of the app is in use — a page nobody needs is just noise. */
type NavItem = { href: string; label: string; short?: string; icon: LucideIcon; requires?: "crypto" };

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", short: "Início", icon: LayoutDashboard },
  { href: "/transactions", label: "Transações", icon: Receipt },
  { href: "/categories", label: "Categorias", icon: PieChart },
  { href: "/cashflow", label: "Fluxo de Caixa", icon: TrendingUp },
  { href: "/accounts", label: "Contas", icon: Wallet },
  { href: "/goals", label: "Metas", icon: Target },
  { href: "/investments", label: "Investimentos", icon: LineChart },
  { href: "/cripto", label: "Cripto", icon: Bitcoin, requires: "crypto" },
  { href: "/recurrings", label: "Recorrentes", icon: Repeat },
  { href: "/installments", label: "Parcelas", icon: Layers },
  { href: "/taxes", label: "Imposto de Renda", icon: Landmark },
  { href: "/rules", label: "Regras", icon: ListChecks },
];

export const SETTINGS_NAV: NavItem = { href: "/settings", label: "Configurações", icon: Settings };

/** The four screens in the phone's bottom bar; everything else sits under "Mais". */
export const MOBILE_TABS = ["/", "/transactions", "/accounts", "/recurrings"];

/** The menu for this install: pages whose feature isn't in use stay out. */
export function navFor({ hasCrypto }: { hasCrypto: boolean }) {
  return NAV.filter((item) => item.requires !== "crypto" || hasCrypto);
}

export function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  if (href === "/settings") return pathname.startsWith("/settings") || pathname.startsWith("/setup");
  return pathname.startsWith(href);
}
