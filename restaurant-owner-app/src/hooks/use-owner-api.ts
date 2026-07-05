import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  type OwnerAuthResponse,
} from "@/src/lib/api";
import { patchOwnerOrderQueryCaches } from "@/src/lib/owner-order-cache";
import { useOwnerAuthStore } from "@/src/store/auth-store";

export type OwnerListResponse<T> = {
  items: T[];
  total: number;
  unreadCount?: number;
};

export type OwnerNotification = {
  _id: string;
  id?: string;
  type: "order" | "payout" | "system" | "promotion" | "support" | "review" | string;
  eventType?: string;
  entityType?: string;
  entityId?: string;
  title: string;
  description?: string;
  actionPath?: string;
  contentType?: "text" | "image" | "image_text" | string;
  imageUrl?: string;
  isRead: boolean;
  readAt?: string | null;
  createdAt?: string;
};

type OwnerNotificationListPage = OwnerListResponse<OwnerNotification> & {
  page?: number;
  pageSize?: number;
};

export type OwnerStoreSettings = {
  id: string;
  name: string;
  description?: string;
  contact?: {
    phone?: string;
    email?: string;
  };
  preparationTimeMinutes?: number | null;
  logo?: { url?: string };
  coverImage?: { url?: string };
  runtime?: {
    isOnline?: boolean;
    isVisible?: boolean;
    currentOperationalStatus?: string;
  };
  settings?: {
    notifications?: {
      newOrder?: boolean;
      cancellation?: boolean;
      payouts?: boolean;
      support?: boolean;
    };
  };
};

export type OwnerOrderStatus =
  | "New"
  | "Accepted"
  | "Preparing"
  | "ReadyForPickup"
  | "PickedUp"
  | "Delivered"
  | "Cancelled"
  | "Rejected";

export type OwnerOrder = {
  _id: string;
  orderNumber: string;
  status: OwnerOrderStatus;
  paymentMethod: string;
  createdAt?: string;
  updatedAt?: string;
  pricing?: {
    subtotal?: number;
    deliveryFee?: number;
    discountAmount?: number;
    ownerDiscountCost?: number;
    platformDiscountCost?: number;
    restaurantSubtotal?: number;
    restaurantNetSales?: number;
    customerPaidTotal?: number;
    ownerVisibleDiscount?: number;
    total?: number;
  };
  appliedVouchers?: {
    id?: string;
    code?: string;
    name?: string;
    type?: string;
    fundedBy?: string;
    discountAmount?: number;
    totalDiscountAmount?: number;
    ownerDiscountCost?: number;
  }[];
  customerSnapshot?: {
    fullName?: string;
    phone?: string;
    deliveryAddress?: {
      label?: string;
      addressLine?: string;
      details?: string;
      district?: string;
      area?: string;
    };
  };
  itemsSnapshot?: {
    itemId?: string;
    name?: string;
    quantity?: number;
    unitPrice?: number;
    selectedVariantOptions?: { groupName: string; optionLabel: string }[];
    selectedAddOnOptions?: { groupName: string; optionLabel: string }[];
  }[];
  timestamps?: Record<string, string | undefined>;
  autoCancel?: {
    enabled: boolean;
    applies: boolean;
    ownerAcceptanceTimeoutMinutes?: number;
    autoCancelAt: string | null;
    remainingSeconds: number | null;
  };
  lateState?: {
    isLate?: boolean;
    reason?: string;
    label?: string;
    tone?: "default" | "warning" | "critical" | string;
    lateBySeconds?: number;
    thresholdMinutes?: number | null;
  };
  preparationMeta?: {
    autoStarted?: boolean;
  };
  preparationTiming?: {
    phase:
      | "not_started"
      | "accepted"
      | "preparing"
      | "preparing_late"
      | "completed";
    label: string;
    baseMinutes: number;
    extraMinutes: number;
    totalMinutes: number;
    maxExtraMinutes: number;
    startedAt: string | null;
    targetStartAt: string | null;
    targetReadyAt: string | null;
    remainingSeconds: number | null;
    lateBySeconds: number;
    canExtend: boolean;
    extensionOptions: number[];
    autoStarted: boolean;
  };
  history?: {
    status: OwnerOrderStatus;
    actor: "owner" | "customer" | "system" | "rider";
    note?: string;
    createdAt: string;
  }[];
};

