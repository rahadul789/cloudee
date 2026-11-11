import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";

import { useCustomerProfileQuery } from "@/src/hooks/use-customer-api";
import {
  buildCartReminderBody,
  planCartReminder,
} from "@/src/lib/cart-reminder-rules";
import { useCartStore } from "@/src/store/cart-store";
import type { AreaServiceWindow } from "@/src/types/restaurant";

const STATE_KEY = "foodbela-cart-reminder-v1";
const SYNC_DEBOUNCE_MS = 1500;

type ReminderState = {
  pendingId: string | null;
  pendingAt: number | null;
  sentAts: number[];
};

async function loadState(): Promise<ReminderState> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ReminderState>) : {};
    return {
      pendingId: typeof parsed.pendingId === "string" ? parsed.pendingId : null,
      pendingAt: typeof parsed.pendingAt === "number" ? parsed.pendingAt : null,
      sentAts: Array.isArray(parsed.sentAts) ? parsed.sentAts.filter((n) => typeof n === "number") : [],
    };
  } catch {
    return { pendingId: null, pendingAt: null, sentAts: [] };
  }
}

async function saveState(state: ReminderState) {
  try {
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // best effort
  }
}

/**
 * "Your cart is waiting 🛒" — a single LOCAL notification on this phone (the cart lives on
 * the device, so no server round-trip). Re-planned on every cart change: ordering or
 * emptying the cart cancels it; still browsing pushes it later. All the anti-annoyance
 * limits live in `cart-reminder-rules.ts`. Never asks for notification permission itself.
 */
export function CartReminderBridge() {
  const carts = useCartStore((state) => state.carts);
  const queryClient = useQueryClient();
  const profileQuery = useCustomerProfileQuery();
  const promotionsEnabled = profileQuery.data?.notificationSettings?.promotions;
  const runningRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const sync = async () => {
        const permission = await Notifications.getPermissionsAsync().catch(() => null);
        const state = await loadState();
        const now = Date.now();

        // A reminder whose time has passed was delivered — remember it for the limits.
        if (state.pendingAt && state.pendingAt <= now) {
          state.sentAts = [...state.sentAts, state.pendingAt].slice(-10);
          state.pendingId = null;
          state.pendingAt = null;
        }
        if (state.pendingId) {
          await Notifications.cancelScheduledNotificationAsync(state.pendingId).catch(() => undefined);
          state.pendingId = null;
          state.pendingAt = null;
        }

        // Most recently touched cart that still has items.
        const cart = Object.values(carts)
          .filter((entry) => entry.items.length > 0)
          .sort((left, right) => right.updatedAt - left.updatedAt)[0];

        // Area service window from the cached home feed (if Foodbela is closed / closing).
        const windows = queryClient
          .getQueriesData<{ areaServiceWindow?: AreaServiceWindow | null }>({
            queryKey: ["customer", "discovery-home"],
          })
          .map(([, data]) => data?.areaServiceWindow)
          .filter(Boolean) as AreaServiceWindow[];
        const areaClosed = windows.some((window) => window.isOpen === false);
        const closesAtEpochMs = windows.find((window) => window.closesAtEpochMs)?.closesAtEpochMs ?? null;

        const fireAt =
          permission?.status === "granted" && cart && !areaClosed
            ? planCartReminder({
                now,
                hasItems: true,
                lastChangeAt: cart.updatedAt || now,
                sentAts: state.sentAts,
                closesAtEpochMs,
                promotionsEnabled,
              })
            : null;

        if (fireAt && cart) {
          const id = await Notifications.scheduleNotificationAsync({
            content: {
              title: "Your cart is waiting 🛒",
              body: buildCartReminderBody(
                cart.restaurant.restaurantName,
                cart.items.map((item) => item.name),
              ),
              data: { type: "cart_reminder", path: "/(tabs)/cart" },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: new Date(fireAt),
              channelId: "default",
            },
          }).catch(() => null);
          if (id) {
            state.pendingId = id;
            state.pendingAt = fireAt;
          }
        }
        await saveState(state);
      };

      // Serialise runs so a burst of cart edits can't double-schedule.
      const previous = runningRef.current ?? Promise.resolve();
      runningRef.current = previous.then(sync).catch(() => undefined);
    }, SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [carts, promotionsEnabled, queryClient]);

  return null;
}
