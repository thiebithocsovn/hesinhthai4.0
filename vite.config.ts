import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const environment = loadEnv(mode, process.cwd(), 'VITE_');
    const configuredBasePath = environment.VITE_APP_BASE_PATH?.trim();
    const deploymentBasePath = configuredBasePath || (process.env.CF_PAGES === '1' ? '/' : '/4.0/');
    const applicationBasePath = deploymentBasePath === '/'
      ? '/'
      : `/${deploymentBasePath.replace(/^\/+|\/+$/g, '')}/`;
    const administratorEmail = environment.VITE_ADMIN_EMAIL?.trim() ||
      fs.readFileSync(path.resolve(__dirname, 'firestore.rules'), 'utf8')
        .match(/request\.auth\.token\.email\s*==\s*['"]([^'"]+)['"]/)?.[1]
        ?.trim() || '';

    return {
    base: applicationBasePath,
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_ADMIN_EMAIL': JSON.stringify(administratorEmail.toLowerCase()),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    };
});
