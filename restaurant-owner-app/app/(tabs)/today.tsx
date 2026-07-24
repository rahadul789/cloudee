import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { Screen } from "@/src/components/screen";
import { EnforcementNotice } from "@/src/components/enforcement-notice";
import { ServiceHoursNotice } from "@/src/components/service-hours-notice";
import { OwnerHeaderActions } from "@/src/components/owner-header-actions";
import { StatusPill } from "@/src/components/status-pill";
import {
  useOwnerDashboardSummaryQuery,
  useOwnerOrdersQuery,
  useOwnerStoreSettingsQuery,
  useUpdateOwnerRestaurantStatusMutation,
} from "@/src/hooks/use-owner-api";
import { useNow } from "@/src/hooks/use-now";
import { useOwnerTranslation } from "@/src/i18n/translations";
import { formatCurrency, formatTime, getOrderPlacedAt, localizeDigits } from "@/src/lib/format";
import {
  formatAutoCancelCountdown,
  getAutoCancelRemainingSeconds,
  getPrepStartRemainingSeconds,
  getPreparationLateSeconds,
  getPreparationRemainingSeconds,
  getLocalizedOrderStatusLabel,
  getOrderStatusTone,
  isOwnerOrderLate,
} from "@/src/lib/order-status";
import { palette } from "@/src/theme/palette";

