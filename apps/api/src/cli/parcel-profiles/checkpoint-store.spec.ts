import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileCheckpointStore, TypeResult } from './checkpoint-store';

const result = (genericArticleId: number): TypeResult => ({
  genericArticleId,
  productTypeName: 'Спирачен диск',
  articleCount: 12,
  samples: [{ weightGrams: 500, packageCm: null }],
});

describe('FileCheckpointStore', () => {
  let directory: string;
  let store: FileCheckpointStore;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'checkpoint-'));
    store = new FileCheckpointStore(join(directory, 'progress.jsonl'));
  });

  afterEach(() => rm(directory, { recursive: true, force: true }));

  it('has no progress before anything is written', async () => {
    await expect(store.hasProgress()).resolves.toBe(false);
    await expect(store.load()).resolves.toEqual([]);
  });

  it('returns what was appended, in order', async () => {
    await store.append(result(1));
    await store.append(result(2));

    await expect(store.hasProgress()).resolves.toBe(true);
    await expect(store.load()).resolves.toEqual([result(1), result(2)]);
  });

  it('forgets everything on reset', async () => {
    await store.append(result(1));
    await store.reset();

    await expect(store.load()).resolves.toEqual([]);
  });
});
