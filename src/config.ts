// Supabase connection comes from .env.local (locally) or the repo's Actions variables (on deploy).
// The dealership contact below is shown when a card is turned off or not found: edit it here.
export const CONFIG = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseKey: import.meta.env.VITE_SUPABASE_KEY ?? '',
  /** Google OAuth "Web application" client ID. When set, the portal shows Google's own sign-in button,
   *  so Google's screen names this site instead of the Supabase address. Public by design. */
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  dealership: {
    name: 'Sample Motors',
    phone: '0917 000 0000',
    email: 'sales@example.com',
    facebook: 'https://facebook.com/'
  }
};

export const isConfigured = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseKey);

/** Public address of the site, e.g. https://you.github.io/dane/ */
export const siteBase = () => location.origin + import.meta.env.BASE_URL;
export const cardUrl = (slug: string) => `${siteBase()}cards/${slug}/`;
