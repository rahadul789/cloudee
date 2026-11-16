import { buildUpNext } from "./hype-up-next";

const list = ["a", "b", "c", "d"].map((id) => ({ id }));
const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe("buildUpNext", () => {
  it("continues after the current video, then wraps", () => {
    expect(ids(buildUpNext(list, "b", new Set(["b"])))).toEqual(["c", "d", "a"]);
  });

  it("never bounces back to a video already played this session", () => {
    // watched a → b; from b the next must be c (not a again)
    expect(ids(buildUpNext(list, "b", new Set(["a", "b"])))[0]).toBe("c");
    // after a, b, c, d were all played, the queue still moves forward
    expect(ids(buildUpNext(list, "d", new Set(["a", "b", "c", "d"])))).toEqual(["a", "b", "c"]);
  });

  it("handles a current video that isn't in the list", () => {
    expect(ids(buildUpNext(list, "x", new Set()))).toEqual(["a", "b", "c", "d"]);
  });
});
