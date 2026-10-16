import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    return {
      base: mode === 'pages' ? '/daily-banana/' : '/',
      server: {
        port: 5000,
        host: '0.0.0.0',
        allowedHosts: true as const,
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
