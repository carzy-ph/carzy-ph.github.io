// "Export PDF": the brand's own Auto Loan Application form (its PDF, logos and all) filled in from the
// application, a page of details the form has no room for, then every uploaded requirement, one page
// each (multi-page PDFs keep all their pages). Built in the browser with pdf-lib; loaded on export.
//
// Each brand's form is a blank PDF in public/forms/ plus the positions of its answers (FORMS below).
// Brands without one get a standard form drawn in the same layout.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import type { Agent, Application, CoMaker, EmploymentType, UploadedDocument } from '@/types';
import { CIVIL_STATUS, RELATIONSHIP, RESIDENCE, SOURCE } from './constants';
import { age, longDate } from './format';
import { coMakerSection } from './applications';
import { amount, financed, money } from './deal';

export interface Attachment { doc: UploadedDocument; bytes: ArrayBuffer | null; mime: string; error?: string }

const W = 612, H = 792, L = 24, R = 588, MID = L + 372;
const BLACK = rgb(0, 0, 0), WHITE = rgb(1, 1, 1), GREY = rgb(0.4, 0.4, 0.4), RED = rgb(1, 0, 0);

// Standard PDF fonts only cover Latin-1 (+ a few symbols). Keep ñ, é…; turn others into close letters.
const EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function safe(v: unknown): string {
  return [...String(v ?? '').normalize('NFC').replace(/₱\s?/g, 'PHP ')].map(ch => {
    const c = ch.charCodeAt(0);
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || EXTRA.includes(ch)) return ch;
    if (/\s/.test(ch)) return ' ';
    const base = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    return /^[\x20-\x7e]+$/.test(base) ? base : '';
  }).join('');
}

