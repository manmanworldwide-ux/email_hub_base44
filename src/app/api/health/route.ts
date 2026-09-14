import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    data: {
      service: "email-hub",
      time: new Date().toISOString(),
      providers: { google: env.google.configured, microsoft: env.microsoft.configured },
      ai: env.ai.configured,
    },
  });
}
