import { useEffect } from "react";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiProtectedGet,
  apiProtectedPost,
} from "@/src/lib/api";
import {
  clearRegisteredCustomerPushToken,
  getRegisteredCustomerPushToken,
} from "@/src/lib/customer-push-token-store";
import { buildQueryString, compactQueryParams } from "@/src/lib/query-params";
import type { SavedLocationServiceArea } from "@/src/types/location";
import type {
  CustomerHomeCms,
  CustomerDiscoveryHome,
  CustomerRestaurantDetails,
  DiscoverableRestaurantsPage,
  DiscoverableRestaurant,
} from "@/src/types/restaurant";
import { useAppBannerStore } from "@/src/store/app-banner-store";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { buildCartItemKey, useCartStore } from "@/src/store/cart-store";
import {
  resolvePlatformMapStyle,
  type CustomerMapStyleContext,
  type PlatformMapStyleSettings,
} from "@/src/lib/map-style";

type NearbyRestaurantsParams = {
  latitude?: number;
  longitude?: number;
  // Optional on purpose: when omitted, the backend applies the admin-configured
  // fallback radius (operations.serviceArea.radiusKm) or the resolved service
  // zone. The app must NOT send a hardcoded ceiling, otherwise the server's
  // min(appRadius, adminRadius) clamp would silently cap the admin's range.
  radiusKm?: number;
  search?: string;
};

type RestaurantDiscoveryPageParams = NearbyRestaurantsParams & {
  pageSize?: number;
  filter?: "all" | "open" | "offers" | "featured";
  sortBy?: "nearest" | "fastest" | "topRated";
  minimumRating?: number;
  maximumLowestPrice?: number;
};

type CustomerSavedLocationResponse = {
  id: string;
  label: string;
  address: string;
  addressDetails?: string;
  latitude: number;
  longitude: number;
  source: "gps" | "manual" | "saved";
  isDefault?: boolean;
  serviceArea?: SavedLocationServiceArea | null;
  lastUsedAt?: string | null;
};

type CustomerFavoriteToggleResponse = {
  restaurantId: string;
  isFavorite: boolean;
  favoriteRestaurantIds: string[];
};

export type CustomerPaymentSettings = {
  cashOnDeliveryEnabled: boolean;
  bkashEnabled: boolean;
  bkashLabel: string;
  bkashSubtitle: string;
  bkashRefundEtaMinutes: number;
};

type PlatformContentResponse = {
  customerApp?: {
    homeCms?: Partial<CustomerHomeCms>;
  };
  operations?: {
    payments?: Partial<CustomerPaymentSettings>;
    mapStyles?: PlatformMapStyleSettings;
    reviewRequests?: {
      riderReviewEnabled?: boolean;
    };
  };
};

async function fetchCustomerPlatformContent() {
  const response = await apiGet<PlatformContentResponse>("/public/content");
  return response.data;
}

function buildRestaurantDetailsSeed(
  restaurant: DiscoverableRestaurant,
  activeOffers: CustomerDiscoveryHome["activeOffers"] = []
): CustomerRestaurantDetails {
  return {
    restaurant,
    categories: [],
    menuItems: [],
    activeOffers,
    recentReviews: [],
  };
}

function findCachedRestaurantDetailsSeed(
  queryClient: QueryClient,
  restaurantId: string
) {
  const nearbyQueries = queryClient.getQueriesData<DiscoverableRestaurant[]>({
    queryKey: ["customer", "nearby-restaurants"],
  });
  const favoriteQueries = queryClient.getQueriesData<DiscoverableRestaurant[]>({
    queryKey: ["customer", "favorite-restaurants"],
  });

  for (const [, restaurants] of [...nearbyQueries, ...favoriteQueries]) {
    const restaurant = restaurants?.find((item) => item._id === restaurantId);
    if (restaurant) return buildRestaurantDetailsSeed(restaurant);
  }

  const homeQueries = queryClient.getQueriesData<CustomerDiscoveryHome>({
    queryKey: ["customer", "discovery-home"],
  });
  for (const [, home] of homeQueries) {
    if (!home) continue;
    const restaurant = [
      ...(home.featuredRestaurants ?? []),
      ...(home.restaurantsWithOffers ?? []),
      ...(home.discoverNewRestaurants ?? []),
      ...(home.popularNearYouRestaurants ?? []),
    ].find((item) => item._id === restaurantId);
    if (!restaurant) continue;

    const activeOffers = (home.activeOffers ?? []).filter(
      (offer) => !offer.restaurantId || offer.restaurantId === restaurantId
    );
    return buildRestaurantDetailsSeed(restaurant, activeOffers);
  }

  return undefined;
}

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
    promotions?: boolean;
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

export type CustomerReferralReward = {
  referredCustomerName: string;
  referredAt: string | null;
  status:
    | "pending"
    | "rewarded"
    | "capped"
    | "disabled"
    | "under_review"
    | "rejected";
  rewardedAt: string | null;
  skippedAt?: string | null;
  skippedReason?: string;
  rewardOrderId: string;
  voucher: {
    id: string;
    code: string;
    amount: number;
    minimumOrderAmount: number;
    expiresAt: string | null;
    status: string;
  } | null;
};

export type CustomerReferralSummary = {
  enabled: boolean;
  referralCode: string;
  canApplyReferralCode?: boolean;
  referralCodeIneligibleReason?: string;
  shareLink?: string;
  shareMessage?: string;
  rewardAmount: number;
  minimumOrderAmount: number;
  rewardExpiryDays: number;
  monthlyRewardCap: number;
  monthlyRewardCount: number;
  totalReferrals: number;
  pendingReferrals: number;
  rewardedReferrals: number;
  cappedReferrals?: number;
  disabledReferrals?: number;
  underReviewReferrals?: number;
  rejectedReferrals?: number;
  rewards: CustomerReferralReward[];
};

export function useCustomerProfileQuery(enabled = true) {
  const isAuthenticated = useCustomerAuthStore((state) => Boolean(state.accessToken));
  const updateCustomerProfile = useCustomerAuthStore((state) => state.updateCustomerProfile);

  const query = useQuery({
    queryKey: ["customer", "profile"],
    enabled: enabled && isAuthenticated,
    queryFn: async () => {
      const response = await apiProtectedGet<{ customer: CustomerProfile }>("/customer/profile");
      return response.data.customer;
    },
  });

  useEffect(() => {
    if (query.data) {
      updateCustomerProfile(query.data);
    }
  }, [query.data, updateCustomerProfile]);

  return query;
}

export function useCustomerReferralSummaryQuery(enabled = true) {
  const isAuthenticated = useCustomerAuthStore((state) => Boolean(state.accessToken));

  return useQuery({
    queryKey: ["customer", "referrals", "summary"],
    enabled: enabled && isAuthenticated,
    queryFn: async () => {
      const response = await apiProtectedGet<CustomerReferralSummary>(
        "/customer/referrals/summary"
      );
      return response.data;
    },
  });
}

export function useCustomerApplyReferralCodeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: { referralCode: string; installId?: string }) => {
      const response = await apiProtectedPost<{
        applied: boolean;
        referralCode: string;
        referrerName: string;
        message: string;
      }>("/customer/referrals/apply", body);
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["customer", "referrals", "summary"],
      });
      await queryClient.invalidateQueries({ queryKey: ["customer", "profile"] });
    },
  });
}

