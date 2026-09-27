import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: GitHub Pages serverer appen under /Familie/
// Fast port 5180 så appen ikke kolliderer med andre prosjekter (GK bruker 5173).
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Familie/' : '/',
  plugins: [react()],
  server: { port: 5180, strictPort: true, open: true },
}));
