import {
  keepPreviousData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { apiDelete, apiGet, apiPost } from "@/src/lib/api";
import { buildQueryString } from "@/src/lib/query-params";
import type { RiderLiveTrackingPolicy } from "@/src/lib/live-tracking-policy";
import {
  resolvePlatformMapStyle,
  type DeliveryMapStyleContext,
  type PlatformMapStyleSettings,
} from "@/src/lib/map-style";
import {
  clearCurrentRiderExpoPushToken,
  getCurrentRiderExpoPushToken,
} from "@/src/lib/rider-push-token-state";
import { useRiderAuthStore, type RiderProfile } from "@/src/store/auth-store";

export type RiderOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  assignmentState?: "unassigned" | "assigned_to_you" | "assigned_to_other";
  isTrackingActiveForRider?: boolean;
  isFocusedLiveTrip?: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  pricing?: {
    total?: number;
    deliveryFee?: number;
  };
  timestamps?: Record<string, string>;
  riderSnapshot?: {
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
    speedKmph?: number;
    isNearCustomer?: boolean;
    currentLocation?: {
      latitude?: number;
      longitude?: number;
      heading?: number | null;
      accuracyMeters?: number | null;
    };
  };
  routeToNext?: {
    distanceKm: number;
    durationMinutes: number;
    polyline: string;
    provider: "google" | "haversine";
    trafficAware: boolean;
  } | null;
  customer?: {
    name?: string;
    phone?: string;
    deliveryAddress?: {
      label?: string;
      addressLine?: string;
      addressDetails?: string;
      latitude?: number | null;
      longitude?: number | null;
    };
  };
  restaurant?: {
    id?: string;
    name?: string;
    phone?: string;
    address?: string;
    city?: string;
    latitude?: number | null;
    longitude?: number | null;
    preparationTimeMinutes?: number | null;
  } | null;
  items?: {
    name?: string;
    quantity?: number;
    totalPrice?: number;
  }[];
  history?: {
    status: string;
    actor: string;
    note?: string;
    createdAt: string | null;
  }[];
};

export type RiderMapCoordinate = {
  latitude: number;
  longitude: number;
};

