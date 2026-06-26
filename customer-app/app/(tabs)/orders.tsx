import { Ionicons } from "@expo/vector-icons";
import LottieView from "lottie-react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ReorderCartSwitchModal } from "@/src/components/orders/reorder-cart-switch-modal";
import { EmptyStateCard } from "@/src/components/empty-state-card";
import { OrdersTabSkeleton } from "@/src/components/loading-skeleton";
import { styles } from "@/src/components/orders/orders-list.styles";
import { OfflineNoticeCard } from "@/src/components/offline-notice-card";
import {
  useCustomerHistoryOrdersInfiniteQuery,
  useCustomerLiveOrdersQuery,
  useCustomerReorderMutation,
} from "@/src/hooks/use-customer-api";
import { useIsOnline } from "@/src/hooks/use-network-status";
import { formatCurrency } from "@/src/lib/currency";
import { getCustomerOrderStatusMeta } from "@/src/lib/customer-order-display";
import { formatCustomerAddressLine } from "@/src/lib/location-address";
import { formatShortOrderIdLabel } from "@/src/lib/order-id";
import { useAppBannerStore } from "@/src/store/app-banner-store";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";

type CustomerOrderSummary = {
  _id: string;
  restaurantId?: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  pricing?: { total?: number };
  itemsSnapshot?: {
    itemId?: string;
    name?: string;
    quantity?: number;
    unitPrice?: number;
    selectedVariantOptions?: { groupName?: string; optionLabel?: string }[];
    selectedAddOnOptions?: { groupName?: string; optionLabel?: string }[];
  }[];
  riderSnapshot?: { name?: string; phone?: string };
  customerSnapshot?: {
    deliveryAddress?: {
      addressLine?: string;
    };
  };
  hasCustomerReview?: boolean;
  createdAt?: string;
  terminalReason?: string;
  cancelledBy?: string;
};