export type OwnerMenuItem = {
  _id: string;
  categoryId: string;
  name: string;
  description?: string;
  status: "active" | "archived";
  availability?: "available" | "unavailable";
  basePrice: number;
  isPopular?: boolean;
  recommendedItemIds?: string[];
  images?: { url?: string }[];
};

export type OwnerVoucher = {
  _id: string;
  fundedBy: "owner" | "platform" | "shared";
  stackingRule: "exclusive" | "stackable";
  mode: "auto" | "coupon";
  type: "flat" | "percentage" | "free_delivery";
  name: string;
  code?: string;
  discountValue?: number | null;
  minimumOrderAmount?: number | null;
  maxTotalUses?: number | null;
  maxUsesPerUser?: number | null;
  allowRepeatUsage?: boolean;
  status: "Draft" | "Active";
  applicability: "all" | "categories" | "items";
  categoryIds?: string[];
  itemIds?: string[];
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
  analytics?: {
    totalUses: number;
    appliedCount: number;
    deliveredCount: number;
    uniqueUsers: number;
    repeatUsage: number;
    totalDiscountGiven: number;
    totalOrdersUsingVoucher: number;
    revenueGenerated: number;
    remainingUsage: number | null;
    totalDeliveryCostCovered: number;
  };
};

export type OwnerVoucherPayload = {
  fundedBy: "owner";
  stackingRule: "exclusive";
  mode: "auto" | "coupon";
  type: "flat" | "percentage";
  name: string;
  code?: string;
  discountValue?: number;
  minimumOrderAmount?: number;
  maxTotalUses?: number;
  maxUsesPerUser?: number;
  allowRepeatUsage?: boolean;
  status: "Draft" | "Active";
  applicability: "all";
  categoryIds?: string[];
  itemIds?: string[];
  startsAt: string;
  endsAt: string;
};

export type OwnerDashboardSummary = {
  restaurant: {
    id: string;
    name: string;
    isOnline: boolean;
    isVisible: boolean;
    currentOperationalStatus: string;
  };
  metrics: {
    totalOrders: number;
    totalRevenue: number;
    totalNetEarnings: number;
    pendingOrders: number;
    completedOrders: number;
    averageOrderValue: number;
    nextEstimatedPayoutAt: string | null;
  };
};

export type OwnerPayoutSummary = {
  pendingBalance: number;
  availableBalance: number;
  paidOutBalance: number;
  requestedPayoutBalance: number;
  lifetimeGrossAmount?: number;
  lifetimeNetEarnings: number;
  lifetimeCommission?: number;
  lifetimeDiscountCost?: number;
  lifetimeDeliveryCost?: number;
  nextSettlementAvailableAt: string | null;
  minimumPayoutAmountTaka?: number;
  oneActivePayoutRequest?: boolean;
  hasActivePayoutRequest?: boolean;
  lastPayout?: {
    _id?: string;
    amount: number;
    status: string;
    requestedAt: string;
    processedAt?: string | null;
  } | null;
  payoutMethod?: {
    _id: string;
    type: "bkash" | "bank";
    accountName: string;
    accountNumber: string;
    bankName?: string;
    branchName?: string;
    isVerified?: boolean;
    pendingType?: "bkash" | "bank" | null;
    pendingAccountName?: string;
    pendingAccountNumber?: string | null;
    pendingVerificationStatus?: "otp_pending" | "admin_pending" | "rejected" | null;
    pendingVerifiedAt?: string | null;
    pendingAdminNote?: string;
  } | null;
};