export type CustomerCustomOfferSummary = {
  status: "locked" | "eligible" | "requested" | "ready";
  enabled?: boolean;
  profileSectionEnabled?: boolean;
  completedOrderCount: number;
  targetOrderCount: number;
  requestedCodeMaxLength: number;
  remainingOrderCount: number;
  progressRatio: number;
  requestedAt?: string | null;
  expectedReadyAt?: string | null;
  fulfilledAt?: string | null;
  requestedCode?: string;
  voucherId?: string;
  voucherCode?: string;
  voucherLabel?: string;
  voucherExpiresAt?: string | null;
};

export function useCustomerCustomOfferSummaryQuery(enabled = true) {
  const isAuthenticated = useCustomerAuthStore((state) => Boolean(state.accessToken));

  return useQuery({
    queryKey: ["customer", "offers", "custom-summary"],
    enabled: enabled && isAuthenticated,
    staleTime: 60_000,
    queryFn: async () => {
      const response = await apiProtectedGet<CustomerCustomOfferSummary>(
        "/customer/offers/custom-summary"
      );
      return response.data;
    },
  });
}

export function useCustomerCustomOfferRequestMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: { requestedCode?: string } = {}) => {
      const response = await apiProtectedPost<CustomerCustomOfferSummary>(
        "/customer/offers/custom-request",
        body
      );
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["customer", "offers", "custom-summary"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["customer", "notifications", "infinite"],
      });
    },
  });
}

export type CustomerNotification = {
  id: string;
  type: string;
  title: string;
  description: string;
  path: string;
  campaignId?: string;
  campaignVariant?: string;
  ctaLabel?: string;
  ctaPath?: string;
  contentType?: "text" | "image" | "image_text" | string;
  imageUrl?: string;
  voucherId?: string;
  voucherCode?: string;
  voucherLabel?: string;
  voucherExpiresAt?: string | null;
  voucherMinOrder?: number | null;
  voucherUsageStatus?: "available" | "used" | "expired" | "info";
  voucherAppliedAt?: string | null;
  voucherOrderId?: string;
  isOfferDisabled?: boolean;
  personalOffer?: boolean;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

type CustomerNotificationListResponse = {
  items: CustomerNotification[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage: number | null;
};

export type CustomerSupportCaseAttachment = {
  url: string;
  publicId?: string;
  fileName?: string;
  fileType?: string;
};

export type CustomerSupportCaseMessage = {
  id: string;
  senderType: "customer" | "admin";
  senderName: string;
  message: string;
  createdAt: string;
  attachments: CustomerSupportCaseAttachment[];
};

export type CustomerSupportCase = {
  id: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  subject: string;
  createdAt: string;
  updatedAt: string;
  messages: CustomerSupportCaseMessage[];
};

export function useNearbyRestaurantsQuery(
  params: NearbyRestaurantsParams & { enabled?: boolean },
) {
  const query = buildQueryString(
    compactQueryParams({
      latitude: typeof params.latitude === "number" ? params.latitude : undefined,
      longitude: typeof params.longitude === "number" ? params.longitude : undefined,
      radiusKm: params.radiusKm,
      search: params.search?.trim(),
    })
  );

  return useQuery({
    queryKey: ["customer", "nearby-restaurants", query],
    // `enabled` lets the caller skip this call entirely when the Nearby home
    // section is turned off in admin — an inactive section makes no API call.
    enabled:
      params.enabled !== false &&
      typeof params.latitude === "number" &&
      typeof params.longitude === "number",
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const response = await apiGet<DiscoverableRestaurant[]>(
        `/customer/restaurants?${query}`
      );
      return response.data;
    },
  });
}

export function useRestaurantDiscoveryInfiniteQuery(
  params: RestaurantDiscoveryPageParams,
  enabled = true,
) {
  const baseQuery = compactQueryParams({
    latitude: typeof params.latitude === "number" ? params.latitude : undefined,
    longitude: typeof params.longitude === "number" ? params.longitude : undefined,
    radiusKm: params.radiusKm,
    search: params.search?.trim(),
    pageSize: params.pageSize ?? 12,
    filter: params.filter && params.filter !== "all" ? params.filter : undefined,
    sortBy: params.sortBy,
    minimumRating: params.minimumRating,
    maximumLowestPrice: params.maximumLowestPrice,
  });
  const queryKey = buildQueryString(baseQuery);

  return useInfiniteQuery({
    queryKey: ["customer", "restaurant-discovery-pages", queryKey],
    enabled:
      enabled &&
      typeof params.latitude === "number" &&
      typeof params.longitude === "number",
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const query = buildQueryString({
        ...baseQuery,
        page: pageParam,
      });
      const response = await apiGet<DiscoverableRestaurantsPage>(
        `/customer/restaurants/search?${query}`,
      );
      return response.data;
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.nextPage : undefined,
  });
}

export function useCustomerDiscoveryHomeQuery(params: {
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  enabled?: boolean;
}) {
  const query = buildQueryString(
    compactQueryParams({
      latitude: typeof params.latitude === "number" ? params.latitude : undefined,
      longitude: typeof params.longitude === "number" ? params.longitude : undefined,
      radiusKm: typeof params.radiusKm === "number" ? params.radiusKm : undefined,
    })
  );

  return useQuery({
    queryKey: ["customer", "discovery-home", query],
    enabled: params.enabled !== false,
    placeholderData: keepPreviousData,
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const response = await apiGet<CustomerDiscoveryHome>(
        `/customer/discovery/home${query ? `?${query}` : ""}`
      );
      return response.data;
    },
  });
}

export function useCustomerPaymentSettingsQuery() {
  return useQuery({
    queryKey: ["platform-content"],
    staleTime: 5 * 60_000,
    queryFn: fetchCustomerPlatformContent,
    select: (content) => {
      const payments = content.operations?.payments ?? {};
      return {
        cashOnDeliveryEnabled: payments.cashOnDeliveryEnabled !== false,
        bkashEnabled: payments.bkashEnabled === true,
        bkashLabel: payments.bkashLabel || "bKash",
        bkashSubtitle:
          payments.bkashSubtitle || "Continue to the official hosted payment page.",
        bkashRefundEtaMinutes:
          typeof payments.bkashRefundEtaMinutes === "number"
            ? payments.bkashRefundEtaMinutes
            : 60,
      } satisfies CustomerPaymentSettings;
    },
  });
}

export function useCustomerRiderReviewEnabledQuery() {
  return useQuery({
    queryKey: ["platform-content"],
    staleTime: 5 * 60_000,
    queryFn: fetchCustomerPlatformContent,
    select: (content) =>
      content.operations?.reviewRequests?.riderReviewEnabled !== false,
  });
}

export function useCustomerMapStyleQuery(context: CustomerMapStyleContext) {
  return useQuery({
    queryKey: ["platform-content"],
    staleTime: 5 * 60_000,
    queryFn: fetchCustomerPlatformContent,
    select: (content) => resolvePlatformMapStyle(content.operations?.mapStyles, context),
  });
}

export function useCustomerHowToOrderGuideQuery(enabled = true) {
  return useQuery({
    queryKey: ["platform-content"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: fetchCustomerPlatformContent,
    select: (content) => content.customerApp?.homeCms?.howToOrderGuide ?? null,
  });
}

export function useCustomerRestaurantDetailsQuery(params: {
  restaurantId?: string;
  latitude?: number;
  longitude?: number;
}) {
  const queryClient = useQueryClient();
  const query = buildQueryString(
    compactQueryParams({
      latitude: typeof params.latitude === "number" ? params.latitude : undefined,
      longitude: typeof params.longitude === "number" ? params.longitude : undefined,
    })
  );

  return useQuery({
    queryKey: ["customer", "restaurant-details", params.restaurantId, query],
    enabled: Boolean(params.restaurantId),
    initialData: () =>
      params.restaurantId
        ? findCachedRestaurantDetailsSeed(queryClient, params.restaurantId)
        : undefined,
    initialDataUpdatedAt: 0,
    placeholderData: (previousData) =>
      previousData?.restaurant?._id === params.restaurantId
        ? previousData
        : undefined,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const response = await apiGet<CustomerRestaurantDetails>(
        `/customer/restaurants/${params.restaurantId}${query ? `?${query}` : ""}`
      );
      return response.data;
    },
  });
}

