import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    alias: {
      'server-only': new URL('./test/noop.ts', import.meta.url).pathname,
    },
  },
});
