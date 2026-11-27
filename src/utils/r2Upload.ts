import { supabase } from '@/lib/supabase';
import { compressImageToWebP } from '@/utils/imageCompress';

type Presign = { photos: { url: string; uploads: { key: string; put_url: string }[] }[] };

/** Sizes produced for every photo: [suffix in the file name, max pixels]. Order matches the server's keys. */
const SIZES: [string, number][] = [['', 2000], ['-md', 900], ['-sm', 480]];

/**
 * Uploads one photo to Cloudflare R2 in three sizes and returns the public URL of the full-size copy.
 * Returns null when R2 is not set up yet (the caller then falls back to Supabase Storage).
 */
export async function uploadToR2(files: File[]): Promise<(string | null)[]> {
  const { data, error } = await supabase.functions.invoke('r2-sign-upload', { body: { action: 'presign', count: files.length } });
  if (error || !(data as Presign | null)?.photos?.length) return files.map(() => null);
  const { photos } = data as Presign;
  return Promise.all(files.map(async (file, i) => {
    const slot = photos[i];
    for (let s = 0; s < SIZES.length; s++) {
      const blob = await compressImageToWebP(file, SIZES[s][1], SIZES[s][1]);
      const up = slot.uploads[s];
      const res = await fetch(up.put_url, { method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: blob });
      if (!res.ok) throw new Error('Photo upload to storage failed. Please try again.');
    }
    return slot.url;
  }));
}

/** Best-effort cleanup of photos removed from a product; failures are ignored (files are tiny). */
export async function deleteFromR2(urls: string[]): Promise<void> {
  if (!urls.length) return;
  try { await supabase.functions.invoke('r2-sign-upload', { body: { action: 'delete', urls } }); } catch { /* ignore */ }
}