export function useCustomerSavedLocationsQuery(enabled = true) {
  const isAuthenticated = useCustomerAuthStore((state) => Boolean(state.accessToken));

  return useQuery({
    queryKey: ["customer", "saved-locations"],
    enabled: enabled && isAuthenticated,
    queryFn: async () => {
      const response = await apiProtectedGet<CustomerSavedLocationResponse[]>(
        "/customer/locations"
      );
      return response.data;
    },
  });
}

export function useCustomerFavoriteRestaurantIdsQuery(enabled = true) {
  const isAuthenticated = useCustomerAuthStore((state) => Boolean(state.accessToken));

  return useQuery({
    queryKey: ["customer", "favorite-restaurant-ids"],
    enabled: enabled && isAuthenticated,
    queryFn: async () => {
      const response = await apiProtectedGet<string[]>(
        "/customer/favorites/restaurants"
      );
      return response.data;
    },
  });
}

export function useCustomerFavoriteRestaurantsQuery(params?: {
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
}) {
  const isAuthenticated = useCustomerAuthStore((state) => Boolean(state.accessToken));
  const query = buildQueryString(
    compactQueryParams({
      latitude: typeof params?.latitude === "number" ? params.latitude : undefined,
      longitude: typeof params?.longitude === "number" ? params.longitude : undefined,
      radiusKm: typeof params?.radiusKm === "number" ? params.radiusKm : undefined,
    })
  );

  return useQuery({
    queryKey: ["customer", "favorite-restaurants", query],
    enabled: isAuthenticated,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const response = await apiProtectedGet<DiscoverableRestaurant[]>(
        `/customer/favorites/restaurants/cards${query ? `?${query}` : ""}`
      );
      return response.data;
    },
  });
}

export function useCustomerNotificationsQuery(enabled = true) {
  const isAuthenticated = useCustomerAuthStore((state) => Boolean(state.accessToken));

  return useQuery({
    queryKey: ["customer", "notifications", "summary"],
    enabled: enabled && isAuthenticated,
    queryFn: async () => {
      const response = await apiProtectedGet<CustomerNotificationListResponse>(
        "/customer/notifications?page=1&limit=20"
      );
      return response.data;
    },
  });
}

export function useCustomerNotificationsInfiniteQuery(
  enabled = true,
  limit = 20,
  category: "all" | "orders" | "offers" | "personal_offers" = "all",
) {
  const isAuthenticated = useCustomerAuthStore((state) => Boolean(state.accessToken));

  return useInfiniteQuery({
    queryKey: ["customer", "notifications", "infinite", limit, category],
    enabled: enabled && isAuthenticated,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const response = await apiProtectedGet<CustomerNotificationListResponse>(
        `/customer/notifications?page=${pageParam}&limit=${limit}&category=${category}`
      );
      return response.data;
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextPage : undefined),
  });
}

export function useCustomerNotificationCampaignQuery(campaignId?: string, enabled = true) {
  const isAuthenticated = useCustomerAuthStore((state) => Boolean(state.accessToken));

  return useQuery({
    queryKey: ["customer", "notifications", "campaign", campaignId],
    enabled: enabled && isAuthenticated && Boolean(campaignId),
    queryFn: async () => {
      const response = await apiProtectedGet<CustomerNotification | null>(
        `/customer/notifications/campaigns/${encodeURIComponent(campaignId ?? "")}`
      );
      return response.data;
    },
  });
}

export function useCustomerNotificationQuery(notificationId?: string, enabled = true) {
  const isAuthenticated = useCustomerAuthStore((state) => Boolean(state.accessToken));

  return useQuery({
    queryKey: ["customer", "notifications", "item", notificationId],
    enabled: enabled && isAuthenticated && Boolean(notificationId),
    queryFn: async () => {
      const response = await apiProtectedGet<CustomerNotification | null>(
        `/customer/notifications/${encodeURIComponent(notificationId ?? "")}`
      );
      return response.data;
    },
  });
}

export function useCustomerLatestSupportCaseQuery(enabled = true) {
  const isAuthenticated = useCustomerAuthStore((state) => Boolean(state.accessToken));

  return useQuery({
    queryKey: ["customer", "support-case", "latest"],
    enabled: enabled && isAuthenticated,
    queryFn: async () => {
      const response = await apiProtectedGet<CustomerSupportCase | null>(
        "/customer/support-cases/latest"
      );
      return response.data;
    },
  });
}

export function useCustomerSupportCaseQuery(caseId?: string, enabled = true) {
  const isAuthenticated = useCustomerAuthStore((state) => Boolean(state.accessToken));

  return useQuery({
    queryKey: ["customer", "support-case", caseId],
    enabled: enabled && isAuthenticated && Boolean(caseId),
    queryFn: async () => {
      const response = await apiProtectedGet<CustomerSupportCase>(
        `/customer/support-cases/${caseId}`
      );
      return response.data;
    },
  });
}

export function useCustomerCreateSupportCaseMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: {
      message: string;
      attachments?: CustomerSupportCaseAttachment[];
    }) => {
      const response = await apiProtectedPost<CustomerSupportCase>(
        "/customer/support-cases",
        body
      );
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["customer", "support-case", "latest"], data);
      queryClient.setQueryData(["customer", "support-case", data.id], data);
    },
  });
}

export function useCustomerSupportCaseMessageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      supportCaseId: string;
      message: string;
      attachments?: CustomerSupportCaseAttachment[];
    }) => {
      const response = await apiProtectedPost<CustomerSupportCase>(
        `/customer/support-cases/${params.supportCaseId}/messages`,
        {
          message: params.message,
          attachments: params.attachments,
        }
      );
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["customer", "support-case", "latest"], data);
      queryClient.setQueryData(["customer", "support-case", data.id], data);
    },
  });
}

type CartQuoteItemPayload = {
  itemId: string;
  quantity: number;
  selectedVariantOptions?: { groupName: string; optionLabel: string }[];
  selectedAddOnOptions?: { groupName: string; optionLabel: string }[];
};

type OrderSnapshotSelection = {
  groupName?: string;
  optionLabel?: string;
};

export type CartQuoteResponse = {
  restaurant: {
    id: string;
    name: string;
    orderNote?: {
      enabled: boolean;
      label: string;
      placeholder: string;
    };
  };
  serviceArea?: {
    districtId?: string;
    districtName?: string;
    zoneId?: string;
    zoneName?: string;
    radiusKm?: number;
  } | null;
  items: {
    itemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    markdownPerUnit?: number;
    effectiveUnitPrice?: number;
    effectiveLineTotal?: number;
    appliedMarkdownRuleId?: string;
    selectedVariantOptions: { groupName: string; optionLabel: string }[];
    selectedAddOnOptions: { groupName: string; optionLabel: string }[];
  }[];
  pricing: {
    subtotal: number;
    menuMarkdownAmount?: number;
    deliveryFee: number;
    rainSurcharge?: number;
    discountAmount: number;
    total: number;
  };
  appliedVouchers: {
    id: string;
    code?: string;
    name: string;
    type: string;
    mode: string;
    discountAmount?: number;
  }[];
};

