// Cloudflare R2 helpers (S3-compatible). Used only by admin-gated edge functions.
import { AwsClient } from "npm:aws4fetch@1.0.20";
import { requireEnv } from "./env.ts";

export const VARIANTS = ["", "-md", "-sm"] as const; // full, 900 px, 480 px
export const KEY_RE = /^p\/[a-z0-9]{6,32}(-md|-sm)?\.webp$/;

export function newPhotoId(): string {
  const b = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(b, (x) => (x % 36).toString(36)).join("") + Date.now().toString(36);
}

export function keysFor(id: string): string[] {
  return VARIANTS.map((v) => `p/${id}${v}.webp`);
}

/** Turns a public photo URL on our images host back into its R2 key, or null if it is not ours. */
export function keyFromUrl(url: string, publicBase: string): string | null {
  const base = publicBase.replace(/\/+$/, "") + "/";
  if (!url.startsWith(base)) return null;
  const key = url.slice(base.length);
  return KEY_RE.test(key) ? key : null;
}

function client(): AwsClient {
  return new AwsClient({
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    service: "s3",
    region: "auto",
  });
}

function objectUrl(key: string): string {
  return `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com/${requireEnv("R2_BUCKET")}/${key}`;
}

/** Presigned PUT valid for 10 minutes; the browser uploads straight to R2. */
export async function presignPut(key: string): Promise<string> {
  const u = new URL(objectUrl(key));
  u.searchParams.set("X-Amz-Expires", "600");
  const signed = await client().sign(new Request(u, { method: "PUT" }), { aws: { signQuery: true } });
  return signed.url;
}

export async function deleteObject(key: string): Promise<void> {
  const res = await client().fetch(objectUrl(key), { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed (${res.status})`);
}
