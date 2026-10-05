export const initials = (name: string) =>
  (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('');

/** "0917 123 4567" -> "+639171234567" */
export function toIntl(phone: string | null | undefined): string {
  const raw = (phone || '').trim();
  const d = raw.replace(/\D/g, '');
  if (/^09\d{9}$/.test(d)) return '+63' + d.slice(1);
  if (/^639\d{9}$/.test(d)) return '+' + d;
  return raw.startsWith('+') ? '+' + d : d;
}

export const isPhMobile = (phone: string) => /^(09\d{9}|639\d{9})$/.test(phone.replace(/\D/g, ''));

/** Only allow link types that are safe to put in an href. */
export const safeUrl = (u: string | null | undefined) =>
  /^(https?:|viber:|tel:|sms:|mailto:)/i.test((u || '').trim()) ? u!.trim() : '#';

export const peso = (n: number | null | undefined) =>
  n == null ? '' : '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });

export function relTime(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  if (s < 172800) return 'Yesterday';
  if (s < 604800) return `${Math.floor(s / 86400)} days ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export const longDate = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? iso + 'T00:00' : iso).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : '';

export function age(birthDate: string): number {
  const b = new Date(birthDate + 'T00:00'), now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a;
}

export const shortName = (n: string) => {
  const p = (n || '').split(' ');
  return p.length > 1 ? `${p[0]} ${p[p.length - 1]![0]}.` : n;
};
