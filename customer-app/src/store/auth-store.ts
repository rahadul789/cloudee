import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { secureStateStorage } from "@/src/lib/secure-storage";

type CustomerProfile = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  referralCode?: string;
  hasPassword?: boolean;
  notificationSettings?: {
    orderUpdates?: boolean;
    restaurantStatus?: boolean;
    reviewReplies?: boolean;
  };
  previousPhones?: {
    phone: string;
    changedAt?: string | null;
  }[];
  profileImage?: {
    url?: string;
    publicId?: string;
  };
};

type PendingPhoneAuth = {
  phone: string;
  verificationSessionId: string;
  redirectTo?: string;
  fullName?: string;
  email?: string;
  referralCode?: string;
  otpVerified?: boolean;
  expiresInSeconds?: number;
  resendAvailableInSeconds?: number;
};

type AuthStore = {
  isHydrated: boolean;
  customer: CustomerProfile | null;
  accessToken: string;
  refreshToken: string;
  pendingPhoneAuth: PendingPhoneAuth | null;
  setHydrated: (value: boolean) => void;
  setPendingPhoneAuth: (value: PendingPhoneAuth | null) => void;
  setSession: (params: {
    customer: CustomerProfile;
    accessToken: string;
    refreshToken: string;
  }) => void;
  updateCustomerProfile: (customer: CustomerProfile) => void;
  clearSession: () => void;
};

export const useCustomerAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      isHydrated: false,
      customer: null,
      accessToken: "",
      refreshToken: "",
      pendingPhoneAuth: null,
      setHydrated: (isHydrated) => set({ isHydrated }),
      setPendingPhoneAuth: (pendingPhoneAuth) => set({ pendingPhoneAuth }),
      setSession: ({ customer, accessToken, refreshToken }) =>
        set({
          customer,
          accessToken,
          refreshToken,
          pendingPhoneAuth: null,
        }),
      updateCustomerProfile: (customer) =>
        set((state) => ({
          customer,
          accessToken: state.accessToken,
          refreshToken: state.refreshToken,
        })),
      clearSession: () =>
        set({
          customer: null,
          accessToken: "",
          refreshToken: "",
          pendingPhoneAuth: null,
        }),
    }),
    {
      name: "customer-auth-session",
      storage: createJSONStorage(() => secureStateStorage),
      partialize: (state) => ({
        customer: state.customer,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
