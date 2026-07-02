import { Ionicons } from "@expo/vector-icons";
import LottieView from "lottie-react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { AppBottomSheet } from "@/src/components/app-bottom-sheet";
import { EmptyStateCard } from "@/src/components/empty-state-card";
import { CardListSkeleton, ShimmerBlock } from "@/src/components/loading-skeleton";
import { LiveOrderMap } from "@/src/components/orders/live-order-map";
import { RiderRatingCard } from "@/src/components/orders/rider-rating-card";
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
  useCustomerReviewMutation,
  useCustomerRiderReviewEnabledQuery,
} from "@/src/hooks/use-customer-api";
import { formatCurrency } from "@/src/lib/currency";
import { getRatingLabel } from "@/src/lib/rating-labels";
import {
  getCustomerOrderStatusMeta,
  getLiveOrderJourneyIndex,
  getLiveOrderTrackingState,
  canCancelCustomerOrder,
  LIVE_ORDER_JOURNEY_STEPS,
} from "@/src/lib/customer-order-display";
import {
  formatDateMedium,
  formatDurationMinutes,
  formatDurationRangeMinutes,
  formatTimeAmPm,
} from "@/src/lib/date-time";
import { formatCustomerAddressLine } from "@/src/lib/location-address";
import { formatShortOrderIdLabel } from "@/src/lib/order-id";
import { getCustomerSocket } from "@/src/lib/socket-client";
import { useIsOnline } from "@/src/hooks/use-network-status";
import { useAppBannerStore } from "@/src/store/app-banner-store";
import { palette } from "@/src/theme/palette";

// Statuses where the order is still live and worth polling as a socket fallback.
const LIVE_TRACKING_STATUSES = [
  "New",
  "Accepted",
  "Preparing",
  "ReadyForPickup",
  "PickedUp",
];

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

function isBkashRefundNoticeVisible(order: {
  status: string;
  paymentMethod?: string;
  paymentStatus?: string;
}) {
  return (
    ["Cancelled", "Rejected"].includes(order.status) &&
    order.paymentMethod === "Bkash" &&
    ["paid", "refund_pending"].includes(order.paymentStatus ?? "")
  );
}