export type OwnerPayoutMethodResponse = {
  payoutMethod: NonNullable<OwnerPayoutSummary["payoutMethod"]>;
  verificationSessionId: string | null;
  expiresInSeconds?: number;
  resendAvailableInSeconds?: number;
};

export type OwnerPayoutHistory = {
  _id: string;
  amount: number;
  status: "pending" | "processing" | "completed" | "failed";
  batchReference?: string;
  failureReason?: string;
  providerReference?: string;
  providerPayoutId?: string;
  providerTransactionId?: string;
  paymentProofUrl?: string;
  processingNote?: string;
  requestedAt: string;
  processedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OwnerPlatformContent = {
  operations?: {
    ownerApp?: {
      webDashboardUrl?: string;
      showCustomerPhoneNumbers?: boolean;
    };
  };
};

export type OwnerOtpSessionResponse = {
  verificationSessionId: string;
  expiresInSeconds?: number;
  resendAvailableInSeconds?: number;
  otpSent?: boolean;
  mockCode?: string | null;
};

export type OwnerOtpVerifyResponse = {
  verified: boolean;
  purpose: string;
  nextStatus?: string;
};

export function useOwnerSigninMutation() {
  const setSession = useOwnerAuthStore((state) => state.setSession);

  return useMutation({
    mutationFn: async (payload: { phone: string; password: string }) => {
      const response = await apiPost<OwnerAuthResponse>(
        "/auth/owner/signin",
        payload,
        false,
      );
      return response.data;
    },
    onSuccess: (data) => {
      setSession({
        owner: data.owner,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        restaurantLifecycleStatus: data.restaurantLifecycleStatus,
      });
    },
  });
}

export function useOwnerOtpSigninStartMutation() {
  return useMutation({
    mutationFn: async (payload: { phone: string }) => {
      const response = await apiPost<OwnerOtpSessionResponse>(
        "/auth/owner/otp/signin/start",
        payload,
        false,
      );
      return response.data;
    },
  });
}

export function useOwnerOtpSigninVerifyMutation() {
  const setSession = useOwnerAuthStore((state) => state.setSession);

  return useMutation({
    mutationFn: async (payload: { verificationSessionId: string; otpCode: string }) => {
      const response = await apiPost<OwnerAuthResponse>(
        "/auth/owner/otp/signin/verify",
        payload,
        false,
      );
      return response.data;
    },
    onSuccess: (data) => {
      setSession({
        owner: data.owner,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        restaurantLifecycleStatus: data.restaurantLifecycleStatus,
      });
    },
  });
}

export function useOwnerPasswordResetStartMutation() {
  return useMutation({
    mutationFn: async (payload: { phone: string }) => {
      const response = await apiPost<OwnerOtpSessionResponse>(
        "/auth/owner/password/forgot",
        payload,
        false,
      );
      return response.data;
    },
  });
}

export function useOwnerOtpVerifyMutation() {
  return useMutation({
    mutationFn: async (payload: { verificationSessionId: string; otpCode: string }) => {
      const response = await apiPost<OwnerOtpVerifyResponse>(
        "/auth/otp/verify",
        payload,
        false,
      );
      return response.data;
    },
  });
}

export function useOwnerPasswordResetMutation() {
  return useMutation({
    mutationFn: async (payload: { verificationSessionId: string; newPassword: string }) => {
      const response = await apiPost<{ reset: boolean }>(
        "/auth/password/reset",
        payload,
        false,
      );
      return response.data;
    },
  });
}

export function useOwnerLogoutMutation() {
  const clearSession = useOwnerAuthStore((state) => state.clearSession);
  const refreshToken = useOwnerAuthStore((state) => state.refreshToken);
  const registeredPushToken = useOwnerAuthStore((state) => state.registeredPushToken);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (registeredPushToken) {
        const query = encodeURIComponent(registeredPushToken);
        await apiDelete(`/owner/push-tokens?expoPushToken=${query}`).catch(() => null);
      }

      if (!refreshToken) return null;
      const response = await apiPost<{ revoked: boolean }>("/auth/owner/logout", {
        refreshToken,
      });
      return response.data;
    },
    onSettled: () => {
      queryClient.clear();
      clearSession();
    },
  });
}

