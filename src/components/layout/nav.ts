import {
  ArrowLeftRight,
  Calculator,
  ChartColumn,
  LayoutDashboard,
  Package,
  Percent,
  Settings,
  ShoppingCart,
  Tags,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Início", icon: LayoutDashboard },
  { href: "/produtos", label: "Produtos e estoque", icon: Package },
  { href: "/categorias", label: "Categorias", icon: Tags },
  { href: "/fornecedores", label: "Fornecedores", icon: Truck },
  { href: "/movimentacoes", label: "Movimentações", icon: ArrowLeftRight },
  { href: "/vendas", label: "Vendas", icon: ShoppingCart },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/precificacao", label: "Precificação", icon: Calculator },
  { href: "/promocoes", label: "Promoções", icon: Percent },
  { href: "/relatorios", label: "Relatórios", icon: ChartColumn },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
