import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { appStateStorage } from "@/src/lib/app-storage";

export type CustomerPreferredPaymentMethod = "Cash" | "Bkash";

type PaymentPreferencesStore = {
  preferredPaymentMethod: CustomerPreferredPaymentMethod;
  setPreferredPaymentMethod: (method: CustomerPreferredPaymentMethod) => void;
};

export const usePaymentPreferencesStore = create<PaymentPreferencesStore>()(
  persist(
    (set) => ({
      preferredPaymentMethod: "Cash",
      setPreferredPaymentMethod: (preferredPaymentMethod) =>
        set({ preferredPaymentMethod }),
    }),
    {
      name: "customer-payment-preferences-v1",
      storage: createJSONStorage(() => appStateStorage),
      partialize: (state) => ({
        preferredPaymentMethod: state.preferredPaymentMethod,
      }),
    },
  ),
);
