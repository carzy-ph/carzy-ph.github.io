// Client side of the requirements upload. The drive-upload function checks the client's private link
// and prepares a one-time Google upload address in the agent's Drive; the browser then sends the file
// straight to Google, and the function records it on the application.
import { CONFIG } from '@/config';

export const DOC_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
export const DOC_MAX_MB = 10;

/** A message explaining why the file can't be uploaded, or null if it's fine. */
export function checkDocument(file: File): string | null {
  if (!DOC_ACCEPT.split(',').includes(file.type)) return `${file.name}: upload a PDF or a photo (JPG, PNG or WebP).`;
  if (file.size > DOC_MAX_MB * 1024 * 1024) return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB. Files must be under ${DOC_MAX_MB} MB.`;
  return null;
}

/** Phone photos of documents are often 3–8 MB; shrink them (still easy to read) so they upload fast. */
async function shrinkPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.size < 1.2 * 1024 * 1024) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.85));
  return blob && blob.size < file.size ? blob : file;
}

async function callUpload<T>(body: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = { apikey: CONFIG.supabaseKey, 'Content-Type': 'application/json' };
  if (!CONFIG.supabaseKey.startsWith('sb_')) headers.Authorization = 'Bearer ' + CONFIG.supabaseKey;
  const res = await fetch(CONFIG.supabaseUrl.replace(/\/$/, '') + '/functions/v1/drive-upload', {
    method: 'POST', headers, body: JSON.stringify(body)
  }).catch(() => { throw new Error('Couldn’t reach Carzy. Check your connection and try again.'); });
  const data = await res.json().catch(() => ({})) as T & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) throw new Error(data.error || 'That upload didn’t go through. Try again in a moment.');
  return data;
}

export type UploadPhase = 'preparing' | 'uploading' | 'saving';

/** Sends the file to Google with progress (fetch can't report upload progress; XHR can). */
function putWithProgress(url: string, blob: Blob, mime: string, onPct: (f: number) => void, signal?: AbortSignal) {
  return new Promise<{ id: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', mime);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onPct(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return reject(new Error('Google Drive didn’t accept that file. Try again.'));
      try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error('Google Drive didn’t confirm the upload. Try again.')); }
    };
    xhr.onerror = () => reject(new Error('The upload was interrupted. Check your connection and try again.'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    if (signal) {
      if (signal.aborted) { reject(new DOMException('Upload cancelled', 'AbortError')); return; }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(blob);
  });
}

/**
 * Uploads one requirement. `onProgress` reports the stage and overall progress (0–1):
 * preparing (shrinking a photo, opening the upload), uploading (to Google), saving (recording it).
 */
export async function uploadDocument(o: {
  ref: string; token: string; type: string; file: File;
  onProgress?: (phase: UploadPhase, fraction: number) => void; signal?: AbortSignal;
}) {
  const report = o.onProgress ?? (() => {});
  report('preparing', 0);
  const blob = await shrinkPhoto(o.file);
  const mime = blob.type || o.file.type;
  const name = blob === o.file ? o.file.name : o.file.name.replace(/\.[^.]+$/, '') + '.jpg';
  if (o.signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError');
  const { upload_url } = await callUpload<{ upload_url: string }>({
    action: 'start', ref: o.ref, token: o.token, type: o.type, name, mime, size: blob.size
  });
  report('uploading', 0.05);
  // Straight to Google Drive (the one-time address only accepts this file).
  const { id } = await putWithProgress(upload_url, blob, mime, f => report('uploading', 0.05 + f * 0.9), o.signal);
  report('saving', 0.97);
  const done = await callUpload<{ name: string; count: number }>({ action: 'finish', ref: o.ref, token: o.token, type: o.type, file_id: id });
  report('saving', 1);
  return done;
}
