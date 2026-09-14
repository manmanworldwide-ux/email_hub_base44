"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, HelpCircle, LogOut, Mail, Menu, MoreHorizontal, PenSquare, Settings, Shield, X } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { ADMIN_NAV, NAV_ITEMS, pageTitle } from "@/components/nav";
import { Tour, startTour, type TourStep } from "@/components/tour";
import type { SessionUser } from "@/types/saas";

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Email Hub",
    body: "One inbox for all your Gmail and Outlook accounts, with AI that reads, prioritises and drafts for you. This quick tour shows you around - it takes about a minute.",
  },
  {
    id: "accounts",
    target: '[data-tour="nav-accounts"], [data-tour-mobile="nav-accounts"]',
    title: "Connect your mailboxes",
    body: "Link as many Gmail and Outlook accounts as you like. Mail and calendars sync into one place automatically.",
    cta: { label: "Connect now", href: "/accounts" },
  },
  {
    id: "inbox",
    target: '[data-tour="nav-inbox"], [data-tour-mobile="nav-inbox"]',
    title: "Your unified inbox",
    body: "Search across every account and filter by AI category, priority or 'needs a reply'. Open any email to read, reply and see its analysis.",
  },
  {
    id: "assistant",
    target: '[data-tour="nav-assistant"], [data-tour-mobile="nav-assistant"]',
    title: "Ask the AI assistant",
    body: "Summarise your day, find that invoice, draft replies or schedule a meeting - the assistant can act across all your accounts.",
  },
  {
    id: "calendar",
    target: '[data-tour="nav-calendar"]',
    title: "Calendar & meetings",
    body: "See upcoming events from every calendar and schedule meetings with Google Meet or Teams links in a couple of clicks.",
  },
  {
    id: "insights",
    target: '[data-tour="nav-insights"]',
    title: "Insights",
    body: "Volume trends, top senders and AI breakdowns of category, priority and sentiment across your inboxes.",
  },
  {
    id: "settings",
    target: '[data-tour="nav-settings"]',
    title: "Settings: your AI and API access",
    body: "Choose which AI provider powers analysis and the assistant (Anthropic, OpenAI, Gemini or your own endpoint), and generate access tokens to connect external AI agents.",
    cta: { label: "Open settings", href: "/settings/ai" },
  },
  {
    id: "done",
    title: "You're all set",
    body: "Start by connecting a mailbox. You can restart this tour any time from the help icon in the top bar.",
    cta: { label: "Connect a mailbox", href: "/accounts" },
  },
];

