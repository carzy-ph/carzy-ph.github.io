// Export PDF from the portal: downloads each requirement from the agent's Google Drive (through the
// drive-files function, which holds the Google token), builds the packet and saves it as a file.
import type { Agent, Application } from '@/types';
import { CONFIG } from '@/config';
import { supabase } from './supabase';
import type { Attachment } from './applicationPdf';

async function fetchDocument(app: Application, index: number, jwt: string): Promise<Attachment> {
  const doc = app.documents[index]!;
  try {
    const res = await fetch(CONFIG.supabaseUrl.replace(/\/$/, '') + '/functions/v1/drive-files', {
      method: 'POST',
      headers: { apikey: CONFIG.supabaseKey, Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_id: app.id, index })
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null) as { error?: string } | null;
      return { doc, bytes: null, mime: '', error: detail?.error || `Google Drive didn’t send it (${res.status}).` };
    }
    return { doc, bytes: await res.arrayBuffer(), mime: (res.headers.get('x-file-type') || '').split(';')[0]!.trim() };
  } catch {
    return { doc, bytes: null, mime: '', error: 'It couldn’t be downloaded (connection problem).' };
  }
}

/** Builds and downloads the PDF. Returns how many requirements couldn't be included. */
export async function exportApplicationPdf(o: {
  app: Application; agent: Agent; brand: string; onStep: (msg: string, fraction: number) => void;
}): Promise<{ missing: number; fileName: string }> {
  const { app } = o;
  o.onStep('Preparing…', 0.02);
  const [{ buildApplicationPdf, pdfFileName }, { data: { session } }] = await Promise.all([
    import('./applicationPdf'),
    supabase.auth.getSession()
  ]);
  if (!session) throw new Error('Sign in again to export.');

  const docs = app.documents ?? [];
  const attachments: Attachment[] = [];
  for (let i = 0; i < docs.length; i++) {
    o.onStep(`Getting requirement ${i + 1} of ${docs.length} from Google Drive…`, 0.05 + (i / docs.length) * 0.75);
    attachments.push(await fetchDocument(app, i, session.access_token));
  }

  o.onStep('Building the PDF…', 0.85);
  const bytes = await buildApplicationPdf({ app, agent: o.agent, brand: o.brand, attachments, onStep: msg => o.onStep(msg, 0.9) });
  const fileName = pdfFileName(app);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  o.onStep('Done', 1);
  return { missing: attachments.filter(x => !x.bytes).length, fileName };
}
