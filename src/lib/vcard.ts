import type { Agent } from '@/types';
import { toIntl } from './format';

/** Downloads a .vcf so the phone offers to add the agent to Contacts. */
export function saveContact(a: Agent, pageUrl: string) {
  const parts = (a.name || '').trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop()! : '';
  const v = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const lines = [
    'BEGIN:VCARD', 'VERSION:3.0',
    `N:${v(last)};${v(parts.join(' '))};;;`,
    `FN:${v(a.name)}`,
    a.dealership && `ORG:${v(a.dealership)}`,
    a.title && `TITLE:${v(a.title)}`,
    a.phone && `TEL;TYPE=CELL:${toIntl(a.phone)}`,
    a.email && `EMAIL;TYPE=INTERNET:${v(a.email)}`,
    `URL:${pageUrl}`,
    a.branch && `NOTE:${v([a.dealership, a.branch].filter(Boolean).join(' · '))}`,
    'END:VCARD'
  ].filter(Boolean);
  download(new Blob([lines.join('\r\n')], { type: 'text/vcard' }), (a.slug || 'contact') + '.vcf');
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