export type RiderNotification = {
  id: string;
  type: string;
  title: string;
  description: string;
  path: string;
  campaignId?: string;
  contentType?: "text" | "image" | "image_text" | string;
  imageUrl?: string;
  zoneId?: string;
  districtId?: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

export type RiderNotificationListResponse = {
  items: RiderNotification[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage: number | null;
};

export type RiderLiveMapOrder = {
  id: string;
  orderNumber: string;
  status: string;
  assignmentState?: "unassigned" | "assigned_to_you" | "assigned_to_other";
  createdAt: string | null;
  updatedAt: string | null;
  priority?: number;
  preparation?: {
    phase?: string;
    label?: string;
    baseMinutes?: number;
    extraMinutes?: number;
    totalMinutes?: number;
    targetStartAt?: string | null;
    targetReadyAt?: string | null;
    remainingSeconds?: number | null;
    lateBySeconds?: number;
  };
  pricing?: {
    total?: number;
    foodSubtotal?: number;
  };
  customer?: {
    id?: string;
    name?: string;
    addressLabel?: string;
    addressLine?: string;
    addressDetails?: string;
    location?: RiderMapCoordinate | null;
  };
  tracking?: RiderOrder["riderTracking"];
};

export type RiderLiveMapRestaurant = {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  city?: string;
  preparationTimeMinutes?: number | null;
  location?: RiderMapCoordinate | null;
  orderCount: number;
  readyCount: number;
  preparingCount: number;
  acceptedCount: number;
  pickedUpCount: number;
  lateCount: number;
  earliestRemainingSeconds?: number | null;
  nextReadyAt?: string | null;
  priority?: number;
  orders: RiderLiveMapOrder[];
};

export type RiderLiveMapResponse = {
  generatedAt: string;
  rider: {
    id: string;
    fullName?: string;
    phone?: string;
    vehicleType?: string;
    activeTrackingOrderId?: string;
    location?: (RiderMapCoordinate & {
      heading?: number | null;
      accuracyMeters?: number | null;
      speedKmph?: number | null;
      updatedAt?: string | null;
    }) | null;
  };
  restaurants: RiderLiveMapRestaurant[];
};

const ACTIVE_ORDER_STATUSES = new Set([
  "ReadyForPickup",
  "PickedUp",
]);

const HISTORY_ORDER_STATUSES = new Set(["Delivered", "Cancelled", "Rejected"]);

type PlatformContentResponse = {
  operations?: {
    liveTracking?: RiderLiveTrackingPolicy;
    dispatch?: Partial<RiderDeliveryThresholds>;
    mapStyles?: PlatformMapStyleSettings;
  };
  supportContact?: {
    phone?: string;
  };
};

export type RiderPerformanceSummary = {
  deliveredToday: number;
  deliveredLast7Days: number;
  deliveredThisMonth: number;
  deliveredTotal: number;
  cancelledTotal: number;
  activeAssignedOrders: number;
};

export type RiderDeliveryThresholds = {
  assignmentTimeoutMinutes: number;
  pickupLateGraceMinutes: number;
  deliveryWatchAfterPickupMinutes: number;
  deliveryLateAfterPickupMinutes: number;
  deliveryCriticalAfterPickupMinutes: number;
  riderEtaSpeedKmph: number;
  riderEtaRouteFactor: number;
};

const DEFAULT_RIDER_DELIVERY_THRESHOLDS: RiderDeliveryThresholds = {
  assignmentTimeoutMinutes: 8,
  pickupLateGraceMinutes: 10,
  deliveryWatchAfterPickupMinutes: 20,
  deliveryLateAfterPickupMinutes: 25,
  deliveryCriticalAfterPickupMinutes: 30,
  riderEtaSpeedKmph: 24,
  riderEtaRouteFactor: 1.1,
};

function useRiderPlatformContentQuery<TData>(
  select: (content: PlatformContentResponse) => TData
) {
  return useQuery({
    queryKey: ["platform-content", "rider"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const response = await apiGet<PlatformContentResponse>("/rider/platform-content");
      return response.data;
    },
    select,
  });
}

function normalizeRiderOrder(order: Partial<RiderOrder> & { _id?: string; id?: string }) {
  const id = order.id ?? order._id ?? "";
  return {
    ...order,
    id,
  } as RiderOrder;
}

function patchScopedOrdersList(
  current: RiderOrder[] | undefined,
  nextOrder: RiderOrder,
  shouldInclude: boolean
) {
  const list = current ?? [];
  const nextIndex = list.findIndex((item) => item.id === nextOrder.id);

  if (!shouldInclude) {
    if (nextIndex === -1) {
      return list;
    }
    return list.filter((item) => item.id !== nextOrder.id);
  }

  if (nextIndex === -1) {
    return [nextOrder, ...list];
  }

  return list.map((item) => (item.id === nextOrder.id ? { ...item, ...nextOrder } : item));
}

function mergeRiderOrder(current: RiderOrder | undefined, nextOrder: RiderOrder) {
  if (!current) return nextOrder;

  return {
    ...current,
    ...nextOrder,
    pricing: nextOrder.pricing ?? current.pricing,
    riderSnapshot: nextOrder.riderSnapshot ?? current.riderSnapshot,
    riderTracking: nextOrder.riderTracking
      ? { ...current.riderTracking, ...nextOrder.riderTracking }
      : current.riderTracking,
    customer: nextOrder.customer ?? current.customer,
    restaurant: nextOrder.restaurant ?? current.restaurant,
    items: nextOrder.items ?? current.items,
    history: nextOrder.history ?? current.history,
    timestamps: {
      ...(current.timestamps ?? {}),
      ...(nextOrder.timestamps ?? {}),
    },
  };
}

export function patchRiderOrderCaches(
  queryClient: QueryClient,
  orderLike: Partial<RiderOrder> & { _id?: string; id?: string },
  options?: { invalidateLiveMap?: boolean; patchScopedLists?: boolean }
) {
  const nextOrder = normalizeRiderOrder(orderLike);
  if (!nextOrder.id) {
    return;
  }

  queryClient.setQueryData<RiderOrder>(["rider", "order", nextOrder.id], (current) =>
    mergeRiderOrder(current, nextOrder)
  );
  if (options?.patchScopedLists !== false) {
    queryClient.setQueryData<RiderOrder[]>(["rider", "orders", "active"], (current) =>
      patchScopedOrdersList(current, nextOrder, ACTIVE_ORDER_STATUSES.has(nextOrder.status))
    );
    queryClient.setQueryData<RiderOrder[]>(["rider", "orders", "history"], (current) =>
      patchScopedOrdersList(current, nextOrder, HISTORY_ORDER_STATUSES.has(nextOrder.status))
    );
    queryClient.setQueryData<RiderOrder[]>(["rider", "orders", "available"], (current) =>
      patchScopedOrdersList(
        current,
        nextOrder,
        nextOrder.status === "ReadyForPickup" && nextOrder.assignmentState !== "assigned_to_other"
      )
    );
  }
  if (options?.invalidateLiveMap) {
    void queryClient.invalidateQueries({ queryKey: ["rider", "live-map"] });
  }
}

type RiderAuthResponse = {
  accessToken: string;
  refreshToken: string;
  rider: RiderProfile;
};

type RiderOtpSessionResponse = {
  verificationSessionId: string;
  phone?: string;
  expiresInSeconds: number;
  resendAvailableInSeconds?: number;
};

type RiderPasswordResetVerifyResponse = {
  verificationSessionId: string;
  phone: string;
  expiresInSeconds: number;
};

export function useRiderProfileQuery(enabled = true) {
  const isAuthenticated = useRiderAuthStore((state: { accessToken: string }) => Boolean(state.accessToken));

  return useQuery({
    queryKey: ["rider", "profile"],
    enabled: enabled && isAuthenticated,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const response = await apiGet<RiderProfile>("/rider/profile");
      return response.data;
    },
  });
}

export type RiderReview = {
  _id: string;
  riderRating: number | null;
  riderComment: string;
  orderId: string;
  createdAt: string | null;
};

export type RiderReviewsResponse = {
  items: RiderReview[];
  total: number;
  averageRating: number;
};

export function useRiderReviewsQuery(enabled = true, pageSize = 20) {
  const isAuthenticated = useRiderAuthStore((state: { accessToken: string }) => Boolean(state.accessToken));

  return useQuery({
    queryKey: ["rider", "reviews", pageSize],
    enabled: enabled && isAuthenticated,
    staleTime: 15_000,
    queryFn: async () => {
      const response = await apiGet<RiderReviewsResponse>(
        `/rider/reviews?page=1&pageSize=${pageSize}`,
      );
      return response.data;
    },
  });
}

export function useUpdateRiderAvailabilityMutation() {
  const queryClient = useQueryClient();
  const setSession = useRiderAuthStore((state) => state.setSession);
  const rider = useRiderAuthStore((state: { rider: RiderProfile | null }) => state.rider);
  const accessToken = useRiderAuthStore((state: { accessToken: string }) => state.accessToken);
  const refreshToken = useRiderAuthStore((state: { refreshToken: string }) => state.refreshToken);

  return useMutation({
    mutationFn: async (isAvailableForAssignments: boolean) => {
      const response = await apiPost<RiderProfile>("/rider/profile/availability", {
        isAvailableForAssignments,
      }, "PATCH");
      return response.data;
    },
    onSuccess: (data: RiderProfile) => {
      queryClient.setQueryData(["rider", "profile"], data);
      void queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
      if (rider && accessToken && refreshToken) {
        setSession({
          rider: { ...rider, ...data },
          accessToken,
          refreshToken,
        });
      }
    },
  });
}

export function useUpdateRiderProfileLocationMutation() {
  const queryClient = useQueryClient();
  const setSession = useRiderAuthStore((state) => state.setSession);
  const rider = useRiderAuthStore((state: { rider: RiderProfile | null }) => state.rider);
  const accessToken = useRiderAuthStore((state: { accessToken: string }) => state.accessToken);
  const refreshToken = useRiderAuthStore((state: { refreshToken: string }) => state.refreshToken);

  return useMutation({
    mutationFn: async (payload: {
      latitude: number;
      longitude: number;
      heading?: number;
      accuracyMeters?: number;
      speedKmph?: number;
    }) => {
      const response = await apiPost<RiderProfile>("/rider/profile/location", payload, "PATCH");
      return response.data;
    },
    onSuccess: (data: RiderProfile) => {
      queryClient.setQueryData(["rider", "profile"], data);
      queryClient.setQueryData<RiderLiveMapResponse>(["rider", "live-map"], (current) => {
        if (!current) return current;
        const location = data.lastKnownLocation;
        return {
          ...current,
          rider: {
            ...current.rider,
            location:
              typeof location?.latitude === "number" && typeof location?.longitude === "number"
                ? {
                    latitude: location.latitude,
                    longitude: location.longitude,
                    heading: location.heading ?? null,
                    accuracyMeters: location.accuracyMeters ?? null,
                    speedKmph: location.speedKmph ?? null,
                    updatedAt: location.updatedAt ?? null,
                  }
                : current.rider.location,
          },
        };
      });
      if (rider && accessToken && refreshToken) {
        setSession({
          rider: { ...rider, ...data },
          accessToken,
          refreshToken,
        });
      }
    },
  });
}

export function useRiderOrdersQuery(scope: "available" | "active" | "history") {
  const isAuthenticated = useRiderAuthStore((state: { accessToken: string }) => Boolean(state.accessToken));
  const query = buildQueryString({ scope });

  return useQuery({
    queryKey: ["rider", "orders", scope],
    enabled: isAuthenticated,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const response = await apiGet<RiderOrder[]>(`/rider/orders?${query}`);
      return response.data;
    },
  });
}

