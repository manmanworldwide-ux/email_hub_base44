"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** CSS selector(s); the first *visible* match is spotlighted. Omit for a centered card. */
  target?: string;
  placement?: "right" | "bottom" | "top" | "left";
  cta?: { label: string; href: string };
}

export const TOUR_EVENT = "emailhub:start-tour";

export function startTour() {
  window.dispatchEvent(new CustomEvent(TOUR_EVENT));
}

interface Spot {
  top: number;
  left: number;
  width: number;
  height: number;
}

function findVisible(selector: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth) return el;
  }
  return null;
}

function tooltipStyle(spot: Spot | null, placement?: TourStep["placement"]): CSSProperties {
  if (!spot || typeof window === "undefined") return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(360, vw * 0.92);
  const clampX = (x: number) => Math.min(Math.max(x, 12), vw - width - 12);
  const resolved =
    placement ??
    (spot.left + spot.width + width + 24 < vw ? "right" : spot.top + spot.height + 240 < vh ? "bottom" : "top");
  switch (resolved) {
    case "right":
      return { top: Math.min(Math.max(spot.top, 12), vh - 280), left: spot.left + spot.width + 14, width };
    case "left":
      return { top: Math.min(Math.max(spot.top, 12), vh - 280), left: spot.left - 14, width, transform: "translateX(-100%)" };
    case "top":
      return { top: spot.top - 14, left: clampX(spot.left), width, transform: "translateY(-100%)" };
    default:
      return { top: spot.top + spot.height + 14, left: clampX(spot.left), width };
  }
}

export function Tour({ steps, autoStart }: { steps: TourStep[]; autoStart: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);
  const step = steps[index];

  useEffect(() => {
    const handler = () => {
      setIndex(0);
      setActive(true);
    };
    window.addEventListener(TOUR_EVENT, handler);
    return () => window.removeEventListener(TOUR_EVENT, handler);
  }, []);

  useEffect(() => {
    if (!autoStart && searchParams.get("tour") !== "1") return;
    const timer = window.setTimeout(() => {
      setIndex(0);
      setActive(true);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [autoStart, searchParams]);

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const measure = () => {
      if (!step?.target) {
        setSpot(null);
        return;
      }
      const el = findVisible(step.target);
      if (!el) {
        setSpot(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const pad = 6;
      setSpot({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
    };
    measure();
    const onChange = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [active, step]);

  const finish = useCallback(() => {
    setActive(false);
    api("/api/v1/me", { method: "PATCH", json: { tour_completed: true } })
      .then(() => router.refresh())
      .catch(() => undefined);
    if (searchParams.get("tour")) router.replace(pathname);
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish, steps.length]);

  const style = useMemo(() => tooltipStyle(spot, step?.placement), [spot, step]);

  if (!active || !step) return null;
  const last = index === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Product tour">
      {spot ? (
        <div
          className="absolute rounded-xl transition-all duration-300 ease-out"
          style={{ ...spot, boxShadow: "0 0 0 9999px rgba(8, 8, 10, 0.62)", outline: "2px solid rgba(255,255,255,0.75)" }}
        />
      ) : (
        <div className="absolute inset-0 bg-neutral-950/65" onClick={finish} />
      )}
      <div className="tour-card absolute rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl" style={style}>
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-600">
            <Sparkles className="h-3 w-3" /> Step {index + 1} of {steps.length}
          </p>
          <button type="button" onClick={finish} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" aria-label="Close tour">
            <X className="h-4 w-4" />
          </button>
        </div>
        <h3 className="mt-2 text-base font-semibold text-neutral-900">{step.title}</h3>
        <p className="mt-1.5 text-sm leading-6 text-neutral-600">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {steps.map((s, i) => (
              <span key={s.id} className={cn("h-1.5 rounded-full transition-all", i === index ? "w-4 bg-brand-600" : "w-1.5 bg-neutral-300")} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {index > 0 ? (
              <button type="button" onClick={() => setIndex(index - 1)} className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100">
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
            ) : null}
            {step.cta ? (
              <Link href={step.cta.href} onClick={finish} className="inline-flex h-8 items-center rounded-md bg-neutral-900 px-3 text-xs font-medium text-white hover:bg-neutral-800">
                {step.cta.label}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => (last ? finish() : setIndex(index + 1))}
              className="inline-flex h-8 items-center gap-1 rounded-md bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700"
            >
              {last ? "Finish" : "Next"} {last ? null : <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TourButton({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" onClick={startTour} className={className}>
      {children ?? "Take the tour"}
    </button>
  );
}