function formatDateTime(value?: string) {
  if (!value) return "Recently";
  return new Date(value).toLocaleString("en-BD", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function isActiveStatus(status: string) {
  return [
    "New",
    "Accepted",
    "Preparing",
    "ReadyForPickup",
    "PickedUp",
  ].includes(status);
}

function isCancelledStatus(status: string) {
  return ["Cancelled", "Rejected"].includes(status);
}

function canRateOrder(status: string, hasCustomerReview?: boolean) {
  return status === "Delivered" && !hasCustomerReview;
}

function getCancelledOrderMessage(order: CustomerOrderSummary) {
  const normalizedReason = order.terminalReason
    ?.replace(/[_-]/g, " ")
    .toLowerCase();

  if (order.status === "Rejected") {
    return "The restaurant could not accept this order. Please try another restaurant.";
  }
  if (order.cancelledBy === "customer") return "You cancelled this order.";
  if (
    order.cancelledBy === "system" ||
    order.terminalReason === "system_auto_cancel_unaccepted" ||
    normalizedReason?.includes("auto cancel") ||
    normalizedReason?.includes("unaccepted")
  ) {
    return "Auto-cancelled because the restaurant did not accept in time.";
  }
  if (order.cancelledBy === "owner" || order.cancelledBy === "restaurant") {
    return "The restaurant cancelled this order.";
  }
  return "This order was cancelled.";
}

function getActiveOrderHeadline(status: string) {
  switch (status) {
    case "New":
      return "Waiting for restaurant confirmation";
    case "Accepted":
      return "Restaurant confirmed your order";
    case "Preparing":
      return "Your food is being prepared";
    case "ReadyForPickup":
      return "Packed and ready for pickup";
    case "PickedUp":
      return "Rider is on the way";
    default:
      return "Active order";
  }
}

function getActiveOrderCardLine(order: CustomerOrderSummary) {
  if (order.status === "ReadyForPickup") {
    return order.riderSnapshot?.name
      ? `${order.riderSnapshot.name} assigned for pickup`
      : "Ready for rider pickup";
  }
  if (order.status === "PickedUp") {
    return order.riderSnapshot?.name
      ? `${order.riderSnapshot.name} is on the way`
      : "Rider is on the way";
  }
  return getActiveOrderHeadline(order.status);
}

function getActiveOrderCardIcon(order: CustomerOrderSummary) {
  if (order.riderSnapshot?.name || order.status === "PickedUp") {
    return "bicycle-outline" as const;
  }
  if (order.status === "Preparing") {
    return "restaurant-outline" as const;
  }
  if (order.status === "ReadyForPickup") {
    return "bag-handle-outline" as const;
  }
  return "receipt-outline" as const;
}

export default function OrdersScreen() {
  const router = useRouter();
  const customer = useCustomerAuthStore((state) => state.customer);
  const liveOrdersQuery = useCustomerLiveOrdersQuery();
  const historyOrdersEnabled = liveOrdersQuery.isFetched;
  const historyOrdersQuery =
    useCustomerHistoryOrdersInfiniteQuery(historyOrdersEnabled);
  const reorderMutation = useCustomerReorderMutation();
  const showBanner = useAppBannerStore((state) => state.showBanner);
  const isOnline = useIsOnline();
  const [reorderConflictOrder, setReorderConflictOrder] =
    useState<CustomerOrderSummary | null>(null);
  const [reorderConflictMeta, setReorderConflictMeta] = useState<{
    currentRestaurantName: string;
    incomingRestaurantName: string;
    previewItemName: string;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const activeOrders = useMemo(
    () =>
      (liveOrdersQuery.data ?? []).filter((order) =>
        isActiveStatus(order.status),
      ),
    [liveOrdersQuery.data],
  );
  const historyOrders = useMemo(
    () => (historyOrdersQuery.data?.pages ?? []).flat(),
    [historyOrdersQuery.data?.pages],
  );
  const isLiveInitialLoading =
    liveOrdersQuery.isLoading && activeOrders.length === 0;
  const isHistoryInitialLoading =
    historyOrdersEnabled &&
    !historyOrdersQuery.isFetched &&
    historyOrders.length === 0;
  const isAnyInitialLoading = isLiveInitialLoading || isHistoryInitialLoading;
  const hasAnyOrders = activeOrders.length > 0 || historyOrders.length > 0;

  function handleOrdersScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    if (
      distanceFromBottom < 420 &&
      historyOrdersQuery.hasNextPage &&
      !historyOrdersQuery.isFetchingNextPage
    ) {
      void historyOrdersQuery.fetchNextPage();
    }
  }

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      const jobs: Promise<unknown>[] = [liveOrdersQuery.refetch()];
      if (historyOrdersEnabled) {
        jobs.push(historyOrdersQuery.refetch());
      }
      await Promise.all(jobs);
    } finally {
      setIsRefreshing(false);
    }
  }

  const handleReorder = async (
    order: CustomerOrderSummary,
    forceReplace = false,
  ) => {
    void Haptics.selectionAsync();
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
      setReorderConflictOrder(order);
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

  if (!customer) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={[styles.emptyState, styles.signedOutEmptyState]}>
          <LottieView
            source={require("@/assets/animations/waiting.json")}
            autoPlay
            loop
            style={styles.emptyAnimation}
          />
          <EmptyStateCard
            title="Sign in to see your orders"
            description="Your full order history stays tied to your verified customer account."
            actionLabel="Sign in"
            onPress={() =>
              router.push({
                pathname: "/sign-in",
                params: { redirectTo: "/(tabs)/orders" },
              })
            }
          />
        </View>
      </SafeAreaView>
    );
  }

  if (liveOrdersQuery.isError && historyOrdersQuery.isError && !hasAnyOrders) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.emptyState}>
          <EmptyStateCard
            title={
              isOnline
                ? "Could not load your orders"
                : "Orders are unavailable offline"
            }
            description={
              isOnline
                ? "Please try again in a moment."
                : "Reconnect to load your latest order history and live updates."
            }
            actionLabel={isOnline ? "Retry" : "Browse restaurants"}
            onPress={
              isOnline
                ? () => {
                    void liveOrdersQuery.refetch();
                    void historyOrdersQuery.refetch();
                  }
                : () => router.push("/(tabs)/browse")
            }
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        onScroll={handleOrdersScroll}
        scrollEventThrottle={200}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={palette.primary}
            colors={[palette.primary, palette.secondary, "#FF5C93"]}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.kicker}>Orders</Text>
          <Text style={styles.title}>Track your orders</Text>
          {/* <Text style={styles.subtitle}>
            Live orders stay first, with your past orders right below.
          </Text> */}
          {!isOnline ? (
            <OfflineNoticeCard description="Showing your last synced orders. Live delivery updates will resume when you're back online." />
          ) : null}
        </View>

        {!hasAnyOrders && isAnyInitialLoading ? (
          <View style={styles.inlineLoadingWrap}>
            <OrdersTabSkeleton />
          </View>
        ) : !hasAnyOrders ? (
          <View style={styles.inlineEmptyWrap}>
            <LottieView
              source={require("@/assets/animations/waiting.json")}
              autoPlay
              loop
              style={styles.emptyAnimation}
            />
            <EmptyStateCard
              title="No orders yet"
              description="Once you place an order, live status and history will show up here."
              actionLabel="Browse restaurants"
              onPress={() => router.push("/(tabs)/browse")}
            />
          </View>
        ) : null}

        {!isLiveInitialLoading && activeOrders.length ? (
          <Section
            title="Active orders"
            subtitle="These are the orders that still need your attention."
          >
            {activeOrders.map((order) => (
              <OrderCard
                key={order._id}
                order={order}
                onPress={() =>
                  router.push({
                    pathname: "/orders/[orderId]",
                    params: { orderId: order._id },
                  })
                }
              />
            ))}
          </Section>
        ) : null}

        {!isHistoryInitialLoading && historyOrders.length ? (
          <Section
            title="Order history"
            subtitle="Delivered, rejected, and cancelled orders load page by page."
          >
            {historyOrders.map((order) => (
              <OrderCard
                key={order._id}
                order={order}
                compact
                reorderPending={
                  reorderMutation.isPending &&
                  reorderMutation.variables?.order._id === order._id
                }
                onReorderPress={
                  order.status === "Delivered"
                    ? () => {
                        void handleReorder(order);
                      }
                    : undefined
                }
                onPress={() =>
                  router.push({
                    pathname: "/orders/[orderId]",
                    params: { orderId: order._id },
                  })
                }
              />
            ))}
            {historyOrdersQuery.isFetchingNextPage ? (
              <View style={styles.historyFooterLoader}>
                <ActivityIndicator size="small" color={palette.secondary} />
                <Text style={styles.historyFooterText}>
                  Loading more history
                </Text>
              </View>
            ) : null}
          </Section>
        ) : null}

        {!isHistoryInitialLoading && historyOrdersQuery.isError ? (
          <View style={styles.inlineEmptyWrap}>
            <EmptyStateCard
              title="Could not load order history"
              description="Live orders can still update. Try loading your past orders again."
              actionLabel="Retry history"
              onPress={() => {
                void historyOrdersQuery.refetch();
              }}
            />
          </View>
        ) : null}
      </ScrollView>

      <ReorderCartSwitchModal
        visible={Boolean(reorderConflictOrder && reorderConflictMeta)}
        previewItemName={
          reorderConflictMeta?.previewItemName ?? "Delivered items"
        }
        currentRestaurantName={
          reorderConflictMeta?.currentRestaurantName ?? "your current cart"
        }
        incomingRestaurantName={
          reorderConflictMeta?.incomingRestaurantName ?? "this restaurant"
        }
        onClose={() => {
          setReorderConflictOrder(null);
          setReorderConflictMeta(null);
        }}
        onConfirm={() => {
          if (!reorderConflictOrder) return;
          setReorderConflictMeta(null);
          void handleReorder(reorderConflictOrder, true).finally(() => {
            setReorderConflictOrder(null);
          });
        }}
      />
    </SafeAreaView>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.cardList}>{children}</View>
    </View>
  );
}

