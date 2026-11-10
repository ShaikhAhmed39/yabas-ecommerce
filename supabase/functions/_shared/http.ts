// Small HTTP helpers shared by every edge function.

export class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

const ALLOWED_HEADERS =
  "authorization, apikey, content-type, x-client-info, x-supabase-api-version";

/**
 * CORS. Set ALLOWED_ORIGINS="https://yourshop.in,https://www.yourshop.in" in production.
 * When it is not set we fall back to "*" (fine for token-authenticated APIs, but lock it down once live).
 */
export function corsHeaders(req?: Request): Record<string, string> {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const base = {
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (allowed.length === 0) return { ...base, "Access-Control-Allow-Origin": "*" };
  const origin = req?.headers.get("Origin") ?? "";
  return {
    ...base,
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
  };
}

export function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

/** Returns a response for CORS preflight, or null when the request should continue. */
export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  return null;
}

export function requirePost(req: Request): void {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");
}

/** Turns anything thrown into a safe JSON response. Internal details are logged, never sent. */
export function errorResponse(err: unknown, req?: Request): Response {
  if (err instanceof HttpError) {
    return json({ error: err.message, ...(err.code ? { code: err.code } : {}) }, err.status, req);
  }
  console.error("Unhandled error:", err instanceof Error ? err.stack ?? err.message : err);
  return json({ error: "Something went wrong on our side. Please try again." }, 500, req);
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function requireUuid(value: unknown, label: string): string {
  if (!isUuid(value)) throw new HttpError(400, `A valid ${label} is required.`);
  return value;
}

export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v.length > max) return null;
  return v;
}

/**
 * Maps a Postgres exception raised by one of our SQL functions to a friendly HTTP error.
 * `rules` is checked in order against the exception message.
 */
export function rpcError(
  error: { message?: string } | null | undefined,
  rules: Array<[RegExp, number, string]> = [],
): HttpError {
  const message = error?.message ?? "";
  for (const [pattern, status, text] of rules) {
    if (pattern.test(message)) return new HttpError(status, text);
  }
  console.error("Database function failed:", message);
  return new HttpError(500, "Something went wrong on our side. Please try again.");
}
