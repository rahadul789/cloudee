import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { startTransition, useCallback, useDeferredValue, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  useRiderOrdersPagedQuery,
  useRiderPerformanceSummaryQuery,
  type RiderOrder,
} from "@/src/hooks/use-rider-api";
import { useDeliveryCopy } from "@/src/lib/copy";
import { formatDateTime, formatRelativeTime } from "@/src/lib/date-time";
import { getOrderStatusBadge, getOrderTimingInfo, getPaymentMethodBadge } from "@/src/lib/rider-order-display";
import { useRiderAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";
import { RiderScreenHeader } from "@/src/components/rider-screen-header";
import { RiderSidebar } from "@/src/components/rider-sidebar";
import { useNetworkStatus } from "@/src/hooks/use-network-status";

type StatusFilter = "all" | "Delivered" | "Cancelled" | "Rejected";
type RangeFilter = "all" | "today" | "last7" | "thisMonth" | "last30";
const HISTORY_PAGE_STEP = 20;

function getOrderTime(order: RiderOrder) {
  return new Date(order.updatedAt ?? order.createdAt ?? 0).getTime();
}

function isWithinRange(order: RiderOrder, rangeFilter: RangeFilter) {
  if (rangeFilter === "all") return true;

  const orderTime = getOrderTime(order);
  const now = Date.now();

  if (rangeFilter === "today") {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return orderTime >= startOfDay.getTime() && orderTime <= now;
  }

  if (rangeFilter === "thisMonth") {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    return orderTime >= startOfMonth.getTime() && orderTime <= now;
  }

  if (rangeFilter === "last30") {
    const startOfWindow = new Date();
    startOfWindow.setDate(startOfWindow.getDate() - 29);
    startOfWindow.setHours(0, 0, 0, 0);
    return orderTime >= startOfWindow.getTime() && orderTime <= now;
  }

  const startOfWindow = new Date();
  startOfWindow.setDate(startOfWindow.getDate() - 6);
  startOfWindow.setHours(0, 0, 0, 0);
  return orderTime >= startOfWindow.getTime() && orderTime <= now;
}

function getStatusFilterLabel(copy: ReturnType<typeof useDeliveryCopy>["copy"], status: StatusFilter) {
  if (status === "all") return copy.common.allStatus;
  if (status === "Delivered") return copy.common.delivered;
  if (status === "Rejected") return "Rejected";
  return copy.common.cancelled;
}

function getRangeFilterLabel(copy: ReturnType<typeof useDeliveryCopy>["copy"], range: RangeFilter) {
  if (range === "all") return copy.common.allTime;
  if (range === "today") return copy.common.today;
  if (range === "last7") return copy.common.last7Days;
  if (range === "thisMonth") return "This month";
  return "Last 30 days";
}

export default function HistoryScreen() {
  const rider = useRiderAuthStore((state) => state.rider);
  const [pageSize, setPageSize] = useState(HISTORY_PAGE_STEP);
  const ordersQuery = useRiderOrdersPagedQuery("history", pageSize);
  // Lifetime rider stats (total rides, this month, cancelled) — authoritative career
  // numbers, independent of the loaded/filtered history page below.
  const performanceQuery = useRiderPerformanceSummaryQuery();
  const perf = performanceQuery.data;
  const { copy } = useDeliveryCopy();
  const isNetworkOnline = useNetworkStatus();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [draftStatusFilter, setDraftStatusFilter] = useState<StatusFilter>("all");
  const [draftRangeFilter, setDraftRangeFilter] = useState<RangeFilter>("all");
  const orders = useMemo(() => ordersQuery.data ?? [], [ordersQuery.data]);
  const canLoadMoreHistory =
    orders.length >= pageSize && !ordersQuery.isLoading && !ordersQuery.isFetching;
  const isAssignmentsPaused = rider?.isAvailableForAssignments === false;
  const statusTone = !isNetworkOnline ? "offline" : isAssignmentsPaused ? "paused" : "online";
  const statusLabel = !isNetworkOnline
    ? copy.common.offline
    : isAssignmentsPaused
      ? "Paused"
      : copy.common.online;
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase();

  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        const matchesStatus = statusFilter === "all" ? true : order.status === statusFilter;
        const matchesRange = isWithinRange(order, rangeFilter);
        const matchesSearch = !normalizedSearchQuery
          ? true
          : [order.orderNumber, order.restaurant?.name, order.customer?.name]
              .filter(Boolean)
              .some((value) => value!.toLowerCase().includes(normalizedSearchQuery));
        return matchesStatus && matchesRange && matchesSearch;
      }),
    [normalizedSearchQuery, orders, rangeFilter, statusFilter]
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await ordersQuery.refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [ordersQuery]);

  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) + (rangeFilter !== "all" ? 1 : 0);

  const appliedFilterChips = useMemo(() => {
    const chips: string[] = [];
    if (statusFilter !== "all") chips.push(getStatusFilterLabel(copy, statusFilter));
    if (rangeFilter !== "all") chips.push(getRangeFilterLabel(copy, rangeFilter));
    return chips;
  }, [copy, rangeFilter, statusFilter]);

  const historyText = copy.history as Record<string, unknown>;
  const historyCopy = {
    searchPlaceholder: (historyText.searchPlaceholder as string | undefined) ?? "Search orders",
    filterTitle: (historyText.filterTitle as string | undefined) ?? "Filter trips",
    filterStatus: (historyText.filterStatus as string | undefined) ?? "Status",
    filterTimeRange: (historyText.filterTimeRange as string | undefined) ?? "Time range",
    thisMonth: (historyText.thisMonth as string | undefined) ?? "This month",
    last30Days: (historyText.last30Days as string | undefined) ?? "Last 30 days",
    clear: (historyText.clear as string | undefined) ?? "Clear",
    reset: (historyText.reset as string | undefined) ?? "Reset",
    applyFilters: (historyText.applyFilters as string | undefined) ?? "Apply filters",
    noMatchingTitle: (historyText.noMatchingTitle as string | undefined) ?? "No matching trips",
    noMatchingText:
      (historyText.noMatchingText as string | undefined) ?? "Try another search or adjust your filters.",
    tripsCount:
      (historyText.tripsCount as ((count: number) => string) | undefined) ??
      ((count: number) => `${count} ${count === 1 ? "trip" : "trips"}`),
  };

  const handleSearchChange = useCallback((value: string) => {
    startTransition(() => {
      setSearchQuery(value);
    });
  }, []);

  const clearFilters = useCallback(() => {
    setStatusFilter("all");
    setRangeFilter("all");
    setIsFilterOpen(false);
    setDraftStatusFilter("all");
    setDraftRangeFilter("all");
  }, []);

  const openFilters = useCallback(() => {
    setDraftStatusFilter(statusFilter);
    setDraftRangeFilter(rangeFilter);
    setIsFilterOpen(true);
  }, [rangeFilter, statusFilter]);

  const closeFilters = useCallback(() => {
    setIsFilterOpen(false);
  }, []);

  const applyFilters = useCallback(() => {
    setStatusFilter(draftStatusFilter);
    setRangeFilter(draftRangeFilter);
    setIsFilterOpen(false);
  }, [draftRangeFilter, draftStatusFilter]);

  const loadMoreHistory = useCallback(() => {
    setPageSize((current) => current + HISTORY_PAGE_STEP);
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
              icon="time-outline"
              title={copy.history.title}
              statusTone={statusTone}
              statusLabel={statusLabel}
              onMenuPress={() => setSidebarOpen(true)}
            />

            {/* Lifetime career stats — total rides always visible, not just the loaded page. */}
            <View style={styles.totalRidesCard}>
              <View style={styles.totalRidesIcon}>
                <Ionicons name="bicycle" size={20} color={palette.surface} />
              </View>
              <View style={styles.totalRidesBody}>
                <Text style={styles.totalRidesLabel}>Total rides delivered</Text>
                <Text style={styles.totalRidesValue}>
                  {performanceQuery.isLoading ? "—" : (perf?.deliveredTotal ?? 0)}
                </Text>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Today</Text>
                <Text style={styles.summaryValue}>{perf?.deliveredToday ?? 0}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>This month</Text>
                <Text style={styles.summaryValue}>{perf?.deliveredThisMonth ?? 0}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>{copy.history.cancelled}</Text>
                <Text style={styles.summaryValue}>{perf?.cancelledTotal ?? 0}</Text>
              </View>
            </View>

            <View style={styles.searchRow}>
              <View style={styles.searchShell}>
                <Ionicons name="search-outline" size={18} color={palette.mutedForeground} />
                <TextInput
                  value={searchQuery}
                  onChangeText={handleSearchChange}
                  placeholder={historyCopy.searchPlaceholder}
                  placeholderTextColor={palette.placeholder}
                  style={styles.searchInput}
                />
                {searchQuery ? (
                  <Pressable style={styles.searchClearButton} onPress={() => setSearchQuery("")}>
                    <Ionicons name="close" size={14} color={palette.mutedForeground} />
                  </Pressable>
                ) : null}
              </View>

              <Pressable
                style={styles.filterIconButton}
                onPress={openFilters}
              >
                <Ionicons
                  name="options-outline"
                  size={16}
                  color={palette.primary}
                />
                {activeFilterCount > 0 ? (
                  <View style={styles.filterCountBadgeFloating}>
                    <Text style={styles.filterCountText}>{activeFilterCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>

            <View style={styles.resultsBar}>
              <Text style={styles.resultsText}>{historyCopy.tripsCount(filteredOrders.length)}</Text>
              <View style={styles.resultsActions}>
                {activeFilterCount > 0 ? (
                  <Pressable style={styles.clearBadge} onPress={clearFilters}>
                    <Text style={styles.clearBadgeText}>{historyCopy.clear}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {appliedFilterChips.length > 0 ? (
              <View style={styles.appliedChipsRow}>
                {appliedFilterChips.map((chip) => (
                  <View key={chip} style={styles.appliedChip}>
                    <Text style={styles.appliedChipText}>{chip}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
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
                <Ionicons name="receipt-outline" size={24} color={palette.foreground} />
              </View>
              <Text style={styles.emptyTitle}>
                {searchQuery || activeFilterCount > 0 ? historyCopy.noMatchingTitle : copy.history.noTripsTitle}
              </Text>
              <Text style={styles.emptyText}>
                {searchQuery || activeFilterCount > 0
                  ? historyCopy.noMatchingText
                  : !isNetworkOnline
                    ? "Reconnect to refresh your trip history."
                    : copy.history.noTripsText}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          filteredOrders.length ? (
            <View style={styles.footerWrap}>
              {ordersQuery.isFetching && !ordersQuery.isLoading ? (
                <ActivityIndicator size="small" color={palette.primary} />
              ) : canLoadMoreHistory ? (
                <Pressable
                  accessibilityRole="button"
                  style={styles.loadMoreButton}
                  onPress={loadMoreHistory}
                >
                  <Text style={styles.loadMoreText}>Show more history</Text>
                  <Ionicons name="chevron-down" size={16} color={palette.foreground} />
                </Pressable>
              ) : (
                <Text style={styles.endOfListText}>Latest loaded history is shown here.</Text>
              )}
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const statusBadge = getOrderStatusBadge(item.status);
          const paymentBadge = getPaymentMethodBadge(item.paymentMethod);
          const timingInfo = getOrderTimingInfo(item);
          return (
            <Pressable style={styles.card} onPress={() => router.push(`/orders/${item.id}`)}>
              <View style={styles.row}>
                <Text style={styles.orderNumber}>{item.orderNumber}</Text>
                <View
                  style={[
                    styles.statusChip,
                    {
                      backgroundColor: statusBadge.backgroundColor,
                      borderColor: statusBadge.borderColor,
                    },
                  ]}
                >
                  <Text style={[styles.status, { color: statusBadge.color }]}>
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
              <View style={styles.timeRow}>
                <Ionicons name="time-outline" size={14} color={palette.mutedForeground} />
                <Text style={styles.meta}>
                  {timingInfo.label}: {formatDateTime(timingInfo.value)}
                  {timingInfo.value ? ` - ${formatRelativeTime(timingInfo.value)}` : ""}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />

      <Modal
        visible={isFilterOpen}
        transparent
        animationType="fade"
        onRequestClose={closeFilters}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeFilters} />
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{historyCopy.filterTitle}</Text>
              <Pressable style={styles.sheetCloseButton} onPress={closeFilters}>
                <Ionicons name="close" size={18} color={palette.mutedForeground} />
              </Pressable>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>{historyCopy.filterStatus}</Text>
              <View style={styles.filterRow}>
                {(["all", "Delivered", "Cancelled", "Rejected"] as const).map((status) => {
                  const active = draftStatusFilter === status;
                  return (
                    <Pressable
                      key={status}
                      style={[styles.filterChip, active ? styles.filterChipActive : null]}
                      onPress={() => setDraftStatusFilter(status)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          active ? styles.filterChipTextActive : null,
                        ]}
                      >
                        {getStatusFilterLabel(copy, status)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>{historyCopy.filterTimeRange}</Text>
              <View style={styles.filterRow}>
                {([
                  "all",
                  "today",
                  "last7",
                  "thisMonth",
                  "last30",
                ] as const).map((range) => {
                  const active = draftRangeFilter === range;
                  return (
                    <Pressable
                      key={range}
                      style={[styles.filterChip, active ? styles.filterChipActive : null]}
                      onPress={() => setDraftRangeFilter(range)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          active ? styles.filterChipTextActive : null,
                        ]}
                      >
                        {range === "thisMonth"
                          ? historyCopy.thisMonth
                          : range === "last30"
                            ? historyCopy.last30Days
                            : getRangeFilterLabel(copy, range)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.filterActionsRow}>
              <Pressable style={styles.filterResetButton} onPress={clearFilters}>
                <Text style={styles.filterResetText}>{historyCopy.reset}</Text>
              </Pressable>
              <Pressable style={styles.filterApplyButton} onPress={applyFilters}>
                <Text style={styles.filterApplyText}>{historyCopy.applyFilters}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <RiderSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FFFFFF" },
  listContent: { paddingHorizontal: 20, paddingBottom: 112, gap: 12, flexGrow: 1 },
  headerWrap: { paddingTop: 16, paddingBottom: 12, gap: 12 },
  totalRidesCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 20,
    padding: 16,
    backgroundColor: palette.foreground,
  },
  totalRidesIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  totalRidesBody: { flex: 1, minWidth: 0 },
  totalRidesLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(255,255,255,0.72)",
    textTransform: "uppercase",
  },
  totalRidesValue: {
    marginTop: 2,
    fontSize: 30,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  summaryRow: { flexDirection: "row", gap: 10 },
  summaryCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    gap: 6,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  summaryPink: {},
  summaryAmber: {},
  summarySky: {},
  summaryLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: palette.mutedForeground,
    textTransform: "uppercase",
  },
  summaryValue: { fontSize: 16, fontWeight: "800", color: palette.foreground },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchShell: {
    flex: 1,
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
  filterIconButton: {
    width: 50,
    height: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  filterCountBadgeFloating: {
    position: "absolute",
    right: -3,
    top: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    paddingHorizontal: 5,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  filterCountText: {
    fontSize: 10,
    fontWeight: "800",
    color: palette.primary,
  },
  resultsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  resultsActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  resultsText: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  clearBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
  },
  clearBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: palette.primary,
  },
  appliedChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  appliedChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
    borderWidth: 1,
    borderColor: "#FFCEE0",
  },
  appliedChipText: {
    fontSize: 12,
    fontWeight: "800",
    color: palette.primary,
  },
  filterSection: {
    gap: 10,
  },
  filterSectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: palette.mutedForeground,
    textTransform: "uppercase",
  },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  filterChipActive: {
    borderColor: "#FFCEE0",
    backgroundColor: palette.primarySoft,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  filterChipTextActive: {
    color: palette.primary,
  },
  filterActionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  filterResetButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
  },
  filterResetText: {
    fontSize: 14,
    fontWeight: "800",
    color: palette.foreground,
  },
  filterApplyButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.foreground,
  },
  filterApplyText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(18, 18, 18, 0.28)",
    justifyContent: "flex-end",
  },
  bottomSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: palette.surface,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 16,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#E7DCCF",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  sheetCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
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
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  orderNumber: { fontSize: 16, fontWeight: "800", color: palette.foreground },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  status: { fontSize: 12, fontWeight: "800" },
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
  footerWrap: {
    minHeight: 70,
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
    fontWeight: "900",
    color: palette.foreground,
  },
  endOfListText: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
});
