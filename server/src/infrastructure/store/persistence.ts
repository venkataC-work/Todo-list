import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DataState } from './state.js';
import { parseSavedState } from './state.schema.js';

export interface Persistence {
  load: () => Promise<DataState | undefined>;
  save: (state: DataState) => Promise<void>;
}

export const memoryPersistence = (initial?: DataState): Persistence => ({
  load: async () => initial,
  save: async () => undefined,
});

const isMissingFile = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

/** JSON file persistence with atomic writes (temp file + rename) to avoid torn files on crash. */
export const filePersistence = (path: string): Persistence => ({
  load: async () => {
    try {
      return parseSavedState(JSON.parse(await readFile(path, 'utf8')));
    } catch (error) {
      if (isMissingFile(error)) return undefined;
      throw error;
    }
  },
  save: async (state) => {
    const tempPath = `${path}.${randomUUID()}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(tempPath, JSON.stringify(state, null, 2), { mode: 0o600 });
      await rename(tempPath, path);
    } finally {
      await rm(tempPath, { force: true });
    }
  },
});
