/**
 * Splits a list into consecutive chunks of at most `size`, preserving order.
 *
 * Written for the upstream calls that document a ceiling on how many ids one
 * request may carry.
 */
export function batched<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];

  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }

  return batches;
}

/**
 * Runs `task` over every item with at most `limit` in flight, answering in the
 * order the items were given rather than the order they finished.
 *
 * This bounds one caller's own fan-out, which is the problem a read that splits
 * into dozens of upstream calls actually has: sending them all at once is a
 * burst no single caller has any reason to produce, and the answer is no faster
 * for it because the upstream is the bottleneck either way.
 *
 * Once an item fails no further ones are started. The map is going to reject, so
 * the remaining calls would be spent on a result nothing will read.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(
      `Concurrency limit must be a positive integer, got ${limit}`,
    );
  }

  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;

  async function worker(): Promise<void> {
    while (next < items.length && !failed) {
      const index = next;
      next += 1;

      try {
        results[index] = await task(items[index]);
      } catch (error) {
        failed = true;

        throw error;
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);

  await Promise.all(workers);

  return results;
}
