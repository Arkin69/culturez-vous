// @ts-check
import { defineConfig } from 'astro/config';

// Le site est publié sur GitHub Pages : https://arkin69.github.io/culturez-vous/
// SITE_URL et SITE_BASE permettent de le publier ailleurs (Vercel, Netlify, domaine perso).
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://arkin69.github.io',
  base: process.env.SITE_BASE ?? '/culturez-vous',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
});