export function useRiderOrdersPagedQuery(
  scope: "available" | "active" | "history",
  pageSize: number
) {
  const isAuthenticated = useRiderAuthStore((state: { accessToken: string }) => Boolean(state.accessToken));
  const query = buildQueryString({ scope, page: 1, pageSize });

  return useQuery({
    queryKey: ["rider", "orders", scope, "paged", pageSize],
    enabled: isAuthenticated,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const response = await apiGet<RiderOrder[]>(`/rider/orders?${query}`);
      return response.data;
    },
  });
}

export function useRiderPerformanceSummaryQuery(enabled = true) {
  const isAuthenticated = useRiderAuthStore((state: { accessToken: string }) => Boolean(state.accessToken));

  return useQuery({
    queryKey: ["rider", "performance-summary"],
    enabled: enabled && isAuthenticated,
    staleTime: 20_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const response = await apiGet<RiderPerformanceSummary>("/rider/orders/summary");
      return response.data;
    },
  });
}

export function useRiderLiveMapQuery(enabled = true) {
  const isAuthenticated = useRiderAuthStore((state: { accessToken: string }) => Boolean(state.accessToken));

  return useQuery({
    queryKey: ["rider", "live-map"],
    enabled: enabled && isAuthenticated,
    placeholderData: keepPreviousData,
    staleTime: 5_000,
    refetchInterval: enabled && isAuthenticated ? 15_000 : false,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const response = await apiGet<RiderLiveMapResponse>("/rider/live-map");
      return response.data;
    },
  });
}

