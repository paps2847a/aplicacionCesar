import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      allowedHosts: true as const,
      hmr: process.env.ENABLE_HMR === 'true',
      watch: {
        ignored: [
          '**/data/**',
          '**/wa_session/**',
          '**/*.db',
          '**/*.db-wal',
          '**/*.db-shm',
          '**/*.journal',
          '**/*.tmp',
          '**/*.log',
          /[\\/]data[\\/]/,
          /[\\/]wa_session[\\/]/,
          /\.(db|db-wal|db-shm|tmp|journal)($|[?#])/,
        ],
      },
    },
  };
});
