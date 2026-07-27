import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { StateStorage } from "zustand/middleware";

export const secureStateStorage: StateStorage = {
  getItem: async (name) => {
    if (Platform.OS === "web") {
      return globalThis.localStorage?.getItem(name) ?? null;
    }

    return SecureStore.getItemAsync(name);
  },
  setItem: async (name, value) => {
    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(name, value);
      return;
    }

    await SecureStore.setItemAsync(name, value);
  },
  removeItem: async (name) => {
    if (Platform.OS === "web") {
      globalThis.localStorage?.removeItem(name);
      return;
    }

    await SecureStore.deleteItemAsync(name);
  },
};

// Larger, non-secret state lives here instead of SecureStore, which on Android caps each value at
// ~2KB per key.
const asyncStateStorage: StateStorage = {
  getItem: (name) => AsyncStorage.getItem(name),
  setItem: (name, value) => AsyncStorage.setItem(name, value),
  removeItem: (name) => AsyncStorage.removeItem(name),
};

const AUTH_PROFILE_SUFFIX = ":profile";

/**
 * Splits the persisted auth session across two backends: the small, secret token payload stays in
 * SecureStore, while the larger `customer` profile goes to AsyncStorage. SecureStore caps each value
 * at ~2KB on Android, and tokens + a rich profile in one blob could exceed that — the write would
 * fail silently and drop the session (violating the stay-signed-in invariant). Keeping only the
 * tokens in SecureStore keeps that value comfortably small.
 *
 * The layer sits under zustand's createJSONStorage, so it receives/returns the stringified
 * `{ state, version }` envelope. Migration from the old single-blob format is automatic: an old
 * SecureStore blob still carries `customer` on read, and the next write splits it back out.
 */
export const authSplitStorage: StateStorage = {
  getItem: async (name) => {
    const secureRaw = await secureStateStorage.getItem(name);
    if (!secureRaw) return null;

    let parsed: { state?: Record<string, unknown> } | null = null;
    try {
      parsed = JSON.parse(secureRaw);
    } catch {
      return secureRaw;
    }
    if (!parsed || typeof parsed !== "object" || !parsed.state) return secureRaw;

    const profileRaw = await asyncStateStorage.getItem(
      name + AUTH_PROFILE_SUFFIX,
    );
    if (profileRaw) {
      try {
        parsed.state = { ...parsed.state, customer: JSON.parse(profileRaw) };
      } catch {
        // A corrupt profile cache is non-fatal — the tokens in secure state still stand.
      }
    }
    return JSON.stringify(parsed);
  },
  setItem: async (name, value) => {
    let parsed: { state?: Record<string, unknown> } | null = null;
    try {
      parsed = JSON.parse(value);
    } catch {
      await secureStateStorage.setItem(name, value);
      return;
    }
    if (parsed && parsed.state && typeof parsed.state === "object") {
      const { customer, ...tokenState } = parsed.state as Record<
        string,
        unknown
      >;
      await secureStateStorage.setItem(
        name,
        JSON.stringify({ ...parsed, state: tokenState }),
      );
      await asyncStateStorage.setItem(
        name + AUTH_PROFILE_SUFFIX,
        JSON.stringify(customer ?? null),
      );
      return;
    }
    await secureStateStorage.setItem(name, value);
  },
  removeItem: async (name) => {
    await secureStateStorage.removeItem(name);
    await asyncStateStorage.removeItem(name + AUTH_PROFILE_SUFFIX);
  },
};