const up = (s?: string | null) => safe(s ?? '').toUpperCase();
const shortDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}-${d.toLocaleString('en-US', { month: 'short' })}-${String(d.getFullYear()).slice(2)}`;
};
const yearsText = (n?: number | null) => (n == null ? '' : `${n} ${n === 1 ? 'YEAR' : 'YEARS'}`);
const personLabel = (c: CoMaker) => (c.relationship === 'spouse' ? 'SPOUSE' : `CO-MAKER (${up(c.relationship ? RELATIONSHIP[c.relationship] : '')})`);

class Sheet {
  page!: PDFPage;
  y = 0;
  constructor(public pdf: PDFDocument, public f: PDFFont, public b: PDFFont, public i: PDFFont, page?: PDFPage) {
    if (page) this.page = page; else this.newPage();
  }

  newPage() { this.page = this.pdf.addPage([W, H]); this.y = 28; }
  /** Start a new page if the next block (h points tall) wouldn't fit. */
  ensure(h: number) { if (this.y + h > H - 30) this.newPage(); }

  /** Fits text into maxW by shrinking a little, then trimming with an ellipsis. */
  fit(text: string, maxW: number, size: number, font: PDFFont, minScale = 0.8): [string, number] {
    let s = safe(text), z = size;
    while (z > size * minScale && font.widthOfTextAtSize(s, z) > maxW) z -= 0.25;
    if (font.widthOfTextAtSize(s, z) <= maxW) return [s, z];
    while (s.length > 1 && font.widthOfTextAtSize(s + '…', z) > maxW) s = s.slice(0, -1);
    return [s + '…', z];
  }
  /** Text whose top edge is at `top` (measured from the top of the page). */
  text(s: string, x: number, top: number, size = 7.5, font = this.f, color = BLACK, maxW?: number) {
    const [t, z] = maxW ? this.fit(s, maxW, size, font) : [safe(s), size];
    if (t) this.page.drawText(t, { x, y: H - top - z * 0.82, size: z, font, color });
  }
  center(s: string, x0: number, x1: number, top: number, size = 7.5, font = this.f, color = BLACK) {
    const [t, z] = this.fit(s, x1 - x0 - 4, size, font);
    this.page.drawText(t, { x: (x0 + x1) / 2 - font.widthOfTextAtSize(t, z) / 2, y: H - top - z * 0.82, size: z, font, color });
  }
  right(s: string, x1: number, top: number, size = 8, font = this.b) {
    const [t, z] = this.fit(s, 160, size, font);
    this.page.drawText(t, { x: x1 - font.widthOfTextAtSize(t, z), y: H - top - z * 0.82, size: z, font });
  }
  /** Text on a form's baseline (measured from the top of the page), fitted between x0 and x1. Returns where it ends. */
  at(value: unknown, x0: number, x1: number, base: number, o: { size?: number; font?: PDFFont; align?: 'left' | 'center'; color?: typeof BLACK; minScale?: number } = {}) {
    const font = o.font ?? this.b;
    const [t, z] = this.fit(String(value ?? ''), x1 - x0, o.size ?? 6.6, font, o.minScale);
    if (!t) return x0;
    const w = font.widthOfTextAtSize(t, z);
    const x = o.align === 'center' ? (x0 + x1) / 2 - w / 2 : x0;
    this.page.drawText(t, { x, y: H - base, size: z, font, color: o.color ?? BLACK });
    return x + w;
  }
  hline(x0: number, x1: number, top: number, w = 0.5) { this.page.drawLine({ start: { x: x0, y: H - top }, end: { x: x1, y: H - top }, thickness: w, color: BLACK }); }
  vline(x: number, top0: number, top1: number, w = 0.6) { this.page.drawLine({ start: { x, y: H - top0 }, end: { x, y: H - top1 }, thickness: w, color: BLACK }); }
  box(x: number, top: number, w: number, h: number, fill?: boolean) {
    this.page.drawRectangle({ x, y: H - top - h, width: w, height: h, color: fill ? BLACK : undefined, borderColor: BLACK, borderWidth: fill ? 0 : 0.6 });
  }
  /** Black section bar with white title. */
  bar(title: string, x0 = L, x1 = R, top = this.y) {
    this.box(x0, top, x1 - x0, 11, true);
    this.center(title, x0, x1, top + 2, 7.5, this.b, WHITE);
  }
  /** Label + bold value on an underline from vx to vEnd; row is 13pt tall starting at `top`. */
  field(label: string, value: string, lx: number, vx: number, vEnd: number, top: number, centered = false) {
    if (label) this.text(label, lx, top + 3, 7.2, this.f, BLACK, vx - lx - 3);
    if (value) {
      if (centered) this.center(value, vx, vEnd, top + 2.5, 8, this.b);
      else this.text(value, vx + 3, top + 2.5, 8, this.b, BLACK, vEnd - vx - 5);
    }
    this.hline(vx, vEnd, top + 12);
  }
  wrap(text: string, maxW: number, size: number, font = this.f): string[] {
    const lines: string[] = [];
    for (const para of safe(text).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) > maxW && line) { lines.push(line); line = word; } else line = next;
      }
      lines.push(line);
    }
    return lines;
  }
  paragraph(text: string, x: number, maxW: number, size = 6.8, gap = 1.6) {
    for (const line of this.wrap(text, maxW, size)) { this.text(line, x, this.y, size); this.y += size + gap; }
  }
}

interface Person {
  label: string; last: string; first: string; middle: string; birth: string | null | undefined;
  employment: EmploymentType; employer: string; address: string; phone: string; position: string;
  years: number | null | undefined; income: number | null | undefined; otherSource: string; otherIncome: number | null | undefined;
  bank: string; branch: string; mobile: string; email: string;
}

function people(a: Application): Person[] {
  const me: Person = {
    label: 'APPLICANT', last: a.last_name, first: a.first_name, middle: a.middle_name ?? '', birth: a.birth_date,
    employment: a.employment_type, employer: a.employer_name, address: a.employer_address ?? '', phone: a.employer_phone ?? '',
    position: a.position ?? '', years: a.years_employed, income: a.monthly_income, otherSource: a.other_income_source ?? '',
    otherIncome: a.other_income, bank: a.bank ?? '', branch: a.bank_branch ?? '', mobile: a.mobile, email: a.email ?? ''
  };
  return [me, ...(a.co_makers ?? []).map(c => ({
    label: personLabel(c), last: c.last_name ?? '', first: c.first_name ?? '', middle: c.middle_name ?? '', birth: c.birth_date,
    employment: c.employment_type ?? 'employed', employer: c.employer_name ?? '', address: c.employer_address ?? '',
    phone: c.employer_phone ?? '', position: c.position ?? '', years: c.years_employed, income: c.monthly_income,
    otherSource: c.other_income_source ?? '', otherIncome: c.other_income, bank: c.bank ?? '', branch: c.bank_branch ?? '',
    mobile: c.mobile ?? '', email: c.email ?? ''
  }))];
}

/** Co-makers with the spouse first (the forms have a spouse row). */
const orderedCoMakers = (a: Application) =>
  [...(a.co_makers ?? [])].sort((x, y) => Number(y.relationship === 'spouse') - Number(x.relationship === 'spouse'));
// Short words for the form's narrow label column ("CO-MAKER CHILD:").
const FORM_REL: Record<string, string> = { child: 'CHILD', relative: 'RELATIVE', other: '' };
const relWord = (c: CoMaker) => (c.relationship ? FORM_REL[c.relationship] ?? up(RELATIONSHIP[c.relationship]) : '');
const downPaymentText = (v?: string) => (v?.trim().endsWith('%') ? v.trim() : money(amount(v)));

/** Income rows shared by the forms: applicant, all co-makers, other income (with what it is). */
function incomeOf(a: Application) {
  const cms = a.co_makers ?? [];
  const sum = (ns: (number | null | undefined)[]) => ns.reduce<number>((t, n) => t + (n ?? 0), 0);
  const applicant = a.monthly_income ?? 0;
  const coMakers = sum(cms.map(c => c.monthly_income));
  const other = sum([a.other_income, ...cms.map(c => c.other_income)]);
  const sources = [...new Set([a.other_income_source, ...cms.map(c => c.other_income_source)].filter(Boolean).map(x => up(x)))];
  return { applicant, coMakers: cms.length ? coMakers : null, other: other || null, sources: sources.join(', '), total: applicant + coMakers + other };
}

interface FormTemplate {
  /** Blank form, served from public/. */
  file: string;
  /** Prints the answers onto the form's first page. */
  fill: (s: Sheet, a: Application, agent: Agent) => void;
}

// Mitsubishi (MMFP / Gateway) form. Positions are baselines in points from the top-left of the page,
// measured from the filled sample the dealer provided.
function fillMitsubishi(s: Sheet, a: Application, agent: Agent) {
  const d = a.deal ?? {};
  const center = { align: 'center' as const };
  const label = { font: s.f, size: 6 };
  const [cm1, cm2] = orderedCoMakers(a);

  // Header
  s.at(up(agent.name), 65.8, 150, 92.7);
  s.at(up(d.grm), 193.8, 296, 92.7);
  s.at(up(SOURCE[a.source]), 340.5, 430, 92.7, { size: 6 });
  s.at(shortDate(a.created_at), 459, 555, 92.7, { ...center, size: 6 });

  // Unit applied for
  s.at(up(a.unit), 65.8, 297, 116.7);
  s.at(money(amount(d.unit_price)), 339, 459, 116.7, center);
  s.at(downPaymentText(d.down_payment), 64, 114.6, 127.8, center);
  s.at(money(financed(d)), 192, 297, 127.8, center);
  s.at(d.terms, 339, 433, 127.8, center);
  s.at(d.aor, 459, 555, 127.8, center);

  // Names: applicant, then spouse / co-maker rows (labels follow the actual relationship)
  const nameRow = (p: { last?: string | null; first?: string | null; middle?: string | null; birth?: string | null }, base: number) => {
    s.at(up(p.last), 64, 150, base, center);
    s.at(up(p.first), 150, 240, base, center);
    s.at(up(p.middle), 240, 338, base, center);
    if (p.birth) {
      s.at(String(age(p.birth)), 370, 404, base, { ...center, size: 6 });
      s.at(longDate(p.birth), 459, 555, base, { ...center, size: 6 });
    }
  };
  nameRow({ last: a.last_name, first: a.first_name, middle: a.middle_name, birth: a.birth_date }, 162.8);
  s.at('B/day:', 434.5, 458, 185.1, { font: s.f, size: 5.3 });
  [cm1, cm2].forEach((c, k) => {
    if (!c) return;
    const base = k === 0 ? 173.8 : 184.7;
    s.at(c.relationship === 'spouse' ? 'SPOUSE:' : `CO-MAKER ${relWord(c)}`.trim() + ':', 11.3, 63, base, { ...label, minScale: 0.75 });
    nameRow({ last: c.last_name, first: c.first_name, middle: c.middle_name, birth: c.birth_date }, base);
  });

  // Address and contact
  s.at(up(a.address), 65.8, 338, 193.7);
  s.at(up(CIVIL_STATUS[a.civil_status]), 434.8, 555, 193.7);
  s.at(yearsText(a.years_at_address), 65.8, 152, 202.7);
  s.at(a.landline, 65.8, 152, 213.7);
  s.at(a.mobile, 193.8, 339, 213.7);
  s.at(a.email, 434.8, 555, 213.7, { font: s.f });
  if (a.residence_type) {
    s.at(a.residence_type === 'owned' ? 'YES' : 'NO', 114, 152.6, 222.8, { ...center, size: 6 });
    s.at(a.residence_type === 'rented' ? 'YES' : 'NO', 114, 152.6, 231.8, { ...center, size: 6 });
  }
  if (cm1) {
    s.at(cm1.mobile, 227.8, 339, 222.7);
    s.at(cm1.email, 434.8, 555, 231.7, { font: s.f });
  }
  if (cm2) {
    const end = s.at(`Co maker's mobile no:${relWord(cm2) ? ` (${relWord(cm2)})` : ''}`, 153.5, 300, 231.8, label);
    s.at(cm2.mobile, end + 3, 339, 231.8, { size: 6 });
  }

  // Occupation: applicant, then the first co-maker (the rest are on the details page)
  type Job = { employment_type?: EmploymentType | null; employer_name?: string | null; employer_address?: string | null; employer_phone?: string | null; position?: string | null; years_employed?: number | null };
  const job = (p: Job, top: number, base: number) => {
    const x = p.employment_type === 'business' ? 226.4 : 152.1;
    s.page.drawRectangle({ x, y: H - top - 9.1, width: 40.4, height: 9.1, color: RED });
    if (p.employment_type === 'ofw') s.at('OFW', x, x + 40.4, top + 7, { ...center, size: 6, color: WHITE });
    s.at(up(p.employer_name), 65.8, 339, base);
    s.at(up(p.employer_address), 65.8, 339, base + 9);
    s.at(p.employer_phone, 65.8, 339, base + 18);
    s.at(up(p.position), 65.8, 192, base + 27);
    if (p.years_employed != null) s.at(String(p.years_employed), 297, 339, base + 27, { ...center, size: 6 });
  };
  job(a, 266.4, 286.7);
  if (cm1) {
    s.at(cm1.relationship === 'spouse' ? 'SPOUSE:' : `COMAKER ${relWord(cm1)}`.trim() + ':', 11.5, 112, 349.8, label);
    job(cm1, 343.3, 367.7);
  }

  // Monthly income
  const inc = incomeOf(a);
  const amt = (n: number | null, base: number) => { if (n != null) s.at(money(n), 433, 555, base, { ...center, size: 7.2 }); };
  amt(inc.applicant, 286.7);
  amt(inc.coMakers, 295.7);
  amt(inc.other, 304.7);
  s.at(inc.sources, 340.5, 432, 313.8, label);
  amt(inc.total, 322.8);
  amt(inc.total, 403.7);

  // Bank reference
  s.at(up(a.bank), 115.8, 226, 444.7);
  s.at(up(a.bank_branch), 297.6, 433, 444.7);
}

