import { Ionicons } from "@expo/vector-icons";
import LottieView from "lottie-react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  Easing,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { AppBottomSheet } from "@/src/components/app-bottom-sheet";
import { BelaPullToRefresh } from "@/src/components/bela-pull-to-refresh";
import { appAlert } from "@/src/lib/app-alert";
import { closedReorderBanner, failedReorderBanner } from "@/src/lib/reorder-messages";
import { EmptyStateCard } from "@/src/components/empty-state-card";
import { CardListSkeleton, ShimmerBlock } from "@/src/components/loading-skeleton";
import { LiveOrderMap } from "@/src/components/orders/live-order-map";
import { OrderStatusHero } from "@/src/components/orders/order-status-hero";
import { PriorityDeliveryBanner } from "@/src/components/orders/priority-delivery-banner";
import { RiderInfoCard } from "@/src/components/orders/rider-info-card";
import { useCustomerOrderChatQuery } from "@/src/hooks/use-order-chat";
import { useCustomerRewardsQuery } from "@/src/hooks/use-rewards-api";
import { AppHeader } from "@/src/components/ui";
import { styles } from "@/src/components/orders/order-tracking.styles";
import { PreparationRuntime, type PreparationEstimate } from "@/src/components/orders/preparation-runtime";
import { ReadyForPickupIcon } from "@/src/components/orders/ready-for-pickup-icon";
import { ReorderCartSwitchModal } from "@/src/components/orders/reorder-cart-switch-modal";
import { OfflineNoticeCard } from "@/src/components/offline-notice-card";
import {
  useCustomerOrderDetailsQuery,
  useCustomerCancelOrderMutation,
  useCustomerMapStyleQuery,
  useCustomerReorderMutation,
  useCustomerRestaurantDetailsQuery,
  useCustomerTrackingTuningQuery,
} from "@/src/hooks/use-customer-api";
import { formatCurrency } from "@/src/lib/currency";
import { platformFeeLabel } from "@/src/lib/platform-fee";
import { isUrgentOrder, urgentDeliveryLabel } from "@/src/lib/urgent-delivery";
import {
  getCustomerOrderStatusMeta,
  getLiveOrderJourneyIndex,
  getLiveOrderTrackingState,
  canCancelCustomerOrder,
  LIVE_ORDER_JOURNEY_STEPS,
} from "@/src/lib/customer-order-display";
import {
  formatDateTimeAmPm,
  formatPrepTimeRange,
  formatDurationRangeMinutes,
  formatTimeAmPm,
} from "@/src/lib/date-time";
import { formatCustomerAddressLine } from "@/src/lib/location-address";
import { formatShortOrderIdLabel } from "@/src/lib/order-id";
import { getCustomerSocket } from "@/src/lib/socket-client";
import { useIsOnline } from "@/src/hooks/use-network-status";
import { useAppBannerStore } from "@/src/store/app-banner-store";
import {
  DEFAULT_TRACKING_TUNING,
  getCustomerTrackingFreshness,
  shouldPollCustomerTracking,
} from "@/src/lib/tracking-freshness";
import { palette } from "@/src/theme/palette";

// Statuses where the order is still live and worth polling as a socket fallback.
const LIVE_TRACKING_STATUSES = [
  "New",
  "Accepted",
  "Preparing",
  "ReadyForPickup",
  "PickedUp",
];

// Short labels for the compact 6-step "Order journey" row, so each fits under its number
// at a small font without breaking mid-word (the full labels live in the details sheet).
const JOURNEY_SHORT_LABELS: Record<string, string> = {
  New: "Placed",
  Accepted: "Accepted",
  Preparing: "Preparing",
  ReadyForPickup: "Ready",
  PickedUp: "On the way",
  Delivered: "Delivered",
};

type OrderTimelineSource = {
  createdAt?: string;
  history?: { status: string; createdAt?: string | null }[];
  timestamps?: {
    placedAt?: string;
    acceptedAt?: string;
    preparingAt?: string;
    readyForPickupAt?: string;
    pickedUpAt?: string;
    deliveredAt?: string;
    cancelledAt?: string;
  };
};

const TIMESTAMP_KEY_BY_STATUS = {
  New: "placedAt",
  Accepted: "acceptedAt",
  Preparing: "preparingAt",
  ReadyForPickup: "readyForPickupAt",
  PickedUp: "pickedUpAt",
  Delivered: "deliveredAt",
} as const;

const ORDER_SUCCESS_PARTICLES = Array.from({ length: 18 }, (_, index) => {
  const angle = (index / 18) * Math.PI * 2;
  const distance = 78 + (index % 3) * 26;
  return {
    key: `success-particle-${index}`,
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    size: 5 + (index % 4),
    color:
      index % 3 === 0
        ? "#14A86B"
        : index % 3 === 1
          ? palette.secondary
          : "#FFC94D",
  };
});

function getOrderStatusTime(order: OrderTimelineSource, status: string) {
  const timestampKey =
    TIMESTAMP_KEY_BY_STATUS[status as keyof typeof TIMESTAMP_KEY_BY_STATUS];

  return (
    (timestampKey ? order.timestamps?.[timestampKey] : undefined) ??
    order.history?.find((entry) => entry.status === status)?.createdAt ??
    (status === "New" ? order.createdAt : undefined)
  );
}

type RefundNoticeState = "completed" | "review";

// A cancelled/rejected bKash order moves through: paid → refund in review → refunded.
// "completed" wins so a finished refund reads as done, not still "in review".
function getRefundNoticeState(order: {
  status: string;
  paymentMethod?: string;
  paymentStatus?: string;
  paymentSnapshot?: { refundStatus?: string };
}): RefundNoticeState | null {
  if (!["Cancelled", "Rejected"].includes(order.status)) return null;
  if (order.paymentMethod !== "Bkash") return null;

  const refundStatus = order.paymentSnapshot?.refundStatus ?? "";
  if (order.paymentStatus === "refunded" || refundStatus === "refunded") {
    return "completed";
  }
  if (
    ["paid", "refund_pending"].includes(order.paymentStatus ?? "") ||
    refundStatus === "pending"
  ) {
    return "review";
  }
  return null;
}

function formatRefundEta(minutes?: number) {
  const safeMinutes =
    typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0
      ? Math.round(minutes)
      : 60;

  if (safeMinutes < 60) {
    return `${safeMinutes} minute${safeMinutes === 1 ? "" : "s"}`;
  }

  // Show the exact hours + remaining minutes (e.g. "1 hour 30 minutes") instead of
  // rounding, so the promised refund time is never overstated.
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  const hourText = `${hours} hour${hours === 1 ? "" : "s"}`;
  if (mins === 0) return hourText;
  return `${hourText} ${mins} minute${mins === 1 ? "" : "s"}`;
}

function formatCountdownClock(seconds?: number | null) {
  const safeSeconds =
    typeof seconds === "number" && Number.isFinite(seconds)
      ? Math.max(0, Math.ceil(seconds))
      : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function KitchenStartCountdown({ estimate }: { estimate: PreparationEstimate }) {
  const motion = useRef(new Animated.Value(0)).current;
  const countdownText =
    typeof estimate.remainingSeconds === "number"
      ? `Preparing starts in ${formatCountdownClock(estimate.remainingSeconds)}`
      : estimate.rangeLabel;

  useEffect(() => {
    motion.setValue(0);
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(motion, {
          toValue: 1,
          duration: 1300,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(motion, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
      motion.stopAnimation();
    };
  }, [motion]);

  const movingDotX = motion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 52],
  });
  const movingDotOpacity = motion.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.45, 1, 0.45],
  });

  return (
    <View style={styles.kitchenStartCard}>
      <View style={styles.kitchenMotionTrack}>
        <Animated.View
          style={[
            styles.kitchenMotionDot,
            {
              opacity: movingDotOpacity,
              transform: [{ translateX: movingDotX }],
            },
          ]}
        />
      </View>
      <Text style={styles.kitchenStartTitle}>
        {countdownText || "Preparing starts soon"}
      </Text>
      <Text style={styles.kitchenStartMeta}>
        {estimate.supportingText || "The kitchen is getting ready now."}
      </Text>
    </View>
  );
}