export function useOwnerStoreSettingsQuery(enabled = true) {
  return useQuery({
    queryKey: ["owner", "store-settings"],
    enabled,
    queryFn: async () => {
      const response = await apiGet<OwnerStoreSettings>("/owner/store-settings");
      return response.data;
    },
  });
}

export function useOwnerDashboardSummaryQuery(enabled = true) {
  return useQuery({
    queryKey: ["owner", "dashboard", "summary", "today"],
    enabled,
    staleTime: 10_000,
    queryFn: async () => {
      const response = await apiGet<OwnerDashboardSummary>(
        "/owner/dashboard/summary?preset=today",
      );
      return response.data;
    },
  });
}

export function useUpdateOwnerRestaurantStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { isOnline: boolean }) => {
      const response = await apiPatch<OwnerStoreSettings>(
        "/owner/restaurant-status",
        payload,
      );
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["owner", "store-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["owner", "dashboard"] });
    },
  });
}

export function useUpdateOwnerStoreSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { phone?: string; preparationTimeMinutes?: number | null }) => {
      const response = await apiPatch<OwnerStoreSettings>(
        "/owner/store-settings",
        payload,
      );
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["owner", "store-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["owner", "dashboard"] });
    },
  });
}

export type OwnerReview = {
  _id: string;
  id?: string;
  rating: number;
  comment?: string;
  orderId?: string;
  riderRating?: number | null;
  riderComment?: string;
  createdAt?: string;
  ownerReply?: {
    message?: string;
    createdAt?: string | null;
    updatedAt?: string | null;
  };
};

export function useOwnerReviewsQuery(enabled = true, pageSize = 20) {
  return useQuery({
    queryKey: ["owner", "reviews", pageSize],
    enabled,
    staleTime: 15_000,
    queryFn: async () => {
      const response = await apiGet<OwnerListResponse<OwnerReview>>(
        `/owner/reviews?page=1&pageSize=${pageSize}`,
      );
      return response.data;
    },
  });
}

export function useOwnerReviewReplyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { reviewId: string; message: string }) => {
      const response = await apiPost<OwnerReview>(
        `/owner/reviews/${payload.reviewId}/reply`,
        { message: payload.message },
      );
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["owner", "reviews"] });
    },
  });
}

export function useOwnerVouchersQuery(enabled = true) {
  return useQuery({
    queryKey: ["owner", "vouchers"],
    enabled,
    queryFn: async () => {
      const response = await apiGet<OwnerListResponse<OwnerVoucher>>(
        "/owner/vouchers?page=1&pageSize=50&sortBy=newestUpdated",
      );
      return response.data;
    },
  });
}

export function useCreateOwnerVoucherMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: OwnerVoucherPayload) => {
      const response = await apiPost<OwnerVoucher>("/owner/vouchers", payload);
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["owner", "vouchers"] });
      await queryClient.invalidateQueries({ queryKey: ["owner", "store-settings"] });
    },
  });
}

export function useUpdateOwnerVoucherMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { id: string; body: Partial<OwnerVoucherPayload> }) => {
      const response = await apiPatch<OwnerVoucher>(
        `/owner/vouchers/${payload.id}`,
        payload.body,
      );
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["owner", "vouchers"] });
      await queryClient.invalidateQueries({ queryKey: ["owner", "store-settings"] });
    },
  });
}

export function useDeleteOwnerVoucherMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (voucherId: string) => {
      const response = await apiDelete<{ deleted: true }>(`/owner/vouchers/${voucherId}`);
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["owner", "vouchers"] });
      await queryClient.invalidateQueries({ queryKey: ["owner", "store-settings"] });
    },
  });
}

