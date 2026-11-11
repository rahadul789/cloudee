// Pure multi-cart model (no React Native imports) — used by the cart store and unit tests.

export type SelectedOption = {
  groupName: string;
  optionLabel: string;
};

export type CartItem = {
  key: string;
  itemId: string;
  name: string;
  imageUrl?: string | null;
  quantity: number;
  unitPrice: number;
  selectedVariantOptions: SelectedOption[];
  selectedAddOnOptions: SelectedOption[];
};

export type RestaurantCartIdentity = {
  restaurantId: string;
  restaurantName: string;
  /** Optional — shown on the "Your carts" list. */
  logoUrl?: string | null;
};

export type AddCartItemInput = {
  restaurant: RestaurantCartIdentity;
  item: Omit<CartItem, "key">;
};

export type CartReorderContext = {
  orderId: string;
  orderNumber: string;
};

/** One restaurant's cart. The app can hold several (multi-cart); one is "active". */
export type RestaurantCart = {
  restaurant: RestaurantCartIdentity;
  items: CartItem[];
  reorderContext: CartReorderContext | null;
  updatedAt: number;
};

export function buildCartItemKey(item: Omit<CartItem, "key">) {
  const variants = item.selectedVariantOptions
    .map((option) => `${option.groupName}:${option.optionLabel}`)
    .sort()
    .join("|");
  const addOns = item.selectedAddOnOptions
    .map((option) => `${option.groupName}:${option.optionLabel}`)
    .sort()
    .join("|");
  return `${item.itemId}__${variants}__${addOns}`;
}

export function getCartItemCount(items: CartItem[]) {
  return items.reduce((total, item) => total + item.quantity, 0);
}

export function getCartSubtotal(items: CartItem[]) {
  return items.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
}

/** Every non-empty cart, most recently touched first. */
export function getAllCarts(state: { carts: Record<string, RestaurantCart> }): RestaurantCart[] {
  return Object.values(state.carts)
    .filter((cart) => cart.items.length > 0)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

/** Total item count across all carts (bottom-tab badge). */
export function getAllCartsItemCount(state: { carts: Record<string, RestaurantCart> }) {
  return Object.values(state.carts).reduce(
    (total, cart) => total + getCartItemCount(cart.items),
    0,
  );
}

// Pure helpers (exported for tests) ------------------------------------------------------

export function mirrorActive(
  carts: Record<string, RestaurantCart>,
  activeRestaurantId: string | null,
) {
  const active = activeRestaurantId ? carts[activeRestaurantId] : undefined;
  return {
    carts,
    activeRestaurantId: active ? activeRestaurantId : null,
    restaurant: active?.restaurant ?? null,
    items: active?.items ?? [],
    reorderContext: active?.reorderContext ?? null,
  };
}

export function putCart(
  carts: Record<string, RestaurantCart>,
  restaurantId: string,
  next: RestaurantCart | null,
) {
  const copy = { ...carts };
  if (!next || next.items.length === 0) delete copy[restaurantId];
  else copy[restaurantId] = next;
  return copy;
}

export function addItemToCarts(
  carts: Record<string, RestaurantCart>,
  { restaurant, item }: AddCartItemInput,
  now = Date.now(),
) {
  const key = buildCartItemKey(item);
  const existing = carts[restaurant.restaurantId];
  const items = existing?.items ?? [];
  const found = items.find((entry) => entry.key === key);
  const nextItems = found
    ? items.map((entry) =>
        entry.key === key ? { ...entry, quantity: entry.quantity + item.quantity } : entry,
      )
    : [...items, { ...item, key }];
  return putCart(carts, restaurant.restaurantId, {
    restaurant: { ...existing?.restaurant, ...restaurant },
    items: nextItems,
    reorderContext: existing?.reorderContext ?? null,
    updatedAt: now,
  });
}

/** v0 (single cart) → v1 (multi-cart) persisted-state migration. */
export function migrateSingleCart(persisted: Record<string, unknown> | null | undefined) {
  const restaurant = persisted?.restaurant as RestaurantCartIdentity | null | undefined;
  const items = (persisted?.items as CartItem[] | undefined) ?? [];
  if (!restaurant?.restaurantId || !items.length) {
    return { carts: {}, activeRestaurantId: null };
  }
  return {
    carts: {
      [restaurant.restaurantId]: {
        restaurant,
        items,
        reorderContext: (persisted?.reorderContext as CartReorderContext | null) ?? null,
        updatedAt: Date.now(),
      },
    },
    activeRestaurantId: restaurant.restaurantId,
  };
}