function formatRefundEta(minutes?: number) {
  const safeMinutes =
    typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0
      ? Math.round(minutes)
      : 60;

  if (safeMinutes < 60) {
    return `${safeMinutes} minute${safeMinutes === 1 ? "" : "s"}`;
  }

  const hours = Math.max(1, Math.round(safeMinutes / 60));
  return `${hours} hour${hours === 1 ? "" : "s"}`;
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
  const params = useLocalSearchParams<{ orderId?: string; justPlaced?: string }>();
  const [isDetailsOpen, setDetailsOpen] = useState(false);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [selectedRiderRating, setSelectedRiderRating] = useState(0);
  const [selectedRiderComment, setSelectedRiderComment] = useState("");
  const [reviewComment, setReviewComment] = useState("");
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
  const trackingMapStyleQuery = useCustomerMapStyleQuery("customer.order_tracking");
  const cancelOrderMutation = useCustomerCancelOrderMutation(orderId);
  const reviewMutation = useCustomerReviewMutation(orderId);
  const riderReviewEnabled = useCustomerRiderReviewEnabledQuery().data !== false;
  const reorderMutation = useCustomerReorderMutation();
  const showBanner = useAppBannerStore((state) => state.showBanner);
  const isOnline = useIsOnline();
  const order = orderQuery.data;
  const orderStatus = order?.status;
  const refetchOrder = orderQuery.refetch;
  // Resilience fallback: the socket is the primary live channel, but on a flaky
  // network it can silently drop. While a live order is on-screen and the socket is
  // NOT connected, poll the order so the map and ETA keep advancing. When the socket
  // is healthy it already streams updates, so we skip the extra fetch.
  useEffect(() => {
    if (!orderStatus || !LIVE_TRACKING_STATUSES.includes(orderStatus) || !isOnline) {
      return;
    }
    const interval = setInterval(() => {
      if (getCustomerSocket()?.connected) {
        return;
      }
      void refetchOrder();
    }, 25_000);
    return () => clearInterval(interval);
  }, [orderStatus, isOnline, refetchOrder]);
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
              <Text style={styles.orderIdText}>
                {isJustPlaced ? "Opening tracking" : "Loading order"}
              </Text>
            </View>
          </View>
          {isJustPlaced ? (
            <View style={styles.justPlacedLoadingWrap}>
              <View style={styles.justPlacedCard}>
                <View style={styles.justPlacedIconWrap}>
                  <ActivityIndicator size="small" color={palette.secondary} />
                </View>
                <View style={styles.justPlacedCopy}>
                  <Text style={styles.justPlacedTitle}>Opening live tracking</Text>
                  <Text style={styles.justPlacedText}>
                    We are syncing the latest restaurant and rider state.
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.trackingSkeletonWrap}>
              <ShimmerBlock style={styles.trackingSkeletonMap} />
              <CardListSkeleton count={3} cardHeight={96} />
            </View>
          )}
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
  const canShowLiveMap = order.status === "PickedUp" && !isQueuedForDelivery;
  const queuedDeliveryEtaText =
    typeof queuedEtaMinutes === "number" && Number.isFinite(queuedEtaMinutes)
      ? `Delivery man will arrive in ${formatDurationRangeMinutes(
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
  const riderPhone = order.riderSnapshot?.phone?.trim() || "";
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
  const showBkashRefundNotice = isBkashRefundNoticeVisible(order);
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
  const handleSubmitReview = () => {
    if (!selectedRating) {
      return;
    }

    reviewMutation.mutate({
      rating: selectedRating,
      comment: reviewComment.trim() || undefined,
      riderRating: selectedRiderRating > 0 ? selectedRiderRating : undefined,
      riderComment:
        selectedRiderRating > 0 && selectedRiderComment.trim()
          ? selectedRiderComment.trim()
          : undefined,
    });
  };
  const handleReorder = async (forceReplace = false) => {
    const result = await reorderMutation.mutateAsync({
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        restaurantId: order.restaurantId,
        itemsSnapshot: order.itemsSnapshot,
      },
      forceReplace,
    });

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
    router.push("/(tabs)/cart");
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
    Alert.alert(
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
  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 32 + Math.max(insets.bottom, 16) },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isManualRefreshing}
            onRefresh={handleManualRefresh}
            tintColor={palette.primary}
            colors={[palette.primary, palette.secondary, "#FF5C93"]}
          />
        }
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
            <View style={styles.orderHeaderRow}>
              <Text style={styles.orderIdText}>
                {formatShortOrderIdLabel(order.orderNumber)}
              </Text>
              <View
                style={[
                  styles.statusPill,
                  { backgroundColor: statusMeta.background },
                ]}
              >
                <Ionicons
                  name={statusMeta.icon}
                  size={13}
                  color={statusMeta.color}
                />
                <Text style={[styles.statusPillText, { color: statusMeta.color }]}>
                  {statusMeta.label}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {!isOnline ? (
          <View style={styles.offlineNoticeWrap}>
            <OfflineNoticeCard description="You're offline. Live rider movement is paused until your connection returns." />
          </View>
        ) : null}

        {showBkashRefundNotice ? (
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

        {!isDeliveredOrder ? (
        <View style={styles.trackingCard}>
          {canShowLiveMap ? (
            customerLocation ? (
              <LiveOrderMap
                customerLocation={customerLocation}
                restaurantLocation={restaurantLocation}
                riderLocation={riderLocation}
                riderHeading={riderHeading}
                status={order.status}
                riderAccentColor="#FF2B85"
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
                  color={palette.primary}
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
                  color={palette.primary}
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
                          ? `${formatDurationMinutes(
                              Math.max(remainingMinutes, 1),
                            )} left`
                          : "Preparing now"}
                    </Text>
                    <Text style={styles.preparingRangeMeta}>
                      {estimate?.supportingText ||
                        (estimate
                          ? "Based on the restaurant's live prep timer."
                          : "Live rider updates start after pickup.")}
                    </Text>
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
              <View style={styles.readyPickupPill}>
                <Ionicons
                  name="bicycle-outline"
                  size={14}
                  color={palette.primary}
                />
                <Text style={styles.readyPickupPillText}>
                  {hasAssignedRider
                    ? "Rider assigned for pickup"
                    : "Waiting for rider assignment"}
                </Text>
              </View>
              {hasAssignedRider ? (
                <View style={styles.readyPickupAssignedChip}>
                  <View style={styles.readyPickupAssignedLeft}>
                    <View style={styles.readyPickupAssignedAvatar}>
                      <Ionicons
                        name="bicycle-outline"
                        size={17}
                        color={palette.secondary}
                      />
                    </View>
                  <View style={styles.readyPickupAssignedCopy}>
                    <Text style={styles.readyPickupAssignedLabel}>
                      Assigned rider
                    </Text>
                    <View style={styles.readyPickupAssignedMetaRow}>
                      <Text style={styles.readyPickupAssignedValue} numberOfLines={1}>
                        {order.riderSnapshot?.name || "Rider assigned"}
                      </Text>
                      {riderPhone ? (
                        <>
                          <View style={styles.readyPickupAssignedDot} />
                          <Text style={styles.readyPickupAssignedPhone} numberOfLines={1}>
                            {riderPhone}
                          </Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                  </View>
                  {riderPhone ? (
                    <Pressable
                      style={styles.readyPickupCallButton}
                      onPress={handleCallRider}
                    >
                      <Ionicons
                        name="call-outline"
                        size={16}
                        color={palette.secondary}
                      />
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
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

        {journeyIndex >= 0 && !isDeliveredOrder ? (
          <View style={styles.journeyCard}>
            <Text style={styles.journeyTitle}>Order journey</Text>

            <View style={styles.journeyRow}>
              {LIVE_ORDER_JOURNEY_STEPS.map((step, index) => {
                const isCompleted = index < journeyIndex;
                const isCurrent = index === journeyIndex;
                const isDeliveredCurrent =
                  order.status === "Delivered" && step.key === "Delivered";

                return (
                  <View key={step.key} style={styles.journeyStep}>
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
                            styles.journeyLine,
                            index < journeyIndex
                              ? styles.journeyLineDone
                              : null,
                          ]}
                        />
                      ) : null}
                    </View>
                    <Text
                      style={[
                        styles.journeyStepLabel,
                        isCompleted || isCurrent
                          ? styles.journeyStepLabelActive
                          : null,
                      ]}
                    >
                      {step.label}
                    </Text>
                  </View>
                );
              })}
            </View>
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
          <View style={styles.reviewCard}>
            <View style={styles.reviewHeaderRow}>
              <View>
                <Text style={styles.reviewTitle}>Rate this order</Text>
                <Text style={styles.reviewHint}>
                  Tell us how your food and delivery felt.
                </Text>
              </View>
            </View>
            <View style={styles.reviewStarsRow}>
              {Array.from({ length: 5 }).map((_, index) => {
                const ratingValue = index + 1;
                const isActive = ratingValue <= selectedRating;

                return (
                  <Pressable
                    key={`star-${ratingValue}`}
                    style={styles.reviewStarButton}
                    onPress={() => setSelectedRating(ratingValue)}
                  >
                    <Ionicons
                      name={isActive ? "star" : "star-outline"}
                      size={23}
                      color={isActive ? palette.amber : palette.mutedForeground}
                    />
                  </Pressable>
                );
              })}
            </View>
            {selectedRating > 0 ? (
              <Text style={styles.reviewRatingLabel}>
                {getRatingLabel(selectedRating)}
              </Text>
            ) : null}
            <TextInput
              value={reviewComment}
              onChangeText={setReviewComment}
              placeholder="Add a comment about the food and your order (optional)"
              placeholderTextColor={palette.placeholder}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={styles.reviewInput}
            />
            {(riderPhone || order.riderSnapshot?.name) && riderReviewEnabled ? (
              <RiderRatingCard
                value={selectedRiderRating}
                onChange={setSelectedRiderRating}
                comment={selectedRiderComment}
                onCommentChange={setSelectedRiderComment}
                riderName={order.riderSnapshot?.name}
              />
            ) : null}
            <Pressable
              style={[
                styles.submitReviewButton,
                selectedRating === 0 || reviewMutation.isPending
                  ? styles.submitReviewButtonDisabled
                  : null,
              ]}
              disabled={selectedRating === 0 || reviewMutation.isPending}
              onPress={handleSubmitReview}
            >
              {reviewMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitReviewButtonText}>Submit review</Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

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
          Placed {formatDateMedium(order.createdAt)}
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
                            {statusTime ? formatTimeAmPm(statusTime) : "Pending"}
                          </Text>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

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
                        color={palette.primary}
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
                <View style={styles.paymentRow}>
                  <Text style={styles.paymentLabel}>Delivery fee</Text>
                  <Text style={styles.paymentValue}>
                    {formatCurrency(order.pricing?.deliveryFee ?? 0)}
                  </Text>
                </View>
                {(order.pricing?.discountAmount ?? 0) > 0 ? (
                  <View style={styles.paymentRow}>
                    <Text style={styles.paymentLabel}>Discount</Text>
                    <Text style={styles.paymentDiscount}>
                      -{formatCurrency(order.pricing?.discountAmount ?? 0)}
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
                    <ActivityIndicator size="small" color={palette.primary} />
                  ) : (
                    <Ionicons name="close-circle-outline" size={16} color={palette.primary} />
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
    </SafeAreaView>
  );
}
