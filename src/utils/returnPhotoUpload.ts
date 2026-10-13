import { supabase } from '@/lib/supabase';
import { compressImageToWebP } from '@/utils/imageCompress';

const BUCKET = 'return-photos';
const MAX_OUTPUT_SIZE = 10 * 1024 * 1024; // Must match the private bucket's 10 MB limit.
const MAX_ORIGINAL_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/**
 * Compress and upload one return photo to the private bucket.
 *
 * Storage path:
 * userId/returnRequestId/unique-file-name.webp
 *
 * The return request ID must be a valid UUID.
 * The caller must supply the authenticated user's ID.
 */
export async function uploadReturnPhoto({
  file,
  userId,
  returnRequestId,
}: {
  file: File;
  userId: string;
  returnRequestId: string;
}): Promise<string> {
  if (!file) {
    throw new Error('Please select a photo.');
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error('Only JPEG, PNG, and WebP photos are allowed.');
  }

  if (file.size === 0 || file.size > MAX_ORIGINAL_SIZE) {
    throw new Error('The original photo must be 10 MB or smaller.');
  }

  if (!userId || !returnRequestId) {
    throw new Error('Missing user or return request information.');
  }

  // Confirm that the current session belongs to this user.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || user.id !== userId) {
    throw new Error('Please sign in with the correct account.');
  }

  // Reuse the existing compressor without changing product uploads.
  const compressed = await compressImageToWebP(file);

  if (compressed.size === 0 || compressed.size > MAX_OUTPUT_SIZE) {
    throw new Error(
      'The compressed photo exceeds the 10 MB upload limit. Please choose a smaller image.',
    );
  }

  const uniqueName = `${crypto.randomUUID()}.webp`;
  const path = `${userId}/${returnRequestId}/${uniqueName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, compressed, {
      contentType: 'image/webp',
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Photo upload failed: ${uploadError.message}`);
  }

  // Return the private storage path, NOT a public URL.
  return path;
}