export function useRiderLiveTrackingPolicyQuery() {
  return useRiderPlatformContentQuery((content) => content.operations?.liveTracking ?? null);
}

export function useRiderMapStyleQuery(context: DeliveryMapStyleContext) {
  return useRiderPlatformContentQuery((content) =>
    resolvePlatformMapStyle(content.operations?.mapStyles, context)
  );
}

export function useRiderDeliveryThresholdsQuery() {
  return useRiderPlatformContentQuery((content) => {
      const dispatch = content.operations?.dispatch ?? {};
      const assignmentTimeoutMinutes =
        typeof dispatch.assignmentTimeoutMinutes === "number"
          ? dispatch.assignmentTimeoutMinutes
          : DEFAULT_RIDER_DELIVERY_THRESHOLDS.assignmentTimeoutMinutes;
      const pickupLateGraceMinutes =
        typeof dispatch.pickupLateGraceMinutes === "number"
          ? dispatch.pickupLateGraceMinutes
          : DEFAULT_RIDER_DELIVERY_THRESHOLDS.pickupLateGraceMinutes;
      const watch =
        typeof dispatch.deliveryWatchAfterPickupMinutes === "number"
          ? dispatch.deliveryWatchAfterPickupMinutes
          : DEFAULT_RIDER_DELIVERY_THRESHOLDS.deliveryWatchAfterPickupMinutes;
      const late = Math.max(
        watch,
        typeof dispatch.deliveryLateAfterPickupMinutes === "number"
          ? dispatch.deliveryLateAfterPickupMinutes
          : DEFAULT_RIDER_DELIVERY_THRESHOLDS.deliveryLateAfterPickupMinutes
      );
      const critical = Math.max(
        late,
        typeof dispatch.deliveryCriticalAfterPickupMinutes === "number"
          ? dispatch.deliveryCriticalAfterPickupMinutes
          : DEFAULT_RIDER_DELIVERY_THRESHOLDS.deliveryCriticalAfterPickupMinutes
      );
      const riderEtaSpeedKmph =
        typeof dispatch.riderEtaSpeedKmph === "number" && Number.isFinite(dispatch.riderEtaSpeedKmph)
          ? Math.min(45, Math.max(6, dispatch.riderEtaSpeedKmph))
          : DEFAULT_RIDER_DELIVERY_THRESHOLDS.riderEtaSpeedKmph;
      const riderEtaRouteFactor =
        typeof dispatch.riderEtaRouteFactor === "number" && Number.isFinite(dispatch.riderEtaRouteFactor)
          ? Math.min(2, Math.max(1, dispatch.riderEtaRouteFactor))
          : DEFAULT_RIDER_DELIVERY_THRESHOLDS.riderEtaRouteFactor;

      return {
        assignmentTimeoutMinutes,
        pickupLateGraceMinutes,
        deliveryWatchAfterPickupMinutes: watch,
        deliveryLateAfterPickupMinutes: late,
        deliveryCriticalAfterPickupMinutes: critical,
        riderEtaSpeedKmph,
        riderEtaRouteFactor,
      } satisfies RiderDeliveryThresholds;
  });
}

