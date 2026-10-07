// Labels for values stored in the database. Change labels freely; keep the keys stable,
// because submit_application() in supabase/schema.sql only accepts these keys.
import type { AppStatus, CivilStatus, EmploymentType, Relationship, ResidenceType, SocialType, Source } from '@/types';

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

/** Who may be a co-maker, in the order the form offers them. */
export const RELATIONSHIP: Record<Relationship, string> = {
  parent: 'Parent', sibling: 'Sibling', live_in_partner: 'Live-in partner', son: 'Son', daughter: 'Daughter', spouse: 'Spouse'
};
/** Choices offered before the list was narrowed; older applications may still have them. */
const OLD_RELATIONSHIP: Record<string, string> = {
  child: 'Son / daughter', relative: 'Other relative', friend: 'Friend', employer: 'Employer', other: 'Other'
};
export const relationshipLabel = (r: string | null | undefined) =>
  (r ? RELATIONSHIP[r as Relationship] ?? OLD_RELATIONSHIP[r] ?? r : '');

/** Requirements checklist on the upload page; the label also names the file in Drive. */
export function requirementTypes(employment: EmploymentType, coMakers: number): { type: string; hint: string }[] {
  const income = {
    employed: { type: 'Proof of income', hint: 'Latest 3 months’ payslips and Certificate of Employment' },
    business: { type: 'Proof of income', hint: 'DTI or SEC registration, latest ITR, 6 months’ bank statements' },
    ofw: { type: 'Proof of income', hint: 'Employment contract and proof of remittances' }
  }[employment];
  return [
    { type: 'Valid ID', hint: 'Two government IDs, front and back' },
    income,
    { type: 'Proof of billing', hint: 'A recent utility bill at your address' },
    ...(coMakers ? [{ type: 'Co-maker documents', hint: 'Co-maker’s valid IDs and proof of income' }] : []),
    { type: 'Other', hint: 'Anything else your agent asked for' }
  ];
}

export const SOURCE: Record<Source, string> = { nfc: 'NFC card', qr: 'QR code', link: 'Shared link' };

/** Suggestions for the bank field; clients can still type any bank. */
export const PH_BANKS = [
  'BDO', 'BPI', 'Metrobank', 'Landbank', 'PNB', 'Security Bank', 'UnionBank', 'RCBC',
  'China Bank', 'EastWest', 'PSBank', 'AUB', 'Maybank', 'Bank of Commerce', 'PBCom', 'Robinsons Bank'
];
