// Photo uploads, optimized for Supabase's free plan (1 GB storage, 5 GB/month transfer):
// only common photo formats are accepted, and every photo is shrunk and re-encoded in the browser
// (WebP where supported, JPEG otherwise) before upload, so stored files are tens to a few hundred KB.

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** `accept` attribute for file inputs. iPhones convert HEIC photos to JPEG for this list automatically. */
export const PHOTO_ACCEPT = PHOTO_TYPES.join(',');
/** Largest original we'll process. Phone photos are usually 2–8 MB. */
export const MAX_UPLOAD_MB = 10;

export const PHOTO_HINT = `JPG, PNG or WebP, up to ${MAX_UPLOAD_MB} MB. Resized automatically.`;

/** Returns a message explaining why the file can't be used, or null if it's fine. */
export function checkPhoto(file: File): string | null {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return 'Use a JPG, PNG or WebP photo. Other formats (like HEIC, GIF or PDF) aren’t supported.';
  }
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    return `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. Use one under ${MAX_UPLOAD_MB} MB.`;
  }
  return null;
}

interface Target {
  /** Longest side for covers, or the side length for square crops. */
  size: number;
  square: boolean;
  /** Keep re-encoding at lower quality until the file is at most this big. */
  maxBytes: number;
}

export const PROFILE: Target = { size: 512, square: true, maxBytes: 120 * 1024 };
export const COVER: Target = { size: 1280, square: false, maxBytes: 300 * 1024 };

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Couldn’t read that photo. Try a different JPG or PNG.'));
    img.src = URL.createObjectURL(file);
  });
}

const toBlob = (c: HTMLCanvasElement, type: string, q: number) =>
  new Promise<Blob | null>(r => c.toBlob(r, type, q));

/** Resizes (and for profiles, center-crops) then encodes as small as the target allows. */
export async function optimizePhoto(file: File, t: Target): Promise<{ blob: Blob; ext: 'webp' | 'jpg' }> {
  const img = await loadImage(file);
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    if (t.square) {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      canvas.width = canvas.height = Math.min(t.size, side);
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
    } else {
      const scale = Math.min(1, t.size / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }

    // WebP is ~30% smaller than JPEG; older Safari returns PNG for it, so fall back to JPEG there.
    const probe = await toBlob(canvas, 'image/webp', 0.8);
    const type = probe?.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    let best: Blob | null = type === 'image/webp' ? probe : null;
    for (const q of [0.8, 0.7, 0.6, 0.5]) {
      const b = q === 0.8 && best ? best : await toBlob(canvas, type, q);
      if (!b) continue;
      best = b;
      if (b.size <= t.maxBytes) break;
    }
    if (!best) throw new Error('Couldn’t process that photo. Try a different one.');
    return { blob: best, ext: type === 'image/webp' ? 'webp' : 'jpg' };
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

/** Storage path inside the agent-photos bucket for a public URL we created, or null for anything else. */
export function photoPath(publicUrl: string | null | undefined): string | null {
  const m = /\/storage\/v1\/object\/public\/agent-photos\/(.+)$/.exec(publicUrl || '');
  return m ? decodeURIComponent(m[1]!) : null;
}
