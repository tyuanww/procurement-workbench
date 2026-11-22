import type { AppDatabase } from '../client.js';
import { storedFiles } from '../schema/platform.js';

export async function rememberStoredFile(db: AppDatabase, file: {
  readonly sha256: string;
  readonly originalName: string;
  readonly size: number;
  readonly mime: string;
  readonly uploadedBy: string;
  readonly at: string;
}): Promise<void> {
  await db.insert(storedFiles).values({
    id: file.sha256,
    createdAt: file.at,
    updatedAt: file.at,
    sha256: file.sha256,
    originalName: file.originalName,
    size: file.size,
    mime: file.mime,
    storedPath: file.sha256,
    uploadedBy: file.uploadedBy,
  }).onConflictDoNothing();
}