type BkashInitiateResponse = {
  sessionId: string;
  paymentID: string;
  bkashURL: string;
  amount: number;
  walletNumber: string;
  expiresAt: string;
};

export function useCustomerCartQuoteQuery(params: {
  restaurantId?: string | null;
  items: CartQuoteItemPayload[];
  voucherCode?: string;
  latitude?: number;
  longitude?: number;
  requiresLocation?: boolean;
}) {
  const itemsKey = JSON.stringify(params.items);
  const accessToken = useCustomerAuthStore((state) => state.accessToken);
  const hasPinnedLocation =
    typeof params.latitude === "number" && typeof params.longitude === "number";

  return useQuery({
    queryKey: [
      "customer",
      "cart-quote",
      params.restaurantId ?? null,
      params.voucherCode ?? null,
      params.latitude ?? null,
      params.longitude ?? null,
      itemsKey,
      Boolean(accessToken),
      Boolean(params.requiresLocation),
    ],
    enabled:
      Boolean(params.restaurantId) &&
      params.items.length > 0 &&
      (!params.requiresLocation || hasPinnedLocation),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const request = accessToken ? apiProtectedPost : apiPost;
      const response = await request<CartQuoteResponse>("/customer/cart/quote", {
        restaurantId: params.restaurantId,
        items: params.items,
        voucherCode: params.voucherCode,
        latitude: typeof params.latitude === "number" ? params.latitude : undefined,
        longitude: typeof params.longitude === "number" ? params.longitude : undefined,
      });
      return response.data;
    },
  });
}

type CustomerAuthResponse = {
  accessToken: string;
  refreshToken: string;
  customer: CustomerProfile;
};

const CUSTOMER_HISTORY_ORDERS_PAGE_SIZE = 10;
const CUSTOMER_LIVE_ORDER_STATUSES = [
  "New",
  "Accepted",
  "Preparing",
  "ReadyForPickup",
  "PickedUp",
];

type CustomerOrderResponse = {
  _id: string;
  restaurantId?: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  paymentStatus?: string;
  terminalReason?: string;
  cancelledBy?: string;
  note?: string;
  paymentSnapshot?: {
    provider?: string;
    sessionId?: string;
    paymentAttemptId?: string;
    paymentID?: string;
    transactionId?: string;
    walletNumber?: string;
    confirmedAt?: string | null;
    refundStatus?: string;
    refundNote?: string;
    refundRequestedAt?: string | null;
    refundReviewedAt?: string | null;
    refundEtaMinutes?: number;
  };
  customerSnapshot?: {
    id?: string;
    fullName?: string;
    phone?: string;
    deliveryAddress?: {
      label?: string;
      addressLine?: string;
      addressDetails?: string;
      latitude?: number | null;
      longitude?: number | null;
    };
  };
  pricing?: {
    subtotal?: number;
    deliveryFee?: number;
    discountAmount?: number;
    total?: number;
  };
  riderSnapshot?: {
    id?: string;
    name?: string;
    phone?: string;
    vehicleType?: string;
  };
  riderTracking?: {
    isActive?: boolean;
    isFocused?: boolean;
    startedAt?: string;
    lastUpdatedAt?: string;
    freshness?: {
      lastUpdatedAt?: string | null;
      ageSeconds?: number | null;
      isFresh?: boolean;
      isStale?: boolean;
      state?: "live" | "stale" | "unavailable";
    };
    remainingDistanceKm?: number;
    directDistanceKm?: number;
    remainingDurationMinutes?: number;
    queueEtaMinutes?: number;
    queuePosition?: number;
    speedKmph?: number;
    isNearCustomer?: boolean;
    nearCustomerNotifiedAt?: string | null;
    currentLocation?: {
      latitude?: number;
      longitude?: number;
      heading?: number | null;
      accuracyMeters?: number | null;
    };
  };
  routeToCustomer?: {
    distanceKm: number;
    durationMinutes: number;
    polyline: string;
    provider: "google" | "haversine";
    trafficAware: boolean;
  } | null;
  itemsSnapshot?: {
    itemId?: string;
    name?: string;
    quantity?: number;
    unitPrice?: number;
    selectedVariantOptions?: OrderSnapshotSelection[];
    selectedAddOnOptions?: OrderSnapshotSelection[];
  }[];
  history?: {
    status: string;
    actor: string;
    note?: string;
    createdAt: string;
  }[];
  timestamps?: {
    placedAt?: string;
    acceptedAt?: string;
    preparingAt?: string;
    readyForPickupAt?: string;
    pickedUpAt?: string;
    deliveredAt?: string;
    cancelledAt?: string;
  };
  customerReview?: {
    id: string;
    rating: number;
    comment?: string;
    createdAt?: string;
    ownerReply?: {
      message: string;
      createdAt?: string | null;
      updatedAt?: string | null;
    } | null;
  } | null;
  hasCustomerReview?: boolean;
  createdAt: string;
};

type CustomerReorderInput = Pick<
  CustomerOrderResponse,
  "_id" | "orderNumber" | "restaurantId" | "itemsSnapshot"
>;

type CustomerReorderResult =
  | {
      status: "conflict";
      incomingRestaurantName: string;
      currentRestaurantName: string;
      previewItemName: string;
    }
  | {
      status: "empty";
      skippedCount: number;
      skippedNames: string[];
    }
  | {
      status: "success";
      restaurantId: string;
      restaurantName: string;
      addedItemCount: number;
      skippedCount: number;
      skippedNames: string[];
    };

