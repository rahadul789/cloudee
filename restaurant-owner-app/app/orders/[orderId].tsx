import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Screen } from "@/src/components/screen";
import { StatusPill } from "@/src/components/status-pill";
import {
  type OwnerOrder,
  useExtendOwnerOrderPreparationMutation,
  useOwnerOrderDetailsQuery,
  useOwnerOrderTransitionMutation,
} from "@/src/hooks/use-owner-api";
import { useNow } from "@/src/hooks/use-now";
import { useOwnerTranslation } from "@/src/i18n/translations";
import {
  formatCurrency,
  formatTime,
  getOrderPlacedAt,
  getOwnerOrderDiscount,
  getOwnerOrderNetSales,
  getOwnerOrderSubtotal,
  localizeDigits,
} from "@/src/lib/format";
import {
  formatAutoCancelCountdown,
  getAutoCancelRemainingSeconds,
  getLocalizedOrderStatusLabel,
  getOrderStatusTone,
  getPrepStartRemainingSeconds,
  getPreparationLateSeconds,
  getPreparationRemainingSeconds,
  isOwnerOrderLate,
} from "@/src/lib/order-status";
import { palette } from "@/src/theme/palette";

export default function OrderDetailsScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const params = useLocalSearchParams<{ orderId?: string | string[] }>();
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
  const orderQuery = useOwnerOrderDetailsQuery(orderId);
  const transitionMutation = useOwnerOrderTransitionMutation();
  const extendPreparationMutation = useExtendOwnerOrderPreparationMutation();
  const [pendingAction, setPendingAction] = useState("");
  const [pendingExtension, setPendingExtension] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { t } = useOwnerTranslation();
  const now = useNow(1000, isFocused);
  const order = orderQuery.data;
  const autoCancelSeconds = order ? getAutoCancelRemainingSeconds(order, now) : null;
  const isLate = order ? isOwnerOrderLate(order, now) : false;

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/(tabs)/orders" as never);
  }

  async function transitionOrder(
    nextStatus: "Accepted" | "Rejected" | "Preparing" | "ReadyForPickup" | "Cancelled",
    note?: string,
  ) {
    if (!order) return;

    setPendingAction(nextStatus);
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

  async function extendPreparation(minutes: 5 | 10) {
    if (!order) return;

    setPendingExtension(minutes);
    try {
      await extendPreparationMutation.mutateAsync({
        orderId: order._id,
        minutes,
      });
    } catch (error) {
      Alert.alert(
        t("orderDetails.timeUpdateFailed"),
        error instanceof Error ? error.message : t("orders.updateFailedBody"),
      );
    } finally {
      setPendingExtension(null);
    }
  }

  async function refreshOrder() {
    setIsRefreshing(true);
    try {
      await orderQuery.refetch();
    } finally {
      setIsRefreshing(false);
    }
  }

  function confirmTransition(
    title: string,
    nextStatus: "Rejected" | "Cancelled",
    note: string,
    message = t("orderDetails.notifyCustomer"),
  ) {
    Alert.alert(title, message, [
      { text: t("orders.keepOrder"), style: "cancel" },
      {
        text: nextStatus === "Rejected" ? t("orders.reject") : t("orders.cancel"),
        style: "destructive",
        onPress: () => void transitionOrder(nextStatus, note),
      },
    ]);
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshOrder}
            tintColor={palette.primary}
          />
        }
      >
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={handleBack}>
            <Ionicons name="chevron-back" size={23} color={palette.foreground} />
          </Pressable>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>{t("orderDetails.title")}</Text>
            <Text style={styles.subtitle}>
              {order?.orderNumber ?? t("orderDetails.loading")}
            </Text>
          </View>
          {order ? (
            <View style={styles.headerBadgeStack}>
              <StatusPill
                label={
                  isLate ? t("orders.late") : getLocalizedOrderStatusLabel(order.status, t)
                }
                tone={isLate ? "danger" : getOrderStatusTone(order.status)}
              />
            </View>
          ) : null}
        </View>

        {orderQuery.isLoading ? (
          <View style={styles.feedbackCard}>
            <ActivityIndicator size="small" color={palette.primary} />
            <Text style={styles.feedbackText}>{t("orderDetails.loading")}</Text>
          </View>
        ) : !order ? (
          <View style={styles.feedbackCard}>
            <Ionicons name="alert-circle-outline" size={28} color={palette.danger} />
            <Text style={styles.feedbackTitle}>{t("orderDetails.notFound")}</Text>
            <Text style={styles.feedbackText}>{t("orderDetails.notFoundBody")}</Text>
          </View>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <InfoBlock
                  label={t("orderDetails.placed")}
                  value={formatTime(getOrderPlacedAt(order)) || t("orders.justNow")}
                />
                <InfoBlock
                  label={t("orderDetails.foodSales")}
                  value={formatCurrency(getOwnerOrderNetSales(order))}
                  alignRight
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.summaryRow}>
                <InfoBlock
                  label={t("orders.customer")}
                  value={order.customerSnapshot?.fullName || t("orders.customer")}
                />
                <InfoBlock
                  label={t("orderDetails.items")}
                  value={`${localizeDigits(String(order.itemsSnapshot?.length ?? 0))} ${t("today.items")}`}
                  alignRight
                />
              </View>
              {order.customerSnapshot?.phone ? (
                <Text style={styles.phoneText}>{order.customerSnapshot.phone}</Text>
              ) : null}
              {autoCancelSeconds !== null ? (
                <View style={styles.autoCancelNotice}>
                  <Ionicons name="timer-outline" size={16} color={palette.danger} />
                  <Text style={styles.autoCancelNoticeText}>
                    {t("orderDetails.autoCancelIn")}{" "}
                    {localizeDigits(formatAutoCancelCountdown(autoCancelSeconds))}
                  </Text>
                </View>
              ) : null}
              <PreparationTimingPanel
                order={order}
                now={now}
                pendingExtension={pendingExtension}
                onExtend={extendPreparation}
              />
              {getCustomerOrderNote(order) ? (
                <View style={styles.notePanel}>
                  <View style={styles.notePanelHeader}>
                    <Ionicons name="chatbubble-ellipses-outline" size={15} color="#FFFFFF" />
                    <Text style={styles.notePanelTitle}>{t("orderDetails.customerNote")}</Text>
                  </View>
                  <Text style={styles.notePanelText}>{getCustomerOrderNote(order)}</Text>
                </View>
              ) : null}
              {hasOrderActions(order) ? (
                <OrderActions
                  order={order}
                  pendingAction={pendingAction}
                  onTransition={transitionOrder}
                  onReject={() =>
                    confirmTransition(
                      t("orders.rejectTitle"),
                      "Rejected",
                      "Rejected from owner mobile app.",
                      t("orders.rejectBody"),
                    )
                  }
                  onCancel={() =>
                    confirmTransition(
                      t("orders.cancelTitle"),
                      "Cancelled",
                      "Cancelled from owner mobile app.",
                      t("orders.cancelBody"),
                    )
                  }
                />
              ) : null}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{t("orderDetails.items")}</Text>
              {order.itemsSnapshot?.map((item, index) => (
                <View
                  key={`${item.itemId ?? item.name}-${index}`}
                  style={styles.itemRow}
                >
                  <View style={styles.quantityPill}>
                    <Text style={styles.quantityText}>{localizeDigits(String(item.quantity ?? 1))}x</Text>
                  </View>
                  <View style={styles.itemBody}>
                    <Text style={styles.itemName}>{item.name ?? t("orderDetails.itemFallback")}</Text>
                    <Text style={styles.itemMeta}>
                      {formatCurrency(item.unitPrice)}
                      {formatOptionText(item) ? ` - ${formatOptionText(item)}` : ""}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{t("orderDetails.restaurantSummary")}</Text>
              <SummaryLine
                label={t("orderDetails.foodSubtotal")}
                value={formatCurrency(getOwnerOrderSubtotal(order))}
              />
              {getOwnerOrderDiscount(order) > 0 ? (
                <SummaryLine
                  label={t("orderDetails.ownerVoucherDiscount")}
                  value={`-${formatCurrency(getOwnerOrderDiscount(order))}`}
                />
              ) : null}
              <View style={styles.summaryDivider} />
              <SummaryLine
                label={t("orderDetails.restaurantNetSales")}
                value={formatCurrency(getOwnerOrderNetSales(order))}
                strong
              />
              {order.appliedVouchers?.length ? (
                <View style={styles.voucherList}>
                  {order.appliedVouchers.map((voucher, index) => (
                    <SummaryLine
                      key={`${voucher.id ?? voucher.code ?? voucher.name ?? "voucher"}-${index}`}
                      label={voucher.name || voucher.code || t("orderDetails.ownerVoucher")}
                      value={`-${formatCurrency(
                        voucher.ownerDiscountCost ?? voucher.discountAmount,
                      )}`}
                      muted
                    />
                  ))}
                </View>
              ) : null}
            </View>

            {order.history?.length ? (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>{t("orderDetails.timeline")}</Text>
                {order.history.slice().reverse().slice(0, 5).map((entry, index) => {
                  // The customer's order note is surfaced in its own block above,
                  // so it is intentionally hidden from the timeline here.
                  const showNote = entry.note && entry.actor !== "customer";
                  return (
                    <View key={`${entry.status}-${entry.createdAt}-${index}`} style={styles.timelineRow}>
                      <View style={styles.timelineDot} />
                      <View style={styles.timelineBody}>
                        <Text style={styles.timelineTitle}>
                          {getLocalizedOrderStatusLabel(entry.status, t)}
                        </Text>
                        <Text style={styles.timelineText}>
                          {entry.actor}
                          {showNote ? ` - ${entry.note}` : ""}
                        </Text>
                      </View>
                      <Text style={styles.timelineTime}>{formatTime(entry.createdAt)}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function PreparationTimingPanel({
  order,
  now,
  pendingExtension,
  onExtend,
}: {
  order: OwnerOrder;
  now: number;
  pendingExtension: number | null;
  onExtend: (minutes: 5 | 10) => void;
}) {
  const { t } = useOwnerTranslation();
  const timing = order.preparationTiming;
  if (!timing || (order.status !== "Accepted" && order.status !== "Preparing")) {
    return null;
  }

  const startRemainingSeconds = getPrepStartRemainingSeconds(order, now);
  const prepRemainingSeconds = getPreparationRemainingSeconds(order, now);
  const lateSeconds = getPreparationLateSeconds(order, now);
  const isPreparing = order.status === "Preparing";
  const isLate = isPreparing && prepRemainingSeconds === 0 && lateSeconds > 0;
  const canShowExtensionOptions =
    isPreparing &&
    prepRemainingSeconds !== null &&
    prepRemainingSeconds > 0 &&
    prepRemainingSeconds < 5 * 60;
  const title = isPreparing
    ? isLate
      ? t("prep.runningLate")
      : t("orders.status.preparing")
    : t("prep.autoPreparing");
  // When preparation is overdue, show the elapsed-late time with a leading
  // minus sign so the owner immediately understands the timer is negative.
  const timerLabel = isPreparing
    ? isLate
      ? `-${localizeDigits(formatAutoCancelCountdown(lateSeconds))}`
      : localizeDigits(formatAutoCancelCountdown(prepRemainingSeconds ?? 0))
    : startRemainingSeconds !== null
      ? localizeDigits(formatAutoCancelCountdown(startRemainingSeconds))
      : "--:--";
  const helperText = isPreparing
    ? `${localizeDigits(String(timing.totalMinutes))} ${t("prep.targetSuffix")}${
        timing.extraMinutes
          ? `, +${localizeDigits(String(timing.extraMinutes))} ${t("prep.addedSuffix")}`
          : ""
      }`
    : t("prep.autoStartHelper");

  return (
    <View style={[styles.prepPanel, isLate ? styles.prepPanelLate : null]}>
      <View style={styles.prepTopRow}>
        <View style={styles.prepTitleWrap}>
          <Ionicons
            name={isPreparing ? "restaurant-outline" : "timer-outline"}
            size={17}
            color={isLate ? palette.danger : palette.primary}
          />
          <Text style={[styles.prepTitle, isLate ? styles.prepTitleLate : null]}>
            {title}
          </Text>
        </View>
        <Text style={[styles.prepTimer, isLate ? styles.prepTimerLate : null]}>
          {timerLabel}
        </Text>
      </View>
      <Text style={styles.prepHelper}>{helperText}</Text>

      {canShowExtensionOptions && timing.canExtend && timing.extensionOptions.length ? (
        <View style={styles.extensionRow}>
          {timing.extensionOptions.map((minutes) => (
            <Pressable
              key={minutes}
              style={[
                styles.extensionChip,
                pendingExtension === minutes ? styles.extensionChipDisabled : null,
              ]}
              disabled={pendingExtension !== null}
              onPress={() => onExtend(minutes as 5 | 10)}
            >
              {pendingExtension === minutes ? (
                <ActivityIndicator size="small" color={palette.primary} />
              ) : (
                <Text style={styles.extensionChipText}>
                  +{localizeDigits(String(minutes))} {t("prep.minSuffix")}
                </Text>
              )}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function InfoBlock({
  label,
  value,
  alignRight,
}: {
  label: string;
  value: string;
  alignRight?: boolean;
}) {
  return (
    <View style={[styles.infoBlock, alignRight ? styles.infoBlockRight : null]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.infoValue}>
        {value}
      </Text>
    </View>
  );
}

function SummaryLine({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={styles.summaryLine}>
      <Text
        numberOfLines={1}
        style={[
          styles.summaryLabel,
          muted ? styles.summaryMuted : null,
          strong ? styles.summaryStrong : null,
        ]}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={[
          styles.summaryValue,
          muted ? styles.summaryMuted : null,
          strong ? styles.summaryStrong : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function OrderActions({
  order,
  pendingAction,
  onTransition,
  onReject,
  onCancel,
}: {
  order: OwnerOrder;
  pendingAction: string;
  onTransition: (
    nextStatus: "Accepted" | "Rejected" | "Preparing" | "ReadyForPickup" | "Cancelled",
    note?: string,
  ) => void;
  onReject: () => void;
  onCancel: () => void;
}) {
  const { t } = useOwnerTranslation();
  const hasPendingAction = Boolean(pendingAction);

  if (order.status === "New") {
    return (
      <View style={styles.actionRow}>
        <ActionButton
          label={t("orders.reject")}
          tone="danger"
          loading={pendingAction === "Rejected"}
          disabled={hasPendingAction}
          onPress={onReject}
        />
        <ActionButton
          label={t("orders.accept")}
          loading={pendingAction === "Accepted"}
          disabled={hasPendingAction}
          onPress={() => onTransition("Accepted")}
        />
      </View>
    );
  }

  if (order.status === "Accepted") {
    return (
      <View style={styles.actionRow}>
        <ActionButton
          label={t("orders.cancel")}
          tone="danger"
          loading={pendingAction === "Cancelled"}
          disabled={hasPendingAction}
          onPress={onCancel}
        />
        <ActionButton
          label={t("orders.startPreparing")}
          loading={pendingAction === "Preparing"}
          disabled={hasPendingAction}
          onPress={() => onTransition("Preparing")}
        />
      </View>
    );
  }

  if (order.status === "Preparing") {
    return (
      <View style={styles.actionRow}>
        <ActionButton
          label={t("orders.cancel")}
          tone="danger"
          loading={pendingAction === "Cancelled"}
          disabled={hasPendingAction}
          onPress={onCancel}
        />
        <ActionButton
          label={t("orders.markReady")}
          loading={pendingAction === "ReadyForPickup"}
          disabled={hasPendingAction}
          onPress={() => onTransition("ReadyForPickup")}
        />
      </View>
    );
  }

  return null;
}

function hasOrderActions(order: OwnerOrder) {
  return order.status === "New" || order.status === "Accepted" || order.status === "Preparing";
}

function ActionButton({
  label,
  loading,
  disabled,
  tone = "primary",
  onPress,
}: {
  label: string;
  loading?: boolean;
  disabled: boolean;
  tone?: "primary" | "danger";
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.actionButton,
        tone === "danger" ? styles.dangerButton : styles.primaryButton,
        disabled ? styles.disabled : null,
      ]}
      disabled={disabled}
      onPress={onPress}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tone === "danger" ? palette.danger : "#FFFFFF"} />
      ) : (
        <Text style={tone === "danger" ? styles.dangerButtonText : styles.primaryButtonText}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

// The customer's order note is stored only on the initial "New" history entry
// authored by the customer. Surface it as a dedicated detail block.
function getCustomerOrderNote(order: OwnerOrder) {
  const entry = order.history?.find(
    (item) => item.actor === "customer" && Boolean(item.note?.trim()),
  );
  return entry?.note?.trim() ?? "";
}

function formatOptionText(item: NonNullable<OwnerOrder["itemsSnapshot"]>[number]) {
  const variants =
    item.selectedVariantOptions
      ?.map((option) => `${option.groupName}: ${option.optionLabel}`)
      .join(", ") ?? "";
  const addOns =
    item.selectedAddOnOptions
      ?.map((option) => `${option.groupName}: ${option.optionLabel}`)
      .join(", ") ?? "";

  return [variants, addOns].filter(Boolean).join(" - ");
}

const styles = StyleSheet.create({
  content: {
    padding: 18,
    gap: 13,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerBadgeStack: {
    alignItems: "flex-end",
    gap: 6,
    maxWidth: 130,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "900",
    color: palette.foreground,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  feedbackCard: {
    minHeight: 360,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.surface,
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
  summaryCard: {
    borderRadius: 22,
    backgroundColor: palette.surface,
    padding: 16,
    gap: 12,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 14,
  },
  divider: {
    height: 1,
    backgroundColor: palette.border,
  },
  infoBlock: {
    flex: 1,
    gap: 3,
  },
  infoBlockRight: {
    alignItems: "flex-end",
  },
  infoLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    textTransform: "uppercase",
    color: palette.mutedForeground,
  },
  infoValue: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: palette.foreground,
  },
  phoneText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  autoCancelNotice: {
    minHeight: 40,
    borderRadius: 14,
    backgroundColor: palette.dangerSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  autoCancelNoticeText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.danger,
  },
  prepPanel: {
    borderRadius: 16,
    backgroundColor: palette.primarySoft,
    padding: 12,
    gap: 8,
  },
  notePanel: {
    borderRadius: 16,
    backgroundColor: palette.foreground,
    padding: 12,
    gap: 6,
  },
  notePanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  notePanelTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "#FFFFFF",
  },
  notePanelText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  prepPanelLate: {
    backgroundColor: palette.dangerSoft,
  },
  prepTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  prepTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  prepTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.primary,
  },
  prepTitleLate: {
    color: palette.danger,
  },
  prepTimer: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
    color: palette.foreground,
  },
  prepTimerLate: {
    color: palette.danger,
  },
  prepHelper: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  extensionRow: {
    flexDirection: "row",
    gap: 8,
  },
  extensionChip: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  extensionChipDisabled: {
    opacity: 0.7,
  },
  extensionChipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    color: palette.primary,
  },
  sectionCard: {
    borderRadius: 20,
    backgroundColor: palette.surface,
    padding: 15,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
    color: palette.foreground,
  },
  summaryLine: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryLabel: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  summaryValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  summaryStrong: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: palette.foreground,
  },
  summaryMuted: {
    color: palette.mutedForeground,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: palette.border,
  },
  voucherList: {
    borderRadius: 14,
    backgroundColor: palette.surfaceMuted,
    padding: 10,
    gap: 6,
  },
  actionRow: {
    flexDirection: "row",
    gap: 9,
  },
  actionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    backgroundColor: palette.foreground,
  },
  primaryButtonText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  dangerButton: {
    backgroundColor: palette.dangerSoft,
  },
  dangerButtonText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.danger,
  },
  disabled: {
    opacity: 0.7,
  },
  itemRow: {
    flexDirection: "row",
    gap: 11,
    paddingTop: 2,
  },
  quantityPill: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  quantityText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    color: palette.primary,
  },
  itemBody: {
    flex: 1,
    gap: 3,
  },
  itemName: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: palette.foreground,
  },
  itemMeta: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  timelineDot: {
    marginTop: 6,
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: palette.primary,
  },
  timelineBody: {
    flex: 1,
  },
  timelineTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  timelineText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  timelineTime: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
});
