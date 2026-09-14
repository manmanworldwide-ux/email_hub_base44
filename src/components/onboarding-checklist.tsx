import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { TourButton } from "@/components/tour";
import { cn } from "@/lib/utils";

export interface OnboardingState {
  hasAccounts: boolean;
  hasEmails: boolean;
  hasAi: boolean;
  canApiKeys: boolean;
  hasApiKey: boolean;
  tourDone: boolean;
}

export function OnboardingChecklist({ state }: { state: OnboardingState }) {
  const items = [
    { done: state.hasAccounts, label: "Connect a Gmail or Outlook mailbox", href: "/accounts", hint: "Add two or more accounts to unify them." },
    { done: state.hasEmails, label: "Run your first sync", href: "/accounts", hint: "Happens automatically after connecting; use Sync to pull more." },
    { done: state.hasAi, label: "Choose your AI provider", href: "/settings/ai", hint: "Anthropic, OpenAI, Gemini or your own endpoint powers analysis and the assistant." },
    ...(state.canApiKeys
      ? [{ done: state.hasApiKey, label: "Create an access token for your AI agent", href: "/settings/api", hint: "Lets tools like Base44 read and act on your inbox." }]
      : []),
    { done: state.tourDone, label: "Take the product tour", href: "", hint: "One minute, shows where everything lives." },
  ];
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;
  const pct = Math.round((done / items.length) * 100);

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-br from-white via-white to-brand-50">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-neutral-900">Getting started</p>
          <p className="text-xs text-neutral-500">
            {done} of {items.length} steps complete
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 w-40 overflow-hidden rounded-full bg-neutral-200">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-medium tabular-nums text-neutral-700">{pct}%</span>
        </div>
      </div>
      <ul className="grid gap-px border-t border-brand-100 bg-brand-100/60 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const inner = (
            <>
              {item.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-300" />}
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm", item.done ? "text-neutral-500 line-through" : "font-medium text-neutral-900")}>{item.label}</span>
                <span className="block text-xs text-neutral-500">{item.hint}</span>
              </span>
              {!item.done ? <ArrowRight className="mt-1 h-3.5 w-3.5 text-neutral-400" /> : null}
            </>
          );
          return (
            <li key={item.label} className="bg-white">
              {item.href ? (
                <Link href={item.href} className="flex items-start gap-3 px-5 py-3.5 hover:bg-brand-50/50">
                  {inner}
                </Link>
              ) : (
                <TourButton className="flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-brand-50/50">{inner}</TourButton>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