export function useRiderSupportContactQuery() {
  return useRiderPlatformContentQuery((content) => content.supportContact ?? null);
}

export function useRiderOrderDetailsQuery(orderId?: string) {
  const isAuthenticated = useRiderAuthStore((state: { accessToken: string }) => Boolean(state.accessToken));

  return useQuery({
    queryKey: ["rider", "order", orderId],
    enabled: isAuthenticated && Boolean(orderId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const response = await apiGet<RiderOrder>(`/rider/orders/${orderId}`);
      return response.data;
    },
  });
}

export function useStartRiderPhoneAuthMutation() {
  return useMutation({
    mutationFn: async (params: { phone: string }) => {
      const response = await apiPost<RiderOtpSessionResponse>("/rider/auth/phone/start", params);
      return response.data;
    },
  });
}

export function useRiderPasswordSigninMutation() {
  const setSession = useRiderAuthStore((state) => state.setSession);

  return useMutation({
    mutationFn: async (params: { phone: string; password: string }) => {
      const response = await apiPost<RiderAuthResponse>("/rider/auth/password/signin", params);
      return response.data;
    },
    onSuccess: (data: RiderAuthResponse) => {
      setSession({
        rider: data.rider,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
    },
  });
}

export function useRiderPasswordResetStartMutation() {
  return useMutation({
    mutationFn: async (params: { phone: string }) => {
      const response = await apiPost<RiderOtpSessionResponse>("/rider/auth/password/forgot", params);
      return response.data;
    },
  });
}

export function useRiderPasswordResetVerifyMutation() {
  return useMutation({
    mutationFn: async (params: { verificationSessionId: string; otpCode: string }) => {
      const response = await apiPost<RiderPasswordResetVerifyResponse>(
        "/rider/auth/password/verify",
        params
      );
      return response.data;
    },
  });
}

export function useRiderPasswordResetMutation() {
  return useMutation({
    mutationFn: async (params: { verificationSessionId: string; newPassword: string }) => {
      const response = await apiPost<{ reset: boolean; phone: string }>(
        "/rider/auth/password/reset",
        params
      );
      return response.data;
    },
  });
}

export function useVerifyRiderPhoneAuthMutation() {
  const setSession = useRiderAuthStore((state) => state.setSession);

  return useMutation<
    RiderAuthResponse,
    Error,
    {
      verificationSessionId: string;
      otpCode: string;
      fullName?: string;
    }
  >({
    mutationFn: async (params) => {
      const response = await apiPost<RiderAuthResponse>("/rider/auth/phone/verify", params);
      return response.data;
    },
    onSuccess: (data: RiderAuthResponse) => {
      setSession({
        rider: data.rider,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
    },
  });
}

export function usePickupOrderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      orderId: string;
      location?: {
        latitude: number;
        longitude: number;
        heading?: number;
        accuracyMeters?: number;
        speedKmph?: number;
      };
    }) => {
      const response = await apiPost<RiderOrder>(
        `/rider/orders/${params.orderId}/pickup`,
        params.location,
      );
      return response.data;
    },
    onSuccess: (data: RiderOrder) => {
      patchRiderOrderCaches(queryClient, data, { invalidateLiveMap: true });
      queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["rider", "profile"] });
    },
  });
}

export function useAcceptOrderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const response = await apiPost<RiderOrder>(`/rider/orders/${orderId}/accept`);
      return response.data;
    },
    onSuccess: (data: RiderOrder) => {
      patchRiderOrderCaches(queryClient, data, { invalidateLiveMap: true });
      queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["rider", "profile"] });
    },
  });
}

export function useDeliverOrderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const response = await apiPost<RiderOrder>(`/rider/orders/${orderId}/deliver`);
      return response.data;
    },
    onSuccess: (data: RiderOrder) => {
      patchRiderOrderCaches(queryClient, data, { invalidateLiveMap: true });
      queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["rider", "profile"] });
    },
  });
}

