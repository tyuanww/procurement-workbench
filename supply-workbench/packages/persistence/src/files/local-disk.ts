import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FileStore } from '../../../application/src/ports/file-store.js';

const SHA256 = /^[a-f0-9]{64}$/;

export function fileStore(root: string): FileStore {
  const pendingDirectory = path.join(root, '.file-store-pending');
  return {
    async put(input) {
      const sha256 = createHash('sha256').update(input.bytes).digest('hex');
      const stored = path.join(root, sha256.slice(0, 2), sha256);
      await mkdir(path.dirname(stored), { recursive: true });
      await mkdir(pendingDirectory, { recursive: true });
      const pending = path.join(pendingDirectory, randomUUID());
      try {
        await writeFile(pending, input.bytes, { flag: 'wx', mode: 0o600 });
        await link(pending, stored).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'EEXIST') throw error;
        });
      } finally {
        await rm(pending, { force: true });
      }
      return { sha256, originalName: input.originalName, size: input.bytes.byteLength, mime: input.mime };
    },
    async read(sha256) {
      if (!SHA256.test(sha256)) return undefined;
      const stored = path.join(root, sha256.slice(0, 2), sha256);
      if (!stored.startsWith(`${path.resolve(root)}${path.sep}`)) return undefined;
      try {
        return new Uint8Array(await readFile(stored));
      } catch (error) {
        if (isMissing(error)) return undefined;
        throw error;
      }
    },
  };
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
