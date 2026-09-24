import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// La marca activa se hornea en el bundle para que la interfaz use su nombre y sus colores.
const brand = JSON.parse(fs.readFileSync(new URL('./electron/active-brand.json', import.meta.url), 'utf8'));

export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    __BRAND__: JSON.stringify(brand),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    strictPort: true,
  },
});
