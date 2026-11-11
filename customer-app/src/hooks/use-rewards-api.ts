import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiProtectedGet, apiProtectedPost } from "@/src/lib/api";
import { useCustomerAuthStore } from "@/src/store/auth-store";

export type WheelSegment = {
  id: string;
  type: "coins" | "bonus_stamp" | "free_delivery" | "discount" | "fun";
  label: string;
  amount: number;
  chance: number; // %
};

export type SpinPrize = {
  id: string;
  type: WheelSegment["type"];
  label: string;
  amount: number;
  voucherCode: string;
};

export type SpinItem = {
  id: string;
  orderId: string;
  orderNumber: string;
  status: "unscratched" | "scratched" | "expired";
  unlocksAt: string | null;
  expiresAt: string;
  spunAt: string | null;
  prize: SpinPrize | null;
};

export type MysteryBox = {
  id: string;
  status: "requested" | "ready" | "opened" | "rejected";
  prizeAmount: number | null;
  voucherCode: string;
  createdAt: string;
  readyAt: string | null;
};

export type CustomerRewards = {
  /** This account is a tester: spins open fast, nothing counts for real stats. */
  testMode?: boolean;
  coins: {
    balance: number;
    stampPrice: number;
    skipCost: number;
    stampsBoughtThisCard: number;
    maxStampsPerCard: number;
    expiryDays: number;
  };
  stamps: {
    enabled: boolean;
    status: "locked" | "eligible" | "requested" | "ready";
    completed: number;
    extra: number;
    target: number;
    remaining: number;
    claimMode: "auto" | "approval";
    requestedCodeMaxLength: number;
    boxRange: { min: number; max: number };
  };
  boxes: MysteryBox[];
  spins: {
    enabled: boolean;
    minOrderAmount: number;
    unlockHours: number;
    localNotify: boolean;
    wheel: WheelSegment[];
    items: SpinItem[];
    readyCount: number;
    lockedCount: number;
  };
};

export const REWARDS_KEY = ["customer", "rewards"] as const;

export function useCustomerRewardsQuery(enabled = true) {
  const signedIn = useCustomerAuthStore((state) => Boolean(state.accessToken));
  return useQuery({
    queryKey: REWARDS_KEY,
    enabled: enabled && signedIn,
    staleTime: 30_000,
    queryFn: async () => (await apiProtectedGet<CustomerRewards>("/customer/rewards")).data,
  });
}

function useInvalidateRewards() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: REWARDS_KEY });
    void queryClient.invalidateQueries({ queryKey: ["customer", "offers", "custom-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["customer", "notifications", "infinite"] });
  };
}

/** Spin (optionally paying coins to open it early). The server decides the prize. */
export function useSpinMutation() {
  const invalidate = useInvalidateRewards();
  return useMutation({
    mutationFn: async (params: { spinId: string; useCoins?: boolean }) =>
      (
        await apiProtectedPost<SpinItem>(`/customer/rewards/spins/${params.spinId}/spin`, {
          useCoins: params.useCoins === true,
        })
      ).data,
    // Refresh AFTER the wheel animation finishes (the screen calls refresh itself).
    onError: () => invalidate(),
  });
}

/** Pay coins to open a locked spin now (it doesn't spin — the customer does). */
export function useUnlockSpinMutation() {
  return useMutation({
    mutationFn: async (spinId: string) =>
      (await apiProtectedPost<SpinItem>(`/customer/rewards/spins/${spinId}/unlock`)).data,
  });
}

export function useBuyStampMutation() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateRewards();
  return useMutation({
    mutationFn: async () => (await apiProtectedPost<CustomerRewards>("/customer/rewards/stamps/buy")).data,
    onSuccess: (data) => {
      queryClient.setQueryData(REWARDS_KEY, data);
      invalidate();
    },
  });
}

export function useOpenBoxMutation() {
  return useMutation({
    mutationFn: async (boxId: string) =>
      (await apiProtectedPost<MysteryBox>(`/customer/rewards/boxes/${boxId}/open`)).data,
  });
}

export function useRefreshRewards() {
  return useInvalidateRewards();
}
