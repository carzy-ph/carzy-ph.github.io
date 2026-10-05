# Agent Cards

NFC business-card pages for car dealer agents. Each card has a car loan application form, and a
portal lets admins manage agents and units while agents follow up on their applications.

- **Card page** (`/cards/<slug>/`) opens when a client taps an agent's NFC card. It has contact
  buttons, Save contact, social links, and a 4-step car loan application.
- **Admin** (`/admin/`) and **Agent Portal** (`/portal/`) are separate addresses with the same
  sign-in: Google. Signing in at the wrong one forwards you to the right one.
  - **Admin:** manage agents, assign each agent a brand, manage the units catalog
    (Brand → Model → Variant), see and reassign all applications, export CSV.
  - **Agent:** edit their own card, see only their own applications, update status and notes.

## Tech stack

| Part | Uses |
|---|---|
| Front end | Vue 3 + TypeScript, built with Vite. Vue Router for the portal. |
| Hosting | GitHub Pages, deployed by GitHub Actions |
| Database, sign-in, photo storage | Supabase (Postgres + Auth + Storage) |
| Scheduled refresh | GitHub Actions, every 6 hours: rebuilds card pages and keeps the free Supabase project awake |

Everything runs on free plans.

## How it fits together

```
 NFC card ─► /cards/marco/?src=nfc   (pre-built page with the agent's profile and units inside)
               │ 1. shows instantly from the built-in copy, even if Supabase is paused
               │ 2. loads the latest profile and units from Supabase
               │ 3. application ─► submit_application()  (database function: validates, then saves)
               ▼
           Supabase ◄── /admin/  (admins and agents sign in; database rules decide what each sees)
               ▲
 GitHub Actions┘ on every push and every 6 h: build Vue site → generate one page per agent → deploy
```

### Units and brands
- Admins manage **Brand → Model → Variant** under **Units**. Models with no variants just skip
  the variant question.
- An agent can be assigned **one brand**. Their card then offers only that brand's units, and the
  brand shows on their card. Agents with no brand offer every brand.
- Turning a brand or model **off** hides it from cards without deleting anything.
- Each application stores the unit name as the client saw it, so later catalog edits never
  change past applications.
- Until the catalog has any units, the form asks clients to type the unit instead.

### Who can see what
These rules are enforced in the database (`supabase/schema.sql`), not in the browser:

| | Visitors | Agent | Admin |
|---|---|---|---|
| Agent profiles, units catalog | read | read | read, edit |
| Applications | can only submit, through `submit_application()` | read and update status/notes on their own | everything |
| Own card | — | edit, except address, brand, branch and live status | everything |

`submit_application()` checks the following:
- **Required fields:** every required field is filled in.
- **Unit:** it exists in the catalog and belongs to the agent's brand. The unit name is built on the server.
- **Mobile number:** it's a valid PH mobile number.
- **Age:** the applicant is 18 or older.
- **Consent:** the box is ticked.
- **Daily limit:** no more than 3 applications per mobile number per day.
- **Bots:** submissions that fill in the hidden trap field are quietly dropped.

## Project layout

```
index.html, card.html, admin/index.html, portal/index.html   Entry pages (root redirects to /portal/, card template, admin, agent portal)
src/
  card/                 Card page app
  admin/                Admin + agent portal app (start.ts picks the area): store, router, views, components
  portal/main.ts        Starts the same app as the Agent Portal
  components/card/      CardView (also the portal's live preview), ApplicationForm, CardFallback
  lib/                  constants (labels), catalog, format, Supabase clients, CSV, vCard
  styles/               tokens.css (shared colors/fonts), admin.css
  sample/               Sample agents and units for local preview
  config.ts             Dealership fallback contact; Supabase settings come from env
  types.ts              Row shapes; keep in sync with supabase/schema.sql
scripts/build-cards.mjs Generates dist/cards/<slug>/index.html and dist/404.html after `vite build`
supabase/schema.sql     Tables, rules, functions, photo bucket
.github/workflows/deploy.yml
```

## Run it locally

```bash
npm install
```
```bash
npm run dev
```

Without Supabase, the card page shows sample data. Open these:
- `http://localhost:5173/card.html?slug=marco&src=nfc`: a Toyota-only agent
- `http://localhost:5173/card.html?slug=joy`: a turned-off card

The application form shows a preview notice instead of sending.

To connect to your Supabase project, copy `.env.example` to `.env.local`, fill in the values, and
restart `npm run dev`. The portal is at `http://localhost:5173/admin/`.

## Setup (about 20 minutes)

