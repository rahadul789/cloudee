import { buildStartingPrice, hasCustomizations } from "@/src/lib/restaurant-menu";
import type { CustomerRestaurantMenuItem } from "@/src/types/restaurant";

// The two functions under test only read basePrice / variants / addOnGroups, so a loose partial
// object cast to the full type keeps the tests readable without hand-building every menu-item field.
function menuItem(
  partial: Record<string, unknown>,
): CustomerRestaurantMenuItem {
  return { basePrice: 0, ...partial } as unknown as CustomerRestaurantMenuItem;
}

describe("buildStartingPrice", () => {
  it("returns the base price when there are no variants", () => {
    expect(buildStartingPrice(menuItem({ basePrice: 100 }))).toBe(100);
  });

  it("adds the cheapest positive variant delta", () => {
    const item = menuItem({
      basePrice: 100,
      variants: [{ options: [{ priceDelta: 20 }, { priceDelta: 10 }] }],
    });
    expect(buildStartingPrice(item)).toBe(110);
  });

  it("never lets a negative variant delta drop below the base price", () => {
    const item = menuItem({
      basePrice: 100,
      variants: [{ options: [{ priceDelta: -5 }, { priceDelta: 3 }] }],
    });
    expect(buildStartingPrice(item)).toBe(100);
  });
});

describe("hasCustomizations", () => {
  it("is true when variants or add-on groups exist", () => {
    expect(hasCustomizations(menuItem({ variants: [{ options: [] }] }))).toBe(
      true,
    );
    expect(
      hasCustomizations(menuItem({ addOnGroups: [{ options: [] }] })),
    ).toBe(true);
  });

  it("is false for a plain item", () => {
    expect(hasCustomizations(menuItem({ basePrice: 50 }))).toBe(false);
  });
});
