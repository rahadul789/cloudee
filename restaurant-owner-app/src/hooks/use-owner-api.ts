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

export type OwnerEnforcementStatus =
  | "active"
  | "under_review"
  | "quality_hold"
  | "temporarily_suspended"
  | "permanently_disabled";

/**
 * Owner-safe subset of the admin enforcement record (the backend strips the
 * admin-only `internalNote`, `reason` and `history` before sending it here).
 */
export type OwnerEnforcement = {
  status: OwnerEnforcementStatus;
  effectiveStatus: OwnerEnforcementStatus;
  isRestricted: boolean;
  isExpired: boolean;
  ownerNote: string;
  customerMessage: string;
  startsAt?: string | null;
  expiresAt?: string | null;
  updatedAt?: string | null;
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
  enforcement?: OwnerEnforcement;
  runtime?: {
    isOnline?: boolean;
    isVisible?: boolean;
    currentOperationalStatus?: string;
  };
  // Platform/zone ordering window. Outside it customers see this restaurant as
  // closed even while the owner is online. Evaluated live by the backend.
  serviceHours?: {
    enabled: boolean;
    isOpenNow: boolean;
    openMinute: number;
    closeMinute: number;
    openLabel: string;
    closeLabel: string;
    timezone: string;
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
  isUrgent?: boolean;
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
  ownerSharePercent?: number;
  platformSharePercent?: number;
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
  status: "Draft" | "PendingApproval" | "Active" | "Rejected";
  // Admin's note when a requested voucher is approved/rejected.
  reviewNote?: string;
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
  fundedBy: "owner" | "shared" | "platform";
  ownerSharePercent?: number;
  platformSharePercent?: number;
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

export type OwnerSalesPreset =
  | "today"
  | "yesterday"
  | "last7Days"
  | "last30Days"
  | "last90Days"
  | "thisWeek"
  | "thisMonth"
  | "lastMonth"
  | "lifetime"
  | "custom";

export type OwnerDashboardTrendPoint = {
  date: string;
  label: string;
  orders: number;
  revenue: number;
  placedValue: number;
  deliveredValue: number;
  netEarnings: number;
  activeOrders: number;
  failedOrders: number;
  failedValue: number;
  cancelledOrders: number;
  rejectedOrders: number;
};

export type OwnerDashboardTopItem = {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
};

export type OwnerDashboardSummary = {
  restaurant: {
    id: string;
    name: string;
    isOnline: boolean;
    isVisible: boolean;
    currentOperationalStatus: string;
    rating?: {
      average: number;
      count: number;
    };
  };
  filter: {
    preset: OwnerSalesPreset;
    from: string;
    to: string;
  };
  metrics: {
    totalOrders: number;
    previousTotalOrders: number;
    totalRevenue: number;
    previousTotalRevenue: number;
    placedOrderValue: number;
    previousPlacedOrderValue: number;
    deliveredOrderValue: number;
    previousDeliveredOrderValue: number;
    totalNetEarnings: number;
    previousTotalNetEarnings: number;
    cancelledOrders: number;
    previousCancelledOrders: number;
    cancelledOrderValue: number;
    previousCancelledOrderValue: number;
    rejectedOrders: number;
    previousRejectedOrders: number;
    rejectedOrderValue: number;
    previousRejectedOrderValue: number;
    pendingOrders: number;
    previousPendingOrders: number;
    completedOrders: number;
    previousCompletedOrders: number;
    averageOrderValue: number;
    previousAverageOrderValue: number;
    uniqueCustomers: number;
    nextEstimatedPayoutAt: string | null;
  };
  salesTrend: OwnerDashboardTrendPoint[];
  topItems: OwnerDashboardTopItem[];
  liveOrders?: {
    id: string;
    orderNumber: string;
    customerName: string;
    status: string;
    placedAt: string;
    value: number;
  }[];
  recentReviews?: {
    id: string;
    customerName: string;
    rating: number;
    comment: string;
    createdAt: string;
  }[];
};

export type OwnerDashboardSummaryQueryParams = {
  preset?: OwnerSalesPreset;
  from?: string;
  to?: string;
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

function buildOwnerDashboardSummaryPath(params?: OwnerDashboardSummaryQueryParams) {
  const searchParams = new URLSearchParams();
  searchParams.set("preset", params?.preset ?? "today");
  if (params?.from) searchParams.set("from", params.from);
  if (params?.to) searchParams.set("to", params.to);
  return `/owner/dashboard/summary?${searchParams.toString()}`;
}

export function useOwnerDashboardSummaryQuery(enabled = true) {
  return useQuery({
    queryKey: ["owner", "dashboard", "summary", "today"],
    enabled,
    staleTime: 10_000,
    queryFn: async () => {
      const response = await apiGet<OwnerDashboardSummary>(
        buildOwnerDashboardSummaryPath({ preset: "today" }),
      );
      return response.data;
    },
  });
}

export function useOwnerSalesReportQuery(
  enabled = true,
  params?: OwnerDashboardSummaryQueryParams,
) {
  const preset = params?.preset ?? "today";
  const from = params?.from ?? "";
  const to = params?.to ?? "";

  return useQuery({
    queryKey: ["owner", "dashboard", "summary", "sales-report", { preset, from, to }],
    enabled,
    staleTime: 10_000,
    queryFn: async () => {
      const response = await apiGet<OwnerDashboardSummary>(
        buildOwnerDashboardSummaryPath({ preset, from, to }),
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
        { ...payload, source: "owner_app" },
      );
      return response.data;
    },
    // The native Switch flips its thumb the instant it is pressed. Without writing
    // the new value into the cache straight away, the next render re-applies the
    // still-old server value and the thumb snaps back — that snap-back-then-flip is
    // the "blink". Writing optimistically keeps the flip single and smooth, and we
    // roll back if the server rejects it.
    onMutate: async ({ isOnline }) => {
      await queryClient.cancelQueries({ queryKey: ["owner", "store-settings"] });
      const previous = queryClient.getQueryData<OwnerStoreSettings>([
        "owner",
        "store-settings",
      ]);

      if (previous) {
        queryClient.setQueryData<OwnerStoreSettings>(["owner", "store-settings"], {
          ...previous,
          runtime: { ...(previous.runtime ?? {}), isOnline },
        });
      }

      return { previous };
    },
    onError: (_error, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["owner", "store-settings"], context.previous);
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["owner", "store-settings"], data);
    },
    onSettled: async () => {
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
  moderationStatus?: "visible" | "hidden" | "flagged";
  isHidden?: boolean;
  hiddenAt?: string | null;
  hiddenReason?: string;
  ownerHideRequest?: {
    status?: "none" | "pending" | "approved" | "rejected" | "cancelled";
    reasonCategory?: string;
    note?: string;
    requestedAt?: string | null;
    reviewedAt?: string | null;
    reviewedByAdminId?: string;
    adminNote?: string;
  };
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

export function useOwnerReviewHideRequestMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      reviewId: string;
      reasonCategory:
        | "fake_spam"
        | "abusive_language"
        | "wrong_restaurant_or_order"
        | "unfair_misleading"
        | "other";
      note?: string;
    }) => {
      const response = await apiPost<OwnerReview>(
        `/owner/reviews/${payload.reviewId}/hide-request`,
        {
          reasonCategory: payload.reasonCategory,
          note: payload.note ?? "",
        },
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

/**
 * Per-status order totals for the filter chips. Keyed by `OwnerOrderStatus`, plus a
 * `live` roll-up of all in-progress statuses. Independent of the current filter/paging.
 */
export type OwnerOrderStatusCounts = Partial<Record<OwnerOrderStatus, number>> & {
  live?: number;
};

export type OwnerOrderListResponse = OwnerListResponse<OwnerOrder> & {
  statusCounts?: OwnerOrderStatusCounts;
};

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
      const response = await apiGet<OwnerOrderListResponse>(
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
      preparationMinutes?: number;
    }) => {
      const response = await apiPost<OwnerOrder>(
        `/owner/orders/${payload.orderId}/transition`,
        {
          nextStatus: payload.nextStatus,
          actor: "owner",
          note: payload.note,
          preparationMinutes: payload.preparationMinutes,
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
      if (order.status === "Delivered") {
        await queryClient.invalidateQueries({ queryKey: ["owner", "payouts"] });
      }
    },
  });
}

export function useExtendOwnerOrderPreparationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { orderId: string; minutes: 5 | 10 | 15 }) => {
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
    // Same reason as the restaurant-status switch: the native Switch flips itself on
    // press, so without an immediate cache write the old server value snaps the thumb
    // back before the response lands. Patch every cached menu-items page (the key
    // carries search/sort), then roll back if the request fails.
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ["owner", "menu-items"] });
      const snapshots = queryClient.getQueriesData<OwnerListResponse<OwnerMenuItem>>({
        queryKey: ["owner", "menu-items"],
      });

      for (const [key, page] of snapshots) {
        if (!page?.items) continue;
        queryClient.setQueryData<OwnerListResponse<OwnerMenuItem>>(key, {
          ...page,
          items: page.items.map((item) =>
            item._id === payload.id ? { ...item, ...payload } : item,
          ),
        });
      }

      return { snapshots };
    },
    onError: (_error, _payload, context) => {
      for (const [key, page] of context?.snapshots ?? []) {
        queryClient.setQueryData(key, page);
      }
    },
    onSettled: async () => {
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

// One order/ledger row inside a payout — SAME endpoint the owner-web uses, so the app's
// per-payout breakdown stays 100% in sync with the web's "Included order transactions".
export type OwnerPayoutTransaction = {
  id: string;
  orderNumber: string;
  type: "earning" | "payout" | "refund";
  orderStatus: string;
  paymentMethod: string;
  paymentStatus: string;
  grossAmount: number;
  commission: number;
  discountCost: number;
  deliveryCost: number;
  netAmount: number;
  createdAt: string;
  deliveredAt: string | null;
};

// The RAW backend shape (ledger entry). Field names differ from the clean type above, so we
// MUST map — otherwise `type`/`orderNumber`/`_id` come back undefined (broke filtering + keys).
type OwnerPayoutTransactionRaw = {
  _id: string;
  orderId?: string | null;
  relatedOrderNumber?: string | null;
  relatedOrderStatus?: string | null;
  relatedOrderPaymentMethod?: string | null;
  relatedOrderPaymentStatus?: string | null;
  relatedOrderDeliveredAt?: string | null;
  relatedOrderCreatedAt?: string | null;
  payoutBatchId?: string | null;
  entryType: "earning" | "refund" | "payout" | "adjustment";
  grossAmount?: number;
  commission?: number;
  discountCost?: number;
  deliveryCost?: number;
  netAmount: number;
  settlementStatus: "pending" | "available" | "paid_out";
  createdAt: string;
};

function mapOwnerPayoutTransaction(
  entry: OwnerPayoutTransactionRaw,
): OwnerPayoutTransaction {
  return {
    id: entry._id,
    orderNumber:
      entry.relatedOrderNumber ?? entry.orderId ?? entry.payoutBatchId ?? entry._id,
    type:
      entry.entryType === "payout"
        ? "payout"
        : entry.entryType === "refund"
          ? "refund"
          : "earning",
    orderStatus: entry.relatedOrderStatus ?? "",
    paymentMethod: entry.relatedOrderPaymentMethod ?? "",
    paymentStatus: entry.relatedOrderPaymentStatus ?? "",
    grossAmount: entry.grossAmount ?? Math.max(entry.netAmount, 0),
    commission: entry.commission ?? 0,
    discountCost: entry.discountCost ?? 0,
    deliveryCost: entry.deliveryCost ?? 0,
    netAmount: entry.netAmount,
    createdAt: entry.createdAt,
    deliveredAt: entry.relatedOrderDeliveredAt ?? entry.relatedOrderCreatedAt ?? null,
  };
}

export type OwnerPayoutTransactionsResult = {
  items: OwnerPayoutTransaction[];
  total: number;
  topItems: OwnerDashboardTopItem[];
};

export function useOwnerPayoutTransactionsQuery(
  payoutId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: ["owner", "payouts", "transactions", payoutId],
    enabled: enabled && Boolean(payoutId),
    queryFn: async (): Promise<OwnerPayoutTransactionsResult> => {
      const response = await apiGet<{
        items: OwnerPayoutTransactionRaw[];
        total: number;
        topItems?: OwnerDashboardTopItem[];
      }>(`/owner/payout-transactions?payoutId=${payoutId}&pageSize=200`);
      return {
        items: (response.data.items ?? []).map(mapOwnerPayoutTransaction),
        total: response.data.total ?? 0,
        topItems: response.data.topItems ?? [],
      };
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

// ── Report issues (support cases) — same /owner/support-cases endpoint the owner web uses,
// so the app and web stay in sync (one backend, one data source).
export type OwnerSupportCase = {
  _id: string;
  kind: "report" | "question";
  subject: string;
  categoryId: string;
  message: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high";
  replies?: Array<{ message: string; adminName?: string; createdAt: string }>;
  createdAt: string;
  updatedAt: string;
};

export function useOwnerSupportCasesQuery(enabled = true) {
  return useQuery({
    queryKey: ["owner", "support-cases"],
    enabled,
    queryFn: async () => {
      const response = await apiGet<OwnerListResponse<OwnerSupportCase>>(
        "/owner/support-cases?page=1&pageSize=30",
      );
      return response.data;
    },
  });
}

export function useCreateOwnerSupportCaseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      kind: "report" | "question";
      subject: string;
      categoryId: string;
      message: string;
    }) => {
      const response = await apiPost<OwnerSupportCase>(
        "/owner/support-cases",
        payload,
      );
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["owner", "support-cases"],
      });
    },
  });
}
