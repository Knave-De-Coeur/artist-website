import {
  cloudflareTest,
  readD1Migrations,
} from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const migrations = await readD1Migrations('worker/migrations');

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
        },
      },
      wrangler: {
        configPath: './wrangler.jsonc',
      },
    }),
  ],
  test: {
    include: ['test/worker/**/*.test.ts'],
    setupFiles: ['test/worker/setup.ts'],
  },
});
