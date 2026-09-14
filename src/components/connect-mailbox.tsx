"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Plus, ShieldCheck, X } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui";
import { ProviderMark } from "@/components/provider-marks";
import { cn } from "@/lib/utils";

export type MailProviderId = "google" | "microsoft";
export type ProviderAvailability = Record<MailProviderId, boolean>;

interface OAuthResultMessage {
  source: "email-hub";
  type: "oauth-result";
  ok: boolean;
  provider?: string;
  email?: string;
  error?: string;
  description?: string;
}

const PROVIDER_META: Record<MailProviderId, { name: string; sub: string; scopes: string }> = {
  google: { name: "Gmail", sub: "Google Workspace & personal Gmail", scopes: "Read & send mail · Google Calendar" },
  microsoft: { name: "Outlook", sub: "Microsoft 365, Exchange & Outlook.com", scopes: "Read & send mail · Outlook Calendar" },
};

/**
 * Opens the provider's sign-in in a popup window and resolves when the callback page posts
 * the result back. Falls back to a full-page redirect if popups are blocked.
 */
export function useOAuthPopup(options: { onConnected?: (email: string, provider: MailProviderId) => void } = {}) {
  const router = useRouter();
  const [busy, setBusy] = useState<MailProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<string | null>(null);
  const cleanupRef = useRef<() => void>(() => undefined);

  useEffect(() => () => cleanupRef.current(), []);

  const connect = useCallback(
    (provider: MailProviderId) => {
      setError(null);
      setConnected(null);
      const url = `/api/auth/${provider}?popup=1`;
      const width = 540;
      const height = 720;
      const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
      const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
      const popup = window.open(url, "emailhub-oauth", `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
      if (!popup) {
        window.location.href = `/api/auth/${provider}`;
        return;
      }
      setBusy(provider);
      let settled = false;

      const finish = () => {
        settled = true;
        window.removeEventListener("message", onMessage);
        window.clearInterval(timer);
        setBusy(null);
      };
      const onMessage = (event: MessageEvent<OAuthResultMessage>) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data;
        if (!data || data.source !== "email-hub" || data.type !== "oauth-result") return;
        finish();
        if (data.ok) {
          setConnected(data.email ?? null);
          options.onConnected?.(data.email ?? "", provider);
          router.refresh();
        } else {
          setError(data.description || data.error || "The connection was not completed.");
        }
      };
      const timer = window.setInterval(() => {
        if (popup.closed && !settled) {
          finish();
          router.refresh();
        }
      }, 700);
      window.addEventListener("message", onMessage);
      cleanupRef.current = finish;
      popup.focus();
    },
    [options, router],
  );

  return { connect, busy, error, connected };
}

export function ConnectProviderButton({
  provider,
  configured,
  children,
  variant = "primary",
  size = "md",
  className,
  onConnected,
}: {
  provider: MailProviderId;
  configured: boolean;
  children?: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  className?: string;
  onConnected?: (email: string) => void;
}) {
  const { connect, busy, error } = useOAuthPopup({ onConnected });
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={!configured || busy !== null}
        onClick={() => connect(provider)}
        title={configured ? undefined : `${PROVIDER_META[provider].name} is not set up yet`}
        className={buttonClasses(variant, size, className)}
      >
        {busy === provider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {children ?? `Connect ${PROVIDER_META[provider].name}`}
      </button>
      {error ? <span className="max-w-xs text-[11px] text-red-600">{error}</span> : null}
    </span>
  );
}

export function AddMailboxButton({
  availability,
  isAdmin,
  label = "Add mailbox",
  variant = "primary",
  size = "md",
  className,
}: {
  availability: ProviderAvailability;
  isAdmin: boolean;
  label?: string;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)} data-tour="add-mailbox">
        <Plus className="h-4 w-4" /> {label}
      </Button>
      {open ? <ConnectMailboxDialog availability={availability} isAdmin={isAdmin} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function ConnectMailboxDialog({ availability, isAdmin, onClose }: { availability: ProviderAvailability; isAdmin: boolean; onClose: () => void }) {
  const { connect, busy, error, connected } = useOAuthPopup();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!connected) return;
    const t = window.setTimeout(onClose, 1800);
    return () => window.clearTimeout(t);
  }, [connected, onClose]);

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-neutral-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Add mailbox">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Add a mailbox</h2>
            <p className="mt-0.5 text-sm text-neutral-500">Choose a provider. A sign-in window opens where you log in to that account and approve access.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {(["google", "microsoft"] as MailProviderId[]).map((id) => {
            const meta = PROVIDER_META[id];
            const ready = availability[id];
            const loading = busy === id;
            return (
              <button
                key={id}
                type="button"
                disabled={!ready || busy !== null}
                onClick={() => connect(id)}
                className={cn(
                  "group flex flex-col items-start gap-3 rounded-2xl border p-4 text-left transition-all",
                  ready ? "border-neutral-200 bg-white hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg" : "cursor-not-allowed border-dashed border-neutral-300 bg-neutral-50 opacity-80",
                )}
              >
                <span className="flex w-full items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-50 ring-1 ring-neutral-200">
                    <ProviderMark provider={id} className="h-7 w-7" />
                  </span>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin text-brand-600" /> : null}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-neutral-900">{meta.name}</span>
                  <span className="block text-xs text-neutral-500">{meta.sub}</span>
                </span>
                <span className="flex items-center gap-1 text-[11px] text-neutral-500">
                  <ShieldCheck className="h-3.5 w-3.5" /> {meta.scopes}
                </span>
                {!ready ? (
                  <span className="text-[11px] font-medium text-amber-700">
                    Not set up yet.{" "}
                    {isAdmin ? (
                      <Link href="/admin/connectors" className="underline" onClick={(e) => e.stopPropagation()}>
                        Configure in Mail connectors
                      </Link>
                    ) : (
                      "Ask your administrator."
                    )}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {busy ? <p className="mt-4 text-xs text-neutral-500">Complete the sign-in in the popup window. If nothing opened, allow popups for this site and try again.</p> : null}
        {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
        {connected ? (
          <p className="mt-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
            <CheckCircle2 className="h-4 w-4" /> Connected {connected}. Syncing the first messages…
          </p>
        ) : null}

        <p className="mt-5 text-[11px] leading-5 text-neutral-400">
          Email Hub never sees your password. Access can be revoked any time from Accounts, or from your Google / Microsoft security settings.
        </p>
      </div>
    </div>
  );
}