function NavLinks({ user, onNavigate, dataAttr }: { user: SessionUser; onNavigate?: () => void; dataAttr: "data-tour" | "data-tour-mobile" }) {
  const pathname = usePathname();
  const items = user.role === "admin" ? [...NAV_ITEMS, ADMIN_NAV] : NAV_ITEMS;
  return (
    <nav className="flex-1 space-y-0.5 px-3">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`) || (item.href === "/admin/users" && pathname.startsWith("/admin"));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            {...{ [dataAttr]: `nav-${item.tour}` }}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active ? "bg-white/10 text-white" : "text-neutral-400 hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon className={cn("h-4 w-4", active ? "text-brand-300" : "text-neutral-500 group-hover:text-neutral-300")} />
            <span className="flex-1">{item.label}</span>
            {item.href === "/admin/users" ? <span className="rounded bg-white/10 px-1.5 text-[10px] font-medium uppercase tracking-wide">admin</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ appName }: { appName: string }) {
  return (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-lg shadow-brand-900/40">
        <Mail className="h-4 w-4" />
      </span>
      <div>
        <p className="text-sm font-semibold text-white">{appName}</p>
        <p className="text-[11px] text-neutral-400">Unified inbox · AI inside</p>
      </div>
    </div>
  );
}

export function AppShell({ user, unread, appName, children }: { user: SessionUser; unread: number; appName: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDrawer(false);
    setMenu(false);
  }, [pathname]);

  useEffect(() => {
    if (!menu) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menu]);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const mobileItems = NAV_ITEMS.filter((i) => i.mobile);

  return (
    <div className="min-h-screen bg-[var(--page)]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-neutral-950 lg:flex">
        <Brand appName={appName} />
        <NavLinks user={user} dataAttr="data-tour" />
        <div className="border-t border-white/10 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/20 text-xs font-semibold text-brand-200">{initials(user.fullName ?? user.email)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-white">{user.fullName ?? user.email}</p>
              <p className="truncate text-[11px] text-neutral-500">{user.role === "admin" ? "Administrator" : user.email}</p>
            </div>
            <button type="button" onClick={signOut} className="rounded p-1.5 text-neutral-500 hover:bg-white/10 hover:text-white" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-neutral-950/60 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[82vw] max-w-xs flex-col bg-neutral-950 shadow-2xl">
            <div className="flex items-center justify-between pr-3">
              <Brand appName={appName} />
              <button type="button" onClick={() => setDrawer(false)} className="rounded-md p-2 text-neutral-400 hover:bg-white/10 hover:text-white" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLinks user={user} dataAttr="data-tour" onNavigate={() => setDrawer(false)} />
            <div className="border-t border-white/10 px-5 py-4 text-xs text-neutral-400">
              <p className="truncate text-white">{user.fullName ?? user.email}</p>
              <p className="truncate">{user.email}</p>
              <button type="button" onClick={signOut} className="mt-3 flex items-center gap-2 text-neutral-300 hover:text-white">
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-screen flex-col lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-neutral-200/80 bg-white/85 px-4 backdrop-blur lg:px-8">
          <button type="button" onClick={() => setDrawer(true)} className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100 lg:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <p className="text-sm font-semibold text-neutral-900">{pageTitle(pathname)}</p>
          <div className="ml-auto flex items-center gap-1.5">
            <Link href="/compose" className="hidden h-9 items-center gap-2 rounded-lg bg-neutral-900 px-3 text-xs font-medium text-white hover:bg-neutral-800 sm:inline-flex">
              <PenSquare className="h-3.5 w-3.5" /> Compose
            </Link>
            <button type="button" onClick={startTour} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900" title="Take the tour" data-tour="help">
              <HelpCircle className="h-5 w-5" />
            </button>
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenu((m) => !m)}
                className="flex items-center gap-1.5 rounded-lg p-1 pr-2 text-neutral-700 hover:bg-neutral-100"
                aria-haspopup="menu"
                aria-expanded={menu}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">{initials(user.fullName ?? user.email)}</span>
                <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />
              </button>
              {menu ? (
                <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-xl" role="menu">
                  <div className="border-b border-neutral-100 px-3 py-2">
                    <p className="truncate text-sm font-medium text-neutral-900">{user.fullName ?? "Your account"}</p>
                    <p className="truncate text-xs text-neutral-500">{user.email}</p>
                  </div>
                  <Link href="/settings" className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50" role="menuitem">
                    <Settings className="h-4 w-4 text-neutral-400" /> Settings
                  </Link>
                  {user.role === "admin" ? (
                    <Link href="/admin/users" className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50" role="menuitem">
                      <Shield className="h-4 w-4 text-neutral-400" /> Administration
                    </Link>
                  ) : null}
                  <button type="button" onClick={signOut} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50" role="menuitem">
                    <LogOut className="h-4 w-4 text-neutral-400" /> Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 pb-24 pt-5 lg:px-8 lg:pb-10 lg:pt-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>

        {/* Mobile bottom navigation */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {mobileItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-tour-mobile={`nav-${item.tour}`}
                className={cn("flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium", active ? "text-brand-700" : "text-neutral-500")}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {item.href === "/inbox" && unread > 0 ? (
                    <span className="absolute -right-2 -top-1 rounded-full bg-brand-600 px-1 text-[9px] leading-3 text-white">{unread > 99 ? "99+" : unread}</span>
                  ) : null}
                </span>
                {item.label.replace("AI ", "")}
              </Link>
            );
          })}
          <button type="button" onClick={() => setDrawer(true)} data-tour-mobile="nav-accounts" className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-neutral-500">
            <MoreHorizontal className="h-5 w-5" />
            More
          </button>
        </nav>
      </div>

      <Tour steps={TOUR_STEPS} autoStart={!user.tourCompletedAt} />
    </div>
  );
}