const FORMS: { match: RegExp; form: FormTemplate }[] = [
  { match: /mitsubishi/i, form: { file: 'forms/mitsubishi.pdf', fill: fillMitsubishi } }
];
/** The brand's own application form, if one has been set up. */
export const formFor = (brand: string) => FORMS.find(f => f.match.test(brand))?.form ?? null;

/** Everything the form has no room for: birthplace, mother's maiden name, each co-maker in full. */
function drawDetails(s: Sheet, a: Application) {
  s.newPage();
  s.y = 24;
  s.bar('ADDITIONAL DETAILS FROM THE ONLINE APPLICATION'); s.y += 15;
  s.text(`Reference ${a.ref} · submitted ${longDate(a.created_at)} · ${a.full_name}`, L, s.y, 7.2, s.i, GREY); s.y += 14;
  const applicant: [string, string][] = [
    ['Birthplace', a.birth_place], ['Mother’s maiden name', a.mothers_maiden_name],
    ['Civil status', CIVIL_STATUS[a.civil_status]], ['Residence', a.residence_type ? RESIDENCE[a.residence_type] : ''],
    ['Landline', a.landline ?? ''], ['Other income', a.other_income_source ?? '']
  ];
  const groups = [
    { title: 'Applicant', rows: applicant.filter(([, v]) => v) },
    ...orderedCoMakers(a).map((c, i) => coMakerSection(c, i)).map(sec => ({ ...sec, rows: sec.rows.filter(([, v]) => v !== '') }))
  ];
  const colW = (R - L - 16) / 2, labelW = 92;
  for (const g of groups) {
    if (!g.rows.length) continue;
    s.ensure(30);
    s.text(up(g.title), L, s.y, 8, s.b); s.y += 11; s.hline(L, R, s.y, 0.6); s.y += 4;
    for (let k = 0; k < g.rows.length; k += 2) {
      s.ensure(12);
      g.rows.slice(k, k + 2).forEach(([key, val], j) => {
        const x = L + j * (colW + 16);
        s.text(key, x, s.y, 7, s.f, GREY, labelW - 4);
        s.text(val, x + labelW, s.y, 7.5, s.b, BLACK, colW - labelW);
      });
      s.y += 11.5;
    }
    s.y += 8;
  }
  s.ensure(30);
  s.paragraph(`The applicant gave consent online when submitting this application${(a.co_makers ?? []).length ? ' and confirmed that their co-makers agreed to share their information' : ''}. Signatures are to be completed on the printed form.`, L, R - L, 7, 2);
}

