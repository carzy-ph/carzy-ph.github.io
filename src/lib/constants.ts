// Labels for values stored in the database. Change labels freely; keep the keys stable,
// because submit_application() in supabase/schema.sql only accepts these keys.
import type { AppStatus, CivilStatus, EmploymentType, ResidenceType, SocialType, Source } from '@/types';

export const SOCIAL: Record<SocialType, { name: string; glyph: string; color: string }> = {
  facebook:  { name: 'Facebook',  glyph: 'f',   color: '#1877F2' },
  messenger: { name: 'Messenger', glyph: 'm',   color: '#0084FF' },
  viber:     { name: 'Viber',     glyph: 'V',   color: '#7360F2' },
  whatsapp:  { name: 'WhatsApp',  glyph: 'W',   color: '#1FA855' },
  instagram: { name: 'Instagram', glyph: 'ig',  color: '#C13584' },
  tiktok:    { name: 'TikTok',    glyph: '♪',   color: '#2A2A2A' },
  youtube:   { name: 'YouTube',   glyph: '▶',   color: '#E62117' },
  website:   { name: 'Website',   glyph: 'www', color: '#4A5562' }
};

export const THEMES: { name: string; color: string }[] = [
  { name: 'Petrol', color: '#0F4C5C' }, { name: 'Crimson', color: '#8E1B23' }, { name: 'Navy', color: '#1C3A6B' },
  { name: 'Forest', color: '#1F5A3D' }, { name: 'Bronze', color: '#7A4E1D' }, { name: 'Graphite', color: '#2B2F36' }
];

/** Application pipeline, in order. `cssVar` names the status color token in admin.css. */
export const STATUS: Record<AppStatus, { label: string; cssVar: string }> = {
  new:       { label: 'New',               cssVar: '--st-new' },
  contacted: { label: 'Contacted',         cssVar: '--st-contacted' },
  submitted: { label: 'Submitted to bank', cssVar: '--st-submitted' },
  approved:  { label: 'Approved',          cssVar: '--st-approved' },
  released:  { label: 'Unit released',     cssVar: '--st-released' },
  declined:  { label: 'Declined',          cssVar: '--st-declined' }
};

export const CIVIL_STATUS: Record<CivilStatus, string> = {
  single: 'Single', married: 'Married', widowed: 'Widowed', separated: 'Separated', annulled: 'Annulled'
};

export const RESIDENCE: Record<ResidenceType, string> = {
  owned: 'Owned', rented: 'Rented', with_relatives: 'Living with relatives', company_provided: 'Company-provided'
};

export const EMPLOYMENT: Record<EmploymentType, { label: string; nameLabel: string; yearsLabel: string; addressLabel: string; phoneLabel: string }> = {
  employed: {
    label: 'Employed', nameLabel: 'Employer', yearsLabel: 'Years in the company',
    addressLabel: 'Company address', phoneLabel: 'Company / HR contact number'
  },
  business: {
    label: 'Business owner', nameLabel: 'Business name', yearsLabel: 'Years in business',
    addressLabel: 'Business address', phoneLabel: 'Business contact number'
  },
  ofw: {
    label: 'OFW', nameLabel: 'Employer abroad', yearsLabel: 'Years with this employer',
    addressLabel: 'Employer address / country', phoneLabel: 'Employer / agency contact number'
  }
};

export const SOURCE: Record<Source, string> = { nfc: 'NFC card', qr: 'QR code', link: 'Shared link' };

/** Suggestions for the bank field; clients can still type any bank. */
export const PH_BANKS = [
  'BDO', 'BPI', 'Metrobank', 'Landbank', 'PNB', 'Security Bank', 'UnionBank', 'RCBC',
  'China Bank', 'EastWest', 'PSBank', 'AUB', 'Maybank', 'Bank of Commerce', 'PBCom', 'Robinsons Bank'
];
