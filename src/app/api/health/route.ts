import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { providerAvailability } from "@/lib/providers/credentials";

export const dynamic = "force-dynamic";

export async function GET() {
  const providers = await providerAvailability().catch(() => ({ google: false, microsoft: false }));
  return NextResponse.json({
    ok: true,
    data: {
      service: "email-hub",
      time: new Date().toISOString(),
      providers,
      ai: env.ai.configured,
    },
  });
}
