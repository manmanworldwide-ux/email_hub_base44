"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2, Trash2 } from "lucide-react";
import { api } from "@/lib/client-api";
import { Alert, Button, Input, Label, Select, Textarea } from "@/components/ui";
import { providerLabel } from "@/lib/utils";
import type { AccountPublic, CalendarEventRow } from "@/types";

function defaultStart(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toLocalInput(d);
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addMinutes(local: string, minutes: number): string {
  const d = new Date(local);
  d.setMinutes(d.getMinutes() + minutes);
  return toLocalInput(d);
}

export function CreateEventForm({ accounts }: { accounts: AccountPublic[] }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(() => addMinutes(defaultStart(), 30));
  const [attendees, setAttendees] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CalendarEventRow | null>(null);

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const event = await api<CalendarEventRow>("/api/v1/calendar/events", {
        method: "POST",
        json: {
          account_id: accountId,
          title,
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          timezone,
          attendees: attendees
            .split(/[,;\n]/)
            .map((s) => s.trim())
            .filter(Boolean),
          location: location || null,
          description: description || null,
          online_meeting: online,
        },
      });
      setCreated(event);
      setTitle("");
      setAttendees("");
      setDescription("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setBusy(false);
    }
  }

  if (!accounts.length) return <Alert tone="warning">Connect an account to schedule meetings.</Alert>;

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <Label htmlFor="ev-account">Calendar</Label>
        <Select id="ev-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.email} ({providerLabel(a.provider)})
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="ev-title">Title</Label>
        <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Project sync" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="ev-start">Start</Label>
          <Input
            id="ev-start"
            type="datetime-local"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (new Date(e.target.value) >= new Date(end)) setEnd(addMinutes(e.target.value, 30));
            }}
            required
          />
        </div>
        <div>
          <Label htmlFor="ev-end">End</Label>
          <Input id="ev-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required />
        </div>
      </div>
      <div>
        <Label htmlFor="ev-attendees">Attendees</Label>
        <Input id="ev-attendees" value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="jane@example.com, john@example.com" />
      </div>
      <div>
        <Label htmlFor="ev-location">Location</Label>
        <Input id="ev-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
      </div>
      <div>
        <Label htmlFor="ev-desc">Description</Label>
        <Textarea id="ev-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-xs text-neutral-600">
        <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} className="h-3.5 w-3.5" />
        Add video meeting link (Google Meet / Teams)
      </label>
      <p className="text-[11px] text-neutral-500">Times are in your timezone ({timezone}). Invitations are emailed to attendees.</p>
      {error ? <Alert tone="critical">{error}</Alert> : null}
      {created ? (
        <Alert tone="good">
          Meeting created.{" "}
          {created.meeting_link ? (
            <a href={created.meeting_link} target="_blank" rel="noreferrer" className="underline">
              Join link
            </a>
          ) : null}
        </Alert>
      ) : null}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} Schedule meeting
      </Button>
    </form>
  );
}

export function DeleteEventButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!window.confirm("Cancel this meeting for all attendees?")) return;
    setBusy(true);
    try {
      await api(`/api/v1/calendar/events/${eventId}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" onClick={remove} disabled={busy} className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600" title="Cancel meeting">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}