function upsertCustomerOrderList(
  current: CustomerOrderResponse[] | undefined,
  nextOrder: CustomerOrderResponse
) {
  const list = current ?? [];
  const exists = list.some((order) => order._id === nextOrder._id);

  const updated = exists
    ? list.map((order) => (order._id === nextOrder._id ? nextOrder : order))
    : [nextOrder, ...list];

  return [...updated].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

function isCustomerLiveOrderStatus(status: string) {
  return CUSTOMER_LIVE_ORDER_STATUSES.includes(status);
}

function upsertCustomerLiveOrderList(
  current: CustomerOrderResponse[] | undefined,
  nextOrder: CustomerOrderResponse
) {
  if (!isCustomerLiveOrderStatus(nextOrder.status)) {
    return (current ?? []).filter((order) => order._id !== nextOrder._id);
  }

  return upsertCustomerOrderList(current, nextOrder);
}

type CustomerPhoneStartResponse = {
  flow: "password" | "otp";
  phone: string;
  verificationSessionId?: string;
  expiresInSeconds?: number;
  resendAvailableInSeconds?: number;
  customer?: {
    fullName?: string;
    email?: string;
  } | null;
};

export type CustomerAuthLocationSnapshot = {
  label?: string;
  address?: string;
  addressDetails?: string;
  latitude?: number;
  longitude?: number;
  source?: "gps" | "manual" | "saved";
  serviceArea?: SavedLocationServiceArea | null;
};

export function useCustomerPhoneStartMutation() {
  return useMutation({
    mutationFn: async (params: { phone: string; useOtp?: boolean }) => {
      const response = await apiPost<CustomerPhoneStartResponse>(
        "/customer/auth/phone/start",
        params
      );
      return response.data;
    },
  });
}

export function useCustomerPasswordSigninMutation() {
  const setSession = useCustomerAuthStore((state) => state.setSession);

  return useMutation({
    mutationFn: async (params: {
      phone: string;
      password: string;
      installId?: string;
      currentLocation?: CustomerAuthLocationSnapshot;
    }) => {
      const response = await apiPost<CustomerAuthResponse>(
        "/customer/auth/phone/password",
        params
      );
      return response.data;
    },
    onSuccess: (data) => {
      setSession({
        customer: data.customer,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
    },
  });
}

type CustomerPasswordResetStartResponse = {
  verificationSessionId: string;
  phone: string;
  expiresInSeconds?: number;
  resendAvailableInSeconds?: number;
};

export function useCustomerPasswordResetStartMutation() {
  return useMutation({
    mutationFn: async (params: { phone: string }) => {
      const response = await apiPost<CustomerPasswordResetStartResponse>(
        "/customer/auth/password/forgot",
        params
      );
      return response.data;
    },
  });
}

export function useCustomerPasswordResetOtpVerifyMutation() {
  return useMutation({
    mutationFn: async (params: {
      verificationSessionId: string;
      otpCode: string;
    }) => {
      const response = await apiPost<{
        verificationSessionId: string;
        phone: string;
        expiresInSeconds: number;
        resendAvailableInSeconds?: number;
      }>("/customer/auth/password/otp/verify", params);
      return response.data;
    },
  });
}

export function useCustomerPasswordResetMutation() {
  return useMutation({
    mutationFn: async (params: {
      verificationSessionId: string;
      newPassword: string;
    }) => {
      const response = await apiPost<{ reset: boolean; phone: string }>(
        "/customer/auth/password/reset",
        params
      );
      return response.data;
    },
  });
}

export function useCustomerPasswordUpdateMutation() {
  const queryClient = useQueryClient();
  const updateCustomerProfile = useCustomerAuthStore((state) => state.updateCustomerProfile);

  return useMutation({
    mutationFn: async (params: {
      currentPassword?: string;
      newPassword: string;
    }) => {
      const response = await apiPatch<{
        customer: CustomerProfile;
      }>("/customer/profile/password", params);
      return response.data;
    },
    onSuccess: (data) => {
      updateCustomerProfile(data.customer);
      queryClient.setQueryData(["customer", "profile"], data.customer);
    },
  });
}

export function useCustomerPhoneOtpVerifyMutation() {
  return useMutation({
    mutationFn: async (params: {
      verificationSessionId: string;
      otpCode: string;
    }) => {
      const response = await apiPost<{
        verificationSessionId: string;
        phone: string;
        expiresInSeconds: number;
        resendAvailableInSeconds?: number;
      }>("/customer/auth/phone/otp/verify", params);
      return response.data;
    },
  });
}

export function useCustomerPhoneVerifyMutation() {
  const setSession = useCustomerAuthStore((state) => state.setSession);

  return useMutation({
    mutationFn: async (params: {
      verificationSessionId: string;
      fullName?: string;
      email?: string;
      password?: string;
      referralCode?: string;
      installId?: string;
      currentLocation?: CustomerAuthLocationSnapshot;
    }) => {
      const response = await apiPost<CustomerAuthResponse>(
        "/customer/auth/phone/verify",
        params
      );
      return response.data;
    },
    onSuccess: (data) => {
      setSession({
        customer: data.customer,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
    },
  });
}

export function useCustomerPhoneChangeStartMutation() {
  return useMutation({
    mutationFn: async (params: { phone: string }) => {
      const response = await apiProtectedPost<{
        verificationSessionId: string;
        expiresInSeconds: number;
        resendAvailableInSeconds?: number;
      }>("/customer/auth/phone-change/start", params);
      return response.data;
    },
  });
}

export function useCustomerPhoneChangeVerifyMutation() {
  const updateCustomerProfile = useCustomerAuthStore((state) => state.updateCustomerProfile);

  return useMutation({
    mutationFn: async (params: {
      verificationSessionId: string;
      otpCode: string;
    }) => {
      const response = await apiProtectedPost<{
        customer: CustomerProfile;
      }>("/customer/auth/phone-change/verify", params);
      return response.data;
    },
    onSuccess: (data) => {
      updateCustomerProfile(data.customer);
    },
  });
}

export function useCustomerProfileUpdateMutation() {
  const queryClient = useQueryClient();
  const updateCustomerProfile = useCustomerAuthStore((state) => state.updateCustomerProfile);

  return useMutation({
    mutationFn: async (params: {
      fullName?: string;
      email?: string;
      profileImage?: {
        url?: string;
        publicId?: string;
      };
      notificationSettings?: {
        orderUpdates?: boolean;
        restaurantStatus?: boolean;
        reviewReplies?: boolean;
        promotions?: boolean;
      };
    }) => {
      const response = await apiPatch<{
        customer: CustomerProfile;
      }>("/customer/profile", params);
      return response.data;
    },
    onSuccess: (data) => {
      updateCustomerProfile(data.customer);
      queryClient.setQueryData(["customer", "profile"], data.customer);
      useAppBannerStore.getState().showBanner({
        title: "Profile updated",
        description: "Your account details were saved successfully.",
        tone: "success",
      });
    },
  });
}

export function useCustomerMediaUploadSignatureMutation() {
  return useMutation({
    mutationFn: async (body: { folder: string; resourceType?: string }) => {
      const response = await apiProtectedPost<{
        cloudName: string;
        folder: string;
        timestamp: number;
        signature: string;
        apiKey: string;
        resourceType: string;
      }>("/media/upload-signature", body);
      return response.data;
    },
  });
}

export function useCustomerMediaDeleteMutation() {
  return useMutation({
    mutationFn: async (body: { publicId: string; resourceType?: string }) => {
      const response = await apiProtectedPost<{ deleted: boolean }>(
        "/media/delete",
        body,
      );
      return response.data;
    },
  });
}

export function useCustomerOrdersQuery(enabled = true) {
  const isAuthenticated = useCustomerAuthStore((state) => Boolean(state.accessToken));

  return useQuery({
    queryKey: ["customer", "orders"],
    enabled: enabled && isAuthenticated,
    queryFn: async () => {
      const response = await apiProtectedGet<CustomerOrderResponse[]>(
        "/customer/orders"
      );
      return response.data;
    },
  });
}

export function useCustomerLiveOrdersQuery(enabled = true) {
  const isAuthenticated = useCustomerAuthStore((state) => Boolean(state.accessToken));

  return useQuery({
    queryKey: ["customer", "orders", "live"],
    enabled: enabled && isAuthenticated,
    staleTime: 15_000,
    queryFn: async () => {
      const response = await apiProtectedGet<CustomerOrderResponse[]>(
        "/customer/orders?page=1&pageSize=10&statusGroup=live"
      );
      return response.data;
    },
  });
}

export function useCustomerHistoryOrdersInfiniteQuery(
  enabled = true,
  pageSize = CUSTOMER_HISTORY_ORDERS_PAGE_SIZE,
) {
  const isAuthenticated = useCustomerAuthStore((state) => Boolean(state.accessToken));

  return useInfiniteQuery({
    queryKey: ["customer", "orders", "history", pageSize],
    enabled: enabled && isAuthenticated,
    initialPageParam: 1,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async ({ pageParam }) => {
      const response = await apiProtectedGet<CustomerOrderResponse[]>(
        `/customer/orders?page=${pageParam}&pageSize=${pageSize}&statusGroup=history`
      );
      return response.data;
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < pageSize ? undefined : allPages.length + 1,
  });
}

export function useCustomerHistoryOrdersPreviewQuery(
  enabled = true,
  pageSize = 6,
) {
  const isAuthenticated = useCustomerAuthStore((state) => Boolean(state.accessToken));

  return useQuery({
    queryKey: ["customer", "orders", "history", "preview", pageSize],
    enabled: enabled && isAuthenticated,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const response = await apiProtectedGet<CustomerOrderResponse[]>(
        `/customer/orders?page=1&pageSize=${pageSize}&statusGroup=history`
      );
      return response.data;
    },
  });
}

export function useCustomerActiveOrderQuery(enabled = true) {
  const isAuthenticated = useCustomerAuthStore((state) => Boolean(state.accessToken));

  return useQuery({
    queryKey: ["customer", "orders", "active"],
    enabled: enabled && isAuthenticated,
    // Socket-primary: the socket pushes order.updated into this cache in real
    // time, so this poll is only a slow fallback for when the socket is down.
    // (Previously 10s everywhere, which kept the whole app busy during a live
    // order. The fast, map-grade refresh now lives only on the tracking screen.)
    refetchInterval: (query) => (query.state.data ? 45_000 : false),
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const response = await apiProtectedGet<CustomerOrderResponse[]>(
        "/customer/orders?page=1&pageSize=1&statusGroup=live"
      );
      return response.data[0] ?? null;
    },
  });
}

export function useCustomerOrderPresenceQuery(enabled = true) {
  const isAuthenticated = useCustomerAuthStore((state) => Boolean(state.accessToken));

  return useQuery({
    queryKey: ["customer", "orders", "presence"],
    enabled: enabled && isAuthenticated,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const [response, completedResponse] = await Promise.all([
        apiProtectedGet<CustomerOrderResponse[]>(
          "/customer/orders?page=1&pageSize=1"
        ),
        apiProtectedGet<CustomerOrderResponse[]>(
          "/customer/orders?page=1&pageSize=1&status=Delivered"
        ),
      ]);
      return {
        hasOrders: response.data.length > 0,
        hasCompletedOrders: completedResponse.data.length > 0,
      };
    },
  });
}

export function useCustomerOrderDetailsQuery(orderId?: string) {
  const isAuthenticated = useCustomerAuthStore((state) => Boolean(state.accessToken));

  return useQuery({
    queryKey: ["customer", "orders", orderId],
    enabled: Boolean(orderId) && isAuthenticated,
    staleTime: 15_000,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    // Realtime order/rider updates arrive through the customer socket bridge.
    // The tracking screen owns the socket-aware fallback poll, so this shared
    // details query should not keep polling while the socket is healthy.
    queryFn: async () => {
      const response = await apiProtectedGet<CustomerOrderResponse>(
        `/customer/orders/${orderId}`
      );
      return response.data;
    },
  });
}

export function useCustomerPlaceOrderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: {
      restaurantId: string;
      clientOrderId?: string;
      items: CartQuoteItemPayload[];
      paymentMethod: string;
      voucherCode?: string;
      paymentReference?: {
        provider?: "Bkash";
        bkashSessionId?: string;
        walletNumber?: string;
      };
      note?: string;
      deliveryAddress: {
        label: string;
        addressLine: string;
        addressDetails?: string;
        latitude?: number | null;
        longitude?: number | null;
      };
    }) => {
      const response = await apiProtectedPost<{
        order: CustomerOrderResponse;
        quote: CartQuoteResponse;
      }>("/customer/orders", body);
      return response.data;
    },
    onSuccess: async (data) => {
      const order = data.order;
      queryClient.setQueryData<CustomerOrderResponse[]>(["customer", "orders"], (current) =>
        upsertCustomerOrderList(current, order)
      );
      queryClient.setQueryData<CustomerOrderResponse[]>(["customer", "orders", "live"], (current) =>
        upsertCustomerLiveOrderList(current, order)
      );
      queryClient.setQueryData<CustomerOrderResponse | null>(
        ["customer", "orders", "active"],
        (current) =>
          isCustomerLiveOrderStatus(order.status)
            ? order
            : current?._id === order._id
              ? null
              : current ?? null,
      );
      queryClient.setQueryData(["customer", "orders", order._id], order);
      await queryClient.invalidateQueries({ queryKey: ["customer", "orders"] });
    },
  });
}

