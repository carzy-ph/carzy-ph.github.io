// Client side of the requirements upload. Each agent runs their own upload service (their copy of
// google/upload.gs under their own Google account); files go there and land in the agent's Drive,
// after the database approves the client's private upload link.

export const DOC_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
export const DOC_MAX_MB = 10;

/** Apps Script web app URL (regular or Google Workspace account). */
export const isServiceUrl = (u: string) =>
  /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.trim());

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

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('Couldn’t read that file.'));
    r.readAsDataURL(blob);
  });
}

export async function uploadDocument(o: { url: string; ref: string; token: string; type: string; file: File }) {
  const blob = await shrinkPhoto(o.file);
  const name = blob === o.file ? o.file.name : o.file.name.replace(/\.[^.]+$/, '') + '.jpg';
  // text/plain keeps this a "simple" request, which Apps Script web apps accept from any site.
  const res = await fetch(o.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ref: o.ref, token: o.token, type: o.type, name, mime: blob.type || o.file.type, data: await toBase64(blob) })
  }).catch(() => { throw new Error('Couldn’t reach your agent’s upload service. Check your connection and try again.'); });
  if (!res.ok) throw new Error('Your agent’s upload service didn’t respond. Try again in a moment.');
  const data = await res.json() as { ok: boolean; error?: string; name: string; count: number };
  if (!data.ok) throw new Error(data.error || 'That upload didn’t go through.');
  return data;
}

/** Calls the agent's service to confirm it's deployed correctly; returns the Google account it runs as. */
export async function testService(url: string): Promise<{ ok: true; account: string; folder: string } | { ok: false; error: string }> {
  if (!isServiceUrl(url)) return { ok: false, error: 'That isn’t a web app link. It should end in /exec.' };
  try {
    const res = await fetch(url.trim());
    const data = await res.json() as { ok?: boolean; service?: string; account?: string; folder?: string };
    if (data.service !== 'carzy-upload') return { ok: false, error: 'That link works, but it isn’t the Carzy upload script.' };
    return { ok: true, account: data.account ?? '', folder: data.folder ?? 'Carzy requirements' };
  } catch {
    return { ok: false, error: 'Couldn’t open it. Check that “Who has access” is set to “Anyone”, then deploy again.' };
  }
}
