import { HttpError } from "./http.ts";

/** Reads an optional environment variable (trimmed, empty -> undefined). */
export function env(name: string): string | undefined {
  const v = Deno.env.get(name);
  return v && v.trim() ? v.trim() : undefined;
}

/** Reads a required variable. The client only ever sees a generic message; the name goes to the log. */
export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) {
    console.error(`Missing required environment variable: ${name}`);
    throw new HttpError(503, "This service is not configured yet.");
  }
  return v;
}

export function envNumber(name: string, fallback: number): number {
  const raw = env(name);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function envBool(name: string, fallback: boolean): boolean {
  const raw = env(name)?.toLowerCase();
  if (raw === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

export function isProduction(): boolean {
  return (env("APP_ENV") ?? "").toLowerCase() === "production";
}
