import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: GitHub Pages serverer appen under /<repo-navn>/. I GitHub Actions hentes navnet fra GITHUB_REPOSITORY,
// så et nytt navn på repoet ikke gjør appen blank. Lokalt bygg bruker dagens navn.
// Fast port 5180 så appen ikke kolliderer med andre prosjekter (GK bruker 5173).
export default defineConfig(({ command }) => ({
  base: command === 'build' ? `/${process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'sulamitten'}/` : '/',
  plugins: [react()],
  server: { port: 5180, strictPort: true, open: true },
}));
