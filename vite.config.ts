import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

const page = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// BASE_PATH is the folder the site lives under on GitHub Pages, e.g. "/dane/".
// The deploy workflow sets it automatically; locally it defaults to "/".
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  // Multi-page site: unknown addresses should 404 (like GitHub Pages), not fall back to the landing page.
  appType: 'mpa',
  plugins: [
    vue(),
    {
      // GitHub Pages sends /admin to /admin/ (and /portal to /portal/); do the same while developing.
      name: 'trailing-slash',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const m = req.url?.match(/^\/(admin|portal|privacy)(\?.*)?$/);
          if (!m) return next();
          res.statusCode = 301;
          res.setHeader('Location', `/${m[1]}/` + (m[2] ?? ''));
          res.end();
        });
      }
    }
  ],
  resolve: { alias: { '@': page('./src') } },
  build: {
    rolldownOptions: {
      input: {
        main: page('./index.html'),
        card: page('./card.html'),
        admin: page('./admin/index.html'),
        portal: page('./portal/index.html'),
        privacy: page('./privacy/index.html')
      }
    }
  }
});
