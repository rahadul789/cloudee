import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { StateStorage } from "zustand/middleware";

export const secureStateStorage: StateStorage = {
  getItem: async (name: string) => {
    if (Platform.OS === "web") {
      return globalThis.localStorage?.getItem(name) ?? null;
    }

    return SecureStore.getItemAsync(name);
  },
  setItem: async (name: string, value: string) => {
    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(name, value);
      return;
    }

    await SecureStore.setItemAsync(name, value);
  },
  removeItem: async (name: string) => {
    if (Platform.OS === "web") {
      globalThis.localStorage?.removeItem(name);
      return;
    }

    await SecureStore.deleteItemAsync(name);
  },
};