function drawForm(s: Sheet, a: Application, agent: Agent, brand: string) {
  const ppl = people(a);
  const deal = a.deal ?? {};
  const dealer = agent.dealership || '';

  // ---- Header
  if (brand) { s.box(L, 26, 88, 30, true); s.center(up(brand), L, L + 88, 36, 11, s.b, WHITE); }
  s.center('Auto Loan Application for Individual and Single Proprietorship', L + 96, R, 30, 12.5, s.b);
  s.field('Dealer:', [dealer, agent.branch].filter(Boolean).join(' - '), L + 100, L + 136, R, 46);
  const row = 62;
  s.field('Salesman:', up(agent.name), L, L + 44, L + 196, row);
  s.field('GRM:', up(deal.grm), L + 202, L + 224, L + 322, row);
  s.field('Source:', up(SOURCE[a.source]), L + 328, L + 358, L + 452, row);
  s.field('Date:', shortDate(a.created_at), L + 458, L + 480, R, row);
  s.y = 80;

  // ---- Unit applied for
  s.bar('UNIT APPLIED FOR'); const unitTop = s.y; s.y += 13;
  s.field('Model/Variant:', up(a.unit), L + 3, L + 62, L + 330, s.y);
  s.field('Unit Price:', money(amount(deal.unit_price)), L + 338, L + 384, R - 3, s.y, true); s.y += 14;
  s.field('Down Payment:', deal.down_payment?.trim().endsWith('%') ? deal.down_payment.trim() : money(amount(deal.down_payment)), L + 3, L + 62, L + 152, s.y, true);
  s.field('Amount Financed:', money(financed(deal)), L + 158, L + 228, L + 330, s.y, true);
  s.field('Terms:', deal.terms ?? '', L + 338, L + 384, L + 452, s.y, true);
  s.field('AOR:', deal.aor ?? '', L + 458, L + 480, R - 3, s.y, true); s.y += 16;
  s.vline(L, unitTop, s.y); s.vline(R, unitTop, s.y); s.hline(L, R, s.y, 0.6); s.y += 2;

  // ---- Personal information
  s.ensure(60 + ppl.length * 14 + 6 * 14 + ppl.slice(1).length * 14);
  s.bar('PERSONAL INFORMATION'); const piTop = s.y; s.y += 13;
  const cols = [L + 80, L + 210, L + 330, L + 430, L + 470];
  s.center('Last Name', cols[0]!, cols[1]!, s.y, 7.2); s.center('First Name', cols[1]!, cols[2]!, s.y, 7.2);
  s.center('Middle', cols[2]!, cols[3]!, s.y, 7.2); s.center('Age:', cols[3]!, cols[4]!, s.y, 7.2); s.y += 10;
  for (const p of ppl) {
    s.text(p.label + ':', L + 3, s.y + 3, p.label.length > 14 ? 6.2 : 7.2, s.f, BLACK, 76);
    s.field('', up(p.last), cols[0]!, cols[0]!, cols[1]! - 4, s.y, true);
    s.field('', up(p.first), cols[1]!, cols[1]!, cols[2]! - 4, s.y, true);
    s.field('', up(p.middle), cols[2]!, cols[2]!, cols[3]! - 4, s.y, true);
    s.field('', p.birth ? String(age(p.birth)) : '', cols[3]!, cols[3]!, cols[4]! - 2, s.y, true);
    s.field('B/day:', p.birth ? longDate(p.birth) : '', cols[4]! + 2, cols[4]! + 28, R - 3, s.y, true);
    s.y += 14;
  }
  s.field('Address :', up(a.address), L + 3, L + 62, L + 388, s.y);
  s.field('Status:', CIVIL_STATUS[a.civil_status] ?? '', L + 392, L + 468, R - 3, s.y); s.y += 14;
  s.field('Length of Stay:', yearsText(a.years_at_address), L + 3, L + 62, L + 180, s.y);
  s.field('Citizenship:', '', L + 186, L + 234, L + 388, s.y);
  s.field('No. of Dependents:', '', L + 392, L + 468, R - 3, s.y); s.y += 14;
  s.field('Tel No. :', a.landline ?? '', L + 3, L + 62, L + 180, s.y);
  s.field('Mobile no:', a.mobile, L + 186, L + 234, L + 388, s.y);
  s.field('E-mail Address:', a.email ?? '', L + 392, L + 468, R - 3, s.y); s.y += 14;
  s.field('Ownership:', a.residence_type ? up(RESIDENCE[a.residence_type]) : '', L + 3, L + 62, L + 180, s.y);
  s.field('TIN :', '', L + 392, L + 468, R - 3, s.y); s.y += 14;
  for (const p of ppl.slice(1)) {
    const rel = p.label.replace(/^CO-MAKER /, '').replace(/[()]/g, '');
    s.field(`Co-maker mobile (${rel}):`, p.mobile, L + 186, L + 290, L + 388, s.y);
    s.field('Co-maker e-mail:', p.email, L + 392, L + 468, R - 3, s.y); s.y += 14;
  }
  s.field('Previous Address:', '', L + 3, L + 80, L + 388, s.y);
  s.field('Co-maker TIN :', '', L + 392, L + 468, R - 3, s.y); s.y += 14;
  s.field('Provincial Address:', '', L + 3, L + 80, L + 388, s.y);
  s.field('Length of stay:', '', L + 392, L + 468, R - 3, s.y); s.y += 16;
  s.vline(L, piTop, s.y); s.vline(R, piTop, s.y); s.hline(L, R, s.y, 0.6); s.y += 2;

  // ---- Occupation (left) and income (right)
  const occH = ppl.length * 92 + 14;
  s.ensure(Math.max(occH, 150) + 12);
  s.bar('OCCUPATION / EMPLOYMENT / SOURCE OF INCOME', L, MID);
  s.bar('ASSETS, INCOME & EXPENSES', MID, R);
  const ocTop = s.y + 11;
  let ly = ocTop + 2;
  for (const p of ppl) {
    s.text(p.label + ':', L + 3, ly + 3, 7.2, s.b, BLACK, 110);
    s.hline(L + 3, L + 3 + Math.min(110, s.b.widthOfTextAtSize(safe(p.label + ':'), 7.2)), ly + 11, 0.4);
    const isBiz = p.employment === 'business';
    s.text('Employment :', L + 120, ly + 3, 6.5); s.box(L + 162, ly + 1.5, 26, 9); if (!isBiz) s.center('X', L + 162, L + 188, ly + 3, 7.5, s.b);
    s.text('Business :', L + 196, ly + 3, 7); s.box(L + 230, ly + 1.5, 26, 9); if (isBiz) s.center('X', L + 230, L + 256, ly + 3, 7.5, s.b);
    if (p.employment === 'ofw') s.text('(OFW)', L + 262, ly + 3, 7, s.b);
    ly += 14;
    s.field('Emp/Bus Name :', up(p.employer), L + 3, L + 62, MID - 4, ly); ly += 13;
    s.field('Address :', up(p.address), L + 3, L + 62, MID - 4, ly); ly += 13;
    s.field('Tel No. / EMAIL :', p.phone, L + 3, L + 62, MID - 4, ly); ly += 13;
    s.field('Position :', up(p.position), L + 3, L + 62, L + 220, ly);
    s.field('Length of Stay:', p.years != null ? String(p.years) : '', L + 226, L + 290, MID - 4, ly, true); ly += 13;
    s.field('Previous Company :', '', L + 3, L + 80, MID - 4, ly); ly += 13;
    s.field('Address :', '', L + 3, L + 62, MID - 4, ly); ly += 14;
  }

  // Right column: monthly income
  let ry = ocTop + 2;
  const amtX0 = MID + 112, amtX1 = R - 3;
  s.text('Monthly Income & Expenses', MID + 3, ry + 3, 7.2); ry += 16;
  let total = 0;
  for (const p of ppl) {
    total += p.income ?? 0;
    s.text(p.label === 'APPLICANT' ? 'Applicant' : p.label.replace('CO-MAKER', 'Co-maker').replace('SPOUSE', 'Spouse'), MID + 3, ry + 3, 7.2, s.f, BLACK, 106);
    s.right(money(p.income), amtX1 - 10, ry + 2.5); s.hline(amtX0, amtX1, ry + 12); ry += 13;
  }
  const others = ppl.filter(p => p.otherSource || p.otherIncome);
  if (others.length) {
    s.text('OTHER SOURCE OF INCOME:', MID + 3, ry + 3, 7.2); ry += 13;
    for (const p of others) {
      total += p.otherIncome ?? 0;
      s.text(up(p.otherSource || 'Other income'), MID + 3, ry + 3, 6.8, s.f, BLACK, 106);
      s.right(money(p.otherIncome), amtX1 - 10, ry + 2.5); s.hline(amtX0, amtX1, ry + 12); ry += 13;
    }
  }
  s.text('Total Income:', MID + 18, ry + 3, 7.2, s.i); s.right(money(total), amtX1 - 10, ry + 2.5); s.hline(amtX0, amtX1, ry + 12); ry += 18;
  s.text('Less:', MID + 3, ry + 3, 7.2); ry += 13;
  for (const label of ['Living Expenses', 'Rental', 'Amortization']) { s.text(label, MID + 12, ry + 3, 7.2); s.hline(amtX0, amtX1, ry + 12); ry += 13; }
  s.text('Total Expenses:', MID + 18, ry + 3, 7.2, s.i); s.hline(amtX0, amtX1, ry + 12); ry += 18;
  s.text('NET INCOME', MID + 3, ry + 3, 7.5, s.b); s.right(money(total), amtX1 - 10, ry + 2.5, 8.5); s.hline(amtX0, amtX1, ry + 12); ry += 16;

  s.y = Math.max(ly, ry) + 2;
  s.vline(L, ocTop, s.y); s.vline(MID, ocTop, s.y); s.vline(R, ocTop, s.y); s.hline(L, R, s.y, 0.6); s.y += 2;

  // ---- Bank references
  const banks: [string, string, string][] = [['Savings/ Time Deposit', ppl[0]!.bank, ppl[0]!.branch]];
  for (const p of ppl.slice(1)) if (p.bank) banks.push([`Savings (${p.label.replace('CO-MAKER ', '').replace(/[()]/g, '')})`, p.bank, p.branch]);
  banks.push(['Checking', '', ''], ['Loans/ Credit Lines', '', ''], ['Credit Cards', '', '']);
  s.ensure(24 + banks.length * 13);
  s.bar('BANK REFERENCES'); s.y += 13;
  s.center('Type', L, L + 120, s.y, 7.2); s.center('Bank / Institution', L + 120, L + 290, s.y, 7.2);
  s.center('Address/Branch', L + 300, L + 470, s.y, 7.2); s.center('Balances', L + 476, R, s.y, 7.2); s.y += 10;
  for (const [type, bank, branch] of banks) {
    s.text(type, L + 3, s.y + 3, 7.2, s.f, BLACK, 116);
    s.field('', up(bank), L + 120, L + 120, L + 290, s.y);
    s.field('', up(branch), L + 300, L + 300, L + 470, s.y);
    s.field('', '', L + 476, L + 476, R - 3, s.y); s.y += 13;
  }
  s.y += 3;

  // ---- Personal references (not collected online: left for the agent to fill)
  s.ensure(60);
  s.bar('PERSONAL REFERENCES (Friends & close relatives not living with you)'); s.y += 13;
  s.center('Name', L, L + 170, s.y, 7.2); s.center('Address', L + 170, L + 390, s.y, 7.2);
  s.center('Tel. No.', L + 390, L + 480, s.y, 7.2); s.center('Relation', L + 480, R, s.y, 7.2); s.y += 10;
  for (let k = 0; k < 2; k++) { s.y += 13; s.hline(L, R, s.y); }
  s.y += 8;

  // ---- Certification, privacy notice, signatures
  s.ensure(200);
  s.paragraph('        I/We hereby certify that all data and statements in this application are correct, and are made for the purpose of obtaining credit, and that the signatures appearing hereon are genuine. I/We authorize you to obtain such information as you may require concerning the statements made in this application and the sources to which you may apply to provide any information relative to this application. All documents and annexes hereto shall remain your property whether the credit is granted or not.', L + 2, R - L - 4);
  s.y += 5;
  s.bar('DATA PRIVACY NOTICE'); const dpTop = s.y + 11; s.y += 15;
  const who = dealer || 'the dealer';
  s.paragraph(`I hereby authorize ${who} to process and share my personal data with its partner banks and financing companies, which are likewise authorized to receive, use, collect and process my personal data for the purpose of financing my purchase of a vehicle from the dealer, or the assignment of the dealer’s rights to them; verification, customer profiling, cross-checking and credit investigation.`, L + 3, R - L - 6);
  s.y += 4;
  s.paragraph('In this regard, my personal information may also be shared with their subsidiaries, affiliates, representatives, or third-party service providers, in line with the Data Privacy Act of 2012 (RA 10173).', L + 3, R - L - 6);
  s.y += 4;
  s.paragraph(`I am also aware that the details of how my personal data will be processed and the rights available to me are listed in the privacy policies of the banks and financing companies. If I want to access, update or correct my personal data, or withdraw my consent, I may contact ${who}.`, L + 3, R - L - 6);
  s.y += 3;
  s.vline(L, dpTop, s.y); s.vline(R, dpTop, s.y); s.hline(L, R, s.y, 0.6); s.y += 6;
  s.text(`Submitted online through Carzy on ${longDate(a.created_at)} (reference ${a.ref}); the applicant agreed to the consent statement${ppl.length > 1 ? ' and confirmed the co-makers agreed to share their information' : ''}.`, L + 2, s.y, 6.5, s.i, GREY, R - L - 4);
  s.y += 34;

  // Signature lines: applicant, each co-maker, date (three per row)
  const signers = [...ppl.map(p => p.label === 'APPLICANT' ? 'Signature of Applicant' : `Signature of ${p.label === 'SPOUSE' ? 'Spouse' : 'Co-maker ' + p.label.replace('CO-MAKER ', '')}`), 'Date'];
  const colW = (R - L - 40) / 3;
  for (let k = 0; k < signers.length; k += 3) {
    s.ensure(30);
    signers.slice(k, k + 3).forEach((label, j) => {
      const x0 = L + j * (colW + 20);
      s.hline(x0, x0 + colW, s.y, 0.6);
      s.center(label, x0, x0 + colW, s.y + 3, 7.2);
    });
    s.y += 36;
  }
}

