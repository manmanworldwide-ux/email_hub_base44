import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType, type ZodTypeDef } from "zod";
import { ApiError } from "@/lib/api/errors";
import { authenticate, requireScope, type AuthContext, type Scope } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export function ok<T>(data: T, meta?: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data, ...(meta ? { meta } : {}) }, init);
}

export function fail(status: number, message: string, code = "error", details?: unknown) {
  return NextResponse.json(
    { ok: false, error: { code, message, ...(details !== undefined ? { details } : {}) } },
    { status },
  );
}

export function errorToResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return fail(error.status, error.message, error.code, error.details);
  }
  if (error instanceof ZodError) {
    return fail(422, "Validation failed", "validation_error", error.flatten());
  }
  if (error instanceof Error && error.message.startsWith("Missing required environment variable")) {
    return fail(503, error.message, "not_configured");
  }
  console.error("[api] unhandled error", error);
  const message = error instanceof Error ? error.message : "Internal server error";
  return fail(500, message, "internal_error");
}

type Schema<T> = ZodType<T, ZodTypeDef, unknown>;

export async function parseBody<T>(request: Request, schema: Schema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON", "invalid_json");
  }
  return schema.parse(raw);
}

export function parseQuery<T>(request: NextRequest, schema: Schema<T>): T {
  const obj: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    obj[key] = value;
  });
  return schema.parse(obj);
}

type Params = Record<string, string>;
type RouteContext = { params: Promise<Params> };
export type AuthedHandler = (request: NextRequest, auth: AuthContext, params: Params) => Promise<Response>;

/**
 * Wraps a route handler with authentication, scope enforcement, error mapping and
 * request logging for API-key callers.
 */
export function withAuth(scope: Scope | null, handler: AuthedHandler) {
  return async (request: NextRequest, context: RouteContext): Promise<Response> => {
    const started = Date.now();
    let auth: AuthContext | null = null;
    let response: Response;
    try {
      auth = await authenticate(request);
      if (scope) requireScope(auth, scope);
      const params = await context.params;
      response = await handler(request, auth, params);
    } catch (error) {
      response = errorToResponse(error);
    }

    if (auth?.method === "api_key") {
      try {
        await createAdminClient().from("api_request_logs").insert({
          user_id: auth.userId,
          api_key_id: auth.apiKeyId,
          method: request.method,
          path: request.nextUrl.pathname,
          status: response.status,
          duration_ms: Date.now() - started,
        });
      } catch (logError) {
        console.warn("[api] failed to write request log", logError);
      }
    }
    return response;
  };
}

/** Wraps a public (unauthenticated) handler with error mapping. */
export function withErrors(handler: (request: NextRequest, params: Params) => Promise<Response>) {
  return async (request: NextRequest, context: RouteContext): Promise<Response> => {
    try {
      return await handler(request, await context.params);
    } catch (error) {
      return errorToResponse(error);
    }
  };
}
