/**
 * Carzy requirements upload service (Google Apps Script) — one copy per agent.
 *
 * Each agent makes their own copy and deploys it under their own Google account. Documents their
 * clients upload (valid IDs, payslips, …) are saved into a "Carzy requirements" folder in the
 * agent's own Google Drive, with a subfolder per application ("A-BED872 - Juan Dela Cruz").
 *
 * Admin, once: fill in the two settings below (both are public by design), then share this
 * script as "Anyone with the link: Viewer" so agents can make a copy. See README.
 *
 * Agent, once: File → Make a copy → Deploy → New deployment → Web app →
 *   Execute as: Me · Who has access: Anyone → Deploy → Authorize → copy the Web app URL into the portal.
 *
 * The database decides what may be uploaded: only for an application with a valid, unexpired
 * upload link, at most 20 files, and only for this agent's own clients.
 */

// ---- Settings (the admin fills these in once, before sharing) ---------------------------
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YOUR-KEY'; // the public "publishable" key, never the secret key
// ------------------------------------------------------------------------------------------

const ROOT_FOLDER = 'Carzy requirements';
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/** The portal's "Test" button calls this to confirm the service runs and under which account. */
function doGet() {
  return json({ ok: true, service: 'carzy-upload', account: Session.getEffectiveUser().getEmail(), folder: ROOT_FOLDER });
}

function doPost(e) {
  try {
    return json(upload(JSON.parse(e.postData.contents)));
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) });
  }
}

function upload(b) {
  if (!b.ref || !b.token) throw new Error('This upload link isn’t valid. Ask your agent for a new one.');
  if (TYPES.indexOf(b.mime) < 0) throw new Error('Upload a PDF, JPG, PNG or WebP file.');
  const bytes = Utilities.base64Decode(String(b.data || ''));
  if (!bytes.length) throw new Error('That file is empty.');
  if (bytes.length > MAX_BYTES) throw new Error('Files must be 10 MB or smaller.');

  // Throws if the link is wrong or expired, or the application already has 20 files.
  const target = rpc('verify_upload', { p_ref: b.ref, p_token: b.token });
  if (deploymentId(target.upload_url) !== deploymentId(ScriptApp.getService().getUrl())) {
    throw new Error('This upload service belongs to a different agent.');
  }

  const root = folderIn(DriveApp.getRootFolder(), ROOT_FOLDER);
  const folder = folderIn(root, target.subfolder);
  const type = String(b.type || 'Document').slice(0, 60);
  const name = (type + ' - ' + String(b.name || 'file').slice(0, 120)).replace(/[\\/:*?"<>|]/g, '_');
  const file = folder.createFile(Utilities.newBlob(bytes, b.mime, name));

  const count = rpc('add_application_document', {
    p_ref: b.ref, p_token: b.token,
    p_doc: { name: name, type: type, url: file.getUrl(), size: bytes.length }
  });
  return { ok: true, name: name, type: type, count: count };
}

function folderIn(parent, name) {
  const found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}

/** ".../macros/s/<id>/exec" → "<id>" (Workspace accounts have "/a/macros/<domain>/s/<id>/exec"). */
function deploymentId(url) {
  const m = /\/s\/([A-Za-z0-9_-]+)\//.exec(String(url || ''));
  return m ? m[1] : '';
}

function rpc(fn, args) {
  const res = UrlFetchApp.fetch(SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/' + fn, {
    method: 'post', contentType: 'application/json',
    // Legacy "anon" keys also go in Authorization; new sb_publishable_ keys must not.
    headers: /^sb_/.test(SUPABASE_KEY) ? { apikey: SUPABASE_KEY } : { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
    payload: JSON.stringify(args), muteHttpExceptions: true
  });
  const text = res.getContentText();
  const data = text ? JSON.parse(text) : null;
  if (res.getResponseCode() >= 300) throw new Error((data && data.message) || 'The upload service couldn’t reach Carzy.');
  return data;
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
