import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { secureStateStorage } from "@/src/lib/secure-storage";

export type OwnerLanguage = "bn" | "en";

type OwnerLanguageStore = {
  language: OwnerLanguage;
  setLanguage: (language: OwnerLanguage) => void;
};

export const useOwnerLanguageStore = create<OwnerLanguageStore>()(
  persist(
    (set) => ({
      language: "bn",
      setLanguage: (language) => set({ language }),
    }),
    {
      name: "restaurant-owner-language",
      storage: createJSONStorage(() => secureStateStorage),
    },
  ),
);

