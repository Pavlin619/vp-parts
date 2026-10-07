import { appendFile, readFile, rm } from 'node:fs/promises';
import type { ShippingProfile } from '../../tecdoc';

/** Everything the run learned about one product type; enough to aggregate it again without TecDoc. */
export interface TypeResult {
  genericArticleId: number;
  productTypeName: string;
  articleCount: number;
  /** Only the weighed parts: the profile is aggregated from these. */
  samples: ShippingProfile[];
}

export interface CheckpointStore {
  hasProgress(): Promise<boolean>;
  load(): Promise<TypeResult[]>;
  append(result: TypeResult): Promise<void>;
  reset(): Promise<void>;
}

/** One JSON line per finished type, so an interrupted run loses at most the type it was in. */
export class FileCheckpointStore implements CheckpointStore {
  constructor(private readonly path: string) {}

  async hasProgress(): Promise<boolean> {
    return (await this.load()).length > 0;
  }

  async load(): Promise<TypeResult[]> {
    const content = await this.readContent();

    return content
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as TypeResult);
  }

  append(result: TypeResult): Promise<void> {
    return appendFile(this.path, `${JSON.stringify(result)}\n`);
  }

  reset(): Promise<void> {
    return rm(this.path, { force: true });
  }

  private async readContent(): Promise<string> {
    try {
      return await readFile(this.path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return '';
      }

      throw error;
    }
  }
}
