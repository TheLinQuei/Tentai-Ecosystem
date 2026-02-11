import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const basePath = process.env.VITE_BASE?.trim() || '/console/';

export default defineConfig({
  base: basePath,
  plugins: [react()],
  server: {
    port: 5173,
  },
});
