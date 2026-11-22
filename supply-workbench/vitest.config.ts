import { defineConfig } from 'vitest/config';
import { projects } from './vitest.workspace.ts';

export default defineConfig({
  test: {
    projects: projects.map((item) => ({
      test: { name: item, include: [`${item}/**/*.test.ts`] },
    })),
    sequence: { shuffle: true },
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
