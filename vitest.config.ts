import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/unit/**/*.test.ts'],
    reporters: ['default']
  }
});