export default function TodayScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const storeQuery = useOwnerStoreSettingsQuery(isFocused);
  const dashboardQuery = useOwnerDashboardSummaryQuery(isFocused);
  const liveOrdersQuery = useOwnerOrdersQuery(isFocused, {
    tab: "live",
    pageSize: 5,
  });
  const statusMutation = useUpdateOwnerRestaurantStatusMutation();
  const { t } = useOwnerTranslation();
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const now = useNow(1000, isFocused);
  const store = storeQuery.data;
  const dashboard = dashboardQuery.data;
  const liveOrders = liveOrdersQuery.data?.items ?? [];
  // The list itself is capped at 5, so the badge uses the server total.
  const liveOrderCount = liveOrdersQuery.data?.total ?? liveOrders.length;
  const isOnline = store?.runtime?.isOnline ?? dashboard?.restaurant.isOnline ?? false;
  const savedPrepMinutes =
    typeof store?.preparationTimeMinutes === "number"
      ? store.preparationTimeMinutes
      : null;
  // Quality hold / suspension / permanent disable block going online. `under_review`
  // does not, so it must not disable the switch.
  const isRestricted = Boolean(store?.enforcement?.isRestricted);
  const isToggleDisabled = statusMutation.isPending || isRestricted;
  const ratingAverage = dashboard?.restaurant.rating?.average ?? 0;
  const ratingCount = dashboard?.restaurant.rating?.count ?? 0;
  const salesToday = dashboard?.metrics.totalRevenue ?? 0;

  async function handleToggleOnline() {
    if (isToggleDisabled) {
      return;
    }

    try {
      await statusMutation.mutateAsync({ isOnline: !isOnline });
    } catch {
      return;
    }
  }

  async function refreshAll() {
    setIsPullRefreshing(true);
    try {
      await Promise.all([
        storeQuery.refetch(),
        dashboardQuery.refetch(),
        liveOrdersQuery.refetch(),
      ]);
    } finally {
      setIsPullRefreshing(false);
    }
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isPullRefreshing}
            onRefresh={refreshAll}
            tintColor={palette.primary}
          />
        }
      >
        <EnforcementNotice variant="card" enabled={isFocused} />
        <ServiceHoursNotice enabled={isFocused} />

        <View style={styles.restaurantCard}>
          <View style={styles.restaurantTop}>
            <View style={styles.restaurantNameWrap}>
              <Text numberOfLines={2} style={styles.restaurantName}>
                {store?.name ?? dashboard?.restaurant.name ?? "Restaurant"}
              </Text>
            </View>
            <OwnerHeaderActions />
          </View>

          {/* The online switch is the most consequential control in the app, so it
              lives in its own colour-coded strip rather than inside the stat row —
              a mis-tap on a stat tile must never take the store offline. */}
          <View
            style={[
              styles.statusStrip,
              isOnline ? styles.statusStripOnline : styles.statusStripOffline,
            ]}
          >
            <StatusPill
              label={isOnline ? t("status.online") : t("status.offline")}
              tone={isOnline ? "success" : "danger"}
            />
            <View style={styles.switchWrap}>
              {/* Fixed-width slot: the spinner (or the restricted lock) occupies the
                  same space whether or not it is visible, so the Switch never shifts. */}
              <View style={styles.switchSlot}>
                {statusMutation.isPending ? (
                  <ActivityIndicator size="small" color={palette.primary} />
                ) : isRestricted ? (
                  <Ionicons name="lock-closed" size={15} color={palette.danger} />
                ) : null}
              </View>
              {/* Solid track + white thumb: the old *Soft palette tints were almost the
                  same value as the strip behind them, so only the thumb was visible.
                  Not disabled while saving — greying it out mid-flip reads as a glitch;
                  handleToggleOnline guards re-entry instead. */}
              <Switch
                value={isOnline}
                disabled={isRestricted}
                onValueChange={handleToggleOnline}
                trackColor={{ false: "#C7CBD4", true: palette.success }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#C7CBD4"
              />
            </View>
          </View>

          {/* Every tile in this row navigates — one consistent interaction rule. */}
          <View style={styles.kpiRow}>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.kpiTile,
                pressed ? styles.kpiTilePressed : null,
              ]}
              onPress={() => router.push("/reviews" as never)}
            >
              <View style={styles.kpiValueRow}>
                <Ionicons name="star" size={13} color={palette.warning} />
                <Text style={styles.kpiValue}>
                  {ratingCount > 0
                    ? localizeDigits(ratingAverage.toFixed(1))
                    : t("today.noRating")}
                </Text>
              </View>
              <Text numberOfLines={1} style={styles.kpiLabel}>
                {ratingCount > 0
                  ? `${localizeDigits(String(ratingCount))} ${t("today.ratingsCount")}`
                  : t("today.rating")}
              </Text>
            </Pressable>

            <View style={styles.kpiDivider} />

            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.kpiTile,
                pressed ? styles.kpiTilePressed : null,
              ]}
              onPress={() => router.push("/account-preparation-time" as never)}
            >
              <View style={styles.kpiValueRow}>
                <Ionicons name="time" size={13} color={palette.primary} />
                <Text style={styles.kpiValue}>
                  {savedPrepMinutes
                    ? `${localizeDigits(String(savedPrepMinutes))} ${t("today.minutesShort")}`
                    : t("today.notSet")}
                </Text>
              </View>
              <Text numberOfLines={1} style={styles.kpiLabel}>
                {t("today.prepTime")}
              </Text>
            </Pressable>

            <View style={styles.kpiDivider} />

            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.kpiTile,
                pressed ? styles.kpiTilePressed : null,
              ]}
              onPress={() => router.push("/sales" as never)}
            >
              <View style={styles.kpiValueRow}>
                <Ionicons name="stats-chart" size={13} color={palette.success} />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                  style={styles.kpiValue}
                >
                  {formatCurrency(salesToday)}
                </Text>
              </View>
              <Text numberOfLines={1} style={styles.kpiLabel}>
                {t("today.salesToday")}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>{t("today.liveOrders")}</Text>
            {liveOrderCount > 0 ? (
              <View style={styles.sectionCountPill}>
                <Text style={styles.sectionCountText}>
                  {localizeDigits(String(liveOrderCount))}
                </Text>
              </View>
            ) : null}
          </View>
          {/* Deep-links into the Orders tab with the Live filter already selected, so
              "View all" lands on the same set the owner was just looking at. */}
          <Pressable
            hitSlop={8}
            style={({ pressed }) => (pressed ? styles.sectionActionPressed : null)}
            onPress={() =>
              router.push({
                pathname: "/(tabs)/orders",
                params: { status: "live", ts: String(Date.now()) },
              } as never)
            }
          >
            <Text style={styles.sectionAction}>{t("today.viewAll")}</Text>
          </Pressable>
        </View>

        {liveOrdersQuery.isLoading ? (
          <View style={styles.feedbackCard}>
            <ActivityIndicator size="small" color={palette.primary} />
            <Text style={styles.feedbackText}>{t("today.loadingLiveOrders")}</Text>
          </View>
        ) : liveOrders.length ? (
          <View style={styles.orderList}>
            {liveOrders.map((order) => {
              const placedTime = formatTime(getOrderPlacedAt(order));
              const autoCancelSeconds = getAutoCancelRemainingSeconds(order, now);
              const prepStartSeconds = getPrepStartRemainingSeconds(order, now);
              const prepRemainingSeconds = getPreparationRemainingSeconds(order, now);
              const prepLateSeconds = getPreparationLateSeconds(order, now);
              const isLate = isOwnerOrderLate(order, now);
              const showPrepPill =
                prepStartSeconds !== null || prepRemainingSeconds !== null;
              const prepPillText =
                order.status === "Accepted" && prepStartSeconds !== null
                  ? `${t("orders.prepIn")} ${localizeDigits(formatAutoCancelCountdown(prepStartSeconds))}`
                  : order.status === "Preparing" && prepRemainingSeconds !== null
                    ? prepRemainingSeconds > 0
                      ? `${t("orders.prep")} ${localizeDigits(formatAutoCancelCountdown(prepRemainingSeconds))}`
                      : `${t("orders.late")} ${localizeDigits(formatAutoCancelCountdown(prepLateSeconds))}`
                    : "";

              return (
                <Pressable
                  key={order._id}
                  style={({ pressed }) => [
                    styles.orderCard,
                    isLate ? styles.orderCardLate : null,
                    pressed ? styles.orderCardPressed : null,
                  ]}
                  onPress={() =>
                    router.push({
                      pathname: "/orders/[orderId]",
                      params: { orderId: order._id },
                    } as never)
                  }
                >
                  <View style={styles.orderRow}>
                    <View style={styles.orderTextBlock}>
                      <Text style={styles.orderNumber}>{order.orderNumber}</Text>
                      <Text style={styles.orderMeta}>
                        {order.customerSnapshot?.fullName || t("today.customer")} -{" "}
                        {localizeDigits(String(order.itemsSnapshot?.length ?? 0))}{" "}
                        {t("today.items")}
                      </Text>
                      {order.status === "New" ? (
                        <Text style={styles.orderPlacedText}>
                          {t("today.placed")} {placedTime || t("today.justNow")}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.orderStatusStack}>
                      <StatusPill
                        label={
                          isLate
                            ? t("orders.late")
                            : getLocalizedOrderStatusLabel(order.status, t)
                        }
                        tone={isLate ? "danger" : getOrderStatusTone(order.status)}
                      />
                      {autoCancelSeconds !== null ? (
                        <View style={styles.autoCancelPill}>
                          <Ionicons
                            name="timer-outline"
                            size={12}
                            color={palette.danger}
                          />
                          <Text style={styles.autoCancelText}>
                            {localizeDigits(
                              formatAutoCancelCountdown(autoCancelSeconds),
                            )}
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
                            color={
                              prepRemainingSeconds === 0
                                ? palette.danger
                                : palette.primary
                            }
                          />
                          <Text
                            style={[
                              styles.prepPillText,
                              prepRemainingSeconds === 0
                                ? styles.prepPillTextLate
                                : null,
                            ]}
                          >
                            {prepPillText}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-done-outline" size={26} color={palette.success} />
            <Text style={styles.emptyTitle}>{t("today.noActiveOrders")}</Text>
            <Text style={styles.emptyText}>
              {t("today.noActiveOrdersBody")}
            </Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 18,
    gap: 16,
  },
  restaurantCard: {
    borderRadius: 22,
    backgroundColor: palette.surface,
    padding: 16,
    gap: 10,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  restaurantTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  restaurantNameWrap: {
    flex: 1,
    gap: 8,
  },
  restaurantName: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "900",
    color: palette.foreground,
  },
  statusStrip: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    paddingLeft: 11,
    paddingRight: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  statusStripOnline: {
    backgroundColor: palette.successSoft,
    borderColor: "rgba(20, 152, 91, 0.24)",
  },
  statusStripOffline: {
    backgroundColor: palette.dangerSoft,
    borderColor: "rgba(180, 35, 24, 0.22)",
  },
  switchWrap: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  switchSlot: {
    width: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiRow: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 16,
    backgroundColor: palette.surfaceMuted,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  kpiTile: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 12,
  },
  // Matches the customer app's press feedback: a small scale/lift rather than a
  // heavy fade, which washed the card out.
  kpiTilePressed: {
    transform: [{ scale: 0.985 }, { translateY: 1 }],
    opacity: 0.95,
  },
  kpiValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  kpiValue: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
    color: palette.foreground,
  },
  kpiLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  kpiDivider: {
    width: 1,
    marginVertical: 4,
    backgroundColor: palette.border,
  },
  prepCard: {
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 15,
    gap: 13,
  },
  prepHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  prepTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  prepTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: palette.foreground,
  },
  prepSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  checkboxButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  prepInputRow: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 8,
  },
  prepInputRowDisabled: {
    opacity: 0.55,
  },
  prepStepButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  prepInput: {
    flex: 1,
    minHeight: 48,
    textAlign: "center",
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
    color: palette.foreground,
    paddingVertical: 0,
  },
  prepUnit: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "900",
    color: palette.mutedForeground,
  },
  prepSaveButton: {
    minHeight: 48,
    borderRadius: 15,
    backgroundColor: palette.foreground,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  prepSaveButtonDisabled: {
    opacity: 0.6,
  },
  prepSaveText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  sectionTitle: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: "900",
    color: palette.foreground,
  },
  sectionCountPill: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionCountText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  sectionAction: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.primary,
  },
  sectionActionPressed: {
    opacity: 0.7,
  },
  feedbackCard: {
    minHeight: 120,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.surface,
  },
  feedbackText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  orderList: {
    gap: 10,
  },
  orderCard: {
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: "transparent",
    padding: 14,
  },
  orderCardLate: {
    borderColor: "rgba(239, 68, 68, 0.32)",
    backgroundColor: "#FFF7F8",
  },
  orderCardPressed: {
    transform: [{ scale: 0.985 }, { translateY: 1 }],
    opacity: 0.95,
  },
  orderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  orderTextBlock: {
    flex: 1,
  },
  orderNumber: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: palette.foreground,
  },
  orderMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  orderPlacedText: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
    color: palette.primary,
  },
  orderStatusStack: {
    alignItems: "flex-end",
    gap: 6,
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
  emptyCard: {
    minHeight: 150,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: palette.surface,
    padding: 18,
  },
  emptyTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
    color: palette.foreground,
  },
  emptyText: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    color: palette.mutedForeground,
    fontWeight: "600",
  },
});
