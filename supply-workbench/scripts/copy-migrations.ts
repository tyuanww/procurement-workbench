import { cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function copyMigrations(from: string, to: string): Promise<void> {
  await rm(to, { recursive: true, force: true });
  await cp(from, to, { recursive: true });
}

const isEntry = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntry) {
  await copyMigrations(
    fileURLToPath(new URL('../packages/persistence/src/migrations', import.meta.url)),
    fileURLToPath(new URL('../packages/persistence/dist/migrations', import.meta.url)),
  );
}
