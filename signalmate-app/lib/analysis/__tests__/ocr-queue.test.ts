import { runOcrQueue } from '../ocr-queue';

describe('runOcrQueue', () => {
  test('OCR 작업은 동시에 두 건을 넘지 않는다', async () => {
    let running = 0;
    let maximum = 0;

    const results = await runOcrQueue(['a', 'b', 'c', 'd'], async (id) => {
      running += 1;
      maximum = Math.max(maximum, running);
      await Promise.resolve();
      running -= 1;
      return id;
    });

    expect(maximum).toBe(2);
    expect(results).toEqual([
      { status: 'fulfilled', value: 'a' },
      { status: 'fulfilled', value: 'b' },
      { status: 'fulfilled', value: 'c' },
      { status: 'fulfilled', value: 'd' },
    ]);
  });

  test('요청 동시성이 2보다 커도 동시에 두 건을 넘지 않는다', async () => {
    let running = 0;
    let maximum = 0;

    await runOcrQueue(['a', 'b', 'c', 'd'], async (id) => {
      running += 1;
      maximum = Math.max(maximum, running);
      await Promise.resolve();
      running -= 1;
      return id;
    }, 10);

    expect(maximum).toBe(2);
  });

  test('빈 입력은 worker를 실행하지 않고 빈 결과를 반환한다', async () => {
    let calls = 0;

    const results = await runOcrQueue([], async () => {
      calls += 1;
      return 'unused';
    }, 10);

    expect(results).toEqual([]);
    expect(calls).toBe(0);
  });

  test('완료 순서와 관계없이 입력 순서로 결과를 보존한다', async () => {
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const resultsPromise = runOcrQueue(['first', 'second'], async (id) => {
      if (id === 'first') await firstGate;
      else releaseFirst?.();
      return id.toUpperCase();
    });

    await expect(resultsPromise).resolves.toEqual([
      { status: 'fulfilled', value: 'FIRST' },
      { status: 'fulfilled', value: 'SECOND' },
    ]);
  });

  test('한 OCR 실패가 나머지 작업을 중단하지 않는다', async () => {
    const error = new Error('OCR failed');

    const results = await runOcrQueue(['ok-1', 'failed', 'ok-2'], async (id) => {
      if (id === 'failed') throw error;
      return id;
    });

    expect(results).toEqual([
      { status: 'fulfilled', value: 'ok-1' },
      { status: 'rejected', reason: error },
      { status: 'fulfilled', value: 'ok-2' },
    ]);
  });
});
