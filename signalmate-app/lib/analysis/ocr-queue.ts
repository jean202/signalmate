export async function runOcrQueue<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency = 2,
): Promise<Array<PromiseSettledResult<R>>> {
  if (items.length === 0) return [];

  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let cursor = 0;

  async function consume() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;

      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  const workerCount = Math.min(2, Math.max(1, Math.floor(concurrency)), items.length);
  await Promise.all(Array.from({ length: workerCount }, consume));
  return results;
}
