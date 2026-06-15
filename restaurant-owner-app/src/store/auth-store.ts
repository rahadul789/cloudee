import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { secureStateStorage } from "@/src/lib/secure-storage";

export type OwnerProfile = {
  id: string;
  fullName: string;
  phone: string;
  isPhoneVerified?: boolean;
};

type OwnerAuthStore = {
  isHydrated: boolean;
  owner: OwnerProfile | null;
  accessToken: string;
  refreshToken: string;
  restaurantLifecycleStatus: string;
  registeredPushToken: string;
  registeredPushLanguage: "bn" | "en" | "";
  setHydrated: (value: boolean) => void;
  setSession: (params: {
    owner: OwnerProfile;
    accessToken: string;
    refreshToken: string;
    restaurantLifecycleStatus?: string;
  }) => void;
  updateOwner: (owner: Partial<OwnerProfile>) => void;
  setRegisteredPushToken: (token: string, language?: "bn" | "en") => void;
  clearSession: () => void;
};

export const useOwnerAuthStore = create<OwnerAuthStore>()(
  persist(
    (set) => ({
      isHydrated: false,
      owner: null,
      accessToken: "",
      refreshToken: "",
      restaurantLifecycleStatus: "",
      registeredPushToken: "",
      registeredPushLanguage: "",
      setHydrated: (isHydrated) => set({ isHydrated }),
      setSession: ({
        owner,
        accessToken,
        refreshToken,
        restaurantLifecycleStatus,
      }) =>
        set({
          owner,
          accessToken,
          refreshToken,
          restaurantLifecycleStatus: restaurantLifecycleStatus ?? "",
        }),
      updateOwner: (owner) =>
        set((state) => ({
          owner: state.owner ? { ...state.owner, ...owner } : state.owner,
        })),
      setRegisteredPushToken: (registeredPushToken, registeredPushLanguage) =>
        set((state) => ({
          registeredPushToken,
          registeredPushLanguage:
            registeredPushLanguage ?? state.registeredPushLanguage,
        })),
      clearSession: () =>
        set({
          owner: null,
          accessToken: "",
          refreshToken: "",
          restaurantLifecycleStatus: "",
          registeredPushToken: "",
          registeredPushLanguage: "",
        }),
    }),
    {
      name: "restaurant-owner-mobile-auth",
      storage: createJSONStorage(() => secureStateStorage),
      partialize: (state) => ({
        owner: state.owner,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        restaurantLifecycleStatus: state.restaurantLifecycleStatus,
        registeredPushToken: state.registeredPushToken,
        registeredPushLanguage: state.registeredPushLanguage,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