/** Phone photos can carry a rotation flag; redrawing through a canvas applies it and normalizes to JPEG. */
async function normalizeImage(bytes: ArrayBuffer, mime: string): Promise<Uint8Array> {
  const bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
  const scale = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.88));
  if (!blob) throw new Error('image');
  return new Uint8Array(await blob.arrayBuffer());
}

function attachmentHeader(s: Sheet, page: PDFPage, doc: UploadedDocument, note = '') {
  s.page = page;
  s.box(L, 18, R - L, 14, true);
  s.text(`REQUIREMENT · ${up(doc.type)}`, L + 6, 21.5, 7.5, s.b, WHITE, 220);
  const name = doc.name.startsWith(doc.type + ' - ') ? doc.name.slice(doc.type.length + 3) : doc.name;
  const right = `${name}${note ? ' · ' + note : ''}`;
  const [t, z] = s.fit(right, 300, 7, s.f);
  page.drawText(t, { x: R - 6 - s.f.widthOfTextAtSize(t, z), y: H - 21.5 - z * 0.82, size: z, font: s.f, color: WHITE });
}

function placeholder(s: Sheet, doc: UploadedDocument, message: string) {
  const page = s.pdf.addPage([W, H]);
  attachmentHeader(s, page, doc);
  s.y = 70;
  s.text('This file couldn’t be added to the PDF.', L, s.y, 12, s.b); s.y += 20;
  s.paragraph(message, L, R - L, 9, 4);
  s.y += 6;
  s.paragraph(`Open it in Google Drive: ${doc.url}`, L, R - L, 8, 3);
}

