import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  type PressableStateCallbackType,
  RefreshControl,
  ScrollView,
  StyleSheet,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import { OwnerStatusBadge } from "@/src/components/owner-status-badge";
import { EnforcementNotice } from "@/src/components/enforcement-notice";
import { OwnerHeaderActions } from "@/src/components/owner-header-actions";
import { Screen } from "@/src/components/screen";
import { StatusPill } from "@/src/components/status-pill";
import {
  type OwnerOrder,
  type OwnerOrderStatus,
  useOwnerOrdersQuery,
  useOwnerOrderTransitionMutation,
} from "@/src/hooks/use-owner-api";
import { useNow } from "@/src/hooks/use-now";
import {
  type TranslationKey,
  useOwnerTranslation,
} from "@/src/i18n/translations";
import {
  formatCurrency,
  formatTime,
  getOrderPlacedAt,
  getOwnerOrderNetSales,
  localizeDigits,
} from "@/src/lib/format";
import {
  canOwnerCancelOrder,
  formatAutoCancelCountdown,
  getAutoCancelRemainingSeconds,
  getPrepStartRemainingSeconds,
  getPreparationLateSeconds,
  getPreparationRemainingSeconds,
  getLocalizedOrderStatusLabel,
  getOrderStatusTone,
  isOwnerOrderLate,
  isOrderHistoryStatus,
} from "@/src/lib/order-status";
import { palette } from "@/src/theme/palette";

const filters: {
  labelKey: TranslationKey;
  status: OwnerOrderStatus | "";
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { labelKey: "orders.filters.live", status: "", icon: "pulse" },
  { labelKey: "orders.filters.new", status: "New", icon: "sparkles" },
  { labelKey: "orders.filters.preparing", status: "Preparing", icon: "restaurant" },
  { labelKey: "orders.filters.ready", status: "ReadyForPickup", icon: "bag-check" },
  { labelKey: "orders.filters.done", status: "Delivered", icon: "checkmark-done" },
  { labelKey: "orders.filters.cancelled", status: "Cancelled", icon: "close-circle" },
];
const OWNER_ORDER_PAGE_STEP = 20;

// Shared press feedback for every action button on an order card, so Accept/Reject/
// Cancel/View all respond identically to touch.
function pressableAction(variant: StyleProp<ViewStyle>) {
  return ({ pressed }: PressableStateCallbackType) => [
    styles.actionButton,
    variant,
    pressed ? styles.actionButtonPressed : null,
  ];
}

type OrderListItem =
  | { type: "date"; key: string; label: string; count: number }
  | { type: "order"; key: string; order: OwnerOrder };

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getOrderHistoryDateValue(order: OwnerOrder) {
  if (order.status === "Delivered") {
    return order.timestamps?.Delivered ?? order.timestamps?.deliveredAt ?? order.updatedAt ?? getOrderPlacedAt(order);
  }

  if (order.status === "Cancelled") {
    return order.timestamps?.Cancelled ?? order.timestamps?.cancelledAt ?? order.updatedAt ?? getOrderPlacedAt(order);
  }

  if (order.status === "Rejected") {
    return order.timestamps?.Rejected ?? order.timestamps?.rejectedAt ?? order.updatedAt ?? getOrderPlacedAt(order);
  }

  return order.updatedAt ?? getOrderPlacedAt(order);
}

function getHistoryDateKey(order: OwnerOrder) {
  const value = getOrderHistoryDateValue(order);
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? getLocalDateKey(date) : "unknown";
}

