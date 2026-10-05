// Shapes of the rows in supabase/schema.sql. Keep the two in sync.

export type SocialType =
  | 'facebook' | 'messenger' | 'viber' | 'whatsapp' | 'instagram' | 'tiktok' | 'youtube' | 'website';

export interface SocialLink { type: SocialType; label: string; url: string }
export interface Highlight { v: string; l: string }

export interface Brand {
  id: string;
  name: string;
  /** Card color for every agent assigned to this brand. null = each agent picks their own. */
  color: string | null;
  active: boolean;
  sort: number;
}
export interface UnitModel { id: string; brand_id: string; name: string; variants: string[]; active: boolean; sort: number }
/** The units a card can offer: active brands and models, already limited to the agent's brand. */
export interface Catalog { brands: Brand[]; models: UnitModel[] }

export interface Agent {
  id: string;
  slug: string;
  /** null = sells all brands */
  brand_id: string | null;
  name: string;
  title: string;
  dealership: string;
  branch: string;
  hours: string;
  phone: string;
  email: string;
  photo_url: string | null;
  /** Wide photo behind the agent's name, e.g. a car or the showroom. */
  cover_url: string | null;
  theme: string;
  links: SocialLink[];
  stats: Highlight[];
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export type AppStatus = 'new' | 'contacted' | 'submitted' | 'approved' | 'released' | 'declined';
export type CivilStatus = 'single' | 'married' | 'widowed' | 'separated' | 'annulled';
export type ResidenceType = 'owned' | 'rented' | 'with_relatives' | 'company_provided';
export type EmploymentType = 'employed' | 'business' | 'ofw';
export type Source = 'nfc' | 'qr' | 'link';
export type Relationship = 'spouse' | 'parent' | 'child' | 'sibling' | 'relative' | 'friend' | 'employer' | 'other';

/** A co-maker's details: the same as the applicant's, plus how they're related. */
export interface CoMakerInput {
  relationship: Relationship | '';
  first_name: string;
  middle_name: string;
  last_name: string;
  birth_date: string;
  birth_place: string;
  mothers_maiden_name: string;
  civil_status: CivilStatus | '';
  mobile: string;
  landline: string;
  email: string;
  address: string;
  years_at_address: string;
  residence_type: ResidenceType | '';
  employment_type: EmploymentType;
  employer_name: string;
  position: string;
  years_employed: string;
  employer_address: string;
  employer_phone: string;
  monthly_income: string;
  other_income_source: string;
  other_income: string;
  bank: string;
  bank_branch: string;
}

/** A co-maker as saved (cleaned by the database; empty answers left out). */
export type CoMaker = Partial<Omit<CoMakerInput, 'years_at_address' | 'years_employed' | 'monthly_income' | 'other_income'>> & {
  years_at_address?: number; years_employed?: number; monthly_income?: number; other_income?: number;
};

export interface UploadedDocument { id?: string; name: string; type: string; url: string; size: number; at: string }

/** Loan details the agent fills in for the bank form (kept as typed). */
export interface Deal { grm?: string; unit_price?: string; down_payment?: string; amount_financed?: string; terms?: string; aor?: string }

/** What the client fills in on the card page. Numbers stay as typed text; the database parses them. */
export interface ApplicationInput {
  brand_id: string;
  model_id: string;
  variant: string;
  /** Free-text unit, only used while no units are set up in the catalog. */
  unit: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  birth_date: string;
  birth_place: string;
  mothers_maiden_name: string;
  civil_status: CivilStatus | '';
  mobile: string;
  landline: string;
  email: string;
  address: string;
  years_at_address: string;
  residence_type: ResidenceType | '';
  employment_type: EmploymentType;
  employer_name: string;
  position: string;
  years_employed: string;
  employer_address: string;
  employer_phone: string;
  monthly_income: string;
  other_income_source: string;
  other_income: string;
  bank: string;
  bank_branch: string;
  co_makers: CoMakerInput[];
  consent: boolean;
  /** Hidden from people; bots fill it in. */
  website: string;
}

export interface Application {
  id: string;
  ref: string;
  agent_id: string;
  source: Source;
  status: AppStatus;
  unit: string;
  brand_id: string | null;
  model_id: string | null;
  variant: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  full_name: string;
  birth_date: string;
  birth_place: string;
  mothers_maiden_name: string;
  civil_status: CivilStatus;
  mobile: string;
  landline: string | null;
  email: string | null;
  address: string;
  years_at_address: number | null;
  residence_type: ResidenceType | null;
  employment_type: EmploymentType;
  employer_name: string;
  position: string | null;
  years_employed: number | null;
  employer_address: string | null;
  employer_phone: string | null;
  monthly_income: number;
  other_income_source: string | null;
  other_income: number | null;
  bank: string | null;
  bank_branch: string | null;
  co_makers: CoMaker[];
  documents: UploadedDocument[];
  deal: Deal;
  upload_token: string | null;
  upload_expires: string | null;
  consent: boolean;
  internal_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMember { email: string; role: 'admin' | 'agent'; agent_id: string | null }

export interface AgentStats {
  agent_id: string;
  taps_week: number;
  last_tap: string | null;
  new_applications: number;
}

/** What submit_application returns. */
export interface SubmitResult { ref: string; upload_token: string | null; uploads: boolean }

/** What upload_info returns for a client's upload link. */
export interface UploadInfo {
  ref: string; first_name: string; unit: string; employment_type: EmploymentType;
  co_makers: number; expires: string; documents: { name: string; type: string }[]; uploads: boolean;
}

/** An agent's connected Google Drive (the token itself stays on the server). */
export interface AgentDrive { agent_id: string; account: string | null; folder_id: string | null; connected_at: string }