export function useBkashInitiateMutation() {
  return useMutation({
    mutationFn: async (body: {
      restaurantId: string;
      clientOrderId?: string;
      items: CartQuoteItemPayload[];
      voucherCode?: string;
      note?: string;
      walletNumber: string;
      deliveryAddress: {
        label: string;
        addressLine: string;
        addressDetails?: string;
        latitude: number;
        longitude: number;
      };
    }) => {
      const response = await apiProtectedPost<BkashInitiateResponse>(
        "/customer/payments/bkash/initiate",
        body
      );
      return response.data;
    },
  });
}

export function useCustomerSaveLocationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: {
      label: string;
      address: string;
      addressDetails?: string;
      latitude: number;
      longitude: number;
      source?: "gps" | "manual" | "saved";
      isDefault?: boolean;
    }) => {
      const response = await apiProtectedPost<CustomerSavedLocationResponse[]>(
        "/customer/locations",
        body
      );
      return response.data;
    },
    onSuccess: async (locations) => {
      queryClient.setQueryData(["customer", "saved-locations"], locations);
    },
  });
}

export function useCustomerToggleFavoriteRestaurantMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (restaurantId: string) => {
      const response = await apiProtectedPost<CustomerFavoriteToggleResponse>(
        `/customer/favorites/restaurants/${restaurantId}/toggle`
      );
      return response.data;
    },
    onMutate: async (restaurantId) => {
      const queryKey = ["customer", "favorite-restaurant-ids"] as const;
      await queryClient.cancelQueries({ queryKey });
      const previousFavoriteIds =
        queryClient.getQueryData<string[]>(queryKey) ?? [];

      const nextFavoriteIds = previousFavoriteIds.includes(restaurantId)
        ? previousFavoriteIds.filter((id) => id !== restaurantId)
        : [...previousFavoriteIds, restaurantId];

      queryClient.setQueryData(queryKey, nextFavoriteIds);

      return { previousFavoriteIds };
    },
    onError: (_error, _restaurantId, context) => {
      if (context?.previousFavoriteIds) {
        queryClient.setQueryData(
          ["customer", "favorite-restaurant-ids"],
          context.previousFavoriteIds
        );
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(
        ["customer", "favorite-restaurant-ids"],
        data.favoriteRestaurantIds
      );
    },
  });
}

export function useCustomerSetDefaultLocationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (locationId: string) => {
      const response = await apiPatch<CustomerSavedLocationResponse[]>(
        `/customer/locations/${locationId}/default`,
        {}
      );
      return response.data;
    },
    onSuccess: async (locations) => {
      queryClient.setQueryData(["customer", "saved-locations"], locations);
    },
  });
}

export function useCustomerUpdateLocationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      locationId: string;
      label?: string;
      address?: string;
      addressDetails?: string;
      latitude?: number;
      longitude?: number;
      source?: "gps" | "manual" | "saved";
      isDefault?: boolean;
    }) => {
      const response = await apiPatch<CustomerSavedLocationResponse[]>(
        `/customer/locations/${params.locationId}`,
        {
          label: params.label,
          address: params.address,
          addressDetails: params.addressDetails,
          latitude: params.latitude,
          longitude: params.longitude,
          source: params.source,
          isDefault: params.isDefault,
        }
      );
      return response.data;
    },
    onSuccess: async (locations) => {
      queryClient.setQueryData(["customer", "saved-locations"], locations);
    },
  });
}

