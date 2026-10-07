// Turning application records into readable text: the detail view, "Copy details", and CSV export.
import type { Application, CoMaker } from '@/types';
import { CIVIL_STATUS, EMPLOYMENT, RESIDENCE, SOURCE, STATUS, relationshipLabel } from './constants';
import { age, longDate, peso } from './format';
import { download } from './vcard';

type Row = [label: string, value: string];
export interface Section { title: string; rows: Row[] }

const years = (n: number | null | undefined) => (n == null ? '' : `${n} ${n === 1 ? 'year' : 'years'}`);

/** One co-maker as a single section (same details as the applicant, plus relationship). */
export function coMakerSection(c: CoMaker, i: number): Section {
  const emp = EMPLOYMENT[c.employment_type ?? 'employed'];
  const name = [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ');
  return { title: `Co-maker ${i + 1}: ${name}`, rows: [
    ['Relationship', relationshipLabel(c.relationship)],
    ['Birthday', c.birth_date ? `${longDate(c.birth_date)} (age ${age(c.birth_date)})` : ''], ['Birthplace', c.birth_place ?? ''],
    ['Mother’s maiden name', c.mothers_maiden_name ?? ''], ['Civil status', c.civil_status ? CIVIL_STATUS[c.civil_status] : ''],
    ['Mobile', c.mobile ?? ''], ['Landline', c.landline ?? ''], ['Email', c.email ?? ''],
    ['Complete address', c.address ?? ''], ['Years staying', years(c.years_at_address)],
    ['Residence', c.residence_type ? RESIDENCE[c.residence_type] : ''],
    ['Work type', emp.label], [emp.nameLabel, c.employer_name ?? ''], ['Position', c.position ?? ''],
    [emp.yearsLabel, years(c.years_employed)], ['Monthly income', peso(c.monthly_income)],
    [emp.addressLabel, c.employer_address ?? ''], [emp.phoneLabel, c.employer_phone ?? ''],
    ['Other source of income', c.other_income_source ?? ''], ['Average monthly income', peso(c.other_income)],
    ['Bank', c.bank ?? ''], ['Branch', c.bank_branch ?? '']
  ] };
}

/** Grouped like the client's form. Empty answers are left out. */
export function sections(a: Application): Section[] {
  const emp = EMPLOYMENT[a.employment_type];
  const list: Section[] = [
    { title: 'Unit', rows: [['Unit applying for', a.unit]] },
    { title: 'Applicant', rows: [
      ['First name', a.first_name], ['Middle name', a.middle_name ?? ''], ['Last name', a.last_name],
      ['Birthday', `${longDate(a.birth_date)} (age ${age(a.birth_date)})`], ['Birthplace', a.birth_place],
      ['Mother’s maiden name', a.mothers_maiden_name], ['Civil status', CIVIL_STATUS[a.civil_status]]
    ] },
    { title: 'Contact & address', rows: [
      ['Mobile', a.mobile], ['Landline', a.landline ?? ''], ['Email', a.email ?? ''],
      ['Complete address', a.address], ['Years staying', years(a.years_at_address)],
      ['Residence', a.residence_type ? RESIDENCE[a.residence_type] : '']
    ] },
    { title: 'Work or business', rows: [
      ['Type', emp.label], [emp.nameLabel, a.employer_name], ['Position', a.position ?? ''],
      [emp.yearsLabel, years(a.years_employed)], ['Monthly income', peso(a.monthly_income)],
      [emp.addressLabel, a.employer_address ?? ''], [emp.phoneLabel, a.employer_phone ?? '']
    ] },
    { title: 'Other income & bank', rows: [
      ['Other source of income', a.other_income_source ?? ''], ['Average monthly income', peso(a.other_income)],
      ['Bank', a.bank ?? ''], ['Branch', a.bank_branch ?? '']
    ] },
    ...(a.co_makers ?? []).map(coMakerSection)
  ];
  return list.map(s => ({ ...s, rows: s.rows.filter(([, v]) => v !== '') })).filter(s => s.rows.length);
}

/** Plain text for pasting into a bank's application form or a chat. */
export function asText(a: Application): string {
  return [`${a.full_name} · ${a.ref}`, ...sections(a).flatMap(s => ['', s.title.toUpperCase(), ...s.rows.map(([k, v]) => `${k}: ${v}`)])].join('\n');
}

export function exportCsv(list: Application[], agentName: (id: string) => string) {
  const cols: [string, (a: Application) => unknown][] = [
    ['Ref', a => a.ref], ['Received', a => new Date(a.created_at).toLocaleString('en-PH')], ['Status', a => STATUS[a.status].label],
    ['Agent', a => agentName(a.agent_id)], ['Source', a => SOURCE[a.source]], ['Unit', a => a.unit],
    ['First name', a => a.first_name], ['Middle name', a => a.middle_name], ['Last name', a => a.last_name],
    ['Birthday', a => a.birth_date], ['Birthplace', a => a.birth_place], ['Mother’s maiden name', a => a.mothers_maiden_name],
    ['Civil status', a => CIVIL_STATUS[a.civil_status]], ['Mobile', a => a.mobile], ['Landline', a => a.landline], ['Email', a => a.email],
    ['Address', a => a.address], ['Years at address', a => a.years_at_address], ['Residence', a => a.residence_type && RESIDENCE[a.residence_type]],
    ['Employment', a => EMPLOYMENT[a.employment_type].label], ['Employer / business', a => a.employer_name], ['Position', a => a.position],
    ['Years employed', a => a.years_employed], ['Employer address', a => a.employer_address], ['Employer / HR phone', a => a.employer_phone],
    ['Monthly income', a => a.monthly_income], ['Other income source', a => a.other_income_source], ['Other monthly income', a => a.other_income],
    ['Bank', a => a.bank], ['Bank branch', a => a.bank_branch],
    ['Co-makers', a => (a.co_makers ?? []).map(c => `${[c.first_name, c.last_name].join(' ')} (${relationshipLabel(c.relationship)}, ${c.mobile ?? ''}, ${peso(c.monthly_income)}/mo)`).join('; ')],
    ['Documents uploaded', a => (a.documents ?? []).length],
    ['Internal note', a => a.internal_note]
  ];
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + [cols.map(c => c[0]).join(','), ...list.map(a => cols.map(c => cell(c[1](a))).join(','))].join('\r\n');
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `applications-${new Date().toISOString().slice(0, 10)}.csv`);
}
