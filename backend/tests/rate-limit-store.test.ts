import { ObservableMemoryStore } from "../src/common/middleware/rate-limit";

describe("ObservableMemoryStore", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("removes expired buckets during the periodic sweep", () => {
    let now = 0;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    const store = new ObservableMemoryStore("test", 30_000, 10);

    store.increment("first");
    store.increment("second");
    expect(store.size()).toBe(2);

    now = 60_001;
    store.increment("current");

    expect(store.size()).toBe(1);
    expect(store.get("current")?.totalHits).toBe(1);
  });

  it("evicts the oldest bucket instead of growing past its hard cap", () => {
    const store = new ObservableMemoryStore("test", 60_000, 3);

    store.increment("first");
    store.increment("second");
    store.increment("third");
    store.increment("fourth");

    expect(store.size()).toBe(3);
    expect(store.get("first")).toBeUndefined();
    expect(store.get("fourth")?.totalHits).toBe(1);
    expect(store.capacity()).toBe(3);
    expect(store.evictions()).toBe(1);
  });
});
