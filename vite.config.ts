import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: GitHub Pages serverer appen under /Familie/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Familie/' : '/',
  plugins: [react()],
}));