function OrderSuccessCelebration({
  visible,
  onDone,
}: {
  visible: boolean;
  onDone: () => void;
}) {
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.92)).current;
  const particleProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    cardOpacity.setValue(0);
    cardScale.setValue(0.92);
    particleProgress.setValue(0);

    Animated.parallel([
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(cardScale, {
        toValue: 1,
        damping: 13,
        stiffness: 190,
        mass: 0.85,
        useNativeDriver: true,
      }),
    ]).start();

    const vanishTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(cardOpacity, {
          toValue: 0,
          duration: 360,
          useNativeDriver: true,
        }),
        Animated.timing(cardScale, {
          toValue: 1.08,
          duration: 360,
          useNativeDriver: true,
        }),
        Animated.timing(particleProgress, {
          toValue: 1,
          duration: 560,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) onDone();
      });
    }, 2000);

    return () => clearTimeout(vanishTimer);
  }, [cardOpacity, cardScale, onDone, particleProgress, visible]);

  if (!visible) return null;

  return (
    <View pointerEvents="none" style={styles.orderSuccessOverlay}>
      <View style={styles.orderSuccessParticleOrigin}>
        {ORDER_SUCCESS_PARTICLES.map((particle) => (
          <Animated.View
            key={particle.key}
            style={[
              styles.orderSuccessParticle,
              {
                width: particle.size,
                height: particle.size,
                borderRadius: particle.size / 2,
                backgroundColor: particle.color,
                opacity: particleProgress.interpolate({
                  inputRange: [0, 0.14, 0.78, 1],
                  outputRange: [0, 1, 0.68, 0],
                }),
                transform: [
                  {
                    translateX: particleProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, particle.x],
                    }),
                  },
                  {
                    translateY: particleProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, particle.y],
                    }),
                  },
                  {
                    scale: particleProgress.interpolate({
                      inputRange: [0, 0.18, 1],
                      outputRange: [0.2, 1, 0.1],
                    }),
                  },
                ],
              },
            ]}
          />
        ))}
      </View>

      <Animated.View
        style={[
          styles.orderSuccessCard,
          {
            opacity: cardOpacity,
            transform: [{ scale: cardScale }],
          },
        ]}
      >
        <View style={styles.orderSuccessIconOuter}>
          <View style={styles.orderSuccessIconInner}>
            <Ionicons
              name="checkmark-done-outline"
              size={34}
              color={palette.successText}
            />
          </View>
        </View>
        <Text style={styles.orderSuccessTitle}>Order placed</Text>
        <Text style={styles.orderSuccessText}>
          Your order is live. We are opening tracking now.
        </Text>
      </Animated.View>
    </View>
  );
}