function formatHistoryDateLabel(key: string) {
  if (key === "unknown") return "Unknown date";
  const date = new Date(`${key}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  const today = new Date();
  const todayKey = getLocalDateKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (key === todayKey) return "Today";
  if (key === getLocalDateKey(yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function OrdersScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  // Today's "View all" deep-links here with status=live. It also sends a changing
  // `ts` so a repeat press re-applies the Live chip even if the owner has since
  // switched to another filter (the status value alone would not change).
  const searchParams = useLocalSearchParams<{ status?: string; ts?: string }>();
  const [selectedStatus, setSelectedStatus] = useState<OwnerOrderStatus | "">("");
  const [pendingAction, setPendingAction] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [orderPageSize, setOrderPageSize] = useState(OWNER_ORDER_PAGE_STEP);
  const { t } = useOwnerTranslation();
  const now = useNow(1000, isFocused);
  const isHistoryStatus = isOrderHistoryStatus(selectedStatus);
  const ordersQuery = useOwnerOrdersQuery(isFocused, {
    tab: isHistoryStatus ? "history" : "live",
    status: selectedStatus || undefined,
    pageSize: isHistoryStatus ? orderPageSize : 80,
  });
  const transitionMutation = useOwnerOrderTransitionMutation();
  // The counts come back with every orders response and cover all statuses (not just
  // the selected one), so the chips stay accurate whichever filter is active.
  const statusCounts = ordersQuery.data?.statusCounts ?? {};

  useEffect(() => {
    if (searchParams.status === "live") {
      setSelectedStatus("");
      setOrderPageSize(OWNER_ORDER_PAGE_STEP);
    }
  }, [searchParams.status, searchParams.ts]);
  const orders = useMemo(
    () =>
      Array.isArray(ordersQuery.data?.items)
        ? ordersQuery.data.items.filter((order) => Boolean(order?._id))
        : [],
    [ordersQuery.data?.items],
  );
  const displayOrders = useMemo<OrderListItem[]>(() => {
    if (!isHistoryStatus) {
      return orders.map((order, index) => ({
        type: "order" as const,
        key: String(order._id || order.orderNumber || index),
        order,
      }));
    }

    // Grouping keys off the *status* date (deliveredAt / cancelledAt), but the server
    // sorts history by its own field. When those two disagree the same day shows up in
    // two non-adjacent runs, and the "new group" check below then emits a second header
    // with an identical key — React's "two children with the same key" error. Sorting by
    // the value we actually group on guarantees each day is one contiguous run.
    const sortedOrders = [...orders].sort((left, right) => {
      const leftTime = new Date(getOrderHistoryDateValue(left) ?? 0).getTime();
      const rightTime = new Date(getOrderHistoryDateValue(right) ?? 0).getTime();
      return (
        (Number.isNaN(rightTime) ? 0 : rightTime) -
        (Number.isNaN(leftTime) ? 0 : leftTime)
      );
    });

    const counts = sortedOrders.reduce<Record<string, number>>((result, order) => {
      const key = getHistoryDateKey(order);
      result[key] = (result[key] ?? 0) + 1;
      return result;
    }, {});
    const items: OrderListItem[] = [];
    let currentDateKey = "";

    for (const order of sortedOrders) {
      const dateKey = getHistoryDateKey(order);
      if (dateKey !== currentDateKey) {
        currentDateKey = dateKey;
        items.push({
          type: "date",
          key: `date:${dateKey}`,
          label: formatHistoryDateLabel(dateKey),
          count: counts[dateKey] ?? 0,
        });
      }
      items.push({ type: "order", key: String(order._id || order.orderNumber), order });
    }

    return items;
  }, [isHistoryStatus, orders]);
  const canLoadMoreOrders = Boolean(
    isHistoryStatus &&
      ordersQuery.data?.total &&
      orders.length < ordersQuery.data.total &&
      !ordersQuery.isFetching,
  );

  async function transitionOrder(
    order: OwnerOrder,
    nextStatus: "Accepted" | "Rejected" | "Preparing" | "ReadyForPickup" | "Cancelled",
    note?: string,
  ) {
    const actionKey = `${order._id}:${nextStatus}`;
    setPendingAction(actionKey);
    try {
      await transitionMutation.mutateAsync({
        orderId: order._id,
        nextStatus,
        note,
      });
    } catch (error) {
      Alert.alert(
        t("orders.updateFailedTitle"),
        error instanceof Error ? error.message : t("orders.updateFailedBody"),
      );
    } finally {
      setPendingAction("");
    }
  }

  function confirmReject(order: OwnerOrder) {
    Alert.alert(
      t("orders.rejectTitle"),
      t("orders.rejectBody"),
      [
        { text: t("orders.cancel"), style: "cancel" },
        {
          text: t("orders.reject"),
          style: "destructive",
          onPress: () =>
            void transitionOrder(order, "Rejected", "Rejected from owner mobile app."),
        },
      ],
    );
  }

  function confirmCancel(order: OwnerOrder) {
    Alert.alert(
      t("orders.cancelTitle"),
      t("orders.cancelBody"),
      [
        { text: t("orders.keepOrder"), style: "cancel" },
        {
          text: t("orders.cancel"),
          style: "destructive",
          onPress: () =>
            void transitionOrder(order, "Cancelled", "Cancelled from owner mobile app."),
        },
      ],
    );
  }

  async function refreshOrders() {
    setIsRefreshing(true);
    try {
      await ordersQuery.refetch();
    } finally {
      setIsRefreshing(false);
    }
  }

  function openOrderDetails(orderId: string) {
    router.push({
      pathname: "/orders/[orderId]",
      params: { orderId },
    } as never);
  }

  function renderOrder({ item }: { item: OrderListItem }) {
    if (item.type === "date") {
      return (
        <View style={styles.dateHeader}>
          <Text style={styles.dateHeaderText}>{item.label}</Text>
          <Text style={styles.dateHeaderCount}>
            {localizeDigits(String(item.count))} {t("orders.count")}
          </Text>
        </View>
      );
    }

    const order = item.order;
    const isCardPending = pendingAction.startsWith(`${order._id}:`);
    const isActionPending = (nextStatus: string) =>
      pendingAction === `${order._id}:${nextStatus}`;
    const autoCancelSeconds = getAutoCancelRemainingSeconds(order, now);
    const prepStartSeconds = getPrepStartRemainingSeconds(order, now);
    const prepRemainingSeconds = getPreparationRemainingSeconds(order, now);
    const prepLateSeconds = getPreparationLateSeconds(order, now);
    const isLate = isOwnerOrderLate(order, now);
    const showPrepPill = prepStartSeconds !== null || prepRemainingSeconds !== null;
    const prepPillText =
      order.status === "Accepted" && prepStartSeconds !== null
        ? `${t("orders.prepIn")} ${localizeDigits(formatAutoCancelCountdown(prepStartSeconds))}`
        : order.status === "Preparing" && prepRemainingSeconds !== null
          ? prepRemainingSeconds > 0
            ? `${t("orders.prep")} ${localizeDigits(formatAutoCancelCountdown(prepRemainingSeconds))}`
            : `${t("orders.late")} -${localizeDigits(formatAutoCancelCountdown(prepLateSeconds))}`
          : "";

    return (
      <Pressable
        style={({ pressed }) => [
          styles.orderCard,
          order.isUrgent ? styles.orderCardUrgent : null,
          isLate ? styles.orderCardLate : null,
          pressed ? styles.orderCardPressed : null,
        ]}
        onPress={() => openOrderDetails(order._id)}
      >
        <View style={styles.orderTop}>
          <View style={styles.orderMain}>
            <View style={styles.orderNumberRow}>
              <Text style={styles.orderNumber}>{order.orderNumber}</Text>
              {order.isUrgent ? (
                <View style={styles.urgentPill}>
                  <Text style={styles.urgentPillText}>⚡ {t("orders.urgent")}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.orderMeta}>
              {formatTime(getOrderPlacedAt(order)) || t("orders.justNow")} -{" "}
              {localizeDigits(String(order.itemsSnapshot?.length ?? 0))} {t("today.items")}
            </Text>
          </View>
          <View style={styles.orderStatusStack}>
            <StatusPill
              label={
                isLate ? t("orders.late") : getLocalizedOrderStatusLabel(order.status, t)
              }
              tone={isLate ? "danger" : getOrderStatusTone(order.status)}
            />
            {autoCancelSeconds !== null ? (
              <View style={styles.autoCancelPill}>
                <Ionicons name="timer-outline" size={12} color={palette.danger} />
                <Text style={styles.autoCancelText}>
                  {t("orders.auto")} {localizeDigits(formatAutoCancelCountdown(autoCancelSeconds))}
                </Text>
              </View>
            ) : null}
            {showPrepPill ? (
              <View
                style={[
                  styles.prepPill,
                  prepRemainingSeconds === 0 ? styles.prepPillLate : null,
                ]}
              >
                <Ionicons
                  name="restaurant-outline"
                  size={12}
                  color={prepRemainingSeconds === 0 ? palette.danger : palette.primary}
                />
                <Text
                  style={[
                    styles.prepPillText,
                    prepRemainingSeconds === 0 ? styles.prepPillTextLate : null,
                  ]}
                >
                  {prepPillText}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <Text style={styles.customerText}>
          {order.customerSnapshot?.fullName || t("orders.customer")} -{" "}
          {formatCurrency(getOwnerOrderNetSales(order))}
        </Text>

        {order.appliedVouchers?.length ? (
          <View style={styles.voucherAppliedPill}>
            <Ionicons name="pricetag-outline" size={13} color={palette.warning} />
            <Text style={styles.voucherAppliedText}>{t("orders.voucherApplied")}</Text>
          </View>
        ) : null}

        {order.itemsSnapshot?.slice(0, 3).map((orderItem, index) => (
          <Text key={`${orderItem.itemId ?? orderItem.name}-${index}`} style={styles.itemText}>
            {localizeDigits(String(orderItem.quantity ?? 1))}x{" "}
            {orderItem.name ?? t("today.items")}
          </Text>
        ))}

        {/* Action buttons only for live statuses — the whole card is already tappable to
            open details, so terminal orders (Delivered/Cancelled/…) need no button. */}
        {order.status === "New" ? (
          <View style={styles.actions}>
            <Pressable
              style={pressableAction(styles.rejectButton)}
              disabled={isCardPending}
              onPress={() => confirmReject(order)}
            >
              {isActionPending("Rejected") ? (
                <ActivityIndicator size="small" color={palette.danger} />
              ) : (
                <Text style={styles.rejectButtonText}>{t("orders.reject")}</Text>
              )}
            </Pressable>
            <Pressable
              style={pressableAction(styles.acceptButton)}
              disabled={isCardPending}
              onPress={() => transitionOrder(order, "Accepted")}
            >
              {isActionPending("Accepted") ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.acceptButtonText}>{t("orders.accept")}</Text>
              )}
            </Pressable>
          </View>
        ) : order.status === "Accepted" ? (
          <View style={styles.actions}>
            {canOwnerCancelOrder(order.status) ? (
              <Pressable
                style={pressableAction(styles.rejectButton)}
                disabled={isCardPending}
                onPress={() => confirmCancel(order)}
              >
                {isActionPending("Cancelled") ? (
                  <ActivityIndicator size="small" color={palette.danger} />
                ) : (
                  <Text style={styles.rejectButtonText}>{t("orders.cancel")}</Text>
                )}
              </Pressable>
            ) : null}
            <Pressable
              style={pressableAction(styles.acceptButton)}
              disabled={isCardPending}
              onPress={() => transitionOrder(order, "Preparing")}
            >
              {isActionPending("Preparing") ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.acceptButtonText}>{t("orders.startPreparing")}</Text>
              )}
            </Pressable>
          </View>
        ) : order.status === "Preparing" ? (
          <View style={styles.actions}>
            {canOwnerCancelOrder(order.status) ? (
              <Pressable
                style={pressableAction(styles.rejectButton)}
                disabled={isCardPending}
                onPress={() => confirmCancel(order)}
              >
                {isActionPending("Cancelled") ? (
                  <ActivityIndicator size="small" color={palette.danger} />
                ) : (
                  <Text style={styles.rejectButtonText}>{t("orders.cancel")}</Text>
                )}
              </Pressable>
            ) : null}
            <Pressable
              style={pressableAction(styles.acceptButton)}
              disabled={isCardPending}
              onPress={() => transitionOrder(order, "ReadyForPickup")}
            >
              {isActionPending("ReadyForPickup") ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.acceptButtonText}>{t("orders.markReady")}</Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </Pressable>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t("orders.title")}</Text>
          <OwnerStatusBadge />
        </View>
        <OwnerHeaderActions />
      </View>

      <View style={styles.enforcementStripWrap}>
        <EnforcementNotice variant="strip" enabled={isFocused} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroller}
        contentContainerStyle={styles.filterRow}
      >
        {filters.map((filter) => {
          const isActive = selectedStatus === filter.status;
          const count = statusCounts[filter.status || "live"] ?? 0;
          return (
            <Pressable
              key={filter.labelKey}
              style={({ pressed }) => [
                styles.filterChip,
                isActive ? styles.filterChipActive : null,
                pressed ? styles.filterChipPressed : null,
              ]}
              onPress={() => {
                setSelectedStatus(filter.status);
                setOrderPageSize(OWNER_ORDER_PAGE_STEP);
              }}
            >
              <Ionicons
                name={filter.icon}
                size={14}
                color={isActive ? "#FFFFFF" : palette.mutedForeground}
              />
              <Text
                style={[
                  styles.filterChipText,
                  isActive ? styles.filterChipTextActive : null,
                ]}
              >
                {t(filter.labelKey)}
              </Text>
              {count > 0 ? (
                <View
                  style={[
                    styles.filterChipCount,
                    isActive ? styles.filterChipCountActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipCountText,
                      isActive ? styles.filterChipCountTextActive : null,
                    ]}
                  >
                    {localizeDigits(String(count))}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={displayOrders}
        keyExtractor={(item) => item.key}
        renderItem={renderOrder}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshOrders}
            tintColor={palette.primary}
          />
        }
        ListEmptyComponent={
          ordersQuery.isLoading ? (
            <View style={styles.feedbackCard}>
              <ActivityIndicator size="small" color={palette.primary} />
              <Text style={styles.feedbackText}>{t("orders.loading")}</Text>
            </View>
          ) : (
            <View style={styles.feedbackCard}>
              <Ionicons name="receipt-outline" size={26} color={palette.mutedForeground} />
              <Text style={styles.feedbackTitle}>{t("orders.emptyTitle")}</Text>
              <Text style={styles.feedbackText}>
                {t("orders.emptyBody")}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          isHistoryStatus && orders.length ? (
            <View style={styles.footerWrap}>
              {ordersQuery.isFetching ? (
                <ActivityIndicator size="small" color={palette.primary} />
              ) : canLoadMoreOrders ? (
                <Pressable
                  accessibilityRole="button"
                  style={styles.loadMoreButton}
                  onPress={() => setOrderPageSize((current) => current + OWNER_ORDER_PAGE_STEP)}
                >
                  <Text style={styles.loadMoreText}>{t("orders.showMoreHistory")}</Text>
                  <Ionicons name="chevron-down" size={16} color={palette.foreground} />
                </Pressable>
              ) : (
                <Text style={styles.endOfListText}>{t("orders.historyLoaded")}</Text>
              )}
            </View>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  titleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontSize: 24,
    lineHeight: 32,
    paddingTop: 2,
    fontWeight: "900",
    color: palette.foreground,
  },
  // Collapses to zero height when there is no enforcement notice to show.
  enforcementStripWrap: {
    paddingHorizontal: 18,
  },
  filterScroller: {
    flexGrow: 0,
    height: 54,
    marginBottom: 8,
  },
  filterRow: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 10,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  filterChip: {
    minHeight: 38,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 13,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  filterChipActive: {
    backgroundColor: palette.foreground,
    borderColor: palette.foreground,
  },
  filterChipPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.9,
  },
  filterChipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: palette.foreground,
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  filterChipCount: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipCountActive: {
    backgroundColor: "rgba(255, 255, 255, 0.22)",
  },
  filterChipCountText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
    color: palette.foreground,
  },
  filterChipCountTextActive: {
    color: "#FFFFFF",
  },
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  dateHeader: {
    marginTop: 4,
    marginBottom: 2,
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateHeaderText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  dateHeaderCount: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  orderCard: {
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 15,
    gap: 10,
  },
  orderCardLate: {
    borderColor: "rgba(239, 68, 68, 0.32)",
    backgroundColor: "#FFF7F8",
  },
  // "Lucrative" amber-gold wash so urgent (paid-priority) orders stand out and get prepped first.
  orderCardUrgent: {
    borderColor: "#F59E0B",
    borderWidth: 1.5,
    backgroundColor: "#FFF8EC",
  },
  // Matches the customer app's press feedback: a small scale/lift rather than a
  // heavy fade, which washed the card out.
  orderCardPressed: {
    transform: [{ scale: 0.985 }, { translateY: 1 }],
    opacity: 0.95,
  },
  orderTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  orderMain: {
    flex: 1,
  },
  orderStatusStack: {
    alignItems: "flex-end",
    gap: 6,
  },
  orderNumberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  orderNumber: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
    color: palette.foreground,
  },
  urgentPill: {
    minHeight: 22,
    borderRadius: 999,
    paddingHorizontal: 8,
    justifyContent: "center",
    backgroundColor: palette.warningSoft,
  },
  urgentPillText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
    color: palette.warning,
  },
  orderMeta: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  customerText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  itemText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  voucherAppliedPill: {
    alignSelf: "flex-start",
    minHeight: 26,
    borderRadius: 999,
    paddingHorizontal: 9,
    backgroundColor: palette.warningSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  voucherAppliedText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
    color: palette.warning,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  autoCancelPill: {
    minHeight: 24,
    borderRadius: 999,
    paddingHorizontal: 8,
    backgroundColor: palette.dangerSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  autoCancelText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
    color: palette.danger,
  },
  prepPill: {
    minHeight: 24,
    borderRadius: 999,
    paddingHorizontal: 8,
    backgroundColor: palette.primarySoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  prepPillLate: {
    backgroundColor: palette.dangerSoft,
  },
  prepPillText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
    color: palette.primary,
  },
  prepPillTextLate: {
    color: palette.danger,
  },
  actionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  acceptButton: {
    backgroundColor: palette.foreground,
  },
  acceptButtonText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  rejectButton: {
    backgroundColor: palette.dangerSoft,
  },
  rejectButtonText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.danger,
  },
  feedbackCard: {
    minHeight: 240,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 20,
  },
  feedbackTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
    color: palette.foreground,
  },
  feedbackText: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    color: palette.mutedForeground,
    fontWeight: "600",
  },
  footerWrap: {
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
  },
  loadMoreButton: {
    minHeight: 46,
    borderRadius: 16,
    paddingHorizontal: 16,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadMoreText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  endOfListText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
});
