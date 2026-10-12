import { createInMemoryAsyncCache } from "../src/common/utils/in-memory-cache";

describe("live snapshot cache invalidation during an in-flight load", () => {
  it("does not let a pre-update snapshot replace fresh rider coordinates", async () => {
    const cache = createInMemoryAsyncCache<{ latitude: number }>({ ttlMs: 5_000 });
    let finishOld!: (value: { latitude: number }) => void;
    const old = cache.getOrSet("live-map", () => new Promise((resolve) => { finishOld = resolve; }));
    cache.clear();
    await cache.getOrSet("live-map", async () => ({ latitude: 23.805 }));
    finishOld({ latitude: 23.8 });
    await old;
    const current = await cache.getOrSet("live-map", async () => ({ latitude: 0 }));
    expect(current.latitude).toBe(23.805);
  });

  it("keeps an invalidated pending snapshot out of the cache", async () => {
    const cache = createInMemoryAsyncCache<number>({ ttlMs: 5_000 });
    let finish!: (value: number) => void;
    const old = cache.getOrSet("live-map", () => new Promise((resolve) => { finish = resolve; }));
    cache.clear();
    finish(1);
    expect(await old).toBe(1);
    expect(cache.size()).toBe(0);
  });
});
