import { openFirst } from "./open-first";

describe("openFirst", () => {
  it("moves closed restaurants to the end, keeping order within each group", () => {
    const list = [
      { id: "a", isOpen: false },
      { id: "b", isOpen: true },
      { id: "c" },
      { id: "d", isOpen: false },
      { id: "e", isOpen: true },
    ];
    expect(openFirst(list).map((r) => r.id)).toEqual(["b", "c", "e", "a", "d"]);
  });
  it("returns the same list when nothing is closed", () => {
    const list = [{ id: "a", isOpen: true }];
    expect(openFirst(list)).toBe(list);
  });
});