export function useOwnerOrdersQuery(
  enabled = true,
  params?: {
    tab?: "live" | "history";
    status?: string;
    pageSize?: number;
  },
) {
  const searchParams = new URLSearchParams();
  if (params?.tab) searchParams.set("tab", params.tab);
  if (params?.status) searchParams.set("status", params.status);
  if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize));
  const query = searchParams.toString();

  return useQuery({
    queryKey: ["owner", "orders", params ?? {}],
    enabled,
    refetchInterval: enabled ? 20_000 : false,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
    queryFn: async () => {
      const response = await apiGet<OwnerListResponse<OwnerOrder>>(
        `/owner/orders${query ? `?${query}` : ""}`,
      );
      return response.data;
    },
  });
}

export function useOwnerOrderDetailsQuery(orderId?: string) {
  return useQuery({
    queryKey: ["owner", "orders", "details", orderId],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const response = await apiGet<OwnerOrder>(`/owner/orders/${orderId}`);
      return response.data;
    },
  });
}

export function useOwnerOrderTransitionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      orderId: string;
      nextStatus: "Accepted" | "Rejected" | "Preparing" | "ReadyForPickup" | "Cancelled";
      note?: string;
    }) => {
      const response = await apiPost<OwnerOrder>(
        `/owner/orders/${payload.orderId}/transition`,
        {
          nextStatus: payload.nextStatus,
          actor: "owner",
          note: payload.note,
        },
      );
      return response.data;
    },
    onSuccess: async (order) => {
      patchOwnerOrderQueryCaches(queryClient, order);
      await queryClient.invalidateQueries({ queryKey: ["owner", "orders"] });
      await queryClient.invalidateQueries({
        queryKey: ["owner", "orders", "details", order._id],
      });
      await queryClient.invalidateQueries({ queryKey: ["owner", "dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["owner", "payouts"] });
    },
  });
}

export function useExtendOwnerOrderPreparationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { orderId: string; minutes: 5 | 10 }) => {
      const response = await apiPost<OwnerOrder>(
        `/owner/orders/${payload.orderId}/preparation/extend`,
        {
          minutes: payload.minutes,
        },
      );
      return response.data;
    },
    onSuccess: async (order) => {
      patchOwnerOrderQueryCaches(queryClient, order);
      await queryClient.invalidateQueries({ queryKey: ["owner", "orders"] });
      await queryClient.invalidateQueries({
        queryKey: ["owner", "orders", "details", order._id],
      });
      await queryClient.invalidateQueries({ queryKey: ["owner", "dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["owner", "payouts"] });
    },
  });
}

export type OwnerMenuSort = "nameAsc" | "priceLow" | "priceHigh";

export function useOwnerMenuItemsQuery(
  enabled = true,
  params?: {
    search?: string;
    sortBy?: OwnerMenuSort;
  },
) {
  const search = params?.search?.trim() ?? "";
  const sortBy = params?.sortBy ?? "nameAsc";
  const query = new URLSearchParams({
    pageSize: "80",
    sortBy,
    ...(search ? { search } : {}),
  }).toString();

  return useQuery({
    queryKey: ["owner", "menu-items", { search, sortBy }],
    enabled,
    queryFn: async () => {
      const response = await apiGet<OwnerListResponse<OwnerMenuItem>>(
        `/owner/menu-items?${query}`,
      );
      return response.data;
    },
  });
}

export function useUpdateOwnerMenuItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      id: string;
      availability?: "available" | "unavailable";
      recommendedItemIds?: string[];
    }) => {
      const { id, ...body } = payload;
      const response = await apiPatch<OwnerMenuItem>(
        `/owner/menu-items/${id}`,
        body,
      );
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["owner", "menu-items"] });
    },
  });
}

