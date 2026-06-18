import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { RiderDelayBanner } from "@/src/components/rider-delay-banner";
import { RiderLocationAccessCard } from "@/src/components/rider-location-access-card";
import { useRiderDeliveryThresholdsQuery, useRiderOrdersQuery } from "@/src/hooks/use-rider-api";
import { useDeliveryCopy } from "@/src/lib/copy";
import { formatDateTime, formatRelativeTime } from "@/src/lib/date-time";
import { getRiderDelayPriority, getRiderDelaySignal } from "@/src/lib/rider-delay-display";
import { getOrderStatusBadge, getOrderTimingInfo, getPaymentMethodBadge } from "@/src/lib/rider-order-display";
import { useRiderAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";
import { RiderScreenHeader } from "@/src/components/rider-screen-header";
import { useNetworkStatus } from "@/src/hooks/use-network-status";

function formatCompactMoney(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return `Tk ${Math.round(value).toLocaleString()}`;
}

export default function ActiveOrdersScreen() {
  const rider = useRiderAuthStore((state) => state.rider);
  const ordersQuery = useRiderOrdersQuery("active");
  const deliveryThresholdsQuery = useRiderDeliveryThresholdsQuery();
  const { copy } = useDeliveryCopy();
  const isNetworkOnline = useNetworkStatus();
  const isAssignmentsPaused = rider?.isAvailableForAssignments === false;
  const statusTone = !isNetworkOnline ? "offline" : isAssignmentsPaused ? "paused" : "online";
  const statusLabel = !isNetworkOnline
    ? copy.common.offline
    : isAssignmentsPaused
      ? "Paused"
      : copy.common.online;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [nowMs, setNowMs] = useState(Date.now());
  const lastDelayAlertKeyRef = useRef("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase();
  const activeText = copy.active as Record<string, unknown>;
  const activeCopy = {
    searchPlaceholder: (activeText.searchPlaceholder as string | undefined) ?? "Search active trips",
    noMatchingTitle: (activeText.noMatchingTitle as string | undefined) ?? "No matching trips",
    noMatchingText:
      (activeText.noMatchingText as string | undefined) ?? "Try another search to find the trip you need.",
    tripsCount:
      (activeText.tripsCount as ((count: number) => string) | undefined) ??
      ((count: number) => `${count} ${count === 1 ? "active trip" : "active trips"}`),
  };

  const orders = useMemo(() => ordersQuery.data ?? [], [ordersQuery.data]);
  const deliveryThresholds = deliveryThresholdsQuery.data;

  useEffect(() => {
    if (!orders.length) return;
    setNowMs(Date.now());
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);

    return () => clearInterval(timer);
  }, [orders.length]);

  const filteredOrders = useMemo(
    () => {
      const matchingOrders = orders.filter((order) =>
        !normalizedSearchQuery
          ? true
          : [order.orderNumber, order.restaurant?.name, order.customer?.name, order.status]
              .filter(Boolean)
              .some((value) => value!.toLowerCase().includes(normalizedSearchQuery))
      );

      return [...matchingOrders].sort((firstOrder, secondOrder) => {
        const firstPriority = getRiderDelayPriority(
          getRiderDelaySignal(firstOrder, deliveryThresholds, nowMs)
        );
        const secondPriority = getRiderDelayPriority(
          getRiderDelaySignal(secondOrder, deliveryThresholds, nowMs)
        );
        if (firstPriority !== secondPriority) return secondPriority - firstPriority;
        return new Date(secondOrder.updatedAt ?? secondOrder.createdAt ?? 0).getTime() -
          new Date(firstOrder.updatedAt ?? firstOrder.createdAt ?? 0).getTime();
      });
    },
    [deliveryThresholds, normalizedSearchQuery, nowMs, orders]
  );
  const urgentDelayKey = useMemo(
    () =>
      orders
        .map((order) => {
          const signal = getRiderDelaySignal(order, deliveryThresholds, nowMs);
          return getRiderDelayPriority(signal) >= 2
            ? `${order.id}:${signal?.tone}`
            : null;
        })
        .filter(Boolean)
        .join("|"),
    [deliveryThresholds, nowMs, orders]
  );

  useEffect(() => {
    if (!urgentDelayKey) {
      lastDelayAlertKeyRef.current = "";
      return;
    }
    if (lastDelayAlertKeyRef.current === urgentDelayKey) return;
    lastDelayAlertKeyRef.current = urgentDelayKey;

    void Haptics.notificationAsync(
      urgentDelayKey.includes(":critical")
        ? Haptics.NotificationFeedbackType.Error
        : Haptics.NotificationFeedbackType.Warning
    );
  }, [urgentDelayKey]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await ordersQuery.refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [ordersQuery]);

  const handleSearchChange = useCallback((value: string) => {
    startTransition(() => {
      setSearchQuery(value);
    });
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <RiderScreenHeader
              icon="flash"
              title={copy.active.title}
              statusTone={statusTone}
              statusLabel={statusLabel}
            />
            <RiderLocationAccessCard />

            <View style={styles.searchShell}>
              <Ionicons name="search-outline" size={18} color={palette.mutedForeground} />
              <TextInput
                value={searchQuery}
                onChangeText={handleSearchChange}
                placeholder={activeCopy.searchPlaceholder}
                placeholderTextColor={palette.placeholder}
                style={styles.searchInput}
              />
              {searchQuery ? (
                <Pressable style={styles.searchClearButton} onPress={() => setSearchQuery("")}>
                  <Ionicons name="close" size={14} color={palette.mutedForeground} />
                </Pressable>
              ) : null}
            </View>

            <Text style={styles.resultsText}>{activeCopy.tripsCount(filteredOrders.length)}</Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void handleRefresh();
            }}
            tintColor={palette.primary}
          />
        }
        ListEmptyComponent={
          ordersQuery.isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" color={palette.primary} />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="bicycle-outline" size={24} color={palette.foreground} />
              </View>
              <Text style={styles.emptyTitle}>
                {searchQuery ? activeCopy.noMatchingTitle : copy.active.emptyTitle}
              </Text>
              <Text style={styles.emptyText}>
                {searchQuery
                  ? activeCopy.noMatchingText
                  : !isNetworkOnline
                    ? "Reconnect to refresh your active trips."
                    : copy.active.emptyText}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const statusBadge = getOrderStatusBadge(item.status);
          const paymentBadge = getPaymentMethodBadge(item.paymentMethod);
          const timingInfo = getOrderTimingInfo(item);
          const delaySignal = getRiderDelaySignal(item, deliveryThresholds, nowMs);
          const isLateOrder =
            delaySignal?.tone === "late" || delaySignal?.tone === "critical";
          const legLabel =
            item.status === "PickedUp" ? "To customer" : "To restaurant";
          const legIcon = item.status === "PickedUp" ? "home-outline" : "storefront-outline";
          const amountLabel = formatCompactMoney(item.pricing?.total);
          return (
            <Pressable
              style={[styles.card, isLateOrder ? styles.cardLate : null]}
              onPress={() => router.push(`/orders/${item.id}`)}
            >
              <View style={styles.cardTopRow}>
                <View style={styles.orderIdentity}>
                  <Text style={styles.orderNumber} numberOfLines={1}>
                    {item.orderNumber}
                  </Text>
                  {item.isFocusedLiveTrip ? (
                    <View style={styles.liveChip}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveText}>Live</Text>
                    </View>
                  ) : null}
                </View>
                <View
                  style={[
                    styles.tripStatusChip,
                    {
                      backgroundColor: statusBadge.backgroundColor,
                      borderColor: statusBadge.borderColor,
                    },
                  ]}
                >
                  <Text style={[styles.tripStatusText, { color: statusBadge.color }]}>
                    {statusBadge.label}
                  </Text>
                </View>
              </View>

              <View style={styles.routeLine}>
                <View style={styles.routeIconWrap}>
                  <Ionicons name={legIcon} size={15} color={palette.primary} />
                </View>
                <View style={styles.routeCopy}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.restaurant?.name ?? copy.common.restaurant}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {legLabel} • {item.customer?.name ?? copy.common.customer}
                  </Text>
                </View>
              </View>

              <View style={styles.cardMetaRow}>
                <View
                  style={[
                    styles.paymentBadge,
                    {
                      backgroundColor: paymentBadge.backgroundColor,
                      borderColor: paymentBadge.borderColor,
                    },
                  ]}
                >
                  <Ionicons name={paymentBadge.icon} size={12} color={paymentBadge.color} />
                  <Text style={[styles.paymentBadgeText, { color: paymentBadge.color }]}>
                    {paymentBadge.label}
                  </Text>
                </View>
                <View style={styles.amountPill}>
                  <Text style={styles.amountText}>{amountLabel}</Text>
                </View>
                <View style={styles.timePill}>
                  <Ionicons name="time-outline" size={12} color={palette.mutedForeground} />
                  <Text style={styles.timePillText} numberOfLines={1}>
                    {timingInfo.value ? formatRelativeTime(timingInfo.value) : timingInfo.label}
                  </Text>
                </View>
              </View>

              {timingInfo.value ? (
                <Text style={styles.timestampText} numberOfLines={1}>
                  {timingInfo.label}: {formatDateTime(timingInfo.value)}
                </Text>
              ) : null}
              <RiderDelayBanner signal={delaySignal} />
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  listContent: { paddingHorizontal: 20, paddingBottom: 112, gap: 12, flexGrow: 1 },
  headerWrap: { paddingTop: 16, paddingBottom: 12, gap: 12 },
  searchShell: {
    minHeight: 50,
    borderRadius: 16,
    paddingHorizontal: 14,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: palette.foreground,
    paddingVertical: 0,
  },
  searchClearButton: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
  },
  resultsText: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  centered: { minHeight: 320, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 13,
    gap: 9,
    borderWidth: 1,
    borderColor: palette.border,
    shadowColor: palette.shadow,
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardLate: {
    borderWidth: 1.5,
    borderColor: palette.warning,
    backgroundColor: palette.warningSoft,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  orderIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  orderNumber: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "900",
    color: palette.foreground,
  },
  liveChip: {
    minHeight: 24,
    borderRadius: 999,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: palette.successSoft,
    borderWidth: 1,
    borderColor: "rgba(20,152,91,0.2)",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: palette.success,
  },
  liveText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
    color: palette.successText,
  },
  tripStatusChip: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
  },
  tripStatusText: { fontSize: 11, fontWeight: "900" },
  routeLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  routeIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  routeCopy: {
    flex: 1,
    minWidth: 0,
  },
  paymentBadge: {
    minHeight: 28,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  paymentBadgeText: {
    fontSize: 11,
    fontWeight: "900",
  },
  name: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  amountPill: {
    minHeight: 28,
    borderRadius: 11,
    paddingHorizontal: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.foreground,
  },
  amountText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    color: "#fff",
  },
  timePill: {
    flex: 1,
    minWidth: 0,
    minHeight: 28,
    borderRadius: 11,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
  },
  timePillText: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  timestampText: {
    marginTop: -2,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  emptyState: {
    flex: 1,
    minHeight: 320,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: palette.foreground },
  emptyText: {
    fontSize: 14,
    lineHeight: 21,
    color: palette.mutedForeground,
    textAlign: "center",
    maxWidth: 280,
  },
});
