"use client";

/** Minimal client for the hub's own JSON API (session cookie auth). */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const response = await fetch(path, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
  });
  const payload = (await response.json().catch(() => null)) as
    | { ok: true; data: T }
    | { ok: false; error?: { message?: string; code?: string } }
    | null;
  if (!response.ok || !payload || !payload.ok) {
    const message = payload && !payload.ok ? payload.error?.message : undefined;
    throw new Error(message ?? `Request failed (${response.status})`);
  }
  return payload.data;
}
