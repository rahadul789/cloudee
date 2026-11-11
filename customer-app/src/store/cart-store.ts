import { create } from "zustand";
import { AppState } from "react-native";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import { appStateStorage } from "@/src/lib/app-storage";

import {
  addItemToCarts,
  buildCartItemKey,
  migrateSingleCart,
  mirrorActive,
  putCart,
  type AddCartItemInput,
  type CartItem,
  type CartReorderContext,
  type RestaurantCart,
  type RestaurantCartIdentity,
} from "@/src/lib/multi-cart";

export {
  buildCartItemKey,
  getAllCarts,
  getAllCartsItemCount,
  getCartItemCount,
  getCartSubtotal,
} from "@/src/lib/multi-cart";
export type { CartItem, RestaurantCart, RestaurantCartIdentity } from "@/src/lib/multi-cart";

const CART_PERSIST_WRITE_DELAY_MS = 120;

// MULTI-CART MODEL
// `carts` holds every restaurant's cart; `activeRestaurantId` picks the one the cart
// screen / checkout / restaurant footer work on. `restaurant`, `items` and
// `reorderContext` are kept as a MIRROR of the active cart so every existing consumer
// (checkout, cart screen, details footer, quotes) keeps working unchanged. Adding an item
// from another restaurant no longer conflicts: it goes into that restaurant's own cart,
// which becomes active. Placing an order clears only the active cart.
type CartStore = {
  carts: Record<string, RestaurantCart>;
  activeRestaurantId: string | null;
  restaurant: RestaurantCartIdentity | null;
  items: CartItem[];
  reorderContext: CartReorderContext | null;
  // Customer opted into the optional platform fee. Shared by cart + checkout so the choice
  // (and toggle state) carries across the two screens. Deliberately NOT persisted — it's a
  // per-session decision that resets with the cart.
  platformFeeOptedIn: boolean;
  // Customer opted into urgent/priority delivery (checkout toggle). Same not-persisted,
  // resets-with-cart semantics as the platform-fee opt-in.
  urgentDeliveryOptedIn: boolean;
  addItem: (input: AddCartItemInput) => void;
  replaceCart: (input: AddCartItemInput) => void;
  setCart: (input: {
    restaurant: RestaurantCartIdentity;
    items: Omit<CartItem, "key">[];
  }) => void;
  /** Make a saved cart the active one (no-op if it doesn't exist). */
  setActiveCart: (restaurantId: string) => void;
  /** Delete one restaurant's cart (active or not). */
  removeCart: (restaurantId: string) => void;
  setReorderContext: (context: CartReorderContext | null) => void;
  setPlatformFeeOptedIn: (value: boolean) => void;
  setUrgentDeliveryOptedIn: (value: boolean) => void;
  syncPricing: (items: { key: string; unitPrice: number }[]) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  /** Clears the ACTIVE cart only (e.g. after its order is placed); other carts stay. */
  clearCart: () => void;
};

function createCartStateStorage(): StateStorage {
  const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();
  const latestValues = new Map<string, string>();
  const writeChains = new Map<string, Promise<void>>();

  const enqueueWrite = (name: string, value: string) => {
    const previousWrite = writeChains.get(name) ?? Promise.resolve();
    const nextWrite: Promise<void> = previousWrite
      .catch(() => undefined)
      .then(async () => {
        await appStateStorage.setItem(name, value);
      });
    writeChains.set(name, nextWrite);
    void nextWrite.finally(() => {
      if (writeChains.get(name) === nextWrite) {
        writeChains.delete(name);
      }
    });
    return nextWrite;
  };

  const flushKey = (name: string) => {
    const pendingWrite = pendingWrites.get(name);
    if (pendingWrite) {
      clearTimeout(pendingWrite);
      pendingWrites.delete(name);
    }

    const value = latestValues.get(name);
    if (typeof value === "string") {
      void enqueueWrite(name, value);
    }
  };

  AppState.addEventListener("change", (nextState) => {
    if (nextState === "active") {
      return;
    }

    Array.from(pendingWrites.keys()).forEach(flushKey);
  });

  return {
    getItem: (name) => latestValues.get(name) ?? appStateStorage.getItem(name),
    setItem: (name, value) => {
      latestValues.set(name, value);
      const pendingWrite = pendingWrites.get(name);
      if (pendingWrite) {
        clearTimeout(pendingWrite);
      }

      pendingWrites.set(
        name,
        setTimeout(() => {
          flushKey(name);
        }, CART_PERSIST_WRITE_DELAY_MS),
      );

      return Promise.resolve();
    },
    removeItem: async (name) => {
      const pendingWrite = pendingWrites.get(name);
      if (pendingWrite) {
        clearTimeout(pendingWrite);
        pendingWrites.delete(name);
      }

      latestValues.delete(name);
      await appStateStorage.removeItem(name);
    },
  };
}

const cartStateStorage = createCartStateStorage();