export type RiderDeliveryFailureReason =
  | "customer_no_response"
  | "wrong_item"
  | "others";

export function useFailDeliveryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      orderId: string;
      reason: RiderDeliveryFailureReason;
      note?: string;
    }) => {
      const response = await apiPost<RiderOrder>(
        `/rider/orders/${params.orderId}/fail`,
        { reason: params.reason, note: params.note },
      );
      return response.data;
    },
    onSuccess: (data: RiderOrder) => {
      patchRiderOrderCaches(queryClient, data, { invalidateLiveMap: true });
      queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["rider", "profile"] });
    },
  });
}

export function useActivateTrackingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const response = await apiPost<RiderOrder>(`/rider/orders/${orderId}/tracking/activate`);
      return response.data;
    },
    onSuccess: (data: RiderOrder) => {
      patchRiderOrderCaches(queryClient, data, { invalidateLiveMap: true });
      queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["rider", "profile"] });
    },
  });
}

export function useUpdateRiderLocationMutation(orderId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      latitude: number;
      longitude: number;
      heading?: number;
      accuracyMeters?: number;
      speedKmph?: number;
    }) => {
      if (!orderId) {
        throw new Error("Order is not available for tracking.");
      }

      const response = await apiPost<RiderOrder>(`/rider/orders/${orderId}/location`, payload);
      return response.data;
    },
    onSuccess: (data: RiderOrder) => {
      patchRiderOrderCaches(queryClient, data, { patchScopedLists: false });
    },
  });
}

export function useLogoutRiderMutation() {
  const refreshToken = useRiderAuthStore((state: { refreshToken: string }) => state.refreshToken);
  const clearSession = useRiderAuthStore((state: { clearSession: () => void }) => state.clearSession);

  return useMutation({
    mutationFn: async () => {
      if (!refreshToken) return null;
      const expoPushToken = getCurrentRiderExpoPushToken();
      await apiPost("/rider/auth/logout", {
        refreshToken,
        ...(expoPushToken ? { expoPushToken } : {}),
      });
      return null;
    },
    onSettled: () => {
      clearCurrentRiderExpoPushToken();
      clearSession();
    },
  });
}

export function useRiderNotificationsQuery(enabled = true, limit = 1) {
  return useQuery({
    queryKey: ["rider", "notifications", "summary", limit],
    enabled,
    refetchInterval: enabled ? 20_000 : false,
    queryFn: async () => {
      const response = await apiGet<RiderNotificationListResponse>(
        `/rider/notifications?limit=${limit}`,
      );
      return response.data;
    },
  });
}

export function useRiderNotificationsInfiniteQuery(enabled = true, limit = 20) {
  return useInfiniteQuery<RiderNotificationListResponse>({
    queryKey: ["rider", "notifications", "infinite", limit],
    enabled,
    initialPageParam: 1,
    refetchInterval: enabled ? 20_000 : false,
    getNextPageParam: (lastPage) => {
      return lastPage.nextPage ?? undefined;
    },
    queryFn: async ({ pageParam }) => {
      const response = await apiGet<RiderNotificationListResponse>(
        `/rider/notifications?page=${Number(pageParam)}&limit=${limit}`,
      );
      return response.data;
    },
  });
}

export function useMarkRiderNotificationReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await apiPost<{ updated: boolean }>(
        `/rider/notifications/${notificationId}/read`,
        {},
        "PATCH",
      );
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rider", "notifications"] });
    },
  });
}

export function useMarkAllRiderNotificationsReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiPost<{ updated: boolean }>(
        "/rider/notifications/read-all",
        {},
        "PATCH",
      );
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rider", "notifications"] });
    },
  });
}

export function useRegisterRiderPushTokenMutation() {
  return useMutation({
    mutationFn: async (body: {
      expoPushToken: string;
      platform: "android" | "ios";
      deviceId?: string;
      appVersion?: string;
    }) => {
      const response = await apiPost<{ registered: boolean }>(
        "/rider/push-tokens",
        body
      );
      return response.data;
    },
  });
}

export function useUnregisterRiderPushTokenMutation() {
  return useMutation({
    mutationFn: async (body: { expoPushToken: string }) => {
      const query = encodeURIComponent(body.expoPushToken);
      const response = await apiDelete<{ removed: boolean }>(
        `/rider/push-tokens?expoPushToken=${query}`
      );
      return response.data;
    },
  });
}
