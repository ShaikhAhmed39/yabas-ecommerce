// Pure functions: courier status text -> our status, and webhook payload parsing.
// No Deno / network APIs here so they can be unit-tested anywhere.
import { sha256Hex } from "../crypto.ts";
import type { MappedStatus } from "./types.ts";

export function normalizeStatusText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.toUpperCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Maps the courier's status text (Shiprocket "current_status") to one of our statuses.
 * Unknown text returns null: the event is still stored in the timeline but changes nothing.
 */
export function mapCourierStatus(raw: unknown): MappedStatus | null {
  const t = normalizeStatusText(raw);
  if (!t) return null;

  if (t.startsWith("RTO")) {
    return /DELIVERED|ACKNOWLEDGED/.test(t) ? "rto_delivered" : "rto_initiated";
  }
  if (t.startsWith("UNDELIVERED") || t === "DELIVERY ATTEMPTED" || t === "NDR") return "undelivered";
  if (t === "DELIVERED") return "delivered";
  if (t === "OUT FOR DELIVERY") return "out_for_delivery";
  if (t === "PICKED UP" || t === "PICKUP DONE") return "picked_up";
  if (/^PICKUP (SCHEDULED|GENERATED|QUEUED|RESCHEDULED)/.test(t) || t.startsWith("OUT FOR PICKUP")) {
    return "pickup_scheduled";
  }
  if (t.startsWith("AWB ASSIGNED") || t.startsWith("AWB GENERATED") || t === "READY TO SHIP") return "awb_assigned";
  if (
    t === "SHIPPED" || t === "IN TRANSIT" || t.startsWith("REACHED") || t === "MISROUTED" ||
    t === "DELAYED" || t.startsWith("IN TRANSIT")
  ) return "in_transit";
  if (t === "CANCELED" || t === "CANCELLED") return "cancelled";
  if (t === "LOST" || t === "DAMAGED" || t === "DESTROYED" || t === "UNTRACEABLE") return "lost";
  return null;
}

/**
 * Parses the date formats couriers/Shiprocket use. Dates without a timezone are treated as IST.
 * Accepts ISO, "YYYY-MM-DD HH:mm[:ss]", "DD-MM-YYYY HH:mm[:ss]" and "DD MM YYYY HH:mm[:ss]".
 */
export function parseCourierTime(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim();
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(v) && v.includes("T")) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return istToIso(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0), IST_OFFSET_MS);
  m = v.match(/^(\d{2})[- ](\d{2})[- ](\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return istToIso(+m[3], +m[2], +m[1], +m[4], +m[5], +(m[6] ?? 0), IST_OFFSET_MS);
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return istToIso(+m[1], +m[2], +m[3], 0, 0, 0, IST_OFFSET_MS);
  return null;
}

function istToIso(y: number, mo: number, d: number, h: number, mi: number, s: number, offsetMs: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi, s) - offsetMs;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export interface ParsedCourierEvent {
  awb: string;
  rawStatus: string;
  mappedStatus: MappedStatus | null;
  eventTime: string | null;
  activity: string | null;
  location: string | null;
  etd: string | null;
  isReturn: boolean | null;
}

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  return undefined;
}

function asText(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * Reads a courier webhook body. Tolerant on purpose: accepts the field names seen in Shiprocket's
 * webhook (awb, current_status, current_timestamp, scans[]) and the alternative shipment_track_activities[].
 * Returns null when there is no AWB or no status to act on.
 */
export function parseCourierWebhook(payload: unknown): ParsedCourierEvent | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  const data = (typeof p.data === "object" && p.data !== null ? p.data : {}) as Record<string, unknown>;

  const awb = asText(pick(p, "awb", "awb_code", "awb_number") ?? pick(data, "awb", "awb_code"));
  const rawStatus = asText(pick(p, "current_status", "shipment_status", "status") ?? pick(data, "current_status"));
  if (!awb || !rawStatus) return null;

  const scansRaw = pick(p, "scans", "shipment_track_activities");
  const scans = Array.isArray(scansRaw)
    ? scansRaw.filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    : [];
  const wanted = normalizeStatusText(rawStatus);
  const matching = [...scans].reverse().find((s) =>
    normalizeStatusText(pick(s, "sr-status-label", "status", "sr_status_label")) === wanted
  );
  const last = matching ?? scans[scans.length - 1];

  const eventTime = parseCourierTime(pick(p, "current_timestamp", "timestamp", "updated_at")) ??
    (last ? parseCourierTime(pick(last, "date", "timestamp")) : null);
  const isReturnRaw = pick(p, "is_return");

  return {
    awb,
    rawStatus,
    mappedStatus: mapCourierStatus(rawStatus),
    eventTime,
    activity: last ? asText(pick(last, "activity", "status")) : null,
    location: last ? asText(pick(last, "location")) : null,
    etd: parseCourierTime(pick(p, "etd", "expected_delivery_date")),
    isReturn: isReturnRaw === undefined ? null : ["1", "true"].includes(String(isReturnRaw).toLowerCase()),
  };
}

/** One stable key per (awb, status, time): the same webhook delivered twice maps to the same key. */
export function dedupeKeyFor(awb: string, rawStatus: string, eventTime: string | null): Promise<string> {
  return sha256Hex(`${awb}|${normalizeStatusText(rawStatus)}|${eventTime ?? ""}`);
}