export const useCartStore = create<CartStore>()(
  persist(
    (set) => {
      // Apply a change to the ACTIVE cart's items (quantity edits, pricing sync, removals).
      const updateActive = (
        state: CartStore,
        fn: (items: CartItem[]) => CartItem[] | null,
      ): Partial<CartStore> | CartStore => {
        const id = state.activeRestaurantId;
        const active = id ? state.carts[id] : undefined;
        if (!id || !active) return state;
        const nextItems = fn(active.items);
        if (nextItems === null) return state;
        const carts = putCart(state.carts, id, {
          ...active,
          items: nextItems,
          updatedAt: Date.now(),
        });
        return mirrorActive(carts, carts[id] ? id : null);
      };

      return {
        carts: {},
        activeRestaurantId: null,
        restaurant: null,
        items: [],
        reorderContext: null,
        platformFeeOptedIn: false,
        urgentDeliveryOptedIn: false,
        addItem: (input) =>
          set((state) =>
            mirrorActive(addItemToCarts(state.carts, input), input.restaurant.restaurantId),
          ),
        replaceCart: ({ restaurant, item }) =>
          set((state) => {
            const carts = putCart(state.carts, restaurant.restaurantId, {
              restaurant,
              items: [{ ...item, key: buildCartItemKey(item) }],
              reorderContext: null,
              updatedAt: Date.now(),
            });
            return mirrorActive(carts, restaurant.restaurantId);
          }),
        setCart: ({ restaurant, items }) =>
          set((state) => {
            const carts = putCart(state.carts, restaurant.restaurantId, {
              restaurant,
              items: items.map((item) => ({ ...item, key: buildCartItemKey(item) })),
              reorderContext: state.carts[restaurant.restaurantId]?.reorderContext ?? null,
              updatedAt: Date.now(),
            });
            return mirrorActive(carts, restaurant.restaurantId);
          }),
        setActiveCart: (restaurantId) =>
          set((state) =>
            state.carts[restaurantId] && state.activeRestaurantId !== restaurantId
              ? {
                  ...mirrorActive(state.carts, restaurantId),
                  // Opt-ins belong to one checkout — don't carry them to another cart.
                  platformFeeOptedIn: false,
                  urgentDeliveryOptedIn: false,
                }
              : state,
          ),
        removeCart: (restaurantId) =>
          set((state) => {
            const carts = putCart(state.carts, restaurantId, null);
            return mirrorActive(
              carts,
              state.activeRestaurantId === restaurantId ? null : state.activeRestaurantId,
            );
          }),
        setReorderContext: (context) =>
          set((state) => {
            const id = state.activeRestaurantId;
            const active = id ? state.carts[id] : undefined;
            if (!id || !active) return { reorderContext: context };
            const carts = { ...state.carts, [id]: { ...active, reorderContext: context } };
            return mirrorActive(carts, id);
          }),
        setPlatformFeeOptedIn: (value) => set({ platformFeeOptedIn: value }),
        setUrgentDeliveryOptedIn: (value) => set({ urgentDeliveryOptedIn: value }),
        syncPricing: (pricedItems) =>
          set((state) => {
            if (!pricedItems.length) return state;
            const priceMap = new Map(pricedItems.map((item) => [item.key, item.unitPrice]));
            return updateActive(state, (items) => {
              let hasChange = false;
              const next = items.map((item) => {
                const nextPrice = priceMap.get(item.key);
                if (typeof nextPrice !== "number" || nextPrice === item.unitPrice) return item;
                hasChange = true;
                return { ...item, unitPrice: nextPrice };
              });
              return hasChange ? next : null;
            });
          }),
        updateQuantity: (key, quantity) =>
          set((state) =>
            updateActive(state, (items) =>
              quantity <= 0
                ? items.filter((item) => item.key !== key)
                : items.map((item) => (item.key === key ? { ...item, quantity } : item)),
            ),
          ),
        removeItem: (key) =>
          set((state) => updateActive(state, (items) => items.filter((item) => item.key !== key))),
        clearCart: () =>
          set((state) => ({
            ...mirrorActive(
              state.activeRestaurantId
                ? putCart(state.carts, state.activeRestaurantId, null)
                : state.carts,
              null,
            ),
            platformFeeOptedIn: false,
            urgentDeliveryOptedIn: false,
          })),
      };
    },
    {
      name: "customer-cart-state",
      version: 1,
      storage: createJSONStorage(() => cartStateStorage),
      partialize: (state) => ({
        carts: state.carts,
        activeRestaurantId: state.activeRestaurantId,
      }),
      // v0 stored one cart as { restaurant, items, reorderContext } — lift it into `carts`.
      migrate: (persisted, version) =>
        version === 0
          ? migrateSingleCart(persisted as Record<string, unknown>)
          : (persisted as { carts: Record<string, RestaurantCart>; activeRestaurantId: string | null }),
      // Rebuild the active-cart mirror from what was persisted.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as {
          carts?: Record<string, RestaurantCart>;
          activeRestaurantId?: string | null;
        };
        return {
          ...current,
          ...mirrorActive(saved.carts ?? {}, saved.activeRestaurantId ?? null),
        };
      },
    },
  ),
);
