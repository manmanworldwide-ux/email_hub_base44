"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Search, X } from "lucide-react";
import { Button, Input, Select } from "@/components/ui";
import { providerLabel } from "@/lib/utils";
import type { AccountPublic } from "@/types";

const CATEGORIES = ["work", "personal", "finance", "meeting", "sales", "support", "newsletter", "promotion", "notification", "social", "spam", "other"];

export function InboxFilters({ accounts }: { accounts: AccountPublic[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  function update(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    sp.delete("page");
    router.push(`/inbox?${sp.toString()}`);
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    update({ q });
  }

  const active = ["account", "q", "unread", "folder", "category", "priority", "requires_response"].some((k) => params.get(k));

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 px-4 py-3">
      <form onSubmit={onSearch} className="relative flex-1 min-w-[220px]">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search subject, sender, body…" className="pl-8" />
      </form>
      <Select value={params.get("account") ?? ""} onChange={(e) => update({ account: e.target.value })} className="w-auto">
        <option value="">All accounts</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {providerLabel(a.provider)} · {a.email}
          </option>
        ))}
      </Select>
      <Select value={params.get("folder") ?? ""} onChange={(e) => update({ folder: e.target.value })} className="w-auto">
        <option value="">Inbox + archive</option>
        <option value="inbox">Inbox</option>
        <option value="sent">Sent</option>
        <option value="archive">Archive</option>
      </Select>
      <Select value={params.get("category") ?? ""} onChange={(e) => update({ category: e.target.value })} className="w-auto">
        <option value="">Any category</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
      <Select value={params.get("priority") ?? ""} onChange={(e) => update({ priority: e.target.value })} className="w-auto">
        <option value="">Any priority</option>
        <option value="urgent">Urgent</option>
        <option value="high">High</option>
        <option value="normal">Normal</option>
        <option value="low">Low</option>
      </Select>
      <Button
        type="button"
        variant={params.get("unread") === "true" ? "primary" : "secondary"}
        size="sm"
        onClick={() => update({ unread: params.get("unread") === "true" ? null : "true" })}
      >
        Unread
      </Button>
      <Button
        type="button"
        variant={params.get("requires_response") === "true" ? "primary" : "secondary"}
        size="sm"
        onClick={() => update({ requires_response: params.get("requires_response") === "true" ? null : "true" })}
      >
        Needs reply
      </Button>
      {active ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => { setQ(""); router.push("/inbox"); }}>
          <X className="h-3.5 w-3.5" /> Clear
        </Button>
      ) : null}
    </div>
  );
}
