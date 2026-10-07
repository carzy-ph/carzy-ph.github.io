-- =====================================================================
-- Agent Cards: database setup
-- Run this whole file once in Supabase: SQL Editor -> New query -> Run.
-- Then add yourself as the first admin (see the last line of this file).
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

-- Units catalog, managed by admins: Brand -> Model -> Variant.
-- Clients pick from it on the card form; turning a brand or model off hides it there.
create table if not exists public.brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  color       text check (color ~ '^#[0-9A-Fa-f]{6}$'),   -- card color for agents of this brand; null = agent picks
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.models (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands(id) on delete cascade,
  name        text not null,
  variants    text[] not null default '{}',   -- e.g. {"1.3 XE CVT","1.5 G CVT"}; empty = no variant choice
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  unique (brand_id, name)
);

-- One row per agent. Everything here is public on the agent's card page while the card is live.
-- (Portal login emails live in `team`, which only admins can read.)
create table if not exists public.agents (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  brand_id    uuid references public.brands(id) on delete set null,   -- null = sells all brands
  name        text not null,
  title       text not null default 'Sales Consultant',
  dealership  text not null default '',
  branch      text not null default '',
  hours       text not null default '',
  phone       text not null default '',
  email       text not null default '',
  photo_url   text,
  cover_url   text,                          -- wide photo behind the name, e.g. a car or the showroom
  theme       text not null default '#0F4C5C' check (theme ~ '^#[0-9A-Fa-f]{6}$'),
  links       jsonb not null default '[]',   -- [{type, label, url}]
  stats       jsonb not null default '[]',   -- [{v, l}]  e.g. {"v":"7","l":"Yrs selling"}
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Columns added after the first release. Safe to re-run on an existing project.
alter table public.agents add column if not exists cover_url text;
alter table public.brands add column if not exists color text check (color ~ '^#[0-9A-Fa-f]{6}$');

-- Who can sign in to the portal. Admins see everything; agents see their own card and applications.
create table if not exists public.team (
  email       text primary key check (email = lower(email)),
  role        text not null check (role in ('admin', 'agent')),
  agent_id    uuid references public.agents(id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists team_one_login_per_agent on public.team(agent_id) where agent_id is not null;

-- Car loan applications sent from the card form. Contains sensitive personal data:
-- only admins and the assigned agent can read a row (see the rules further down).
create table if not exists public.applications (
  id                   uuid primary key default gen_random_uuid(),
  ref                  text not null unique default ('A-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  agent_id             uuid not null references public.agents(id),
  source               text not null default 'link',
  status               text not null default 'new'
                       check (status in ('new', 'contacted', 'submitted', 'approved', 'released', 'declined')),

  -- Unit. `unit` keeps the full name as the client saw it, even if the catalog changes later.
  unit                 text not null,
  brand_id             uuid references public.brands(id) on delete set null,
  model_id             uuid references public.models(id) on delete set null,
  variant              text,

  -- Applicant
  first_name           text not null,
  middle_name          text,
  last_name            text not null,
  full_name            text generated always as (
                         first_name || coalesce(' ' || nullif(middle_name, ''), '') || ' ' || last_name
                       ) stored,
  birth_date           date not null,
  birth_place          text not null,
  mothers_maiden_name  text not null,
  civil_status         text not null check (civil_status in ('single', 'married', 'widowed', 'separated', 'annulled')),

  -- Contact & residence
  mobile               text not null,
  landline             text,
  email                text,
  address              text not null,
  years_at_address     numeric(4,1),
  residence_type       text check (residence_type in ('owned', 'rented', 'with_relatives', 'company_provided')),

  -- Work or business
  employment_type      text not null check (employment_type in ('employed', 'business', 'ofw')),
  employer_name        text not null,
  position             text,
  years_employed       numeric(4,1),
  employer_address     text,
  employer_phone       text,
  monthly_income       numeric(12,2) not null check (monthly_income >= 0),

  -- Other income & bank
  other_income_source  text,
  other_income         numeric(12,2) check (other_income >= 0),
  bank                 text,
  bank_branch          text,

  consent              boolean not null,
  -- Optional co-makers, same details as the applicant plus relationship: [{first_name, …, relationship}]
  co_makers            jsonb not null default '[]',
  -- Requirements uploaded to the agent's Google Drive folder: [{id, name, type, url, size, at}]
  documents            jsonb not null default '[]',
  -- Loan details the agent fills in for the bank form: {grm, unit_price, down_payment, amount_financed, terms, aor}
  deal                 jsonb not null default '{}',
  -- Private link the client uses to upload requirements (see upload_info / renew_upload_link)
  upload_token         text,
  upload_expires       timestamptz,
  -- Hidden from the main list by the agent or admin ("Archive"); null = active
  archived_at          timestamptz,
  internal_note        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists applications_agent_created on public.applications(agent_id, created_at desc);
-- Columns added after the first release (safe to re-run on an existing project).
alter table public.applications add column if not exists co_makers jsonb not null default '[]';
alter table public.applications add column if not exists documents jsonb not null default '[]';
alter table public.applications add column if not exists upload_token text;
alter table public.applications add column if not exists upload_expires timestamptz;
alter table public.applications add column if not exists deal jsonb not null default '{}';
alter table public.applications add column if not exists archived_at timestamptz;

-- Each agent's connected Google Drive ("Connect Google Drive" in their portal). Clients' requirements are
-- saved into a "Carzy requirements" folder in that agent's own Drive. Carzy may only touch files it
-- created there (Google's drive.file permission). The refresh token is readable only by the upload
-- functions (supabase/functions), never by the website.
create table if not exists public.agent_drive (
  agent_id      uuid primary key references public.agents(id) on delete cascade,
  account       text,
  folder_id     text,
  refresh_token text,
  connected_at  timestamptz not null default now()
);
-- Upgrade from the earlier script-based version (safe to re-run).
alter table public.agent_drive drop column if exists upload_url;
alter table public.agent_drive drop column if exists updated_at;
alter table public.agent_drive add column if not exists folder_id text;
alter table public.agent_drive add column if not exists refresh_token text;
alter table public.agent_drive add column if not exists connected_at timestamptz not null default now();
revoke all on public.agent_drive from anon, authenticated;
grant select (agent_id, account, folder_id, connected_at) on public.agent_drive to authenticated;
grant all on public.agent_drive to service_role;

-- One row each time a card page is opened from the NFC card (or QR / shared link).
create table if not exists public.card_taps (
  id          bigint generated always as identity primary key,
  agent_id    uuid not null references public.agents(id) on delete cascade,
  source      text not null default 'nfc',
  created_at  timestamptz not null default now()
);
create index if not exists card_taps_agent_created on public.card_taps(agent_id, created_at desc);

-- ---------- Helpers ---------------------------------------------------

create or replace function public.my_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team where email = my_email() and role = 'admin')
$$;

-- The agent card linked to this login. Admins can have one too (an admin who also sells).
create or replace function public.my_agent_id() returns uuid
language sql stable security definer set search_path = public as $$
  select agent_id from team where email = my_email()
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists agents_touch on public.agents;
create trigger agents_touch before update on public.agents
  for each row execute function public.touch_updated_at();
drop trigger if exists applications_touch on public.applications;
create trigger applications_touch before update on public.applications
  for each row execute function public.touch_updated_at();

-- Agents may edit their own profile, but not the fields the admin controls.
create or replace function public.guard_agent_update() returns trigger
language plpgsql as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' and not public.is_admin() then
    if new.slug is distinct from old.slug
       or new.brand_id is distinct from old.brand_id
       or new.dealership is distinct from old.dealership
       or new.branch is distinct from old.branch
       or new.active is distinct from old.active then
      raise exception 'Only an admin can change the card address, brand, dealership, branch or live status.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists agents_guard on public.agents;
create trigger agents_guard before update on public.agents
  for each row execute function public.guard_agent_update();

-- Agents can update status, notes, loan details and archiving on their own applications, but only
-- admins can reassign one or change what the client submitted.
-- (Deleting goes through the delete-application function, which also clears the files in Drive.)
create or replace function public.guard_application_update() returns trigger
language plpgsql as $$
begin
  -- Functions below that manage uploads mark themselves trusted for the current transaction.
  if current_setting('carzy.trusted', true) = 'on' then return new; end if;
  if coalesce(auth.role(), '') = 'authenticated' and not public.is_admin() then
    -- full_name is a generated column, which isn't filled in yet inside a BEFORE trigger.
    if (to_jsonb(new) - array['status', 'internal_note', 'deal', 'archived_at', 'updated_at', 'full_name'])
       is distinct from (to_jsonb(old) - array['status', 'internal_note', 'deal', 'archived_at', 'updated_at', 'full_name']) then
      raise exception 'Agents can only change the status, internal note, loan details and archiving of an application.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists applications_guard on public.applications;
create trigger applications_guard before update on public.applications
  for each row execute function public.guard_application_update();

-- Portal sign-in is automatic: an agent without one signs in with their contact email.
-- Runs when an admin (or the SQL editor) saves an agent; an agent changing their own contact email
-- doesn't change who can sign in. An email already linked to another card is left alone; an admin's
-- own email gets linked as well (an admin who also sells), keeping admin access.
create or replace function public.link_agent_login(p_agent uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return; end if;
  if exists (select 1 from team where agent_id = p_agent) then return; end if;
  if exists (select 1 from team where email = v_email and agent_id is not null) then return; end if;
  update team set agent_id = p_agent where email = v_email and role = 'admin' and agent_id is null;
  if not found then
    insert into team (email, role, agent_id) values (v_email, 'agent', p_agent)
    on conflict (email) do nothing;
  end if;
end $$;

create or replace function public.auto_link_agent_login() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' or public.is_admin() then
    perform public.link_agent_login(new.id, new.email);
  end if;
  return new;
end $$;
drop trigger if exists agents_auto_login on public.agents;
create trigger agents_auto_login after insert or update of email on public.agents
  for each row execute function public.auto_link_agent_login();

-- Existing agents without a sign-in get one from their contact email (safe to re-run).
select public.link_agent_login(id, email) from public.agents
where not exists (select 1 from public.team t where t.agent_id = agents.id);

revoke execute on function public.link_agent_login(uuid, text) from public, anon, authenticated;

-- ---------- Row level security ----------------------------------------

alter table public.brands       enable row level security;
alter table public.models       enable row level security;
alter table public.agents       enable row level security;
alter table public.team         enable row level security;
alter table public.applications enable row level security;
alter table public.card_taps    enable row level security;
alter table public.agent_drive  enable row level security;

drop policy if exists "Admins and owners manage drive folder" on public.agent_drive;
drop policy if exists "Admins and owners manage upload service" on public.agent_drive;
drop policy if exists "Admins and owners see Drive connection" on public.agent_drive;
-- Read-only for the portal (and without the token column); connecting and disconnecting go
-- through the drive-connect function.
create policy "Admins and owners see Drive connection" on public.agent_drive for select to authenticated
  using (public.is_admin() or agent_id = public.my_agent_id());

drop policy if exists "Catalog is public"     on public.brands;
drop policy if exists "Admins manage brands"  on public.brands;
drop policy if exists "Catalog is public"     on public.models;
drop policy if exists "Admins manage models"  on public.models;
create policy "Catalog is public"    on public.brands for select using (true);
create policy "Admins manage brands" on public.brands for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Catalog is public"    on public.models for select using (true);
create policy "Admins manage models" on public.models for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Cards are public"              on public.agents;
drop policy if exists "Live cards are public"         on public.agents;
drop policy if exists "Team sees agent profiles"      on public.agents;
drop policy if exists "Admins add agents"             on public.agents;
drop policy if exists "Admins and owners edit agents" on public.agents;
drop policy if exists "Admins delete agents"          on public.agents;
-- Agent profiles are public while their card is live. A turned-off card (e.g. the agent left) is hidden
-- from the public, so their phone and email stop being published; admins and the agent still see it.
create policy "Live cards are public"         on public.agents for select using (active);
create policy "Team sees agent profiles"      on public.agents for select to authenticated
  using (public.is_admin() or id = public.my_agent_id());
create policy "Admins add agents"             on public.agents for insert to authenticated with check (public.is_admin());
create policy "Admins and owners edit agents" on public.agents for update to authenticated
  using (public.is_admin() or id = public.my_agent_id())
  with check (public.is_admin() or id = public.my_agent_id());
create policy "Admins delete agents"          on public.agents for delete to authenticated using (public.is_admin());

drop policy if exists "See own membership" on public.team;
drop policy if exists "Admins manage team" on public.team;
create policy "See own membership" on public.team for select to authenticated
  using (email = public.my_email() or public.is_admin());
create policy "Admins manage team" on public.team for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Read own applications"      on public.applications;
drop policy if exists "Update own applications"    on public.applications;
drop policy if exists "Admins delete applications" on public.applications;
create policy "Read own applications"   on public.applications for select to authenticated
  using (public.is_admin() or agent_id = public.my_agent_id());
create policy "Update own applications" on public.applications for update to authenticated
  using (public.is_admin() or agent_id = public.my_agent_id())
  with check (public.is_admin() or agent_id = public.my_agent_id());
create policy "Admins delete applications" on public.applications for delete to authenticated using (public.is_admin());
-- No insert policy: visitors can only add applications through submit_application() below.

drop policy if exists "Read own taps" on public.card_taps;
create policy "Read own taps" on public.card_taps for select to authenticated
  using (public.is_admin() or agent_id = public.my_agent_id());

-- ---------- Public functions (called from the card page) ---------------

-- Trims a text field from the submitted JSON, caps its length, and turns blanks into null.
create or replace function public.clean_text(p jsonb, k text, max_len int default 200) returns text
language sql immutable as $$
  select nullif(left(trim(coalesce(p ->> k, '')), max_len), '')
$$;

-- Reads a non-negative number (commas and peso signs allowed), or null.
create or replace function public.clean_amount(p jsonb, k text) returns numeric
language sql immutable as $$
  select case when regexp_replace(coalesce(p ->> k, ''), '[^0-9.]', '', 'g') ~ '^\d+(\.\d+)?$'
              then regexp_replace(p ->> k, '[^0-9.]', '', 'g')::numeric end
$$;

-- Normalizes a PH mobile number to +639XXXXXXXXX, or null if it isn't one.
create or replace function public.clean_mobile(v text) returns text
language sql immutable as $$
  select case
    when regexp_replace(coalesce(v, ''), '\D', '', 'g') ~ '^09\d{9}$' then '+63' || substr(regexp_replace(v, '\D', '', 'g'), 2)
    when regexp_replace(coalesce(v, ''), '\D', '', 'g') ~ '^639\d{9}$' then '+' || regexp_replace(v, '\D', '', 'g')
  end
$$;

create or replace function public.is_email(v text) returns boolean
language sql immutable as $$
  select coalesce(trim(v), '') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
$$;

-- Checks and cleans one co-maker; `who` (e.g. "Co-maker 1") prefixes error messages.
create or replace function public.clean_co_maker(p jsonb, who text) returns jsonb
language plpgsql immutable as $$
declare
  v_birth date;
begin
  if clean_text(p, 'first_name') is null or clean_text(p, 'last_name') is null then
    raise exception '%: enter the first and last name.', who;
  end if;
  if coalesce(p ->> 'relationship', '') not in ('parent', 'sibling', 'live_in_partner', 'son', 'daughter', 'spouse') then
    raise exception '%: choose the relationship to the applicant.', who;
  end if;
  if coalesce(p ->> 'birth_date', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '%: enter the birthday.', who; end if;
  v_birth := (p ->> 'birth_date')::date;
  if v_birth > current_date - interval '18 years' or v_birth < current_date - interval '100 years' then
    raise exception '%: co-makers must be at least 18 years old.', who;
  end if;
  if clean_text(p, 'birth_place') is null then raise exception '%: enter the birthplace.', who; end if;
  if clean_text(p, 'mothers_maiden_name') is null then raise exception '%: enter the mother''s maiden name.', who; end if;
  if coalesce(p ->> 'civil_status', '') not in ('single', 'married', 'widowed', 'separated', 'annulled') then
    raise exception '%: choose the civil status.', who;
  end if;
  if clean_mobile(p ->> 'mobile') is null then raise exception '%: use a PH mobile number, for example 0917 123 4567.', who; end if;
  if not is_email(p ->> 'email') then raise exception '%: enter a valid email address.', who; end if;
  if clean_text(p, 'address') is null then raise exception '%: enter the complete address.', who; end if;
  if coalesce(p ->> 'employment_type', '') not in ('employed', 'business', 'ofw') then
    raise exception '%: choose employed, business owner, or OFW.', who;
  end if;
  if clean_text(p, 'employer_name') is null then raise exception '%: enter the employer or business name.', who; end if;
  if clean_amount(p, 'monthly_income') is null then raise exception '%: enter the monthly income.', who; end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'relationship', p ->> 'relationship',
    'first_name', clean_text(p, 'first_name', 80), 'middle_name', clean_text(p, 'middle_name', 80),
    'last_name', clean_text(p, 'last_name', 80),
    'birth_date', v_birth, 'birth_place', clean_text(p, 'birth_place', 120),
    'mothers_maiden_name', clean_text(p, 'mothers_maiden_name', 160), 'civil_status', p ->> 'civil_status',
    'mobile', clean_mobile(p ->> 'mobile'), 'landline', clean_text(p, 'landline', 40),
    'email', lower(clean_text(p, 'email', 160)), 'address', clean_text(p, 'address', 300),
    'years_at_address', least(clean_amount(p, 'years_at_address'), 100),
    'residence_type', case when p ->> 'residence_type' in ('owned', 'rented', 'with_relatives', 'company_provided') then p ->> 'residence_type' end,
    'employment_type', p ->> 'employment_type', 'employer_name', clean_text(p, 'employer_name', 160),
    'position', clean_text(p, 'position', 120), 'years_employed', least(clean_amount(p, 'years_employed'), 80),
    'employer_address', clean_text(p, 'employer_address', 300), 'employer_phone', clean_text(p, 'employer_phone', 60),
    'monthly_income', clean_amount(p, 'monthly_income'),
    'other_income_source', clean_text(p, 'other_income_source', 160), 'other_income', clean_amount(p, 'other_income'),
    'bank', clean_text(p, 'bank', 80), 'bank_branch', clean_text(p, 'bank_branch', 120)
  ));
end $$;

-- Returns {ref, upload_token, uploads}: the reference number, the private upload link token,
-- and whether the agent has connected their Google Drive for requirements.
drop function if exists public.submit_application(text, jsonb, text);
create function public.submit_application(p_slug text, p jsonb, p_source text default 'link')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a         agents;
  v_model   models;
  v_brand   brands;
  v_variant text;
  v_unit    text;
  v_mobile  text;
  v_birth   date;
  v_income  numeric;
  v_co      jsonb := '[]';
  v_token   text;
  v_ref     text;
  i         int;
begin
  -- Hidden "website" field: real people leave it empty, bots fill it in.
  if coalesce(p ->> 'website', '') <> '' then
    return jsonb_build_object('ref', 'A-RECEIVED', 'upload_token', null, 'uploads', false);
  end if;

  select * into a from agents where slug = p_slug and active;
  if not found then
    raise exception 'This card is not accepting applications right now.';
  end if;

  -- Unit: must come from the catalog (limited to the agent's brand, if they have one).
  -- Free text is accepted only while no units are set up for this card yet.
  if coalesce(p ->> 'model_id', '') ~ '^[0-9a-f-]{36}$' then
    select m.* into v_model
    from models m join brands b on b.id = m.brand_id
    where m.id = (p ->> 'model_id')::uuid and m.active and b.active
      and (a.brand_id is null or m.brand_id = a.brand_id);
    if not found then raise exception 'Choose a unit from the list.'; end if;
    select * into v_brand from brands where id = v_model.brand_id;
    v_variant := clean_text(p, 'variant', 80);
    if cardinality(v_model.variants) > 0 then
      if v_variant is null or not (v_variant = any (v_model.variants)) then
        raise exception 'Choose a variant for the %.', v_model.name;
      end if;
    else
      v_variant := null;
    end if;
    v_unit := v_brand.name || ' ' || v_model.name || coalesce(' ' || v_variant, '');
  else
    if exists (select 1 from models m join brands b on b.id = m.brand_id
               where m.active and b.active and (a.brand_id is null or m.brand_id = a.brand_id)) then
      raise exception 'Choose a unit from the list.';
    end if;
    v_unit := clean_text(p, 'unit', 160);
    if v_unit is null then raise exception 'Enter the unit you are applying for.'; end if;
  end if;
  if clean_text(p, 'first_name') is null or clean_text(p, 'last_name') is null then
    raise exception 'Enter your first and last name.';
  end if;
  if clean_text(p, 'birth_place') is null then raise exception 'Enter your birthplace.'; end if;
  if clean_text(p, 'mothers_maiden_name') is null then raise exception 'Enter your mother''s maiden name.'; end if;
  if clean_text(p, 'address') is null then raise exception 'Enter your complete address.'; end if;
  if clean_text(p, 'employer_name') is null then raise exception 'Enter your employer or business name.'; end if;
  if not is_email(p ->> 'email') then raise exception 'Enter a valid email address.'; end if;

  if coalesce(p ->> 'birth_date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Enter your birthday.';
  end if;
  v_birth := (p ->> 'birth_date')::date;
  if v_birth > current_date - interval '18 years' or v_birth < current_date - interval '100 years' then
    raise exception 'Applicants must be at least 18 years old.';
  end if;

  v_mobile := clean_mobile(p ->> 'mobile');
  if v_mobile is null then raise exception 'Use a PH mobile number, for example 0917 123 4567.'; end if;

  v_income := clean_amount(p, 'monthly_income');
  if v_income is null then raise exception 'Enter your monthly income.'; end if;

  if coalesce(p ->> 'civil_status', '') not in ('single', 'married', 'widowed', 'separated', 'annulled') then
    raise exception 'Choose your civil status.';
  end if;
  if coalesce(p ->> 'employment_type', '') not in ('employed', 'business', 'ofw') then
    raise exception 'Choose employed, business owner, or OFW.';
  end if;

  -- Optional co-makers (up to 3), each checked like the applicant.
  if jsonb_typeof(p -> 'co_makers') = 'array' then
    if jsonb_array_length(p -> 'co_makers') > 3 then raise exception 'Add at most 3 co-makers.'; end if;
    for i in 0 .. jsonb_array_length(p -> 'co_makers') - 1 loop
      v_co := v_co || jsonb_build_array(clean_co_maker(p -> 'co_makers' -> i, 'Co-maker ' || (i + 1)));
    end loop;
  end if;

  if coalesce((p ->> 'consent')::boolean, false) is not true then
    raise exception 'Please tick the consent box so we can process your application.';
  end if;

  if (select count(*) from applications where mobile = v_mobile and created_at > now() - interval '1 day') >= 3 then
    raise exception 'We already received your application. Your agent will contact you soon.';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into applications (
    agent_id, source, unit, brand_id, model_id, variant,
    first_name, middle_name, last_name, birth_date, birth_place, mothers_maiden_name, civil_status,
    mobile, landline, email, address, years_at_address, residence_type,
    employment_type, employer_name, position, years_employed, employer_address, employer_phone, monthly_income,
    other_income_source, other_income, bank, bank_branch, co_makers, consent, upload_token, upload_expires
  ) values (
    a.id,
    case when p_source in ('nfc', 'qr', 'link') then p_source else 'link' end,
    v_unit, v_model.brand_id, v_model.id, v_variant,
    clean_text(p, 'first_name', 80), clean_text(p, 'middle_name', 80), clean_text(p, 'last_name', 80),
    v_birth, clean_text(p, 'birth_place', 120), clean_text(p, 'mothers_maiden_name', 160),
    p ->> 'civil_status',
    v_mobile, clean_text(p, 'landline', 40), lower(clean_text(p, 'email', 160)),
    clean_text(p, 'address', 300), least(clean_amount(p, 'years_at_address'), 100),
    case when p ->> 'residence_type' in ('owned', 'rented', 'with_relatives', 'company_provided') then p ->> 'residence_type' end,
    p ->> 'employment_type', clean_text(p, 'employer_name', 160), clean_text(p, 'position', 120),
    least(clean_amount(p, 'years_employed'), 80), clean_text(p, 'employer_address', 300),
    clean_text(p, 'employer_phone', 60), v_income,
    clean_text(p, 'other_income_source', 160), clean_amount(p, 'other_income'),
    clean_text(p, 'bank', 80), clean_text(p, 'bank_branch', 120),
    v_co, true, v_token, now() + interval '30 days'
  )
  returning ref into v_ref;

  return jsonb_build_object(
    'ref', v_ref,
    'upload_token', v_token,
    'uploads', exists (select 1 from agent_drive where agent_id = a.id and refresh_token is not null)
  );
end $$;

-- ---------- Requirements upload (Google Drive) ---------------------------

-- What the client's upload page shows. Needs the private token from their upload link.
create or replace function public.upload_info(p_ref text, p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  x applications;
begin
  select * into x from applications where ref = p_ref and upload_token = p_token and coalesce(p_token, '') <> '';
  if not found or x.upload_expires < now() then
    raise exception 'This upload link has expired or isn''t valid. Ask your agent for a new one.';
  end if;
  return jsonb_build_object(
    'ref', x.ref, 'first_name', x.first_name, 'unit', x.unit, 'employment_type', x.employment_type,
    'co_makers', jsonb_array_length(x.co_makers), 'expires', x.upload_expires,
    'documents', coalesce((select jsonb_agg(jsonb_build_object('name', d ->> 'name', 'type', d ->> 'type'))
                           from jsonb_array_elements(x.documents) d), '[]'),
    'uploads', exists (select 1 from agent_drive where agent_id = x.agent_id and refresh_token is not null)
  );
end $$;

-- Used by the drive-upload function: records a saved file (a Google Drive link) on the application.
create or replace function public.add_application_document(p_ref text, p_token text, p_doc jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  perform set_config('carzy.trusted', 'on', true);
  if coalesce(p_doc ->> 'url', '') !~ '^https://drive\.google\.com/' then
    raise exception 'Only Google Drive files can be recorded.';
  end if;
  update applications
     set documents = documents || jsonb_build_array(jsonb_build_object(
           'id', left(p_doc ->> 'id', 120), 'name', left(p_doc ->> 'name', 200), 'type', left(p_doc ->> 'type', 60),
           'url', left(p_doc ->> 'url', 300), 'size', (p_doc ->> 'size')::bigint, 'at', now()))
   where ref = p_ref and upload_token = p_token and upload_expires >= now()
         and jsonb_array_length(documents) < 20
  returning jsonb_array_length(documents) into n;
  if n is null then raise exception 'This upload link has expired or isn''t valid.'; end if;
  return n;
end $$;

-- Admins and the assigned agent can issue a fresh 30-day upload link (e.g. for older applications).
create or replace function public.renew_upload_link(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_until timestamptz := now() + interval '30 days';
begin
  if not exists (select 1 from applications where id = p_id and (is_admin() or agent_id = my_agent_id())) then
    raise exception 'You don''t have access to this application.';
  end if;
  perform set_config('carzy.trusted', 'on', true);
  update applications set upload_token = v_token, upload_expires = v_until where id = p_id;
  return jsonb_build_object('upload_token', v_token, 'upload_expires', v_until);
end $$;

create or replace function public.log_tap(p_slug text, p_source text default 'nfc')
returns void
language sql security definer set search_path = public as $$
  insert into card_taps (agent_id, source)
  select id, case when p_source in ('nfc', 'qr') then p_source else 'link' end
  from agents where slug = p_slug;
$$;

-- Per-agent numbers for the portal. Runs with the caller's rights, so agents only count their own.
create or replace function public.agent_stats()
returns table (agent_id uuid, taps_week bigint, last_tap timestamptz, new_applications bigint)
language sql stable as $$
  select a.id,
         (select count(*) from card_taps t where t.agent_id = a.id and t.created_at > now() - interval '7 days'),
         (select max(t.created_at) from card_taps t where t.agent_id = a.id),
         (select count(*) from applications x where x.agent_id = a.id and x.status = 'new' and x.archived_at is null)
  from agents a
$$;

revoke execute on function public.submit_application(text, jsonb, text) from public;
revoke execute on function public.upload_info(text, text) from public;
revoke execute on function public.renew_upload_link(uuid) from public;
revoke execute on function public.add_application_document(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.upload_info(text, text) to anon, authenticated;
grant execute on function public.renew_upload_link(uuid) to authenticated;
grant execute on function public.add_application_document(text, text, jsonb) to service_role;
-- Removed: earlier upload designs.
drop function if exists public.upload_target(text, text);
drop function if exists public.verify_upload(text, text);
revoke execute on function public.log_tap(text, text) from public;
grant execute on function public.submit_application(text, jsonb, text) to anon, authenticated;
grant execute on function public.log_tap(text, text)                   to anon, authenticated;
grant execute on function public.agent_stats()                         to authenticated;

-- ---------- Photo storage ----------------------------------------------

-- Public bucket for agent photos and covers. The portal shrinks photos to WebP/JPEG before upload
-- (usually under 300 KB); these limits stop anything else from being stored.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agent-photos', 'agent-photos', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Admins manage every photo; agents only the files in their own folder (agent-photos/<agent id>/…).
drop policy if exists "Team uploads agent photos" on storage.objects;
drop policy if exists "Team reads agent photo files" on storage.objects;
drop policy if exists "Team deletes agent photos" on storage.objects;
create policy "Team uploads agent photos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'agent-photos'
    and (public.is_admin() or (storage.foldername(name))[1] = public.my_agent_id()::text)
  );
-- Needed (with delete) so the portal can remove photos that were replaced.
create policy "Team reads agent photo files" on storage.objects for select to authenticated
  using (
    bucket_id = 'agent-photos'
    and (public.is_admin() or (storage.foldername(name))[1] = public.my_agent_id()::text)
  );
create policy "Team deletes agent photos" on storage.objects for delete to authenticated
  using (
    bucket_id = 'agent-photos'
    and (public.is_admin() or (storage.foldername(name))[1] = public.my_agent_id()::text)
  );

-- Tell Supabase's API about new tables/columns right away (otherwise: "Could not find the column ... in the schema cache").
notify pgrst, 'reload schema';

-- ---------- First admin --------------------------------------------------
-- Replace the email below with yours (lowercase), then run just this line:
-- insert into public.team (email, role) values ('you@example.com', 'admin');
