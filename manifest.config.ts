import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'InstaMoney — Prospección en Instagram',
  description: 'Prospección en Instagram: campañas automáticas de DM, IA, seguimientos, engagement y CRM.',
  version: pkg.version,
  icons: {
    16: 'public/icons/icon16.png',
    32: 'public/icons/icon32.png',
    48: 'public/icons/icon48.png',
    128: 'public/icons/icon128.png',
  },
  action: {
    default_icon: {
      16: 'public/icons/icon16.png',
      32: 'public/icons/icon32.png',
    },
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  permissions: ['storage', 'unlimitedStorage', 'sidePanel', 'alarms', 'notifications', 'activeTab', 'scripting', 'tabs'],
  // Webhooks: se pide permiso para el dominio concreto cuando el usuario añade uno en Ajustes.
  optional_host_permissions: ['https://*/*', 'http://*/*'],
  host_permissions: [
    'https://www.instagram.com/*',
    'https://ig.me/*',
    'https://api.groq.com/*',
    'https://*.cdninstagram.com/*',
    'https://*.fbcdn.net/*',
  ],
  content_scripts: [
    {
      matches: ['https://www.instagram.com/*'],
      js: ['src/content/index.tsx'],
      run_at: 'document_idle',
    },
  ],
});
