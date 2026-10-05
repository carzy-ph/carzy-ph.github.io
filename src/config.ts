// Supabase connection comes from .env.local (locally) or the repo's Actions variables (on deploy).
// Brand name and the contact shown when a card is turned off or not found: edit them here.
export const CONFIG = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseKey: import.meta.env.VITE_SUPABASE_KEY ?? '',
  /** Google OAuth "Web application" client ID. When set, the portal shows Google's own sign-in button,
   *  so Google's screen names this site instead of the Supabase address. Public by design. */
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  /** Link to the shared upload script (google/upload.gs) that each agent copies into their own
   *  Google account, so clients' requirements land in that agent's Drive. See README. */
  uploadTemplateUrl: import.meta.env.VITE_UPLOAD_TEMPLATE_URL ?? '',
  brand: 'Carzy',
  /** Contact on the "card is off / not found" page. Leave a field empty to hide it. */
  support: {
    phone: '',
    email: '',
    facebook: ''
  }
};

export const isConfigured = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseKey);

/** Public address of the site, e.g. https://you.github.io/dane/ */
export const siteBase = () => location.origin + import.meta.env.BASE_URL;
export const cardUrl = (slug: string) => `${siteBase()}cards/${slug}/`;