export default function OrderTrackingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const rewardsQuery = useCustomerRewardsQuery();
  const params = useLocalSearchParams<{ orderId?: string; justPlaced?: string }>();
  const [isDetailsOpen, setDetailsOpen] = useState(false);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [reorderConflictMeta, setReorderConflictMeta] = useState<{
    currentRestaurantName: string;
    incomingRestaurantName: string;
    previewItemName: string;
  } | null>(null);
  const orderId =
    typeof params.orderId === "string" ? params.orderId : undefined;
  const isJustPlaced = params.justPlaced === "1";
  const [showOrderSuccessCelebration, setShowOrderSuccessCelebration] =
    useState(isJustPlaced);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const orderQuery = useCustomerOrderDetailsQuery(orderId);
  // Rider chat thread (unread badge on the rider card). Only while a rider is on a live order.
  const chatOrder = orderQuery.data;
  const chatQuery = useCustomerOrderChatQuery(
    orderId,
    Boolean(chatOrder?.riderSnapshot?.name || chatOrder?.riderSnapshot?.phone) &&
      ["Accepted", "Preparing", "ReadyForPickup", "PickedUp"].includes(chatOrder?.status ?? ""),
  );
  const trackingMapStyleQuery = useCustomerMapStyleQuery("customer.order_tracking");
  const cancelOrderMutation = useCustomerCancelOrderMutation(orderId);
  const reorderMutation = useCustomerReorderMutation();
  const showBanner = useAppBannerStore((state) => state.showBanner);
  const isOnline = useIsOnline();
  const order = orderQuery.data;
  const orderStatus = order?.status;
  const [trackingNow, setTrackingNow] = useState(Date.now);
  const trackingSampleAt = order?.riderTracking?.lastUpdatedAt;
  const trackingFocused = order?.riderTracking?.isFocused;
  const refetchOrder = orderQuery.refetch;
  // Timings come from the backend (admin → Settings → Customer live tracking) with safe
  // clamped defaults, so tracking can be tuned without an app release.
  const tuning = useCustomerTrackingTuningQuery().data ?? DEFAULT_TRACKING_TUNING;
  const pollMs = tuning.fallbackPollSeconds * 1000;
  const refetchIfQuietSeconds = tuning.refetchIfQuietSeconds;
  // Resilience fallback: the socket is the primary live channel, but on a flaky
  // network it can silently drop. While a live order is on-screen and the socket is
  // NOT connected, poll the order so the map and ETA keep advancing. When the socket
  // is healthy it already streams updates, so we skip the extra fetch.
  useEffect(() => {
    if (!orderStatus || !LIVE_TRACKING_STATUSES.includes(orderStatus) || !isOnline) {
      return;
    }
    const interval = setInterval(() => {
      if (AppState.currentState !== "active") return;
      setTrackingNow(Date.now());
      if (!shouldPollCustomerTracking({ socketConnected: Boolean(getCustomerSocket()?.connected),
        status: orderStatus, isFocused: trackingFocused, lastUpdatedAt: trackingSampleAt,
        refetchIfQuietSeconds })) return;
      void refetchOrder();
    }, pollMs);
    return () => clearInterval(interval);
  }, [orderStatus, isOnline, refetchOrder, trackingSampleAt, trackingFocused, pollMs, refetchIfQuietSeconds]);
  const restaurantId = order?.restaurantId;
  const restaurantQuery = useCustomerRestaurantDetailsQuery({
    restaurantId: restaurantId ?? undefined,
  });
  const restaurant = restaurantQuery.data?.restaurant;
  const refetchOrderDetails = orderQuery.refetch;
  const refetchRestaurantDetails = restaurantQuery.refetch;
  const refreshOrderSnapshot = useCallback(async () => {
    if (!orderId) return;

    const jobs: Promise<unknown>[] = [refetchOrderDetails()];
    if (restaurantId) {
      jobs.push(refetchRestaurantDetails());
    }

    await Promise.all(jobs);
  }, [orderId, refetchOrderDetails, refetchRestaurantDetails, restaurantId]);
  const handleManualRefresh = useCallback(async () => {
    if (!orderId) return;

    setIsManualRefreshing(true);
    try {
      await refreshOrderSnapshot();
    } finally {
      setIsManualRefreshing(false);
    }
  }, [orderId, refreshOrderSnapshot]);
  const customerLocation =
    typeof order?.customerSnapshot?.deliveryAddress?.latitude === "number" &&
    typeof order?.customerSnapshot?.deliveryAddress?.longitude === "number"
      ? {
          latitude: order.customerSnapshot.deliveryAddress.latitude,
          longitude: order.customerSnapshot.deliveryAddress.longitude,
        }
      : null;
  const restaurantLocation =
    typeof restaurant?.location?.latitude === "number" &&
    typeof restaurant?.location?.longitude === "number"
      ? {
          latitude: restaurant.location.latitude,
          longitude: restaurant.location.longitude,
        }
      : null;
  const riderLocation =
    typeof order?.riderTracking?.currentLocation?.latitude === "number" &&
    typeof order?.riderTracking?.currentLocation?.longitude === "number"
      ? {
          latitude: order.riderTracking.currentLocation.latitude,
          longitude: order.riderTracking.currentLocation.longitude,
        }
      : null;
  const riderHeading =
    typeof order?.riderTracking?.currentLocation?.heading === "number"
      ? order.riderTracking.currentLocation.heading
      : null;

  const itemRows = useMemo(
    () => order?.itemsSnapshot ?? [],
    [order?.itemsSnapshot],
  );
  const dismissOrderSuccessCelebration = useCallback(() => {
    setShowOrderSuccessCelebration(false);
  }, []);

  useEffect(() => {
    setShowOrderSuccessCelebration(isJustPlaced);
  }, [isJustPlaced, orderId]);

  useFocusEffect(
    useCallback(() => {
      void refreshOrderSnapshot();
    }, [refreshOrderSnapshot]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void refreshOrderSnapshot();
      }
    });

    return () => subscription.remove();
  }, [refreshOrderSnapshot]);

  const openDetailsSheet = () => {
    setDetailsOpen(true);
  };
  const closeDetailsSheet = () => {
    setDetailsOpen(false);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/(tabs)/orders");
  };

  if (orderQuery.isLoading) {
    // Just placed (e.g. right after a bKash payment): show a clean, centered loader
    // instead of the full skeleton — minimal and calm while the first order state syncs.
    if (isJustPlaced) {
      return (
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
          <View style={styles.justPlacedHeader}>
            <Pressable style={styles.backButton} onPress={handleBack}>
              <Ionicons
                name="chevron-back"
                size={20}
                color={palette.foreground}
              />
            </Pressable>
          </View>
          <View style={styles.justPlacedLoadingWrap}>
            <View style={styles.justPlacedIconWrap}>
              <ActivityIndicator size="large" color={palette.secondary} />
            </View>
            <Text style={styles.justPlacedTitle}>Opening live tracking</Text>
            <Text style={styles.justPlacedText}>
              Syncing the latest restaurant and rider state…
            </Text>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: 32 + Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.header}>
            <Pressable style={styles.backButton} onPress={handleBack}>
              <Ionicons
                name="chevron-back"
                size={20}
                color={palette.foreground}
              />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.kicker}>Order details</Text>
              <Text style={styles.orderIdText}>Loading order</Text>
            </View>
          </View>
          <View style={styles.trackingSkeletonWrap}>
            <ShimmerBlock style={styles.trackingSkeletonMap} />
            <CardListSkeleton count={3} cardHeight={96} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.emptyWrap}>
          <EmptyStateCard
            title="Tracking is unavailable"
            description="We could not load the live tracking screen right now."
            actionLabel="Back to orders"
            onPress={() => router.replace("/(tabs)/orders")}
          />
        </View>
      </SafeAreaView>
    );
  }

  const trackingState = getLiveOrderTrackingState(order);
  const remainingMinutes =
    order.routeToCustomer?.durationMinutes ??
    order.riderTracking?.remainingDurationMinutes ??
    null;
  const queuedEtaMinutes = order.riderTracking?.queueEtaMinutes ?? null;
  const statusMeta = getCustomerOrderStatusMeta(order.status);
  const isQueuedForDelivery =
    order.status === "PickedUp" && order.riderTracking?.isFocused === false;
  const canShowLiveMap = order.status === "PickedUp" && !isQueuedForDelivery && Boolean(riderLocation);
  const trackingFresh = getCustomerTrackingFreshness(trackingSampleAt, Math.max(trackingNow, Date.now()), tuning.staleAfterSeconds) === "live";
  const staleMinutes = trackingSampleAt
    ? Math.max(1, Math.round((Math.max(trackingNow, Date.now()) - new Date(trackingSampleAt).getTime()) / 60_000))
    : null;
  const staleLocationTitle =
    staleMinutes && Number.isFinite(staleMinutes)
      ? `Rider location updated ${staleMinutes} min ago`
      : "Waiting for the rider's live location";
  const queuedDeliveryEtaText =
    typeof queuedEtaMinutes === "number" && Number.isFinite(queuedEtaMinutes)
      ? `Delivery man will start your delivery in ${formatDurationRangeMinutes(
          Math.max(queuedEtaMinutes, 1),
          Math.max(queuedEtaMinutes, 1) + 5,
        )}`
      : "Waiting for delivery";
  const hasAssignedRider = Boolean(
    order.riderSnapshot?.name || order.riderSnapshot?.phone,
  );
  const journeyIndex = getLiveOrderJourneyIndex(order.status);
  const restaurantPreparationTimeMinutes =
    typeof restaurant?.preparationTimeMinutes === "number"
      ? restaurant.preparationTimeMinutes
      : null;
  const riderTitle =
    order.riderSnapshot?.name ||
    (order.status === "PickedUp"
      ? "Rider on the way"
      : "Waiting for assignment");
  // Admin can hide the rider's phone from customers (backend sends
  // riderPhoneVisible=false and clears the number). Treat undefined as visible so
  // older payloads keep working.
  const riderPhone =
    order.riderPhoneVisible === false
      ? ""
      : order.riderSnapshot?.phone?.trim() || "";
  // Admin-set platform fee charged on this order (0/absent on older orders → no line).
  const platformFeeAmount = order.pricing?.platformFee ?? 0;
  const platformFeeInfo = order.pricing?.platformFeeInfo;
  const urgentDeliveryAmount = order.pricing?.urgentDeliveryFee ?? 0;
  const urgentDeliveryInfo = order.pricing?.urgentDeliveryInfo;
  // Show the priority reassurance only while the order is still in flight — once it is
  // delivered/cancelled/rejected the priority no longer means anything to the customer.
  const showPriorityBanner =
    isUrgentOrder(order) &&
    !["Delivered", "Cancelled", "Rejected"].includes(order.status);
  const restaurantName = restaurant?.name || "Restaurant";
  const canReviewOrder = order.status === "Delivered" && !order.customerReview;
  const canCancelOrder = canCancelCustomerOrder(order.status);
  const restaurantAddressText = formatCustomerAddressLine(
    typeof restaurant?.address === "string"
      ? restaurant.address
      : [restaurant?.address?.address, restaurant?.address?.city]
          .filter(Boolean)
          .join(", "),
    "Restaurant pickup details will appear here.",
  );
  const deliveryAddressText = formatCustomerAddressLine(
    order.customerSnapshot?.deliveryAddress?.addressLine,
    "Delivery address unavailable",
  );
  const isDeliveredOrder = order.status === "Delivered";
  const refundNoticeState = getRefundNoticeState(order);
  const refundEtaText = formatRefundEta(order.paymentSnapshot?.refundEtaMinutes);
  const totalItemCount = itemRows.reduce(
    (sum, item) => sum + Math.max(item.quantity ?? 0, 0),
    0,
  );
  const isCurrentOrderReordering =
    reorderMutation.isPending && reorderMutation.variables?.order._id === order._id;
  const handleCallRider = () => {
    if (!riderPhone) {
      return;
    }

    void Linking.openURL(`tel:${riderPhone}`);
  };
  const openReviewScreen = () => {
    router.push(`/orders/${orderId}/review`);
  };
  // Shared receipt (items + price breakdown) so the delivered screen can show it
  // inline while live orders keep it inside the on-demand details sheet.
  const renderOrderReceipt = () => (
    <>
      {itemRows.map((item, index) => {
        const quantity = item.quantity ?? 0;
        const unitPrice = item.unitPrice ?? 0;

        return (
          <View
            key={`${item.itemId ?? item.name}-${index}`}
            style={styles.detailsItemRow}
          >
            <View style={styles.detailsItemIcon}>
              <Ionicons
                name="restaurant-outline"
                size={16}
                color={palette.secondary}
              />
            </View>
            <View style={styles.detailsItemCopy}>
              <View style={styles.detailsItemTopRow}>
                <Text style={styles.detailsItemName} numberOfLines={1}>
                  {item.name || "Menu item"}
                </Text>
                <Text style={styles.detailsItemPrice}>
                  {formatCurrency(quantity * unitPrice)}
                </Text>
              </View>
              <Text style={styles.detailsItemMeta}>
                {quantity} x {formatCurrency(unitPrice)}
              </Text>
            </View>
          </View>
        );
      })}

      <View style={styles.detailsDivider} />

      <View style={styles.paymentSummary}>
        <View style={styles.paymentRow}>
          <Text style={styles.paymentLabel}>Items subtotal</Text>
          <Text style={styles.paymentValue}>
            {formatCurrency(order.pricing?.subtotal ?? 0)}
          </Text>
        </View>
        {(order.pricing?.menuMarkdownAmount ?? 0) > 0 ? (
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Item discount</Text>
            <Text style={styles.paymentDiscount}>
              -{formatCurrency(order.pricing?.menuMarkdownAmount ?? 0)}
            </Text>
          </View>
        ) : null}
        <View style={styles.paymentRow}>
          <Text style={styles.paymentLabel}>Delivery fee</Text>
          <Text style={styles.paymentValue}>
            {formatCurrency(order.pricing?.deliveryFee ?? 0)}
          </Text>
        </View>
        {urgentDeliveryAmount > 0 ? (
          <View style={styles.paymentSubRow}>
            <Text style={styles.paymentSubLabel}>⚡ Priority</Text>
            <Text style={styles.paymentSubValue}>
              +{formatCurrency(urgentDeliveryAmount)}
            </Text>
          </View>
        ) : null}
        {(order.pricing?.rainSurcharge ?? 0) > 0 ? (
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Rain surcharge</Text>
            <Text style={styles.paymentValue}>
              {formatCurrency(order.pricing?.rainSurcharge ?? 0)}
            </Text>
          </View>
        ) : null}
        {platformFeeAmount > 0 ? (
          <>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>
                {platformFeeLabel(platformFeeInfo)}
              </Text>
              <Text style={styles.paymentValue}>
                {formatCurrency(platformFeeAmount)}
              </Text>
            </View>
            {platformFeeInfo?.note ? (
              <Text style={styles.paymentDeliveryNote}>
                {platformFeeInfo.note}
              </Text>
            ) : null}
          </>
        ) : null}
        {(order.pricing?.discountAmount ?? 0) > 0 ? (
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Discount</Text>
            <Text style={styles.paymentDiscount}>
              -{formatCurrency(order.pricing?.discountAmount ?? 0)}
            </Text>
          </View>
        ) : null}
        {(order.pricing?.firstOrderDiscountAmount ?? 0) > 0 ? (
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>First order discount</Text>
            <Text style={styles.paymentDiscount}>
              -{formatCurrency(order.pricing?.firstOrderDiscountAmount ?? 0)}
            </Text>
          </View>
        ) : null}
        <View style={styles.detailsDivider} />
        <View style={styles.paymentRow}>
          <Text style={styles.paymentValueStrong}>Total</Text>
          <Text style={styles.paymentValueStrong}>
            {formatCurrency(order.pricing?.total ?? 0)}
          </Text>
        </View>
      </View>
    </>
  );
  const handleReorder = async (forceReplace = false) => {
    let result: Awaited<ReturnType<typeof reorderMutation.mutateAsync>>;
    try {
      result = await reorderMutation.mutateAsync({
        order: {
          _id: order._id,
          orderNumber: order.orderNumber,
          restaurantId: order.restaurantId,
          itemsSnapshot: order.itemsSnapshot,
        },
        forceReplace,
      });
    } catch {
      showBanner(failedReorderBanner);
      return;
    }

    if (result.status === "closed") {
      showBanner(closedReorderBanner(result));
      return;
    }

    if (result.status === "conflict") {
      setReorderConflictMeta({
        currentRestaurantName: result.currentRestaurantName,
        incomingRestaurantName: result.incomingRestaurantName,
        previewItemName: result.previewItemName,
      });
      return;
    }

    if (result.status === "empty") {
      showBanner({
        title: "Could not reorder this order",
        description:
          result.skippedCount > 0
            ? "Those items are no longer available with their previous configuration."
            : "We could not rebuild this order right now.",
        tone: "warning",
      });
      return;
    }

    showBanner({
      title:
        result.skippedCount > 0
          ? "Reorder ready with available items"
          : "Reorder ready",
      description:
        result.skippedCount > 0
          ? `${result.addedItemCount} item${result.addedItemCount === 1 ? "" : "s"} restored. ${result.skippedCount} could not be added.`
          : `Your cart now has ${result.addedItemCount} item${result.addedItemCount === 1 ? "" : "s"} from this delivered order.`,
      tone: result.skippedCount > 0 ? "warning" : "success",
    });
    router.push({ pathname: "/(tabs)/cart", params: { view: "active" } });
  };
  const handleCancelOrder = async () => {
    if (!canCancelOrder || cancelOrderMutation.isPending) return;

    try {
      await cancelOrderMutation.mutateAsync({
        reason: "customer_cancelled_before_acceptance",
      });
      closeDetailsSheet();
      showBanner({
        title: "Order cancelled",
        description: "Your order was cancelled.",
        tone: "success",
        dedupeKey: `order:${order._id}:Cancelled`,
      });
    } catch (error) {
      showBanner({
        title: "Could not cancel order",
        description:
          error instanceof Error
            ? error.message
            : "This order may already have been accepted by the restaurant.",
        tone: "warning",
      });
    }
  };
  const handleRequestCancelOrder = () => {
    appAlert(
      "Cancel this order?",
      order.paymentMethod === "Bkash"
        ? "The restaurant has not accepted it yet. Your bKash refund will move to review after cancellation."
        : "The restaurant has not accepted it yet. Cash on delivery orders do not need a refund.",
      [
        { text: "Keep order", style: "cancel" },
        {
          text: "Cancel order",
          style: "destructive",
          onPress: () => {
            void handleCancelOrder();
          },
        },
      ],
    );
  };
  const orderScratchCard = rewardsQuery.data?.spins.items.find(
    (card) => card.orderId === orderId && card.status === "unscratched",
  );

  const overlays = (
    <>
      <AppBottomSheet
        visible={isDetailsOpen}
        onClose={closeDetailsSheet}
        title="Order items"
        subtitle={`${restaurantName} - ${formatShortOrderIdLabel(order.orderNumber)}`}
        leadingIcon="receipt-outline"
        snapPoints={[0.7, 0.92]}
        initialSnapPoint={0.7}
        scroll={false}
        contentContainerStyle={styles.detailsBottomSheetContent}
      >
        <Text style={styles.detailsDateText}>
          Placed {formatDateTimeAmPm(order.createdAt)}
        </Text>

            <ScrollView
              style={styles.detailsList}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingBottom: Math.max(insets.bottom, 16),
              }}
            >
              {journeyIndex >= 0 ? (
                <View style={styles.detailsTimelineCard}>
                  <Text style={styles.detailsTimelineTitle}>Order timeline</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.detailsTimelineRow}
                  >
                    {LIVE_ORDER_JOURNEY_STEPS.map((step, index) => {
                      const statusTime = getOrderStatusTime(order, step.key);
                      const isCompleted = Boolean(statusTime) || index < journeyIndex;
                      const isCurrent = index === journeyIndex;
                      const isDeliveredCurrent =
                        order.status === "Delivered" && step.key === "Delivered";

                      return (
                        <View key={step.key} style={styles.detailsTimelineStep}>
                          <View style={styles.journeyMarkerRow}>
                            <View
                              style={[
                                styles.journeyMarker,
                                isCompleted || isDeliveredCurrent
                                  ? styles.journeyMarkerDone
                                  : null,
                                isCurrent && !isDeliveredCurrent
                                  ? styles.journeyMarkerCurrent
                                  : null,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.journeyMarkerText,
                                  isCompleted || isDeliveredCurrent
                                    ? styles.journeyMarkerTextOnSolid
                                    : null,
                                  isCurrent && !isDeliveredCurrent
                                    ? styles.journeyMarkerTextCurrent
                                    : null,
                                ]}
                              >
                                {index + 1}
                              </Text>
                            </View>
                            {index < LIVE_ORDER_JOURNEY_STEPS.length - 1 ? (
                              <View
                                style={[
                                  styles.detailsTimelineLine,
                                  isCompleted ? styles.journeyLineDone : null,
                                ]}
                              />
                            ) : null}
                          </View>
                          <Text
                            numberOfLines={2}
                            style={[
                              styles.detailsTimelineLabel,
                              isCompleted || isCurrent
                                ? styles.journeyStepLabelActive
                                : null,
                            ]}
                          >
                            {step.label}
                          </Text>
                          <Text style={styles.detailsTimelineTime}>
                            {statusTime ? formatTimeAmPm(statusTime) : ""}
                          </Text>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              {renderOrderReceipt()}

              {canCancelOrder ? (
                <Pressable
                  style={[
                    styles.subtleCancelButton,
                    cancelOrderMutation.isPending ? styles.subtleCancelButtonDisabled : null,
                  ]}
                  disabled={cancelOrderMutation.isPending}
                  onPress={handleRequestCancelOrder}
                >
                  {cancelOrderMutation.isPending ? (
                    <ActivityIndicator size="small" color={palette.secondary} />
                  ) : (
                    <Ionicons name="close-circle-outline" size={16} color={palette.secondary} />
                  )}
                  <View style={styles.subtleCancelCopy}>
                    <Text style={styles.subtleCancelText}>Cancel this order</Text>
                    <Text style={styles.subtleCancelHint}>
                      Available until the restaurant accepts it.
                    </Text>
                  </View>
                </Pressable>
              ) : null}

            </ScrollView>
      </AppBottomSheet>
      <ReorderCartSwitchModal
        visible={Boolean(reorderConflictMeta)}
        previewItemName={reorderConflictMeta?.previewItemName ?? "Delivered items"}
        currentRestaurantName={reorderConflictMeta?.currentRestaurantName ?? "your current cart"}
        incomingRestaurantName={reorderConflictMeta?.incomingRestaurantName ?? restaurantName}
        onClose={() => setReorderConflictMeta(null)}
        onConfirm={() => {
          setReorderConflictMeta(null);
          void handleReorder(true);
        }}
      />
      <OrderSuccessCelebration
        visible={showOrderSuccessCelebration}
        onDone={dismissOrderSuccessCelebration}
      />
    </>
  );

  // ── Live order: location-picker style ──
  // A full-bleed "stage" on top (the live map once the rider is on the way, otherwise the
  // current step's illustration), a floating back button + title pill over it, and a
  // rounded sheet below with the status + amount first, then rider, details, route.
  if (!isDeliveredOrder) {
    const hasMap = canShowLiveMap && Boolean(customerLocation);
    const stageHeight = Math.round(windowHeight * (hasMap ? 0.5 : 0.36));
    const payCaption =
      order.paymentMethod === "Bkash"
        ? order.paymentStatus === "paid"
          ? "Paid online · bKash"
          : "bKash payment pending"
        : "Cash on delivery";
    const isPaid = order.paymentStatus === "paid";

    const stageCaption =
      order.status === "New"
        ? "Waiting for the restaurant"
        : order.status === "Accepted"
          ? "Order confirmed"
          : order.status === "Preparing"
            ? "Cooking your food"
            : order.status === "ReadyForPickup"
              ? "Packed & ready"
              : order.status === "PickedUp"
                ? isQueuedForDelivery
                  ? "In the rider's queue"
                  : "Rider picked up your order"
                : trackingState?.title ?? statusMeta.label;

    const stageArt =
      order.status === "New" ? (
        <LottieView autoPlay loop source={require("../../../assets/animations/waiting.json")} style={live.stageLottie} />
      ) : order.status === "Preparing" ? (
        <LottieView autoPlay loop source={require("../../../assets/animations/Preparing_food.json")} style={live.stageLottie} />
      ) : order.status === "PickedUp" ? (
        <LottieView autoPlay loop source={require("../../../assets/animations/delivery-boy.json")} style={live.stageLottie} />
      ) : order.status === "ReadyForPickup" ? (
        <ReadyForPickupIcon />
      ) : (
        <View style={[live.stageIconCircle, { backgroundColor: statusMeta.background }]}>
          <Ionicons
            name={order.status === "Accepted" ? "checkmark-done" : trackingState?.icon ?? statusMeta.icon}
            size={44}
            color={order.status === "Accepted" ? palette.secondary : trackingState?.accent ?? statusMeta.color}
          />
        </View>
      );

    const statusLine =
      order.status === "New" ? (
        <Text style={live.statusLine}>The restaurant is reviewing your order.</Text>
      ) : order.status === "Accepted" ? (
        <PreparationRuntime order={order} preparationTimeMinutes={restaurantPreparationTimeMinutes}>
          {(estimate) =>
            estimate ? (
              <KitchenStartCountdown estimate={estimate} />
            ) : (
              <Text style={live.statusLine}>The kitchen will start soon.</Text>
            )
          }
        </PreparationRuntime>
      ) : order.status === "Preparing" ? (
        <PreparationRuntime order={order} preparationTimeMinutes={restaurantPreparationTimeMinutes}>
          {(estimate) => (
            <View style={live.statusLineGroup}>
              <Text style={live.statusLineStrong}>
                {estimate
                  ? estimate.rangeLabel
                  : remainingMinutes !== null
                    ? `${formatPrepTimeRange(Math.max(remainingMinutes, 1))} left`
                    : "Preparing now"}
              </Text>
              {estimate?.supportingText ? (
                <Text style={live.statusLine}>{estimate.supportingText}</Text>
              ) : null}
              {estimate?.state === "delayed" && estimate.lateByMinutes >= 10 ? (
                <Pressable style={live.inlineAction} onPress={() => router.push("/support-chat")}>
                  <Ionicons name="chatbubble-ellipses-outline" size={14} color={palette.foreground} />
                  <Text style={live.inlineActionText}>Contact support</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </PreparationRuntime>
      ) : order.status === "ReadyForPickup" ? (
        <Text style={live.statusLine}>
          {hasAssignedRider ? `${riderTitle} will pick it up soon` : "We're finding a rider to pick it up"}
        </Text>
      ) : order.status === "PickedUp" ? (
        <Text style={live.statusLineStrong}>
          {isQueuedForDelivery
            ? queuedDeliveryEtaText
            : remainingMinutes !== null
              ? `Arriving in ${formatPrepTimeRange(Math.max(remainingMinutes, 1))}`
              : "Your rider is on the way"}
        </Text>
      ) : trackingState?.subtitle ? (
        <Text style={live.statusLine}>{trackingState.subtitle}</Text>
      ) : null;

    return (
      <View style={live.root}>
        {/* Stage */}
        <View style={[live.stage, { height: stageHeight + 28 }]}>
          {hasMap && customerLocation ? (
            <LiveOrderMap
              bare
              height={stageHeight + 28}
              trackingFresh={trackingFresh}
              customerLocation={customerLocation}
              restaurantLocation={restaurantLocation}
              riderLocation={riderLocation}
              riderHeading={riderHeading}
              status={order.status}
              riderAccentColor="#E8930C"
              riderName={order.riderSnapshot?.name || "Rider"}
              riderVehicleIcon="bicycle-outline"
              routePolyline={order.routeToCustomer?.polyline}
              routeDistanceKm={order.routeToCustomer?.distanceKm}
              routeDurationMinutes={order.routeToCustomer?.durationMinutes}
              routeProvider={order.routeToCustomer?.provider}
              trafficAware={order.routeToCustomer?.trafficAware}
              mapStyle={trackingMapStyleQuery.data}
            />
          ) : (
            <View style={[live.stageArt, { paddingTop: insets.top + 44 }]}>
              {stageArt}
              <View style={live.stageCaption}>
                <Text style={live.stageCaptionText}>{stageCaption}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Floating top bar */}
        <View style={[live.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [live.roundButton, pressed ? live.pressed : null]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={6}
          >
            <Ionicons name="arrow-back" size={20} color={palette.foreground} />
          </Pressable>
          <View style={live.titlePill}>
            <Text style={live.titleText} numberOfLines={1}>
              {formatShortOrderIdLabel(order.orderNumber)}
            </Text>
            <Text style={live.titleSub} numberOfLines={1}>
              {restaurantName}
            </Text>
          </View>
        </View>

        {/* Sheet */}
        <View style={[live.sheet, { marginTop: stageHeight }]}>
          <View style={live.handle} />
          <BelaPullToRefresh refreshing={isManualRefreshing} onRefresh={handleManualRefresh}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[live.sheetContent, { paddingBottom: 28 + Math.max(insets.bottom, 12) }]}
            >
              {/* Status (left) + amount (right) */}
              <View style={live.statusCard}>
                <View style={live.statusRow}>
                  <View style={live.statusCopy}>
                    <View style={[live.statusChip, { backgroundColor: statusMeta.background }]}>
                      <Ionicons name={statusMeta.icon} size={12} color={statusMeta.color} />
                      <Text style={[live.statusChipText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                    </View>
                    {statusLine}
                  </View>
                  <View style={live.amountBox}>
                    <Text style={live.amount}>{formatCurrency(order.pricing?.total ?? 0)}</Text>
                    <View style={[live.payChip, isPaid ? live.payChipPaid : null]}>
                      <Ionicons
                        name={isPaid ? "checkmark-circle" : order.paymentMethod === "Bkash" ? "time-outline" : "cash-outline"}
                        size={12}
                        color={isPaid ? palette.successText : palette.secondary}
                      />
                      <Text style={[live.payChipText, isPaid ? live.payChipTextPaid : null]}>{payCaption}</Text>
                    </View>
                  </View>
                </View>

                {journeyIndex >= 0 ? (
                  <View style={live.steps}>
                    {LIVE_ORDER_JOURNEY_STEPS.map((step, index) => {
                      const done = index < journeyIndex;
                      const current = index === journeyIndex;
                      return (
                        <View key={step.key} style={live.step}>
                          <View style={live.stepTrack}>
                            <View style={[live.stepLine, index === 0 ? live.stepLineHidden : null, index <= journeyIndex ? live.stepLineDone : null]} />
                            <View style={[live.stepDot, done ? live.stepDotDone : null, current ? live.stepDotCurrent : null]}>
                              {done ? <Ionicons name="checkmark" size={10} color={palette.onPrimary} /> : null}
                            </View>
                            <View style={[live.stepLine, index === LIVE_ORDER_JOURNEY_STEPS.length - 1 ? live.stepLineHidden : null, index < journeyIndex ? live.stepLineDone : null]} />
                          </View>
                          <Text style={[live.stepLabel, current ? live.stepLabelCurrent : null]} numberOfLines={1}>
                            {JOURNEY_SHORT_LABELS[step.key] ?? step.label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>

              {hasMap && !trackingFresh ? (
                <View style={live.notice}>
                  <Ionicons name="cellular-outline" size={16} color="#8A5A00" />
                  <View style={live.noticeCopy}>
                    <Text style={live.noticeTitle}>{staleLocationTitle}</Text>
                    <Text style={live.noticeText}>The rider&apos;s phone may have weak signal. The map will update on its own.</Text>
                  </View>
                </View>
              ) : null}

              {!isOnline ? (
                <OfflineNoticeCard description="You're offline. Live rider movement is paused until your connection returns." />
              ) : null}

              {refundNoticeState === "review" ? (
                <View style={live.notice}>
                  <Ionicons name="wallet-outline" size={16} color="#8A5A00" />
                  <View style={live.noticeCopy}>
                    <Text style={live.noticeTitle}>bKash refund is in review</Text>
                    <Text style={live.noticeText}>
                      Your order was cancelled after bKash payment. We will process the refund within {refundEtaText}.
                    </Text>
                  </View>
                </View>
              ) : refundNoticeState === "completed" ? (
                <View style={[live.notice, live.noticeDone]}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={palette.successText} />
                  <View style={live.noticeCopy}>
                    <Text style={live.noticeTitle}>bKash refund completed</Text>
                    <Text style={live.noticeText}>It may take a little time to appear in your bKash account.</Text>
                  </View>
                </View>
              ) : null}

              {showPriorityBanner ? <PriorityDeliveryBanner label={urgentDeliveryLabel(urgentDeliveryInfo)} /> : null}

              {["Accepted", "Preparing", "ReadyForPickup", "PickedUp"].includes(order.status) ? (
                <RiderInfoCard
                  assigned={hasAssignedRider}
                  name={order.riderSnapshot?.name}
                  phone={riderPhone}
                  vehicleType={order.riderSnapshot?.vehicleType}
                  status={order.status}
                  onCall={handleCallRider}
                  onChat={hasAssignedRider ? () => router.push(`/orders/${orderId}/chat`) : undefined}
                  unreadCount={chatQuery.data?.unreadCount ?? 0}
                />
              ) : null}

              {/* Clearly a button: tinted, bordered, icon + label + chevron */}
              <Pressable
                onPress={openDetailsSheet}
                style={({ pressed }) => [live.detailsButton, pressed ? live.pressed : null]}
                accessibilityRole="button"
              >
                <View style={live.detailsIcon}>
                  <Ionicons name="receipt-outline" size={18} color={palette.onPrimary} />
                </View>
                <View style={live.detailsCopy}>
                  <Text style={live.detailsTitle}>View order details</Text>
                  <Text style={live.detailsSub} numberOfLines={1}>
                    {totalItemCount} item{totalItemCount === 1 ? "" : "s"} · bill & timeline
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={palette.foreground} />
              </Pressable>

              {order.note?.trim() ? (
                <Pressable style={live.card} onPress={() => setNoteExpanded((value) => !value)} accessibilityRole="button">
                  <View style={live.cardHeader}>
                    <Ionicons name="document-text-outline" size={16} color={palette.secondary} />
                    <Text style={live.cardTitle}>Your note</Text>
                    <Ionicons name={noteExpanded ? "chevron-up" : "chevron-down"} size={16} color={palette.mutedForeground} />
                  </View>
                  <Text style={live.cardBody} numberOfLines={noteExpanded ? undefined : 1}>
                    {order.note.trim()}
                  </Text>
                </Pressable>
              ) : null}

              <View style={live.card}>
                <Text style={live.cardTitle}>Delivery route</Text>
                <View style={live.route}>
                  <View style={live.routeRail}>
                    <View style={live.routeDotFrom} />
                    <View style={live.routeLine} />
                    <View style={live.routeDotTo} />
                  </View>
                  <View style={live.routeStops}>
                    <View>
                      <Text style={live.routeLabel}>Pickup from</Text>
                      <Text style={live.routeTitle} numberOfLines={1}>{restaurantName}</Text>
                      <Text style={live.routeMeta} numberOfLines={2}>{restaurantAddressText}</Text>
                    </View>
                    <View>
                      <Text style={live.routeLabel}>{order.gift?.isGift ? "🎁 Gift for" : "Deliver to"}</Text>
                      <Text style={live.routeTitle} numberOfLines={1}>
                        {order.gift?.isGift
                          ? `${order.gift.recipientName ?? "Receiver"} · ${order.gift.recipientPhone ?? ""}`
                          : order.customerSnapshot?.deliveryAddress?.label || "Your location"}
                      </Text>
                      <Text style={live.routeMeta} numberOfLines={2}>{deliveryAddressText}</Text>
                    </View>
                  </View>
                </View>
              </View>
            </ScrollView>
          </BelaPullToRefresh>
        </View>
        {overlays}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <BelaPullToRefresh
        refreshing={isManualRefreshing}
        onRefresh={handleManualRefresh}
      >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 32 + Math.max(insets.bottom, 16) },
        ]}
      >
        <AppHeader
          inline
          style={styles.sectionInset}
          onBack={handleBack}
          eyebrow="Order details"
          title={formatShortOrderIdLabel(order.orderNumber)}
          subtitle={restaurantName}
          right={
            <View style={[styles.statusPill, { backgroundColor: statusMeta.background }]}>
              <Ionicons name={statusMeta.icon} size={13} color={statusMeta.color} />
              <Text style={[styles.statusPillText, { color: statusMeta.color }]}>
                {statusMeta.label}
              </Text>
            </View>
          }
        />

        {!isOnline ? (
          <View style={styles.offlineNoticeWrap}>
            <OfflineNoticeCard description="You're offline. Live rider movement is paused until your connection returns." />
          </View>
        ) : null}

        {refundNoticeState === "completed" ? (
          <View style={[styles.refundNoticeCard, styles.refundNoticeCardDone]}>
            <View style={[styles.refundNoticeIcon, styles.refundNoticeIconDone]}>
              <Ionicons
                name="checkmark-circle-outline"
                size={18}
                color={palette.successText}
              />
            </View>
            <View style={styles.refundNoticeCopy}>
              <Text style={styles.refundNoticeTitle}>bKash refund completed</Text>
              <Text style={styles.refundNoticeText}>
                Your bKash payment for this cancelled order has been refunded. It may
                take a little time to appear in your bKash account.
              </Text>
            </View>
          </View>
        ) : refundNoticeState === "review" ? (
          <View style={styles.refundNoticeCard}>
            <View style={styles.refundNoticeIcon}>
              <Ionicons name="wallet-outline" size={18} color={palette.secondary} />
            </View>
            <View style={styles.refundNoticeCopy}>
              <Text style={styles.refundNoticeTitle}>bKash refund is in review</Text>
              <Text style={styles.refundNoticeText}>
                Your order was cancelled after bKash payment. We will process the refund within {refundEtaText}.
              </Text>
            </View>
          </View>
        ) : null}

        {showPriorityBanner ? (
          <PriorityDeliveryBanner
            label={urgentDeliveryLabel(urgentDeliveryInfo)}
          />
        ) : null}

        {!isDeliveredOrder && journeyIndex >= 0 ? (
          <View style={styles.sectionInset}>
          <OrderStatusHero
            title={statusMeta.label}
            subtitle={`${restaurantName} · ${totalItemCount} item${totalItemCount === 1 ? "" : "s"}`}
            icon={statusMeta.icon}
            tint={statusMeta.background}
            accent={statusMeta.color}
            currentIndex={journeyIndex}
            amount={formatCurrency(order.pricing?.total ?? 0)}
            amountPaid={order.paymentStatus === "paid"}
            amountCaption={
              order.paymentMethod === "Bkash"
                ? order.paymentStatus === "paid"
                  ? "Paid via bKash"
                  : "bKash payment pending"
                : "Pay in cash on delivery"
            }
            steps={LIVE_ORDER_JOURNEY_STEPS.map((step) => ({
              key: step.key,
              label: JOURNEY_SHORT_LABELS[step.key] ?? step.label,
            }))}
          />
          </View>
        ) : null}

        {!isDeliveredOrder ? (
        <View style={styles.trackingCard}>
          {canShowLiveMap ? (
            customerLocation ? (
              <View>
              {!trackingFresh ? (
                <View style={staleStyles.banner}>
                  <Ionicons name="cellular-outline" size={16} color="#8A5A00" />
                  <View style={staleStyles.copy}>
                    <Text style={staleStyles.title}>{staleLocationTitle}</Text>
                    <Text style={staleStyles.text}>
                      The rider&apos;s phone may have weak signal. The map will update on its own.
                    </Text>
                  </View>
                </View>
              ) : null}
              <LiveOrderMap
                trackingFresh={trackingFresh}
                customerLocation={customerLocation}
                restaurantLocation={restaurantLocation}
                riderLocation={riderLocation}
                riderHeading={riderHeading}
                status={order.status}
                riderAccentColor="#E8930C"
                riderName={order.riderSnapshot?.name || "Rider"}
                riderVehicleIcon="bicycle-outline"
                routePolyline={order.routeToCustomer?.polyline}
                routeDistanceKm={order.routeToCustomer?.distanceKm}
                routeDurationMinutes={order.routeToCustomer?.durationMinutes}
                routeProvider={order.routeToCustomer?.provider}
                trafficAware={order.routeToCustomer?.trafficAware}
                mapStyle={trackingMapStyleQuery.data}
              />
              </View>
            ) : (
              <View style={[styles.stateCard, { backgroundColor: "#F3F7FF" }]}>
                <View
                  style={[
                    styles.stateIconWrap,
                    { backgroundColor: "#FFFFFFA8" },
                  ]}
                >
                  <Ionicons name="map-outline" size={20} color={palette.sky} />
                </View>
                <Text style={styles.stateTitle}>Live tracking unavailable</Text>
                <Text style={styles.stateSubtitle}>
                  Customer location is unavailable for this order.
                </Text>
              </View>
            )
          ) : isQueuedForDelivery ? (
            <View style={styles.pickupWaitingCard}>
              <View style={styles.pickupWaitingPill}>
                <Ionicons
                  name="list-outline"
                  size={14}
                  color={palette.secondary}
                />
                <Text style={styles.pickupWaitingPillText}>Order Queue</Text>
              </View>
              <LottieView
                autoPlay
                loop
                source={require("../../../assets/animations/delivery-boy.json")}
                style={styles.pickupWaitingAnimation}
              />
              <Text style={styles.pickupWaitingTitle}>
                Waiting for delivery
              </Text>
              <Text style={styles.pickupWaitingSubtitle}>
                Delivery man is completing another order.
              </Text>
              <Text style={styles.pickupWaitingMeta}>
                {queuedDeliveryEtaText}
              </Text>
            </View>
          ) : order.status === "PickedUp" ? (
            <View style={styles.pickupWaitingCard}>
              <View style={styles.pickupWaitingPill}>
                <Ionicons
                  name="locate-outline"
                  size={14}
                  color={palette.secondary}
                />
                <Text style={styles.pickupWaitingPillText}>
                  Waiting for live tracking
                </Text>
              </View>
              <LottieView
                autoPlay
                loop
                source={require("../../../assets/animations/delivery-boy.json")}
                style={styles.pickupWaitingAnimation}
              />
              <Text style={styles.pickupWaitingTitle}>
                The rider already picked up your order
              </Text>
              {/* <Text style={styles.pickupWaitingSubtitle}>
                We will show the map as soon as the rider starts sharing a real
                location signal.
              </Text> */}
            </View>
          ) : order.status === "New" ? (
            <View style={styles.waitingCard}>
              <View style={styles.waitingPill}>
                <Ionicons name="time-outline" size={14} color={palette.sky} />
                <Text style={styles.waitingPillText}>
                  Waiting for restaurant confirmation
                </Text>
              </View>
              <Text style={styles.waitingSubtitle}>
                The restaurant is reviewing your order.
              </Text>
              <LottieView
                autoPlay
                loop
                source={require("../../../assets/animations/waiting.json")}
                style={styles.waitingAnimation}
              />
            </View>
          ) : order.status === "Accepted" ? (
            <View style={styles.confirmedCard}>
              <View style={styles.confirmedPill}>
                <Ionicons
                  name="checkmark-done-circle-outline"
                  size={14}
                  color={palette.sky}
                />
                <Text style={styles.confirmedPillText}>
                  Restaurant confirmed your order
                </Text>
              </View>
              <Text style={styles.confirmedSubtitle}>
                The kitchen has queued your order.
              </Text>
              <PreparationRuntime
                order={order}
                preparationTimeMinutes={restaurantPreparationTimeMinutes}
              >
                {(estimate) =>
                  estimate ? (
                    <KitchenStartCountdown estimate={estimate} />
                  ) : null
                }
              </PreparationRuntime>
              <View style={styles.confirmedBadge}>
                <Ionicons
                  name="restaurant-outline"
                  size={28}
                  color={palette.sky}
                />
              </View>
            </View>
          ) : order.status === "Preparing" ? (
            <View style={styles.preparingCard}>
              <View style={styles.preparingPill}>
                <Ionicons
                  name="sparkles-outline"
                  size={14}
                  color="#9A4F00"
                />
                <Text style={styles.preparingPillText}>
                  Your food is preparing
                </Text>
              </View>
              <LottieView
                autoPlay
                loop
                source={require("../../../assets/animations/Preparing_food.json")}
                style={styles.preparingAnimation}
              />
              <PreparationRuntime
                order={order}
                preparationTimeMinutes={restaurantPreparationTimeMinutes}
              >
                {(estimate) => (
                  <>
                    <Text style={styles.preparingRange}>
                      {estimate
                        ? estimate.rangeLabel
                        : remainingMinutes !== null
                          ? `${formatPrepTimeRange(
                              Math.max(remainingMinutes, 1),
                            )} left`
                          : "Preparing now"}
                    </Text>
                    {estimate?.supportingText ? (
                      <Text style={styles.preparingRangeMeta}>
                        {estimate.supportingText}
                      </Text>
                    ) : !estimate ? (
                      <Text style={styles.preparingRangeMeta}>
                        Live rider updates start after pickup.
                      </Text>
                    ) : null}
                    {estimate?.state === "delayed" &&
                    estimate.lateByMinutes >= 10 ? (
                      <Pressable
                        style={styles.supportButton}
                        onPress={() => router.push("/support-chat")}
                      >
                        <Ionicons
                          name="chatbubble-ellipses-outline"
                          size={14}
                          color={palette.foreground}
                        />
                        <Text style={styles.supportButtonText}>
                          Contact support
                        </Text>
                      </Pressable>
                    ) : null}
                  </>
                )}
              </PreparationRuntime>
            </View>
          ) : order.status === "ReadyForPickup" ? (
            <View style={styles.readyPickupCard}>
              <ReadyForPickupIcon />
              <Text style={styles.readyPickupTitle}>
                Packed and ready for pickup
              </Text>
              <Text style={styles.readyPickupMeta}>
                {hasAssignedRider
                  ? `${riderTitle} will pick it up soon`
                  : "We are finding a rider to pick it up"}
              </Text>
            </View>
          ) : trackingState ? (
            <View
              style={[
                styles.stateCard,
                { backgroundColor: trackingState.tint },
              ]}
            >
              <View
                style={[styles.stateIconWrap, { backgroundColor: "#FFFFFFA8" }]}
              >
                <Ionicons
                  name={trackingState.icon}
                  size={20}
                  color={trackingState.accent}
                />
              </View>
              <Text style={styles.stateTitle}>{trackingState.title}</Text>
              <Text style={styles.stateSubtitle}>{trackingState.subtitle}</Text>
            </View>
          ) : null}
        </View>
        ) : null}

        {!isDeliveredOrder &&
        ["Accepted", "Preparing", "ReadyForPickup", "PickedUp"].includes(order.status) ? (
          <View style={styles.sectionInset}>
          <RiderInfoCard
            assigned={hasAssignedRider}
            name={order.riderSnapshot?.name}
            phone={riderPhone}
            vehicleType={order.riderSnapshot?.vehicleType}
            status={order.status}
            onCall={handleCallRider}
            onChat={hasAssignedRider ? () => router.push(`/orders/${orderId}/chat`) : undefined}
            unreadCount={chatQuery.data?.unreadCount ?? 0}
          />
          </View>
        ) : null}

        {/* Stamp card: the happiest moment to hand out the scratch card this order earned. */}
        {isDeliveredOrder && orderScratchCard ? (
          <Pressable
            onPress={() => router.push("/rewards" as never)}
            style={({ pressed }) => [live.rewardBanner, styles.sectionInset, pressed ? live.pressed : null]}
            accessibilityRole="button"
          >
            <View style={live.rewardIcon}>
              <Ionicons name="gift" size={20} color={palette.onPrimary} />
            </View>
            <View style={live.rewardCopy}>
              <Text style={live.rewardTitle}>You earned a spin 🎡</Text>
              <Text style={live.rewardText}>+1 stamp · your spin unlocks soon</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.onPrimary} />
          </Pressable>
        ) : null}

        {isDeliveredOrder ? (
          <View style={styles.deliveredSummaryCard}>
            <View style={styles.deliveredSummaryTopRow}>
              <View style={styles.deliveredSummaryCopy}>
                <View style={styles.deliveredSummaryIcon}>
                  <Ionicons
                    name="checkmark-done-outline"
                    size={18}
                    color={palette.secondary}
                  />
                </View>
                <View style={styles.deliveredSummaryTextWrap}>
                  <Text style={styles.deliveredSummaryTitle}>
                    Delivered successfully
                  </Text>
                  <Text style={styles.deliveredSummaryMeta}>
                    {totalItemCount} item{totalItemCount === 1 ? "" : "s"} from {restaurantName}
                  </Text>
                </View>
              </View>
              <View style={styles.deliveredSummaryTotalBox}>
                <Text style={styles.deliveredSummaryTotalLabel}>Total</Text>
                <Text style={styles.deliveredSummaryTotalValue}>
                  {formatCurrency(order.pricing?.total ?? 0)}
                </Text>
                <Pressable
                  style={[
                    styles.deliveredReorderButton,
                    isCurrentOrderReordering ? styles.deliveredReorderButtonDisabled : null,
                  ]}
                  disabled={isCurrentOrderReordering}
                  onPress={() => {
                    void handleReorder();
                  }}
                >
                  {isCurrentOrderReordering ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="refresh-outline" size={14} color="#fff" />
                      <Text style={styles.deliveredReorderButtonText}>Reorder</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        {!isDeliveredOrder ? (
          <View style={styles.detailsButtonRow}>
            <Pressable
              android_ripple={{ color: "rgba(255,255,255,0.18)" }}
              style={({ pressed }) => [
                styles.detailsButton,
                styles.detailsButtonFull,
                pressed && styles.detailsButtonPressed,
              ]}
              onPress={openDetailsSheet}
            >
              <Ionicons name="receipt-outline" size={15} color="#fff" />
              <Text style={styles.detailsButtonText}>Order details</Text>
            </Pressable>
          </View>
        ) : null}

        {order.note?.trim() ? (
          <View style={styles.noteCard}>
            <Pressable
              style={styles.noteHeader}
              onPress={() => setNoteExpanded((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel="Your order note"
            >
              <View style={styles.noteHeaderLeft}>
                <Ionicons
                  name="document-text-outline"
                  size={17}
                  color={palette.secondary}
                />
                <Text style={styles.noteTitle}>Your note</Text>
              </View>
              <Ionicons
                name={noteExpanded ? "chevron-up" : "chevron-down"}
                size={18}
                color={palette.mutedForeground}
              />
            </Pressable>
            {noteExpanded ? (
              <Text style={styles.noteBody}>{order.note.trim()}</Text>
            ) : (
              <Text style={styles.noteBodyPreview} numberOfLines={1}>
                {order.note.trim()}
              </Text>
            )}
          </View>
        ) : null}

        {!isDeliveredOrder ? (
        <View style={styles.routeCard}>
          <View style={styles.routeHeader}>
            <Text style={styles.routeTitle}>Delivery route</Text>
          </View>

          <View style={styles.routeSteps}>
            <View style={styles.routeRail}>
              <View style={styles.routeDotPrimary} />
              <View style={styles.routeLine} />
              <View style={styles.routeDotSecondary} />
            </View>

            <View style={styles.routeStops}>
              <View style={styles.routeStop}>
                <Text style={styles.routeStopLabel}>Pickup from</Text>
                <Text style={styles.routeStopTitle}>{restaurantName}</Text>
                <Text style={styles.routeStopMeta}>
                  {restaurantAddressText}
                </Text>
              </View>

              <View style={styles.routeStop}>
                <Text style={styles.routeStopLabel}>Deliver to</Text>
                <Text style={styles.routeStopTitle}>
                  {order.customerSnapshot?.deliveryAddress?.label ||
                    "Your location"}
                </Text>
                <Text style={styles.routeStopMeta}>{deliveryAddressText}</Text>
              </View>
            </View>
          </View>
        </View>
        ) : null}

        {isDeliveredOrder ? (
          <View style={styles.journeyCard}>
            <Text style={styles.journeyTitle}>Order details</Text>
            <Text style={styles.detailsDateText}>
              Placed {formatDateTimeAmPm(order.createdAt)}
            </Text>
            {renderOrderReceipt()}
          </View>
        ) : null}

        {order.customerReview ? (
          <View style={styles.reviewCard}>
            <View style={styles.reviewHeaderRow}>
              <View>
                <Text style={styles.reviewTitle}>Your review</Text>
                <Text style={styles.reviewHint}>Thanks for your feedback</Text>
              </View>
              <View style={styles.reviewDoneBadge}>
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color={palette.successText}
                />
                <Text style={styles.reviewDoneBadgeText}>Reviewed</Text>
              </View>
            </View>
          </View>
        ) : null}

        {canReviewOrder ? (
          <Pressable
            style={({ pressed }) => [
              styles.reviewCard,
              styles.rateCtaCard,
              pressed ? styles.rateCtaCardPressed : null,
            ]}
            onPress={openReviewScreen}
          >
            <View style={styles.rateCtaIcon}>
              <Ionicons name="star" size={20} color={palette.amber} />
            </View>
            <View style={styles.rateCtaCopy}>
              <Text style={styles.reviewTitle}>Rate this order</Text>
              <Text style={styles.reviewHint}>
                Tell us how your food and delivery felt.
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={palette.mutedForeground}
            />
          </Pressable>
        ) : null}
      </ScrollView>
      </BelaPullToRefresh>

      {overlays}
    </SafeAreaView>
  );
}

const staleStyles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#FFF3D6",
  },
  copy: { flex: 1, gap: 2 },
  title: { fontSize: 13, lineHeight: 18, fontWeight: "700", color: "#5C3D00" },
  text: { fontSize: 12, lineHeight: 16, color: "#8A5A00" },
});

// Live-order layout (location-picker style). Flat: only floating things get a shadow.
const floatingShadow = {
  shadowColor: "#000000",
  shadowOpacity: 0.14,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 5 },
  elevation: 7,
};

const live = StyleSheet.create({
  rewardBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: palette.primary,
  },
  rewardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  rewardCopy: { flex: 1, gap: 2 },
  rewardTitle: { fontSize: 15, fontWeight: "800", color: palette.onPrimary },
  rewardText: { fontSize: 12.5, color: "rgba(17,17,17,0.72)" },
  root: { flex: 1, backgroundColor: palette.background },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },

  stage: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: palette.primarySoft },
  stageArt: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingBottom: 36 },
  stageLottie: { width: 170, height: 150 },
  stageIconCircle: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center" },
  stageCaption: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: palette.surface,
  },
  stageCaptionText: { fontSize: 13, lineHeight: 17, fontWeight: "700", color: palette.foreground },

  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    ...floatingShadow,
  },
  titlePill: {
    flexShrink: 1,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: palette.surface,
    ...floatingShadow,
  },
  titleText: { fontSize: 14.5, lineHeight: 19, fontWeight: "700", color: palette.foreground },
  titleSub: { fontSize: 11.5, lineHeight: 15, color: palette.mutedForeground },

  sheet: {
    flex: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: palette.background,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4.5,
    borderRadius: 999,
    marginTop: 10,
    marginBottom: 4,
    backgroundColor: "#D5D7DB",
  },
  sheetContent: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },

  statusCard: {
    padding: 16,
    gap: 16,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6E6E6",
  },
  statusRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  statusCopy: { flex: 1, minWidth: 0, gap: 8 },
  statusChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusChipText: { fontSize: 12.5, lineHeight: 16, fontWeight: "700" },
  statusLineGroup: { gap: 4 },
  statusLine: { fontSize: 13.5, lineHeight: 19, color: palette.mutedForeground },
  statusLineStrong: { fontSize: 18, lineHeight: 24, fontWeight: "700", color: palette.foreground },
  inlineAction: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: palette.surfaceMuted,
  },
  inlineActionText: { fontSize: 12.5, lineHeight: 16, fontWeight: "700", color: palette.foreground },
  amountBox: { alignItems: "flex-end", gap: 6 },
  amount: { fontSize: 24, lineHeight: 30, fontWeight: "800", color: palette.foreground },
  payChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
  },
  payChipPaid: { backgroundColor: "#E7F7EE" },
  payChipText: { fontSize: 11.5, lineHeight: 15, fontWeight: "700", color: palette.secondary },
  payChipTextPaid: { color: palette.successText },

  steps: { flexDirection: "row" },
  step: { flex: 1, alignItems: "center", gap: 6 },
  stepTrack: { flexDirection: "row", alignItems: "center", alignSelf: "stretch" },
  stepLine: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "#E4E5E8" },
  stepLineDone: { backgroundColor: palette.primary },
  stepLineHidden: { backgroundColor: "transparent" },
  stepDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E4E5E8",
  },
  stepDotDone: { backgroundColor: palette.primary },
  stepDotCurrent: { backgroundColor: palette.surface, borderWidth: 4, borderColor: palette.primary },
  stepLabel: { fontSize: 10.5, lineHeight: 13, color: palette.mutedForeground },
  stepLabelCurrent: { fontWeight: "700", color: palette.foreground },

  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#FFF3D6",
  },
  noticeDone: { backgroundColor: "#E7F7EE" },
  noticeCopy: { flex: 1, gap: 2 },
  noticeTitle: { fontSize: 13, lineHeight: 18, fontWeight: "700", color: "#5C3D00" },
  noticeText: { fontSize: 12, lineHeight: 16, color: "#8A5A00" },

  detailsButton: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: palette.primarySoft,
    borderWidth: 1.5,
    borderColor: palette.primary,
  },
  detailsIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  detailsCopy: { flex: 1, minWidth: 0 },
  detailsTitle: { fontSize: 15, lineHeight: 20, fontWeight: "700", color: palette.foreground },
  detailsSub: { fontSize: 12, lineHeight: 16, color: palette.mutedForeground },

  card: {
    padding: 14,
    gap: 10,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6E6E6",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { flex: 1, fontSize: 14.5, lineHeight: 19, fontWeight: "700", color: palette.foreground },
  cardBody: { fontSize: 13, lineHeight: 19, color: palette.mutedForeground },
  route: { flexDirection: "row", gap: 12 },
  routeRail: { width: 14, alignItems: "center", paddingTop: 4 },
  routeDotFrom: { width: 12, height: 12, borderRadius: 6, backgroundColor: palette.primary },
  routeLine: { flex: 1, width: 2, marginVertical: 4, backgroundColor: "#E4E5E8" },
  routeDotTo: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: palette.foreground },
  routeStops: { flex: 1, gap: 14 },
  routeLabel: { fontSize: 11, lineHeight: 14, fontWeight: "700", letterSpacing: 0.4, color: palette.mutedForeground },
  routeTitle: { fontSize: 14, lineHeight: 19, fontWeight: "700", color: palette.foreground },
  routeMeta: { fontSize: 12.5, lineHeight: 17, color: palette.mutedForeground },
});
