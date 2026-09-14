import { ALL_SCOPES, SCOPE_DESCRIPTIONS } from "@/lib/api/auth";
import { ENDPOINTS, type EndpointDoc } from "@/lib/api/endpoints";

type JsonObject = Record<string, unknown>;

function pathParams(path: string): JsonObject[] {
  return [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
    name: m[1],
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
}

function queryParams(query: EndpointDoc["query"]): JsonObject[] {
  if (!query) return [];
  return Object.entries(query).map(([name, description]) => ({
    name,
    in: "query",
    required: false,
    description,
    schema: { type: "string" },
  }));
}

function operation(endpoint: EndpointDoc): JsonObject {
  const op: JsonObject = {
    summary: endpoint.summary,
    description: endpoint.description ?? undefined,
    tags: [endpoint.tag],
    operationId: `${endpoint.method.toLowerCase()}_${endpoint.path
      .replace(/^\/api\/v1\//, "")
      .replace(/^\/api\//, "")
      .replace(/[{}]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")}`,
    parameters: [...pathParams(endpoint.path), ...queryParams(endpoint.query)],
    responses: {
      "200": {
        description: "Success",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } },
      },
      "401": { description: "Missing or invalid credentials", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      "403": { description: "Insufficient scope", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      "422": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
    },
  };
  if (endpoint.scope === "public") {
    op.security = [];
  } else if (endpoint.scope === "interactive" || endpoint.scope === "admin") {
    op.security = [{ supabaseJwt: [] }];
    op.description = `${op.description ? `${op.description}\n\n` : ""}${
      endpoint.scope === "admin" ? "Administrators only. " : ""
    }Interactive login only (session or Supabase JWT); cannot be called with an API key.`;
  } else {
    op.security = [{ apiKey: [endpoint.scope] }, { supabaseJwt: [] }];
    op["x-required-scope"] = endpoint.scope;
  }
  if (endpoint.body) {
    op.requestBody = {
      required: true,
      content: { "application/json": { schema: endpoint.body, ...(endpoint.example ? { example: endpoint.example } : {}) } },
    };
  }
  return op;
}

export function buildOpenApiSpec(baseUrl: string): JsonObject {
  const paths: Record<string, JsonObject> = {};
  for (const endpoint of ENDPOINTS) {
    paths[endpoint.path] ??= {};
    paths[endpoint.path][endpoint.method.toLowerCase()] = operation(endpoint);
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Email Hub API",
      version: "1.0.0",
      description:
        "Unified Gmail + Outlook inbox with AI analysis, an AI assistant, calendar scheduling and send/reply. " +
        "Authenticate with an API key created in Settings → API access: `Authorization: Bearer ehk_live_...` (or the `x-api-key` header). " +
        "All responses are wrapped as `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.",
    },
    servers: [{ url: baseUrl }],
    tags: ["Auth", "Accounts", "Sync", "Emails", "AI", "Calendar", "Analytics", "API keys", "Admin", "Meta"].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        apiKey: {
          type: "http",
          scheme: "bearer",
          description: `Email Hub API key (prefix ehk_). Scopes: ${ALL_SCOPES.map((s) => `${s} (${SCOPE_DESCRIPTIONS[s]})`).join("; ")}`,
        },
        supabaseJwt: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Supabase user access token (interactive clients).",
        },
      },
      schemas: {
        Envelope: {
          type: "object",
          required: ["ok", "data"],
          properties: { ok: { type: "boolean", const: true }, data: {}, meta: { type: "object" } },
        },
        Error: {
          type: "object",
          required: ["ok", "error"],
          properties: {
            ok: { type: "boolean", const: false },
            error: {
              type: "object",
              properties: { code: { type: "string" }, message: { type: "string" }, details: {} },
            },
          },
        },
        Account: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            provider: { type: "string", enum: ["google", "microsoft"] },
            email: { type: "string" },
            display_name: { type: "string", nullable: true },
            status: { type: "string", enum: ["active", "needs_reauth", "disabled", "error"] },
            last_synced_at: { type: "string", format: "date-time", nullable: true },
          },
        },
        Email: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            account_id: { type: "string", format: "uuid" },
            thread_id: { type: "string", nullable: true },
            subject: { type: "string", nullable: true },
            from_name: { type: "string", nullable: true },
            from_email: { type: "string", nullable: true },
            to_recipients: { type: "array", items: { $ref: "#/components/schemas/Address" } },
            snippet: { type: "string", nullable: true },
            body_text: { type: "string", nullable: true },
            body_html: { type: "string", nullable: true },
            received_at: { type: "string", format: "date-time" },
            is_read: { type: "boolean" },
            is_starred: { type: "boolean" },
            is_sent: { type: "boolean" },
            has_attachments: { type: "boolean" },
            folder: { type: "string", nullable: true },
            analysis: { $ref: "#/components/schemas/EmailAnalysis" },
          },
        },
        EmailAnalysis: {
          type: "object",
          nullable: true,
          properties: {
            category: { type: "string" },
            priority: { type: "string", enum: ["urgent", "high", "normal", "low"] },
            sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
            intent: { type: "string" },
            summary: { type: "string" },
            action_items: { type: "array", items: { type: "object", properties: { text: { type: "string" }, due: { type: "string" } } } },
            entities: { type: "object" },
            requires_response: { type: "boolean" },
            suggested_reply: { type: "string", nullable: true },
            language: { type: "string" },
          },
        },
        Address: {
          type: "object",
          properties: { name: { type: "string", nullable: true }, email: { type: "string" } },
        },
        CalendarEvent: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            account_id: { type: "string", format: "uuid" },
            title: { type: "string", nullable: true },
            start_at: { type: "string", format: "date-time" },
            end_at: { type: "string", format: "date-time" },
            all_day: { type: "boolean" },
            location: { type: "string", nullable: true },
            meeting_link: { type: "string", nullable: true },
            web_link: { type: "string", nullable: true },
            attendees: { type: "array", items: { type: "object" } },
            status: { type: "string", nullable: true },
          },
        },
      },
    },
  };
}
