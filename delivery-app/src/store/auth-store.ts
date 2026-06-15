import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { secureStateStorage } from "@/src/lib/secure-storage";

export type RiderProfile = {
  id: string;
  fullName: string;
  phone: string;
  vehicleType?: string;
  activeTrackingOrderId?: string;
  isAvailableForAssignments?: boolean;
  status?: string;
  lastKnownLocation?: {
    latitude?: number | null;
    longitude?: number | null;
    heading?: number | null;
    accuracyMeters?: number | null;
    speedKmph?: number | null;
    updatedAt?: string | null;
  } | null;
  profileImage?: {
    url?: string;
    publicId?: string;
  };
};

type PendingPhoneAuth = {
  phone: string;
  verificationSessionId: string;
  resendAvailableInSeconds?: number;
};

type RiderAuthStore = {
  isHydrated: boolean;
  rider: RiderProfile | null;
  accessToken: string;
  refreshToken: string;
  pendingPhoneAuth: PendingPhoneAuth | null;
  setHydrated: (value: boolean) => void;
  setPendingPhoneAuth: (value: PendingPhoneAuth | null) => void;
  setSession: (params: {
    rider: RiderProfile;
    accessToken: string;
    refreshToken: string;
  }) => void;
  clearSession: () => void;
};

export const useRiderAuthStore = create<RiderAuthStore>()(
  persist(
    (set) => ({
      isHydrated: false,
      rider: null,
      accessToken: "",
      refreshToken: "",
      pendingPhoneAuth: null,
      setHydrated: (isHydrated: boolean) => set({ isHydrated }),
      setPendingPhoneAuth: (pendingPhoneAuth: PendingPhoneAuth | null) => set({ pendingPhoneAuth }),
      setSession: ({ rider, accessToken, refreshToken }) =>
        set({
          rider,
          accessToken,
          refreshToken,
          pendingPhoneAuth: null,
        }),
      clearSession: () =>
        set({
          rider: null,
          accessToken: "",
          refreshToken: "",
          pendingPhoneAuth: null,
        }),
    }),
    {
      name: "delivery-rider-auth",
      storage: createJSONStorage(() => secureStateStorage),
      partialize: (state) => ({
        rider: state.rider,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHydrated(true);
        }
      },
    }
  )
);
