import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { secureStateStorage } from "@/src/lib/secure-storage";

export type AppLanguage = "en" | "bn";

type PreferencesStore = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
};

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      // Bangla-first: riders see Bangla out of the box; the Account screen toggle switches it.
      language: "bn",
      setLanguage: (language) => set({ language }),
    }),
    {
      name: "delivery-rider-preferences",
      storage: createJSONStorage(() => secureStateStorage),
      partialize: (state) => ({
        language: state.language,
      }),
    }
  )
);
