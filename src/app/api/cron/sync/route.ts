import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncEverything } from "@/lib/hub/sync";
import { errorToResponse } from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled sync for all users. Protect with CRON_SECRET:
 *   Authorization: Bearer <CRON_SECRET>
 * Vercel Cron sends this header automatically when CRON_SECRET is set in the project.
 */
async function handler(request: NextRequest) {
  const secret = env.cronSecret;
  if (!secret) {
    return NextResponse.json({ ok: false, error: { code: "cron_disabled", message: "CRON_SECRET is not set" } }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  const provided = header.replace(/^Bearer\s+/i, "");
  if (!provided || !safeEqual(provided, secret)) {
    return NextResponse.json({ ok: false, error: { code: "unauthorized", message: "Invalid cron secret" } }, { status: 401 });
  }
  try {
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "5");
    const results = await syncEverything(createAdminClient(), Number.isFinite(limit) ? Math.min(limit, 50) : 5);
    return NextResponse.json({ ok: true, data: results });
  } catch (error) {
    return errorToResponse(error);
  }
}

export const GET = handler;
export const POST = handler;
