// Vista previa del panel lateral fuera de Chrome (datos simulados de src/sidepanel/devMock.ts).
// Uso: npx vite --config vite.preview.config.ts → http://localhost:5174/src/sidepanel/index.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5174, strictPort: true },
});
