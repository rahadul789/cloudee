import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { StateStorage } from "zustand/middleware";

export const appStateStorage: StateStorage = {
  getItem: async (name) => {
    if (Platform.OS === "web") {
      return globalThis.localStorage?.getItem(name) ?? null;
    }

    return AsyncStorage.getItem(name);
  },
  setItem: async (name, value) => {
    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(name, value);
      return;
    }

    await AsyncStorage.setItem(name, value);
  },
  removeItem: async (name) => {
    if (Platform.OS === "web") {
      globalThis.localStorage?.removeItem(name);
      return;
    }

    await AsyncStorage.removeItem(name);
  },
};
