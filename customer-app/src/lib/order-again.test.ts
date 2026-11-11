import { buildOrderAgainEntries, formatOrderItemsLabel, type OrderAgainSourceOrder } from "./order-again";

const order = (overrides: Partial<OrderAgainSourceOrder>): OrderAgainSourceOrder => ({
  _id: Math.random().toString(36).slice(2),
  restaurantId: "r1",
  status: "Delivered",
  createdAt: "2026-11-01T10:00:00Z",
  pricing: { total: 450 },
  itemsSnapshot: [{ itemId: "i1", name: "Kacchi", quantity: 2 }],
  restaurantCard: { name: "Kacchi Bhai", imageUrl: null },
  ...overrides,
});

describe("order again", () => {
  it("labels items", () => {
    expect(formatOrderItemsLabel([{ name: "Kacchi" }])).toBe("Kacchi");
    expect(formatOrderItemsLabel([{ name: "Kacchi" }, { name: "Borhani" }, { name: "Firni" }])).toBe(
      "Kacchi + 2 more",
    );
    expect(formatOrderItemsLabel([])).toBe("Your last order");
  });

  it("keeps the latest delivered order per restaurant, newest first", () => {
    const entries = buildOrderAgainEntries([
      order({ _id: "old", createdAt: "2026-10-01T10:00:00Z" }),
      order({ _id: "new", createdAt: "2026-11-05T10:00:00Z" }),
      order({ _id: "other", restaurantId: "r2", createdAt: "2026-11-03T10:00:00Z", restaurantCard: { name: "Pizza Hub", imageUrl: "x" } }),
    ]);
    expect(entries.map((entry) => entry.order._id)).toEqual(["new", "other"]);
    expect(entries[0].itemCount).toBe(2);
  });

  it("respects the admin max-age (days)", () => {
    const now = Date.parse("2026-11-09T10:00:00Z");
    const recent = order({ _id: "recent", createdAt: "2026-11-01T10:00:00Z" });
    const old = order({ _id: "old", restaurantId: "r2", createdAt: "2026-07-01T10:00:00Z" });
    expect(buildOrderAgainEntries([recent, old], 6, 60, now).map((e) => e.order._id)).toEqual(["recent"]);
    expect(buildOrderAgainEntries([recent, old], 6, undefined, now)).toHaveLength(2);
  });

  it("skips cancelled, nameless (old backend) and empty orders, and caps the list", () => {
    expect(buildOrderAgainEntries([order({ status: "Cancelled" })])).toHaveLength(0);
    expect(buildOrderAgainEntries([order({ restaurantCard: null })])).toHaveLength(0);
    expect(buildOrderAgainEntries([order({ itemsSnapshot: [] })])).toHaveLength(0);
    const many = Array.from({ length: 10 }, (_, index) => order({ restaurantId: `r${index}` }));
    expect(buildOrderAgainEntries(many)).toHaveLength(6);
  });
});
