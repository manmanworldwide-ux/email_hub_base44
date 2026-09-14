"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function SubNav({ items }: { items: { href: string; label: string; exact?: boolean }[] }) {
  const pathname = usePathname();
  return (
    <div className="mb-6 -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <nav className="inline-flex min-w-full gap-1 border-b border-neutral-200 lg:min-w-0">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "border-brand-600 text-brand-700" : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-800",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
