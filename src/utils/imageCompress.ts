/**
 * Image compression utility for Yaba's Jewelry.
 *
 * Pipeline:
 * - Accepts an image File
 * - Resizes while preserving aspect ratio
 * - Uses a maximum dimension of 2560px
 * - Encodes as WebP
 * - Targets approximately 400 KB
 * - Keeps the existing #FAF9F6 background
 * - Returns a Blob ready for Supabase Storage upload
 */

const MAX_WIDTH = 2560;
const MAX_HEIGHT = 2560;

// Target output size: approximately 400 KB.
// This is a target, not an absolute guarantee because WebP size
// depends on image dimensions and visual complexity.
const TARGET_SIZE_BYTES = 400 * 1024;

const INITIAL_QUALITY = 0.85;
const MIN_QUALITY = 0.45;
const QUALITY_STEP = 0.05;

const MAX_COMPRESSION_ATTEMPTS = 9;

export async function compressImageToWebP(
  file: File,
  maxWidth = MAX_WIDTH,
  maxHeight = MAX_HEIGHT,
  quality = INITIAL_QUALITY,
): Promise<Blob> {
  if (!file) {
    throw new Error('No image file was provided.');
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('The selected file is not a valid image.');
  }

  if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
    throw new Error('Invalid maximum image width.');
  }

  if (!Number.isFinite(maxHeight) || maxHeight <= 0) {
    throw new Error('Invalid maximum image height.');
  }

  if (!Number.isFinite(quality) || quality <= 0 || quality > 1) {
    throw new Error('Invalid image quality. Use a value between 0 and 1.');
  }

  const img = await loadImage(file);

  const { width, height } = getDimensions(
    img.width,
    img.height,
    maxWidth,
    maxHeight,
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas is not supported by this browser.');
  }

  /*
   * Keep the existing Yaba's Jewelry background for now.
   * We can remove this later if transparent backgrounds are required.
   */
  ctx.fillStyle = '#FAF9F6';
  ctx.fillRect(0, 0, width, height);

  ctx.drawImage(img, 0, 0, width, height);

  /*
   * Release the HTMLImageElement resources as soon as the canvas
   * has received the image data.
   */
  img.src = '';

  /*
   * First attempt uses the requested quality.
   * If the result is larger than our target, progressively reduce
   * quality until we reach the target or the safe minimum quality.
   */
  let currentQuality = Math.min(1, Math.max(MIN_QUALITY, quality));

  for (let attempt = 0; attempt < MAX_COMPRESSION_ATTEMPTS; attempt++) {
    const blob = await canvasToWebP(canvas, currentQuality);

    if (blob.size <= TARGET_SIZE_BYTES) {
      return blob;
    }

    if (currentQuality <= MIN_QUALITY) {
      return blob;
    }

    currentQuality = Math.max(
      MIN_QUALITY,
      Number((currentQuality - QUALITY_STEP).toFixed(2)),
    );
  }

  /*
   * This point is only a defensive fallback.
   * The loop normally returns before reaching here.
   */
  return canvasToWebP(canvas, MIN_QUALITY);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      if (!img.naturalWidth || !img.naturalHeight) {
        reject(new Error('The selected image has invalid dimensions.'));
        return;
      }

      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load the selected image.'));
    };

    img.src = objectUrl;
  });
}

function canvasToWebP(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to generate WebP image.'));
          return;
        }

        resolve(blob);
      },
      'image/webp',
      quality,
    );
  });
}

function getDimensions(
  origW: number,
  origH: number,
  maxW: number,
  maxH: number,
): { width: number; height: number } {
  if (
    !Number.isFinite(origW) ||
    !Number.isFinite(origH) ||
    origW <= 0 ||
    origH <= 0
  ) {
    throw new Error('Invalid source image dimensions.');
  }

  if (origW <= maxW && origH <= maxH) {
    return {
      width: Math.round(origW),
      height: Math.round(origH),
    };
  }

  const ratio = Math.min(maxW / origW, maxH / origH);

  return {
    width: Math.max(1, Math.round(origW * ratio)),
    height: Math.max(1, Math.round(origH * ratio)),
  };
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '0 B';
  }

  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}