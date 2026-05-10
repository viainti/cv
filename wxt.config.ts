import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react';

export default defineConfig({
  manifest: {
    name: 'TRCVASTIAN - CV & Job Automation',
    description: 'Automate CV parsing, profile filling, and job applications on LinkedIn',
    version: '2.0.0',
    manifest_version: 3,
    permissions: [
      'storage',
      'activeTab',
      'scripting',
      'webNavigation',
    ],
    host_permissions: [
      'https://*.linkedin.com/*',
      'https://*.indeed.com/*',
    ],
    action: {
      default_title: 'TRCVASTIAN',
      default_popup: 'entrypoints/popup/index.html',
    },
  },
  vite: () => ({
    plugins: [react()],
  }),
  webExt: {
    startUrl: ['https://www.linkedin.com'],
  },
});
