/**
 * Client-side image resize/compress before upload (browser-only).
 *
 * Normal phone gallery/camera photos are often 4-12 MB and far larger than any
 * upload needs. This shrinks the longest edge to <= maxEdge (default 1920px),
 * re-encodes as JPEG/WebP at ~0.82 quality, and PRESERVES orientation by
 * decoding EXIF (createImageBitmap { imageOrientation: "from-image" }). The user
 * never has to manually resize. If anything fails, or the result would be larger
 * than the original, the ORIGINAL file is returned unchanged — we never block an
 * upload and never inflate a file.
 *
 * Pure dimension math (computeTargetDimensions) is unit-tested; the canvas path
 * runs only in the browser.
 */

export interface CompressOptions {
  /** Max length of the longest edge in px. */
  readonly maxEdge?: number;
  /** Encoder quality 0..1 (JPEG/WebP). */
  readonly quality?: number;
  readonly mimeType?: "image/jpeg" | "image/webp";
}

export interface CompressResult {
  readonly file: File;
  readonly originalBytes: number;
  readonly outputBytes: number;
  /** True when the output is a genuinely smaller/resized re-encode. */
  readonly resized: boolean;
}

export const IMAGE_COMPRESS_DEFAULTS = {
  maxEdge: 1920,
  quality: 0.82,
  mimeType: "image/jpeg",
} as const;

/** Image types we can safely re-encode in-browser. */
export function isCompressibleImage(file: File): boolean {
  return /^image\/(jpeg|png|webp)$/.test(file.type);
}

/**
 * Scale (w,h) so the longest edge is at most maxEdge, preserving aspect ratio.
 * Never upscales. Pure + deterministic — the unit-tested core.
 */
export function computeTargetDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function renameForOutput(name: string, mime: string): string {
  const ext = mime === "image/webp" ? "webp" : "jpg";
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem || "photo"}.${ext}`;
}

async function decode(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; done: () => void }> {
  // Preferred path: createImageBitmap respects EXIF orientation natively.
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        done: () => bitmap.close(),
      };
    } catch {
      /* fall through to <img> path */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const el = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image-decode-failed"));
      img.src = url;
    });
    return {
      width: el.naturalWidth,
      height: el.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(el, 0, 0, w, h),
      done: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/**
 * Resize/compress an image File. Returns the smaller re-encode, or the original
 * untouched if it is not an image, decoding fails, or compression wouldn't help.
 */
export async function compressImageFile(
  file: File,
  options: CompressOptions = {},
): Promise<CompressResult> {
  const unchanged: CompressResult = {
    file,
    originalBytes: file.size,
    outputBytes: file.size,
    resized: false,
  };
  if (typeof document === "undefined" || !isCompressibleImage(file)) return unchanged;

  const maxEdge = options.maxEdge ?? IMAGE_COMPRESS_DEFAULTS.maxEdge;
  const quality = options.quality ?? IMAGE_COMPRESS_DEFAULTS.quality;
  const mimeType = options.mimeType ?? IMAGE_COMPRESS_DEFAULTS.mimeType;

  let decoded: Awaited<ReturnType<typeof decode>> | null = null;
  try {
    decoded = await decode(file);
    const target = computeTargetDimensions(decoded.width, decoded.height, maxEdge);
    if (target.width === 0 || target.height === 0) return unchanged;

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return unchanged;
    decoded.draw(ctx, target.width, target.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), mimeType, quality),
    );
    if (!blob || blob.size === 0) return unchanged;
    // Never inflate: if the re-encode is not smaller, keep the original.
    if (blob.size >= file.size) return unchanged;

    const out = new File([blob], renameForOutput(file.name, mimeType), {
      type: mimeType,
      lastModified: file.lastModified,
    });
    return {
      file: out,
      originalBytes: file.size,
      outputBytes: out.size,
      resized: true,
    };
  } catch {
    return unchanged;
  } finally {
    decoded?.done();
  }
}