async function addAttachment(s: Sheet, att: Attachment) {
  const { doc } = att;
  if (!att.bytes) return placeholder(s, doc, att.error || 'It couldn’t be downloaded from Google Drive.');
  const box = { x: L, top: 40, w: R - L, h: H - 40 - 24 };
  const mime = att.mime || (/\.pdf$/i.test(doc.name) ? 'application/pdf' : 'image/jpeg');

  if (mime.startsWith('image/')) {
    let img: PDFImage;
    try { img = await s.pdf.embedJpg(await normalizeImage(att.bytes, mime)); }
    catch {
      // Couldn't redraw it here: embed the original JPG/PNG as is.
      try { img = mime === 'image/png' ? await s.pdf.embedPng(att.bytes) : await s.pdf.embedJpg(att.bytes); }
      catch { return placeholder(s, doc, 'The image couldn’t be read.'); }
    }
    const k = Math.min(box.w / img.width, box.h / img.height, 1.5);
    const page = s.pdf.addPage([W, H]);
    attachmentHeader(s, page, doc);
    const w = img.width * k, h = img.height * k;
    page.drawImage(img, { x: (W - w) / 2, y: H - box.top - h, width: w, height: h });
    return;
  }

  if (mime === 'application/pdf') {
    let src: PDFDocument;
    try { src = await PDFDocument.load(att.bytes); }
    catch (e) {
      const locked = /encrypt/i.test(String((e as Error)?.message));
      return placeholder(s, doc, locked
        ? 'It is password-protected (common for bank statements), so its pages can’t be copied. Ask the client for an unlocked copy, or print it separately.'
        : 'The PDF couldn’t be read.');
    }
    const pages = src.getPages();
    let embedded;
    try { embedded = await s.pdf.embedPages(pages); }
    catch { return placeholder(s, doc, 'The PDF’s pages couldn’t be copied.'); }
    embedded.forEach((ep, n) => {
      const page = s.pdf.addPage([W, H]);
      attachmentHeader(s, page, doc, pages.length > 1 ? `page ${n + 1} of ${pages.length}` : '');
      const k = Math.min(box.w / ep.width, box.h / ep.height);
      const w = ep.width * k, h = ep.height * k;
      page.drawPage(ep, { x: (W - w) / 2, y: H - box.top - h, width: w, height: h });
    });
    return;
  }
  placeholder(s, doc, 'This file type can’t be added to a PDF.');
}

