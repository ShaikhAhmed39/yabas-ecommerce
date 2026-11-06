// Environment helpers shared by every edge function.
export class ConfigError extends Error {}

export function env(name: string): string | undefined {
  const v = Deno.env.get(name);
  return v && v.trim() ? v.trim() : undefined;
}

export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new ConfigError(`${name} is not configured`);
  return v;
}

export function envInt(name: string, fallback: number): number {
  const v = env(name);
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function envNumber(name: string, fallback: number): number {
  const v = env(name);
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Days after delivery during which a customer may request a return. */
export const returnWindowDays = () => envInt("RETURN_WINDOW_DAYS", 7);
/** Minutes an unpaid checkout may hold stock. */
export const checkoutHoldMinutes = () => envInt("CHECKOUT_HOLD_MINUTES", 30);
