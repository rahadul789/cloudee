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
import { RiderAvailabilityCard } from "@/src/components/rider-availability-card";
import { RiderLocationAccessCard } from "@/src/components/rider-location-access-card";
import { useRiderDeliveryThresholdsQuery, useRiderOrdersQuery } from "@/src/hooks/use-rider-api";
import { useDeliveryCopy } from "@/src/lib/copy";
import { formatDateTime, formatRelativeTime } from "@/src/lib/date-time";
import { getRiderDelayPriority, getRiderDelaySignal } from "@/src/lib/rider-delay-display";
import { getOrderStatusBadge, getOrderTimingInfo, getPaymentMethodBadge } from "@/src/lib/rider-order-display";
import { useRiderAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";
import { useNetworkStatus } from "@/src/hooks/use-network-status";

export default function AvailableOrdersScreen() {
  const rider = useRiderAuthStore((state) => state.rider);
  const ordersQuery = useRiderOrdersQuery("available");
  const deliveryThresholdsQuery = useRiderDeliveryThresholdsQuery();
  const { copy } = useDeliveryCopy();
  const isNetworkOnline = useNetworkStatus();
  const isAssignmentsPaused = rider?.isAvailableForAssignments === false;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [nowMs, setNowMs] = useState(Date.now());
  const lastDelayAlertKeyRef = useRef("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase();
  const availableText = copy.available as Record<string, unknown>;
  const availableCopy = {
    searchPlaceholder: (availableText.searchPlaceholder as string | undefined) ?? "Search pickups",
    noMatchingTitle: (availableText.noMatchingTitle as string | undefined) ?? "No matching pickups",
    noMatchingText:
      (availableText.noMatchingText as string | undefined) ?? "Try another search to find a pickup faster.",
    pickupsCount:
      (availableText.pickupsCount as ((count: number) => string) | undefined) ??
      ((count: number) => `${count} ${count === 1 ? "pickup" : "pickups"}`),
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
          : [order.orderNumber, order.restaurant?.name, order.customer?.deliveryAddress?.addressLine]
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
        return new Date(secondOrder.createdAt ?? secondOrder.updatedAt ?? 0).getTime() -
          new Date(firstOrder.createdAt ?? firstOrder.updatedAt ?? 0).getTime();
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
            <RiderAvailabilityCard />
            <RiderLocationAccessCard />

            <View style={styles.searchShell}>
              <Ionicons name="search-outline" size={18} color={palette.mutedForeground} />
              <TextInput
                value={searchQuery}
                onChangeText={handleSearchChange}
                placeholder={availableCopy.searchPlaceholder}
                placeholderTextColor={palette.placeholder}
                style={styles.searchInput}
              />
              {searchQuery ? (
                <Pressable style={styles.searchClearButton} onPress={() => setSearchQuery("")}>
                  <Ionicons name="close" size={14} color={palette.mutedForeground} />
                </Pressable>
              ) : null}
            </View>

            <Text style={styles.resultsText}>{availableCopy.pickupsCount(filteredOrders.length)}</Text>
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
                {searchQuery ? availableCopy.noMatchingTitle : copy.available.emptyTitle}
              </Text>
              <Text style={styles.emptyText}>
                {searchQuery
                  ? availableCopy.noMatchingText
                  : !isNetworkOnline
                    ? "Reconnect to load new pickup requests."
                    : isAssignmentsPaused
                    ? copy.available.emptyOffline
                    : copy.available.emptyOnline}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const statusBadge = getOrderStatusBadge(item.status);
          const paymentBadge = getPaymentMethodBadge(item.paymentMethod);
          const timingInfo = getOrderTimingInfo(item);
          const delaySignal = getRiderDelaySignal(item, deliveryThresholds, nowMs);
          return (
            <Pressable
              style={[styles.card, item.isExternal ? styles.cardExternal : null]}
              onPress={() => router.push(`/orders/${item.id}`)}
            >
              <View style={styles.row}>
                <View style={styles.orderNumberGroup}>
                  <Text style={styles.orderNumber}>{item.orderNumber}</Text>
                  {item.isUrgent ? (
                    <View style={styles.urgentChip}>
                      <Text style={styles.urgentChipText}>⚡ {copy.common.urgent}</Text>
                    </View>
                  ) : null}
                  {item.isExternal ? (
                    <View style={styles.externalChip}>
                      <Ionicons name="storefront-outline" size={11} color="#6D28D9" />
                      <Text style={styles.externalChipText}>{copy.sheet.external}</Text>
                    </View>
                  ) : null}
                </View>
                <View
                  style={[
                    styles.readyChip,
                    {
                      backgroundColor: statusBadge.backgroundColor,
                      borderColor: statusBadge.borderColor,
                    },
                  ]}
                >
                  <Text style={[styles.readyChipText, { color: statusBadge.color }]}>
                    {statusBadge.label}
                  </Text>
                </View>
              </View>
              <View
                style={[
                  styles.paymentBadge,
                  {
                    backgroundColor: paymentBadge.backgroundColor,
                    borderColor: paymentBadge.borderColor,
                  },
                ]}
              >
                <Ionicons name={paymentBadge.icon} size={13} color={paymentBadge.color} />
                <Text style={[styles.paymentBadgeText, { color: paymentBadge.color }]}>
                  {paymentBadge.label}
                </Text>
              </View>
              <Text style={styles.name}>{item.restaurant?.name ?? copy.common.restaurant}</Text>
              <Text style={styles.metaStrong}>{item.customer?.name ?? copy.common.customer}</Text>
              <Text style={styles.meta}>
                {item.customer?.deliveryAddress?.addressLine ?? copy.available.locationPending}
              </Text>
              <View style={styles.timeRow}>
                <Ionicons name="time-outline" size={14} color={palette.mutedForeground} />
                <Text style={styles.meta}>
                  {timingInfo.label}: {formatDateTime(timingInfo.value)}
                  {timingInfo.value ? ` - ${formatRelativeTime(timingInfo.value)}` : ""}
                </Text>
              </View>
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
    borderRadius: 18,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cardExternal: { borderColor: "#C4B5FD", backgroundColor: "#FAF8FF" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  orderNumberGroup: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  orderNumber: { fontSize: 16, fontWeight: "800", color: palette.foreground },
  urgentChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    backgroundColor: palette.warningSoft,
    borderColor: palette.warning,
  },
  urgentChipText: { fontSize: 11, fontWeight: "900", color: palette.warning },
  externalChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    backgroundColor: "#EDE9FE",
    borderColor: "#C4B5FD",
  },
  externalChipText: { fontSize: 11, fontWeight: "900", color: "#6D28D9" },
  readyChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  readyChipText: { fontSize: 12, fontWeight: "800" },
  paymentBadge: {
    alignSelf: "flex-start",
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  paymentBadgeText: {
    fontSize: 11,
    fontWeight: "900",
  },
  name: { fontSize: 15, fontWeight: "700", color: palette.foreground },
  metaStrong: { fontSize: 13, fontWeight: "700", color: palette.foreground },
  meta: { fontSize: 13, color: palette.mutedForeground },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