export function useOwnerPayoutSummaryQuery(enabled = true) {
  return useQuery({
    queryKey: ["owner", "payouts", "summary"],
    enabled,
    queryFn: async () => {
      const response = await apiGet<OwnerPayoutSummary>("/owner/payouts/summary");
      return response.data;
    },
  });
}

export function useOwnerPayoutHistoryQuery(enabled = true, pageSize = 8) {
  return useQuery({
    queryKey: ["owner", "payouts", "history", { pageSize }],
    enabled,
    queryFn: async () => {
      const response = await apiGet<OwnerListResponse<OwnerPayoutHistory>>(
        `/owner/payouts/history?page=1&pageSize=${pageSize}`,
      );
      return response.data;
    },
  });
}

export function useRequestOwnerPayoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiPost<OwnerPayoutHistory>(
        "/owner/payouts/request",
        {},
      );
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["owner", "payouts"] });
      await queryClient.invalidateQueries({ queryKey: ["owner", "dashboard"] });
    },
  });
}

export function useUpdateOwnerPayoutMethodMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      type: "bkash";
      accountName: string;
      accountNumber: string;
    }) => {
      const response = await apiPut<OwnerPayoutMethodResponse>(
        "/owner/payout-method",
        payload,
      );
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["owner", "payouts"] });
    },
  });
}

export function useOwnerPlatformContentQuery(enabled = true) {
  return useQuery({
    queryKey: ["public", "content", "owner-app"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const response = await apiGet<OwnerPlatformContent>("/public/content");
      return response.data;
    },
  });
}

export function useOwnerNotificationsQuery(enabled = true, pageSize = 1) {
  return useQuery({
    queryKey: ["owner", "notifications", "summary", pageSize],
    enabled,
    refetchInterval: enabled ? 20_000 : false,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const response = await apiGet<OwnerListResponse<OwnerNotification>>(
        `/owner/notifications?pageSize=${pageSize}`,
      );
      return response.data;
    },
  });
}

export function useOwnerNotificationsInfiniteQuery(enabled = true, pageSize = 20) {
  return useInfiniteQuery<OwnerNotificationListPage>({
    queryKey: ["owner", "notifications", "infinite", pageSize],
    enabled,
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce(
        (total, page) => total + (page.items?.length ?? 0),
        0,
      );
      return loaded >= (lastPage.total ?? loaded) ? undefined : allPages.length + 1;
    },
    refetchInterval: enabled ? 20_000 : false,
    refetchIntervalInBackground: false,
    queryFn: async ({ pageParam }) => {
      const response = await apiGet<OwnerNotificationListPage>(
        `/owner/notifications?page=${Number(pageParam)}&pageSize=${pageSize}`,
      );
      return response.data;
    },
  });
}

export function useMarkOwnerNotificationReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await apiPatch<OwnerNotification>(
        `/owner/notifications/${notificationId}/read`,
        {},
      );
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["owner", "notifications"] });
    },
  });
}

export function useMarkAllOwnerNotificationsReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiPatch<{ updated: boolean }>(
        "/owner/notifications/read-all",
        {},
      );
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["owner", "notifications"] });
    },
  });
}

export function useRegisterOwnerPushTokenMutation() {
  return useMutation({
    mutationFn: async (body: {
      expoPushToken: string;
      platform: "android" | "ios";
      deviceId?: string;
      appVersion?: string;
      language?: "bn" | "en";
    }) => {
      const response = await apiPost<{ registered: boolean }>(
        "/owner/push-tokens",
        body,
      );
      return response.data;
    },
  });
}

export function useUnregisterOwnerPushTokenMutation() {
  return useMutation({
    mutationFn: async (body: { expoPushToken: string }) => {
      const query = encodeURIComponent(body.expoPushToken);
      const response = await apiDelete<{ removed: boolean }>(
        `/owner/push-tokens?expoPushToken=${query}`,
      );
      return response.data;
    },
  });
}