/** The full packet: filled form, then each requirement. Returns the PDF bytes. */
export async function buildApplicationPdf(o: {
  app: Application; agent: Agent; brand: string; attachments: Attachment[]; onStep?: (msg: string) => void;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Auto Loan Application - ${safe(o.app.full_name)}`);
  pdf.setSubject(`Reference ${o.app.ref}`);
  pdf.setProducer('Carzy');
  pdf.setCreator('Carzy');
  const fonts = [
    await pdf.embedFont(StandardFonts.Helvetica),
    await pdf.embedFont(StandardFonts.HelveticaBold),
    await pdf.embedFont(StandardFonts.HelveticaOblique)
  ] as const;

  // Page 1: the brand's own form if there is one (the standard layout if it isn't set up or can't load).
  const form = formFor(o.brand);
  const blank = form && await fetch(import.meta.env.BASE_URL + form.file).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  let s: Sheet;
  if (form && blank) {
    const [page] = await pdf.copyPages(await PDFDocument.load(blank), [0]);
    pdf.addPage(page!);
    s = new Sheet(pdf, ...fonts, page!);
    form.fill(s, o.app, o.agent);
  } else {
    s = new Sheet(pdf, ...fonts);
    drawForm(s, o.app, o.agent, o.brand);
  }
  drawDetails(s, o.app);
  for (const [n, att] of o.attachments.entries()) {
    o.onStep?.(`Adding requirement ${n + 1} of ${o.attachments.length}…`);
    await addAttachment(s, att);
  }
  // Footer on every page: reference and page number, for printing and bank submission.
  const all = pdf.getPages();
  all.forEach((page, n) => {
    const t = safe(`${o.app.ref} · ${o.app.full_name} · Page ${n + 1} of ${all.length}`);
    page.drawText(t, { x: R - s.f.widthOfTextAtSize(t, 6.5), y: 12, size: 6.5, font: s.f, color: GREY });
  });
  return pdf.save();
}

/** "APPLICATION DELA CRUZ, MARISSA TADIAMAN.pdf" */
export const pdfFileName = (a: Application) =>
  `APPLICATION ${[a.last_name, ', ', a.first_name, a.middle_name ? ' ' + a.middle_name : ''].join('').toUpperCase().replace(/[\\/:*?"<>|]/g, '')}.pdf`;
