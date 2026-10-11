/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // One .env at the repo root; only VITE_* variables are exposed to the browser bundle.
  envDir: '../..',
  server: {
    port: 4200,
    strictPort: true,
    // Same-origin API in development so the httpOnly refresh cookie is first-party.
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
  },
  preview: { port: 4200 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    testTimeout: 20_000,
  },
});