### 1. Create the Supabase project
1. At [supabase.com](https://supabase.com), create a project on the Free plan. Singapore is the
   closest region to the Philippines.
2. Open **SQL Editor → New query**, paste all of `supabase/schema.sql`, and click **Run**.
   It's safe to run again after updates.
3. Make yourself the admin. Use your own email, in lowercase:
   ```sql
   insert into public.team (email, role) values ('you@example.com', 'admin');
   ```

### 2. Set the sign-in addresses
**Authentication → URL Configuration**:
- **Site URL:** `https://YOUR-USERNAME.github.io/portal/`
- **Redirect URLs:** add `http://localhost:5173/admin/`, `http://localhost:5173/portal/`,
  `https://YOUR-USERNAME.github.io/admin/` and `https://YOUR-USERNAME.github.io/portal/`.

### 2b. Turn on Google sign-in (required)
The portal signs people in with Google only.
Either way, access depends on the team list: the Google account's email must be an admin or an
agent's **Portal login email**.

1. In [Google Cloud Console](https://console.cloud.google.com), create a project (e.g. "Agent Cards").
2. Go to **Google Auth Platform** (or **APIs & Services → OAuth consent screen**):
   - **Branding:** app name, support email.
   - **Audience:** External. Publish the app so any Google account can sign in. Only the basic
     email and profile access is requested, so Google doesn't need to review it.
3. Go to **Clients → Create client → Web application** and fill in:
   - **Authorized JavaScript origins:** `http://localhost:5173` and `https://YOUR-USERNAME.github.io`
   - **Authorized redirect URIs:** `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
     (Supabase shows this exact address on its Google provider page).
4. Copy the **Client ID** and **Client secret**.
5. In Supabase, go to **Authentication → Sign In / Providers → Google**, turn it on, paste both
   values, and save. Keep the secret only there, never in this repo.
6. Put the **Client ID** in `.env.local` as `VITE_GOOGLE_CLIENT_ID`, and add it as the
   `VITE_GOOGLE_CLIENT_ID` repository variable on GitHub. The portal then shows Google's own
   button, and Google's screen names your site instead of the Supabase address.
7. Reload the portal. The Google button appears.

### 3. Get your keys
In **Project Settings → API Keys**, copy the **Project URL** and the **publishable key**
(the legacy `anon` key also works). Both are public by design. Never use the `secret` or
`service_role` key in this project.

### 4. Publish on GitHub Pages
```bash
git init
git add .
git commit -m "Agent cards"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/dane.git
git push -u origin main
```

Then, on GitHub:
1. Go to **Settings → Pages → Build and deployment** and set Source to **GitHub Actions**.
2. Go to **Settings → Secrets and variables → Actions → Variables** and add:
   - `VITE_SUPABASE_URL`: your Project URL
   - `VITE_SUPABASE_KEY`: your publishable key
3. Go to **Actions → Build and deploy → Run workflow**. After this first run, it runs on every
   push and every 6 hours.

### 5. Add units, agents, and cards
1. Open `https://YOUR-USERNAME.github.io/dane/admin/` and sign in.
2. Under **Units**, add your brands, then each brand's models and variants.
3. Under **Agents**, click **+ Add agent**. Fill in the profile, pick their brand, and create them.
4. In **NFC card link**, copy the link. Write it to the card with an NFC writer app
   (for example NFC Tools: Write → Add a record → URL).
5. To give the agent portal access, set their **Portal login email**, then send them
   `https://YOUR-USERNAME.github.io/dane/portal/`. They sign in there with that Google account
   or email.

Don't change an agent's card address (`/cards/marco/`) once it's written to a physical card.
Everything else can change at any time and shows up immediately.

## Requirements upload (Google Drive)

After sending the application, clients can upload their requirements (valid IDs, proof of income,
proof of billing, co-maker documents). Each agent clicks **Connect Google Drive** once in their
portal (**My card → Requirements upload**) and approves Google's permission screen. Files then go into a
**"Carzy requirements"** folder in **that agent's own Google Drive**, one subfolder per application
(for example `A-BED872 - Juan Dela Cruz`).

- Carzy uses Google's `drive.file` permission: it can only see and edit files it saved there, nothing
  else in the agent's Drive. Google classes this as non-sensitive, so no review is needed.
- Clients use a private upload link (valid 30 days). Agents can copy or renew it from the
  application in the portal.
- Files go from the client's browser straight to Google Drive. Two Supabase Edge Functions
  (`supabase/functions/drive-connect` and `drive-upload`) handle connecting and checking uploads.
  The agent's Google token is stored only for these functions; the website can never read it.
- Limits: PDF, JPG, PNG or WebP, up to 10 MB each, 20 files per application. Phone photos are shrunk
  before upload. Files use the agent's own Google storage (15 GB free).

**Admin, once:**
1. Google Cloud Console: enable the **Google Drive API**. Under **Google Auth Platform → Data access →
   Add or remove scopes**, add `https://www.googleapis.com/auth/drive.file`, then save.
2. Supabase → **Edge Functions → Secrets**: add `GOOGLE_CLIENT_ID` (your OAuth client ID) and
   `GOOGLE_CLIENT_SECRET` (its secret).
3. Deploy the functions (needs `npx supabase login` once):
   ```bash
   npx supabase functions deploy drive-connect --project-ref YOUR-PROJECT-REF
   ```
   ```bash
   npx supabase functions deploy drive-upload --no-verify-jwt --project-ref YOUR-PROJECT-REF
   ```

## Day to day
- **An agent leaves:** turn off **Card is live**. Their card then shows the dealership contact.
  Their applications stay, and you can reassign them from each application's details.
- **A model is discontinued:** turn it off under **Units**.
- **Sending to a bank:** open the application and use **Copy details**, or use **Export CSV**.
  These contain personal data covered by the Data Privacy Act. Share them only with the
  financing bank.
- **Changing form choices** (civil status, residence, employment types): edit
  `src/lib/constants.ts`. If you add a new value, also add it to `supabase/schema.sql`
  (the table check and `submit_application()`), then re-run the file.

## Free plan notes
- Free Supabase projects pause after 7 days without activity. The 6-hourly workflow prevents
  that. Even when paused, cards still open from their built-in copy, but applications can't
  be sent until the project is resumed.
- GitHub turns off scheduled workflows in repos with no commits for 60 days, and emails you
  when it does. Re-enable it under **Actions** if that happens.
- Supabase Pro ($25/month) adds daily backups and never pauses. Consider it once you're
  collecting real applications.

## Not included yet
- **Instant new-application alerts.** Agents see new applications when they open the portal.
  Email or Viber alerts need a Supabase Database Webhook and an email service.
- **Document uploads** (IDs, payslips). Agents collect these directly from the client for now.