export function useCustomerTouchLocationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (locationId: string) => {
      const response = await apiPatch<CustomerSavedLocationResponse[]>(
        `/customer/locations/${locationId}/touch`,
        { lastUsed: true }
      );
      return response.data;
    },
    onSuccess: async (locations) => {
      queryClient.setQueryData(["customer", "saved-locations"], locations);
    },
  });
}

export function useCustomerDeleteLocationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (locationId: string) => {
      const response = await apiDelete<CustomerSavedLocationResponse[]>(
        `/customer/locations/${locationId}`
      );
      return response.data;
    },
    onSuccess: async (locations) => {
      queryClient.setQueryData(["customer", "saved-locations"], locations);
    },
  });
}

export function useCustomerCancelOrderMutation(orderId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body?: { reason?: string }) => {
      if (!orderId) {
        throw new Error("Order id is required to cancel the order.");
      }

      const response = await apiProtectedPost<CustomerOrderResponse>(
        `/customer/orders/${orderId}/cancel`,
        body ?? {}
      );
      return response.data;
    },
    onSuccess: async (order) => {
      queryClient.setQueryData<CustomerOrderResponse[]>(["customer", "orders"], (current) =>
        upsertCustomerOrderList(current, order)
      );
      queryClient.setQueryData(["customer", "orders", orderId], order);
      await queryClient.invalidateQueries({ queryKey: ["customer", "orders"] });
    },
  });
}

export function useCustomerReviewMutation(orderId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: {
      rating: number;
      comment?: string;
      riderRating?: number;
      riderComment?: string;
    }) => {
      if (!orderId) {
        throw new Error("Order id is required to submit a review.");
      }

      const response = await apiProtectedPost<{
        _id: string;
        restaurantId: string;
        customerId: string;
        orderId: string;
        rating: number;
        comment: string;
        ownerReply?: {
          message?: string;
          createdAt?: string | null;
          updatedAt?: string | null;
        };
        createdAt: string;
      }>(`/customer/orders/${orderId}/review`, body);
      return response.data;
    },
    onSuccess: (review) => {
      useAppBannerStore.getState().showBanner({
        title: "Review submitted",
        description: "Thanks for sharing your feedback. The restaurant can now review it.",
        tone: "success",
        path: orderId ? `/orders/${orderId}/tracking` : undefined,
        actionLabel: orderId ? "View order" : undefined,
      });

      if (!orderId) return;

      // Surgical, in-place cache update instead of invalidating the whole
      // ["customer","orders"] tree. A blanket invalidate refetches the paginated
      // history list, and during that multi-page refetch the just-reviewed order
      // can shift across a page boundary and appear twice → duplicate React key.
      // Flipping the single order in place avoids the refetch entirely.
      const customerReview = {
        id: review._id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        ownerReply: null,
      };
      const markReviewed = (
        order: CustomerOrderResponse | null | undefined,
      ): CustomerOrderResponse | null | undefined =>
        order && order._id === orderId
          ? { ...order, hasCustomerReview: true, customerReview }
          : order;

      queryClient.setQueryData<CustomerOrderResponse | null>(
        ["customer", "orders", orderId],
        (current) => markReviewed(current) ?? null,
      );
      queryClient.setQueryData<CustomerOrderResponse | null>(
        ["customer", "orders", "active"],
        (current) => markReviewed(current) ?? null,
      );
      for (const listKey of [["customer", "orders"], ["customer", "orders", "live"]]) {
        queryClient.setQueryData<CustomerOrderResponse[]>(listKey, (current) =>
          Array.isArray(current)
            ? current.map((order) => markReviewed(order) as CustomerOrderResponse)
            : current,
        );
      }
      // History is an infinite query keyed with a pageSize suffix; match any.
      queryClient.setQueriesData<{
        pages: CustomerOrderResponse[][];
        pageParams: unknown[];
      }>({ queryKey: ["customer", "orders", "history"] }, (current) =>
        current?.pages
          ? {
              ...current,
              pages: current.pages.map((page) =>
                page.map((order) => markReviewed(order) as CustomerOrderResponse),
              ),
            }
          : current,
      );

      // Refresh ONLY the single order detail (authoritative server fields) —
      // exact:true so the paginated lists are never refetched.
      void queryClient.invalidateQueries({
        queryKey: ["customer", "orders", orderId],
        exact: true,
      });
    },
  });
}

function sanitizeSelections(selections: OrderSnapshotSelection[] | undefined) {
  return (selections ?? []).filter(
    (selection): selection is { groupName: string; optionLabel: string } =>
      Boolean(selection.groupName?.trim()) && Boolean(selection.optionLabel?.trim())
  );
}

function isSelectionCountValid(
  count: number,
  group: { minSelect?: number; maxSelect?: number }
) {
  const minSelect = group.minSelect ?? 0;
  const maxSelect = group.maxSelect ?? Number.POSITIVE_INFINITY;
  return count >= minSelect && count <= maxSelect;
}

