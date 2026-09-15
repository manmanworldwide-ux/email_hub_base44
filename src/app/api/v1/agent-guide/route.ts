import { NextResponse, type NextRequest } from "next/server";
import { buildAgentGuide } from "@/lib/api/agent-guide";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Public, plain-text API guide that AI agents (e.g. Base44) can read by URL instead of a pasted prompt. */
export async function GET(request: NextRequest) {
  const base = env.appUrl || request.nextUrl.origin;
  return new NextResponse(buildAgentGuide(base), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