function OrderCard({
  order,
  onPress,
  onReorderPress,
  reorderPending,
  compact = false,
}: {
  order: CustomerOrderSummary;
  onPress: () => void;
  onReorderPress?: () => void;
  reorderPending?: boolean;
  compact?: boolean;
}) {
  const isActive = isActiveStatus(order.status);
  const isCancelled = isCancelledStatus(order.status);
  const statusMeta = getCustomerOrderStatusMeta(order.status);
  const deliveryAddress = formatCustomerAddressLine(
    order.customerSnapshot?.deliveryAddress?.addressLine,
    "Delivery address unavailable",
  );
  if (isActive) {
    const progressWidth =
      order.status === "New"
        ? "18%"
        : order.status === "Accepted"
          ? "36%"
          : order.status === "Preparing"
            ? "62%"
            : order.status === "ReadyForPickup"
              ? "80%"
              : "100%";

    return (
      <Pressable
        style={({ pressed }) => [
          styles.orderCard,
          styles.orderCardActive,
          pressed ? styles.orderCardPressed : null,
        ]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityHint="Opens live order tracking"
      >
        <View style={styles.orderTopRow}>
          <View style={styles.orderCopy}>
            <Text style={styles.orderMeta}>
              {formatShortOrderIdLabel(order.orderNumber)} -{" "}
              {formatDateTime(order.createdAt)}
            </Text>
          </View>
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

        <View style={styles.activeProgressCard}>
          <View style={styles.activeProgressTopRow}>
            <View style={styles.activeProgressChip}>
              <Ionicons
                name={getActiveOrderCardIcon(order)}
                size={14}
                color={palette.secondary}
              />
              <Text style={styles.activeProgressChipText} numberOfLines={1}>
                {getActiveOrderCardLine(order)}
              </Text>
            </View>
            <View style={styles.activeProgressAmountRow}>
              <Text style={styles.orderTotal}>
                {formatCurrency(order.pricing?.total ?? 0)}
              </Text>
              <View style={styles.activeOpenCue}>
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={palette.secondary}
                />
              </View>
            </View>
          </View>

          <View style={styles.activeProgressTrack}>
            <View
              style={[styles.activeProgressFill, { width: progressWidth }]}
            />
          </View>

          <View style={styles.activeDestinationRow}>
            <Ionicons
              name="location-outline"
              size={15}
              color={palette.mutedForeground}
            />
            <Text style={styles.orderAddress} numberOfLines={1}>
              {deliveryAddress}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }

  if (compact) {
    const itemCount = order.itemsSnapshot?.length ?? 0;
    const previewItems = (order.itemsSnapshot ?? []).slice(0, 2);
    const remainingItemCount = Math.max(itemCount - previewItems.length, 0);

    return (
      <Pressable
        style={({ pressed }) => [
          styles.orderCard,
          styles.orderCardCompact,
          pressed ? styles.orderCardPressed : null,
        ]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityHint="Opens order details"
      >
        <View style={styles.orderTopRow}>
          <View style={styles.orderCopy}>
            <Text style={styles.orderIdCompact} numberOfLines={1}>
              {formatShortOrderIdLabel(order.orderNumber)}
            </Text>
            <Text style={styles.orderMeta}>
              {formatDateTime(order.createdAt)} - {itemCount} item
              {itemCount === 1 ? "" : "s"}
            </Text>
          </View>
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

        {order.status === "Delivered" && previewItems.length > 0 ? (
          <View style={styles.compactHistoryItems}>
            {previewItems.map((item, index) => (
              <Text
                key={`${item.itemId ?? item.name ?? "item"}-${index}`}
                style={styles.compactHistoryItemText}
                numberOfLines={1}
              >
                {item.quantity ?? 1}x {item.name ?? "Food item"}
              </Text>
            ))}
            {remainingItemCount > 0 ? (
              <Text style={styles.compactHistoryMoreText}>
                +{remainingItemCount} more
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.compactHistoryBottomRow}>
          <Text style={styles.orderTotal}>
            {formatCurrency(order.pricing?.total ?? 0)}
          </Text>
          <View style={styles.compactHistoryActions}>
            {order.status === "Delivered" && onReorderPress ? (
              <Pressable
                style={[
                  styles.reorderButton,
                  styles.reorderButtonCompact,
                  reorderPending ? styles.reorderButtonDisabled : null,
                ]}
                onPress={onReorderPress}
                disabled={reorderPending}
              >
                {reorderPending ? (
                  <ActivityIndicator size="small" color={palette.secondary} />
                ) : (
                  <>
                    <Ionicons
                      name="refresh-outline"
                      size={15}
                      color={palette.secondary}
                    />
                    <Text style={styles.reorderButtonText}>Reorder</Text>
                  </>
                )}
              </Pressable>
            ) : null}
            <Ionicons
              name="chevron-forward"
              size={16}
              color={palette.mutedForeground}
            />
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.orderCard,
        pressed ? styles.orderCardPressed : null,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint="Opens order details"
    >
      <View style={styles.orderTopRow}>
        <View style={styles.orderCopy}>
          <Text style={styles.orderRestaurant} numberOfLines={1}>
            {formatShortOrderIdLabel(order.orderNumber)}
          </Text>
          <Text style={styles.orderMeta}>
            {formatDateTime(order.createdAt)}
          </Text>
          <Text style={styles.orderMeta}>
            {order.itemsSnapshot?.length ?? 0} item
            {(order.itemsSnapshot?.length ?? 0) === 1 ? "" : "s"} -{" "}
            {order.paymentMethod}
          </Text>
        </View>
        <View
          style={[
            styles.statusPill,
            { backgroundColor: statusMeta.background },
          ]}
        >
          <Ionicons name={statusMeta.icon} size={13} color={statusMeta.color} />
          <Text style={[styles.statusPillText, { color: statusMeta.color }]}>
            {statusMeta.label}
          </Text>
        </View>
      </View>

      <View style={styles.orderItemsWrap}>
        {(order.itemsSnapshot ?? []).slice(0, 3).map((item, index) => (
          <Text
            key={`${item.itemId ?? item.name ?? "item"}-${index}`}
            style={styles.orderItemLine}
          >
            {item.quantity ?? 0} x {item.name ?? "Menu item"}
          </Text>
        ))}
        {(order.itemsSnapshot?.length ?? 0) > 3 ? (
          <Text style={styles.orderMoreItems}>
            +{(order.itemsSnapshot?.length ?? 0) - 3} more items
          </Text>
        ) : null}
      </View>

      <View style={styles.orderBottomRow}>
        <View style={styles.orderBottomLeft}>
          <View style={styles.orderAddressWrap}>
            <Ionicons
              name="location-outline"
              size={15}
              color={palette.mutedForeground}
            />
            <Text style={styles.orderAddress} numberOfLines={1}>
              {deliveryAddress}
            </Text>
          </View>

          {isCancelled ? (
            <Text style={styles.orderAddress} numberOfLines={2}>
              {getCancelledOrderMessage(order)}
            </Text>
          ) : canRateOrder(order.status, order.hasCustomerReview) ? (
            <Text style={styles.orderAddress}>Open to leave your review.</Text>
          ) : (
            <Text style={styles.orderAddress}>
              Open to see the full breakdown again.
            </Text>
          )}
        </View>
        <View style={styles.orderTrailingMeta}>
          {order.status === "Delivered" ? (
            <Text style={styles.orderTotal}>
              {formatCurrency(order.pricing?.total ?? 0)}
            </Text>
          ) : null}
          <Ionicons
            name="chevron-forward"
            size={16}
            color={palette.mutedForeground}
          />
        </View>
      </View>

      {order.status === "Delivered" && onReorderPress ? (
        <Pressable
          style={[
            styles.reorderButton,
            reorderPending ? styles.reorderButtonDisabled : null,
          ]}
          onPress={onReorderPress}
          disabled={reorderPending}
        >
          {reorderPending ? (
            <ActivityIndicator size="small" color={palette.secondary} />
          ) : (
            <>
              <Ionicons
                name="refresh-outline"
                size={16}
                color={palette.secondary}
              />
              <Text style={styles.reorderButtonText}>Reorder</Text>
            </>
          )}
        </Pressable>
      ) : null}
    </Pressable>
  );
}
