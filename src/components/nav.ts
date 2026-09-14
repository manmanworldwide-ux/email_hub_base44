import {
  BarChart3,
  Bot,
  CalendarDays,
  Inbox,
  LayoutDashboard,
  PenSquare,
  Plug,
  Settings,
  Shield,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  tour: string;
  /** Shown in the mobile bottom bar. */
  mobile?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, tour: "dashboard", mobile: true },
  { href: "/inbox", label: "Inbox", icon: Inbox, tour: "inbox", mobile: true },
  { href: "/compose", label: "Compose", icon: PenSquare, tour: "compose", mobile: true },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, tour: "calendar" },
  { href: "/assistant", label: "AI Assistant", icon: Bot, tour: "assistant", mobile: true },
  { href: "/insights", label: "Insights", icon: BarChart3, tour: "insights" },
  { href: "/accounts", label: "Accounts", icon: Plug, tour: "accounts" },
  { href: "/settings", label: "Settings", icon: Settings, tour: "settings" },
];

export const ADMIN_NAV: NavItem = { href: "/admin/users", label: "Admin", icon: Shield, tour: "admin" };

export function pageTitle(pathname: string): string {
  if (pathname.startsWith("/admin")) return "Administration";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/inbox/")) return "Email";
  const item = NAV_ITEMS.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  return item?.label ?? "Email Hub";
}
