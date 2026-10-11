import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC is used so decorator metadata is emitted — Nest's DI depends on it.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
  },
});
