import { useQueryClient } from "@tanstack/react-query";
import { useIsFocused } from "@react-navigation/native";
import LottieView from "lottie-react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyStateCard } from "@/src/components/empty-state-card";
import { OrdersTabSkeleton } from "@/src/components/loading-skeleton";
import {
  buildOrderCardModel,
  dedupeOrdersById,
  isActiveStatus,
  OrderCard,
  type OrderCardModel,
  OrdersListSeparator,
  OrdersSectionHeader,
  type CustomerOrderSummary,
} from "@/src/components/orders/customer-order-cards";
import { ReorderCartSwitchModal } from "@/src/components/orders/reorder-cart-switch-modal";
import { styles } from "@/src/components/orders/orders-list.styles";
import { OfflineNoticeCard } from "@/src/components/offline-notice-card";
import {
  useCustomerHistoryOrdersPreviewQuery,
  useCustomerLiveOrdersQuery,
  useCustomerReorderMutation,
} from "@/src/hooks/use-customer-api";
import { useIsOnline } from "@/src/hooks/use-network-status";
import { useAppBannerStore } from "@/src/store/app-banner-store";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";

const ORDER_TAB_HISTORY_PREVIEW_LIMIT = 5;

type OrdersListItem =
  | { type: "loading" }
  | { type: "empty" }
  | { type: "active-header" }
  | { type: "active-order"; card: OrderCardModel }
  | { type: "history-header" }
  | { type: "history-order"; card: OrderCardModel }
  | { type: "history-error" };

