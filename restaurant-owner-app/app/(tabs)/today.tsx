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
import { formatTime, getOrderPlacedAt } from "@/src/lib/format";
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
  const isOnline = store?.runtime?.isOnline ?? dashboard?.restaurant.isOnline ?? false;
  const savedPrepMinutes =
    typeof store?.preparationTimeMinutes === "number"
      ? store.preparationTimeMinutes
      : null;

  async function handleToggleOnline() {
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
        <View style={styles.restaurantCard}>
          <View style={styles.restaurantTop}>
            <View style={styles.restaurantNameWrap}>
              <Text numberOfLines={2} style={styles.restaurantName}>
                {store?.name ?? dashboard?.restaurant.name ?? "Restaurant"}
              </Text>
            </View>
            <OwnerHeaderActions />
          </View>
          <View style={styles.restaurantStateRow}>
            <StatusPill
              label={isOnline ? t("status.online") : t("status.offline")}
              tone={isOnline ? "success" : "danger"}
            />
            <View style={styles.switchWrap}>
              {statusMutation.isPending ? (
                <ActivityIndicator size="small" color={palette.primary} />
              ) : null}
              <Switch
                value={isOnline}
                disabled={statusMutation.isPending}
                onValueChange={handleToggleOnline}
                trackColor={{ false: palette.dangerSoft, true: palette.successSoft }}
                thumbColor={isOnline ? palette.success : palette.danger}
              />
            </View>
          </View>
          <View style={styles.prepSummaryRow}>
            <View style={styles.prepSummaryCopy}>
              <Ionicons name="restaurant-outline" size={15} color={palette.primary} />
              <Text style={styles.prepSummaryText}>
                {t("today.prepTime")}:{" "}
                {savedPrepMinutes ? `${savedPrepMinutes} min` : t("today.notSet")}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              style={styles.prepEditButton}
              onPress={() => router.push("/account-preparation-time" as never)}
            >
              <Ionicons name="create-outline" size={16} color={palette.foreground} />
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t("today.liveOrders")}</Text>
          <Pressable onPress={() => router.push("/(tabs)/orders" as never)}>
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
                  ? `${t("orders.prepIn")} ${formatAutoCancelCountdown(prepStartSeconds)}`
                  : order.status === "Preparing" && prepRemainingSeconds !== null
                    ? prepRemainingSeconds > 0
                      ? `${t("orders.prep")} ${formatAutoCancelCountdown(prepRemainingSeconds)}`
                      : `${t("orders.late")} ${formatAutoCancelCountdown(prepLateSeconds)}`
                    : "";

              return (
                <Pressable
                  key={order._id}
                  style={[styles.orderCard, isLate ? styles.orderCardLate : null]}
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
                        {order.itemsSnapshot?.length ?? 0} {t("today.items")}
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
                            {formatAutoCancelCountdown(autoCancelSeconds)}
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
  restaurantStateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  restaurantName: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "900",
    color: palette.foreground,
  },
  prepSummaryRow: {
    minHeight: 38,
    borderRadius: 14,
    backgroundColor: palette.primarySoft,
    paddingLeft: 11,
    paddingRight: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  prepSummaryCopy: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  prepSummaryText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "900",
    color: palette.foreground,
  },
  prepEditButton: {
    width: 30,
    height: 30,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  switchWrap: {
    minHeight: 44,
    minWidth: 78,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
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
  sectionTitle: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: "900",
    color: palette.foreground,
  },
  sectionAction: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.primary,
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
