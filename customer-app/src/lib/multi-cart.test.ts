import {
  addItemToCarts,
  getAllCarts,
  getAllCartsItemCount,
  migrateSingleCart,
  mirrorActive,
  putCart,
  type RestaurantCart,
} from "./multi-cart";

const item = (itemId: string, quantity = 1, unitPrice = 100) => ({
  itemId,
  name: itemId,
  quantity,
  unitPrice,
  selectedVariantOptions: [],
  selectedAddOnOptions: [],
});
const A = { restaurantId: "a", restaurantName: "Tasty Treat" };
const B = { restaurantId: "b", restaurantName: "Kacchi Khadok" };

describe("multi-cart", () => {
  it("keeps a separate cart per restaurant instead of conflicting", () => {
    let carts: Record<string, RestaurantCart> = {};
    carts = addItemToCarts(carts, { restaurant: A, item: item("burger") }, 1);
    carts = addItemToCarts(carts, { restaurant: B, item: item("kacchi") }, 2);
    expect(Object.keys(carts).sort()).toEqual(["a", "b"]);
    expect(carts.a.items).toHaveLength(1);
    expect(carts.b.items[0].itemId).toBe("kacchi");
  });

  it("merges the same item into one line", () => {
    let carts: Record<string, RestaurantCart> = {};
    carts = addItemToCarts(carts, { restaurant: A, item: item("burger", 1) });
    carts = addItemToCarts(carts, { restaurant: A, item: item("burger", 2) });
    expect(carts.a.items).toHaveLength(1);
    expect(carts.a.items[0].quantity).toBe(3);
  });

  it("mirrors the active cart into restaurant/items", () => {
    const carts = addItemToCarts({}, { restaurant: A, item: item("burger") });
    const mirror = mirrorActive(carts, "a");
    expect(mirror.restaurant?.restaurantId).toBe("a");
    expect(mirror.items).toHaveLength(1);
    expect(mirrorActive(carts, "missing").activeRestaurantId).toBeNull();
  });

  it("drops a cart when it becomes empty", () => {
    const carts = addItemToCarts({}, { restaurant: A, item: item("burger") });
    expect(putCart(carts, "a", { ...carts.a, items: [] })).toEqual({});
  });

  it("lists non-empty carts newest first and counts all items", () => {
    let carts: Record<string, RestaurantCart> = {};
    carts = addItemToCarts(carts, { restaurant: A, item: item("burger", 2) }, 1);
    carts = addItemToCarts(carts, { restaurant: B, item: item("kacchi", 1) }, 5);
    expect(getAllCarts({ carts }).map((cart) => cart.restaurant.restaurantId)).toEqual(["b", "a"]);
    expect(getAllCartsItemCount({ carts })).toBe(3);
  });

  it("migrates the old single-cart storage", () => {
    const migrated = migrateSingleCart({
      restaurant: A,
      items: [{ ...item("burger"), key: "burger____" }],
      reorderContext: null,
    });
    expect(migrated.activeRestaurantId).toBe("a");
    expect(Object.keys(migrated.carts)).toEqual(["a"]);
    expect(migrateSingleCart({ restaurant: null, items: [] })).toEqual({
      carts: {},
      activeRestaurantId: null,
    });
  });
});
