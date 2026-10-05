// Social links: agents type whatever is natural (a full address, "facebook.com/page", "@handle",
// or a phone number for Viber/WhatsApp) and we turn it into a working link plus a short display text.
import type { SocialLink, SocialType } from '@/types';
import { toIntl } from './format';

/** What to type for each platform (shown as the input's placeholder). */
export const LINK_HINT: Record<SocialType, string> = {
  facebook: 'facebook.com/yourpage or @yourpage',
  messenger: 'm.me/yourpage or yourpage',
  viber: 'Mobile number, e.g. 0917 123 4567',
  whatsapp: 'Mobile number, e.g. 0917 123 4567',
  instagram: '@yourhandle or instagram.com/yourhandle',
  tiktok: '@yourhandle or tiktok.com/@yourhandle',
  youtube: '@yourchannel or a youtube.com link',
  website: 'yourwebsite.com'
};

const HOSTS: Partial<Record<SocialType, string>> = {
  facebook: 'https://www.facebook.com/',
  messenger: 'https://m.me/',
  instagram: 'https://www.instagram.com/',
  tiktok: 'https://www.tiktok.com/@',
  youtube: 'https://www.youtube.com/@'
};

const looksLikeUrl = (s: string) => /^(https?:\/\/|www\.)|^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(s);
const isPhone = (s: string) => /^\+?[\d\s()-]{7,}$/.test(s);

/** Turns what was typed into a working link for the platform, or '' if nothing usable was typed. */
export function toLink(type: SocialType, input: string): string {
  const v = input.trim();
  if (!v) return '';
  if (/^(https?:|viber:|tel:|sms:|mailto:)/i.test(v)) return v;
  if (type === 'viber' && isPhone(v)) return `viber://chat?number=%2B${toIntl(v).replace(/\D/g, '')}`;
  if (type === 'whatsapp' && isPhone(v)) return `https://wa.me/${toIntl(v).replace(/\D/g, '')}`;
  const host = HOSTS[type];
  // On social platforms, "dane.cars" is a handle (dots are allowed in usernames), not a website;
  // treat it as an address only when it clearly is one ("www.", a slash, or a .com/.me/.be domain).
  const isAddress = host
    ? /^www\./i.test(v) || v.includes('/') || /\.(com|me|be|ph)(\/|$)/i.test(v)
    : looksLikeUrl(v);
  if (isAddress) return 'https://' + v.replace(/^\/+/, '');
  const handle = v.replace(/^@/, '').replace(/\s+/g, '');
  return host && handle ? host + handle : '';
}

/** Short text for the card when the agent didn't write one: the handle, page name or number. */
export function defaultText(type: SocialType, url: string): string {
  if (type === 'viber') {
    const n = /number=%2B(\d+)/.exec(url)?.[1];
    return n ? '+' + n : '';
  }
  if (type === 'whatsapp') {
    const n = /wa\.me\/(\d+)/.exec(url)?.[1];
    return n ? '+' + n : '';
  }
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    if (!last) return u.hostname.replace(/^www\./, '');
    return ['instagram', 'tiktok', 'youtube'].includes(type) ? '@' + last.replace(/^@/, '') : last;
  } catch { return ''; }
}

/**
 * The link as the card shows it. Also rescues links saved before this helper existed, where the
 * address was typed into the text box and the link box was left empty.
 */
export function resolveLink(l: SocialLink): { url: string; text: string } | null {
  let url = l.url?.trim() ? toLink(l.type, l.url) : '';
  let text = l.label?.trim() || '';
  const addressLike = /^(https?:|viber:)/i.test(text) || looksLikeUrl(text) || text.startsWith('@')
    || ((l.type === 'viber' || l.type === 'whatsapp') && isPhone(text));
  if (!url && addressLike) {
    url = toLink(l.type, text);
    if (url) text = '';
  }
  if (!url) return null;
  return { url, text: text || defaultText(l.type, url) };
}