export default function OrdersScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isOrdersFocused = useIsFocused();
  const customer = useCustomerAuthStore((state) => state.customer);
  const liveOrdersQuery = useCustomerLiveOrdersQuery(isOrdersFocused);
  const historyOrdersEnabled = isOrdersFocused && liveOrdersQuery.isFetched;
  const historyOrdersQuery = useCustomerHistoryOrdersPreviewQuery(
    historyOrdersEnabled,
    ORDER_TAB_HISTORY_PREVIEW_LIMIT,
  );
  const historyOrdersFetched = historyOrdersQuery.isFetched;
  const historyOrdersError = historyOrdersQuery.isError;
  const refetchHistoryOrders = historyOrdersQuery.refetch;
  const refetchLiveOrders = liveOrdersQuery.refetch;
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
  const reorderPendingOrderId = reorderMutation.variables?.order._id ?? null;

  useEffect(() => {
    queryClient.removeQueries({
      queryKey: ["customer", "orders", "history"],
      predicate: (query) => query.queryKey[3] !== "preview",
    });
  }, [queryClient]);

  const activeOrders = useMemo(
    () =>
      dedupeOrdersById(
        (liveOrdersQuery.data ?? []).filter((order) =>
          isActiveStatus(order.status),
        ),
      ),
    [liveOrdersQuery.data],
  );
  const historyOrders = useMemo(
    () =>
      dedupeOrdersById(historyOrdersQuery.data ?? []).slice(
        0,
        ORDER_TAB_HISTORY_PREVIEW_LIMIT,
      ),
    [historyOrdersQuery.data],
  );
  const isLiveInitialLoading =
    liveOrdersQuery.isLoading && activeOrders.length === 0;
  const isHistoryInitialLoading =
    historyOrdersEnabled && !historyOrdersFetched && historyOrders.length === 0;
  const isAnyInitialLoading = isLiveInitialLoading || isHistoryInitialLoading;
  const hasAnyOrders = activeOrders.length > 0 || historyOrders.length > 0;

  const ordersListItems = useMemo<OrdersListItem[]>(() => {
    if (!hasAnyOrders && isAnyInitialLoading) {
      return [{ type: "loading" }];
    }

    if (!hasAnyOrders) {
      return [{ type: "empty" }];
    }

    const items: OrdersListItem[] = [];
    if (!isLiveInitialLoading && activeOrders.length > 0) {
      items.push({ type: "active-header" });
      activeOrders.forEach((order) =>
        items.push({ type: "active-order", card: buildOrderCardModel(order) }),
      );
    }

    if (!isHistoryInitialLoading && historyOrders.length > 0) {
      items.push({ type: "history-header" });
      historyOrders.forEach((order) =>
        items.push({ type: "history-order", card: buildOrderCardModel(order) }),
      );
    }

    if (!isHistoryInitialLoading && historyOrdersError) {
      items.push({ type: "history-error" });
    }

    return items;
  }, [
    activeOrders,
    hasAnyOrders,
    historyOrders,
    historyOrdersError,
    isAnyInitialLoading,
    isHistoryInitialLoading,
    isLiveInitialLoading,
  ]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const jobs: Promise<unknown>[] = [refetchLiveOrders()];
      if (historyOrdersEnabled) {
        jobs.push(refetchHistoryOrders());
      }
      await Promise.all(jobs);
    } finally {
      setIsRefreshing(false);
    }
  }, [historyOrdersEnabled, refetchHistoryOrders, refetchLiveOrders]);

  const handleReorder = useCallback(
    async (order: CustomerOrderSummary, forceReplace = false) => {
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
            ? `${result.addedItemCount} item${
                result.addedItemCount === 1 ? "" : "s"
              } restored. ${result.skippedCount} could not be added.`
            : `Your cart now has ${result.addedItemCount} item${
                result.addedItemCount === 1 ? "" : "s"
              } from this delivered order.`,
        tone: result.skippedCount > 0 ? "warning" : "success",
      });
      router.push("/(tabs)/cart");
    },
    [reorderMutation, router, showBanner],
  );

  const openOrder = useCallback(
    (orderId: string) => {
      router.push({
        pathname: "/orders/[orderId]",
        params: { orderId },
      });
    },
    [router],
  );

  const renderOrdersItem = useCallback(
    ({ item }: { item: OrdersListItem }) => {
      switch (item.type) {
        case "loading":
          return (
            <View style={styles.inlineLoadingWrap}>
              <OrdersTabSkeleton />
            </View>
          );
        case "empty":
          return (
            <View style={styles.inlineEmptyWrap}>
              <LottieView
                source={require("@/assets/animations/waiting.json")}
                autoPlay={isOrdersFocused}
                loop={isOrdersFocused}
                style={styles.emptyAnimation}
              />
              <EmptyStateCard
                title="No orders yet"
                description="Once you place an order, live status and history will show up here."
                actionLabel="Browse restaurants"
                onPress={() => router.push("/(tabs)/browse")}
              />
            </View>
          );
        case "active-header":
          return (
            <OrdersSectionHeader
              title="Active orders"
              subtitle="These are the orders that still need your attention."
            />
          );
        case "active-order":
          return (
            <View style={styles.virtualizedCardRow}>
              <OrderCard
                card={item.card}
                onPress={() => openOrder(item.card.id)}
              />
            </View>
          );
        case "history-header":
          return (
            <OrdersSectionHeader
              title="Recent history"
              subtitle="Showing your latest 5 orders."
            />
          );
        case "history-order":
          return (
            <View style={styles.virtualizedCardRow}>
              <OrderCard
                card={item.card}
                compact
                reorderPending={
                  reorderMutation.isPending &&
                  reorderPendingOrderId === item.card.id
                }
                onReorderPress={
                  item.card.status === "Delivered"
                    ? () => {
                        void handleReorder(item.card.order);
                      }
                    : undefined
                }
                onPress={() => openOrder(item.card.id)}
              />
            </View>
          );
        case "history-error":
          return (
            <View style={styles.inlineEmptyWrap}>
              <EmptyStateCard
                title="Could not load order history"
                description="Live orders can still update. Try loading your recent orders again."
                actionLabel="Retry history"
                onPress={() => {
                  void refetchHistoryOrders();
                }}
              />
            </View>
          );
        default:
          return null;
      }
    },
    [
      handleReorder,
      openOrder,
      refetchHistoryOrders,
      reorderMutation.isPending,
      reorderPendingOrderId,
      router,
    ],
  );

  const keyExtractor = useCallback((item: OrdersListItem, index: number) => {
    if ("card" in item) {
      return `${item.type}:${item.card.id}`;
    }
    return `${item.type}:${index}`;
  }, []);

  if (!customer) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={[styles.emptyState, styles.signedOutEmptyState]}>
          <LottieView
            source={require("@/assets/animations/waiting.json")}
            autoPlay={isOrdersFocused}
            loop={isOrdersFocused}
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

  if (liveOrdersQuery.isError && historyOrdersError && !hasAnyOrders) {
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
                    void refetchLiveOrders();
                    void refetchHistoryOrders();
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
          {!isOnline ? (
            <OfflineNoticeCard description="Showing your last synced orders. Live delivery updates will resume when you're back online." />
          ) : null}
        </View>

        {ordersListItems.map((item, index) => (
          <View key={keyExtractor(item, index)}>
            {index > 0 ? <OrdersListSeparator /> : null}
            {renderOrdersItem({ item })}
          </View>
        ))}
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
