import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.57.4";
import { HttpError } from "./http.ts";
import { requireEnv } from "./env.ts";

export type Db = SupabaseClient;

/** Service-role client. Only ever use it AFTER the caller has been authenticated/authorised. */
export function adminClient(): Db {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function bearerToken(req: Request): string {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) throw new HttpError(401, "Please sign in first.");
  const token = header.slice("Bearer ".length).trim();
  if (!token) throw new HttpError(401, "Please sign in first.");
  return token;
}

/** Verifies the caller's Supabase access token and returns the user. */
export async function authenticate(req: Request): Promise<{ user: User; token: string }> {
  const token = bearerToken(req);
  const anon = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Your session is invalid or expired. Please sign in again.");
  return { user: data.user, token };
}

/** Authenticates AND checks the admin_users allow-list (live schema: admin_users.id = auth user id). */
export async function requireAdmin(req: Request): Promise<{ user: User; db: Db }> {
  const { user } = await authenticate(req);
  const db = adminClient();
  const { data, error } = await db.from("admin_users").select("id").eq("id", user.id).maybeSingle();
  if (error) {
    console.error("Admin lookup failed:", error.message);
    throw new HttpError(500, "Could not verify administrator access.");
  }
  if (!data) throw new HttpError(403, "Administrator access required.");
  return { user, db };
}

/** Looks up the customer's e-mail (for courier booking and notifications). */
export async function userEmail(db: Db, userId: string | null, orderId?: string): Promise<string | null> {
  // A guest checkout has no account email: use the address typed at checkout when we know the order.
  if (orderId) {
    try {
      const { data: row } = await db.from("orders").select("customer_email").eq("id", orderId).maybeSingle();
      const typed = (row as { customer_email?: string | null } | null)?.customer_email;
      if (typed) return typed;
    } catch { /* fall through to the account email */ }
  }
  if (!userId) return null;
  try {
    const { data } = await db.auth.admin.getUserById(userId);
    return data.user?.email ?? null;
  } catch (e) {
    console.error("Could not look up user e-mail:", e instanceof Error ? e.message : e);
    return null;
  }
}
