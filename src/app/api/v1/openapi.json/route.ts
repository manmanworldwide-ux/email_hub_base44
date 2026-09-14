import { NextResponse, type NextRequest } from "next/server";
import { buildOpenApiSpec } from "@/lib/api/openapi";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const base = env.appUrl || request.nextUrl.origin;
  return NextResponse.json(buildOpenApiSpec(base), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