export function useCustomerReorderMutation() {
  const setCart = useCartStore((state) => state.setCart);
  const setReorderContext = useCartStore((state) => state.setReorderContext);

  return useMutation({
    mutationFn: async (params: {
      order: CustomerReorderInput;
      forceReplace?: boolean;
    }): Promise<CustomerReorderResult> => {
      const restaurantId = params.order.restaurantId;
      const snapshotItems = params.order.itemsSnapshot ?? [];

      if (!restaurantId || !snapshotItems.length) {
        return { status: "empty", skippedCount: snapshotItems.length, skippedNames: [] };
      }

      const detailsResponse = await apiGet<CustomerRestaurantDetails>(
        `/customer/restaurants/${restaurantId}`
      );
      const details = detailsResponse.data;

      const menuItemMap = new Map(details.menuItems.map((item) => [item._id, item]));
      const imageMap = new Map(
        details.menuItems.map((item) => [item._id, item.images?.[0]?.url ?? null] as const)
      );

      const skippedNames: string[] = [];
      const reorderCandidates: (CartQuoteItemPayload & {
        name: string;
        imageUrl?: string | null;
      })[] = [];

      for (const snapshotItem of snapshotItems) {
        const itemId = snapshotItem.itemId?.trim();
        const quantity = Math.max(0, snapshotItem.quantity ?? 0);

        if (!itemId || quantity <= 0) {
          continue;
        }

        const menuItem = menuItemMap.get(itemId);
        if (!menuItem || menuItem.availability === "unavailable") {
          skippedNames.push(snapshotItem.name?.trim() || "Menu item");
          continue;
        }

        const selectedVariantOptions = sanitizeSelections(snapshotItem.selectedVariantOptions);
        const selectedAddOnOptions = sanitizeSelections(snapshotItem.selectedAddOnOptions);

        const validVariantSelections = selectedVariantOptions.filter((selection) => {
          const group = menuItem.variants?.find((entry) => entry.name === selection.groupName);
          return Boolean(
            group?.options.some((option) => option.label === selection.optionLabel)
          );
        });

        const validAddOnSelections = selectedAddOnOptions.filter((selection) => {
          const group = menuItem.addOnGroups?.find((entry) => entry.name === selection.groupName);
          return Boolean(
            group?.options.some((option) => option.label === selection.optionLabel)
          );
        });

        const hasInvalidVariantGroup = (menuItem.variants ?? []).some((group) => {
          const groupCount = validVariantSelections.filter(
            (selection) => selection.groupName === group.name
          ).length;
          return !isSelectionCountValid(groupCount, group);
        });

        const hasInvalidAddOnGroup = (menuItem.addOnGroups ?? []).some((group) => {
          const groupCount = validAddOnSelections.filter(
            (selection) => selection.groupName === group.name
          ).length;
          return !isSelectionCountValid(groupCount, group);
        });

        if (hasInvalidVariantGroup || hasInvalidAddOnGroup) {
          skippedNames.push(snapshotItem.name?.trim() || menuItem.name);
          continue;
        }

        reorderCandidates.push({
          itemId: menuItem._id,
          name: menuItem.name,
          quantity,
          imageUrl: imageMap.get(menuItem._id) ?? null,
          selectedVariantOptions: validVariantSelections,
          selectedAddOnOptions: validAddOnSelections,
        });
      }

      if (!reorderCandidates.length) {
        return {
          status: "empty",
          skippedCount: skippedNames.length,
          skippedNames,
        };
      }

      const currentCart = useCartStore.getState();
      if (
        !params.forceReplace &&
        currentCart.restaurant &&
        currentCart.restaurant.restaurantId !== restaurantId &&
        currentCart.items.length > 0
      ) {
        return {
          status: "conflict",
          incomingRestaurantName: details.restaurant.name,
          currentRestaurantName: currentCart.restaurant.restaurantName,
          previewItemName: reorderCandidates[0]?.name ?? "Selected item",
        };
      }

      const mergedItems = new Map<
        string,
        CartQuoteItemPayload & { name: string; imageUrl?: string | null }
      >();

      for (const candidate of reorderCandidates) {
        const key = buildCartItemKey({
          itemId: candidate.itemId,
          name: candidate.name,
          imageUrl: candidate.imageUrl ?? null,
          quantity: 1,
          unitPrice: 0,
          selectedVariantOptions: candidate.selectedVariantOptions ?? [],
          selectedAddOnOptions: candidate.selectedAddOnOptions ?? [],
        });

        const existing = mergedItems.get(key);
        if (existing) {
          existing.quantity += candidate.quantity;
        } else {
          mergedItems.set(key, { ...candidate });
        }
      }

      const quoteResponse = await apiPost<CartQuoteResponse>("/customer/cart/quote", {
        restaurantId,
        items: Array.from(mergedItems.values()).map((item) => ({
          itemId: item.itemId,
          quantity: item.quantity,
          selectedVariantOptions: item.selectedVariantOptions ?? [],
          selectedAddOnOptions: item.selectedAddOnOptions ?? [],
        })),
      });

      const quotedItems = quoteResponse.data.items;
      const mergedImageMap = new Map<string, string | null>();

      for (const item of reorderCandidates) {
        mergedImageMap.set(
          buildCartItemKey({
            itemId: item.itemId,
            name: item.name,
            imageUrl: item.imageUrl ?? null,
            quantity: 1,
            unitPrice: 0,
            selectedVariantOptions: item.selectedVariantOptions ?? [],
            selectedAddOnOptions: item.selectedAddOnOptions ?? [],
          }),
          item.imageUrl ?? null
        );
      }

      setCart({
        restaurant: {
          restaurantId: quoteResponse.data.restaurant.id,
          restaurantName: quoteResponse.data.restaurant.name,
        },
        items: quotedItems.map((item) => ({
          itemId: item.itemId,
          name: item.name,
          imageUrl:
            mergedImageMap.get(
              buildCartItemKey({
                itemId: item.itemId,
                name: item.name,
                imageUrl: null,
                quantity: 1,
                unitPrice: 0,
                selectedVariantOptions: item.selectedVariantOptions,
                selectedAddOnOptions: item.selectedAddOnOptions,
              })
            ) ?? null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          selectedVariantOptions: item.selectedVariantOptions,
          selectedAddOnOptions: item.selectedAddOnOptions,
        })),
      });
      setReorderContext({
        orderId: params.order._id,
        orderNumber: params.order.orderNumber,
      });

      return {
        status: "success",
        restaurantId: quoteResponse.data.restaurant.id,
        restaurantName: quoteResponse.data.restaurant.name,
        addedItemCount: reorderCandidates.length,
        skippedCount: skippedNames.length,
        skippedNames,
      };
    },
  });
}

export function useCustomerMarkNotificationReadMutation() {
    const queryClient = useQueryClient();
  
    return useMutation({
      mutationFn: async (notificationId: string) => {
      const response = await apiPatch<CustomerNotificationListResponse>(
        `/customer/notifications/${notificationId}/read`,
        {}
      );
        return response.data;
      },
      onSuccess: async () => {
        queryClient.invalidateQueries({ queryKey: ["customer", "notifications"] });
      },
    });
  }

export function useCustomerMarkAllNotificationsReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
      mutationFn: async () => {
        const response = await apiPatch<CustomerNotificationListResponse>(
        "/customer/notifications/read-all",
        {}
      );
        return response.data;
      },
      onSuccess: async () => {
        queryClient.invalidateQueries({ queryKey: ["customer", "notifications"] });
      },
    });
  }

export function useCustomerLogoutMutation() {
  const queryClient = useQueryClient();
  const clearSession = useCustomerAuthStore((state) => state.clearSession);
  const accessToken = useCustomerAuthStore((state) => state.accessToken);
  const refreshToken = useCustomerAuthStore((state) => state.refreshToken);
  const clearCart = useCartStore((state) => state.clearCart);

  return useMutation({
    mutationFn: async () => {
      const registeredPushToken = await getRegisteredCustomerPushToken();

      if (!refreshToken) {
        if (accessToken && registeredPushToken?.expoPushToken) {
          await apiDelete<{ removed: boolean }>(
            `/customer/push-tokens?expoPushToken=${encodeURIComponent(
              registeredPushToken.expoPushToken,
            )}`,
          );
        }
        return null;
      }

      try {
        const response = await apiPost<{ revoked: boolean }>("/customer/auth/logout", {
          refreshToken,
          expoPushToken: registeredPushToken?.expoPushToken,
        });
        return response.data;
      } catch (error) {
        if (accessToken && registeredPushToken?.expoPushToken) {
          await apiDelete<{ removed: boolean }>(
            `/customer/push-tokens?expoPushToken=${encodeURIComponent(
              registeredPushToken.expoPushToken,
            )}`,
          );
          return { revoked: false };
        }

        throw error;
      }
    },
    onSuccess: async () => {
      await clearRegisteredCustomerPushToken();
      queryClient.removeQueries({ queryKey: ["customer"] });
      clearCart();
      clearSession();
    },
    onError: () => {
      useAppBannerStore.getState().showBanner({
        title: "Sign out failed",
        description:
          "Please try again so this device can be safely removed from your account notifications.",
        tone: "warning",
      });
    },
  });
}

export function useRegisterCustomerPushTokenMutation() {
  return useMutation({
    mutationFn: async (body: {
      expoPushToken: string;
      platform: "android" | "ios";
      deviceId?: string;
      appVersion?: string;
    }) => {
      const response = await apiProtectedPost<{ registered: boolean }>(
        "/customer/push-tokens",
        body
      );
      return response.data;
    },
  });
}

export function useUnregisterCustomerPushTokenMutation() {
  return useMutation({
    mutationFn: async (body: { expoPushToken: string }) => {
      const response = await apiDelete<{ removed: boolean }>(
        `/customer/push-tokens?expoPushToken=${encodeURIComponent(body.expoPushToken)}`
      );
      return response.data;
    },
  });
}
