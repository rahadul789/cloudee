import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
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

// Per-order prep-time choices (mirrors the backend 5–45 bounds). The owner can tweak this
// before accepting; defaults to the restaurant average.
const PREPARATION_TIME_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45] as const;

// Stepper bounds for adjusting the prep time with the − / + buttons (no manual typing).
const PREP_MIN_MINUTES = 5;
const PREP_MAX_MINUTES = 45;
const PREP_STEP_MINUTES = 5;

function clampPrepMinutes(minutes: number) {
  return Math.min(PREP_MAX_MINUTES, Math.max(PREP_MIN_MINUTES, minutes));
}

// Solid dot colour per order status for the horizontal timeline (mirrors the StatusPill tones).
const STATUS_DOT_COLORS: Record<string, string> = {
  New: palette.warning,
  Accepted: palette.primary,
  Preparing: palette.info,
  ReadyForPickup: "#6D28D9",
  PickedUp: "#0F766E",
  Delivered: palette.success,
  Rejected: "#BE123C",
  Cancelled: palette.danger,
};

function getStatusDotColor(status: string) {
  return STATUS_DOT_COLORS[status] ?? palette.mutedForeground;
}

function snapPrepOption(minutes: number) {
  return PREPARATION_TIME_OPTIONS.reduce(
    (closest, option) =>
      Math.abs(option - minutes) < Math.abs(closest - minutes) ? option : closest,
    PREPARATION_TIME_OPTIONS[0] as number,
  );
}

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
  // Per-order prep time chosen from the accept selector (defaults to the restaurant average
  // carried on the order's preparation timing).
  const [prepMinutes, setPrepMinutes] = useState<number | null>(null);
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
        preparationMinutes:
          nextStatus === "Accepted"
            ? prepMinutes ?? snapPrepOption(order.preparationTiming?.baseMinutes ?? 20)
            : undefined,
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

  async function extendPreparation(minutes: 5 | 10 | 15) {
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
          <Pressable
            style={({ pressed }) => [
              styles.backButton,
              pressed ? styles.backButtonPressed : null,
            ]}
            onPress={handleBack}
          >
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
              {order.isUrgent ? (
                <StatusPill label={`⚡ ${t("orders.urgent")}`} tone="warning" />
              ) : null}
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
            {/* Urgent auto-cancel countdown — kept at the very top so it's the first thing
                the owner sees on a New order. */}
            {autoCancelSeconds !== null ? (
              <View style={styles.autoCancelBanner}>
                <Ionicons name="timer-outline" size={17} color={palette.danger} />
                <Text style={styles.autoCancelBannerText}>
                  {t("orderDetails.autoCancelIn")}{" "}
                  {localizeDigits(formatAutoCancelCountdown(autoCancelSeconds))}
                </Text>
              </View>
            ) : null}

            {/* ITEMS — the hero of this screen. Each item is a soft tile (photo + big qty
                badge + name + option chips) so the owner reads "what to cook" at a glance. */}
            <View style={styles.itemsCard}>
              <SectionHeader
                icon="fast-food"
                title={t("orderDetails.items")}
                count={order.itemsSnapshot?.length ?? 0}
                dark
              />
              <View style={styles.itemsList}>
                {order.itemsSnapshot?.map((item, index) => {
                  const quantity = item.quantity ?? 1;
                  const unitPrice = item.unitPrice ?? 0;
                  const lineTotal = unitPrice * quantity;
                  const chips = getItemChips(item);
                  return (
                    <View
                      key={`${item.itemId ?? item.name}-${index}`}
                      style={styles.itemTile}
                    >
                      <FoodThumb uri={item.imageUrl} quantity={quantity} />
                      <View style={styles.itemBody}>
                        <Text style={styles.itemName} numberOfLines={2}>
                          {item.name ?? t("orderDetails.itemFallback")}
                        </Text>
                        {chips.length ? (
                          <View style={styles.chipRow}>
                            {chips.map((chip, chipIndex) => (
                              <View key={chipIndex} style={styles.chip}>
                                <Text style={styles.chipText}>{chip}</Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.itemPriceCol}>
                        <Text style={styles.itemLineTotal}>{formatCurrency(lineTotal)}</Text>
                        {quantity > 1 ? (
                          <Text style={styles.itemUnit}>
                            {formatCurrency(unitPrice)} {t("orderDetails.each")}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* Food subtotal — highlighted so the owner's own total stands out. */}
              <View style={styles.subtotalRow}>
                <Text style={styles.subtotalLabel}>{t("orderDetails.foodSubtotal")}</Text>
                <Text style={styles.subtotalValue}>
                  {formatCurrency(getOwnerOrderSubtotal(order))}
                </Text>
              </View>
              {getOwnerOrderDiscount(order) > 0 ? (
                <SummaryLine
                  label={t("orderDetails.ownerVoucherDiscount")}
                  value={`-${formatCurrency(getOwnerOrderDiscount(order))}`}
                  dark
                />
              ) : null}
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

            {/* PREP TIME + ACTIONS — its own card directly under the items, where the owner
                acts after reading the order. */}
            {hasOrderActions(order) ? (
              <View style={styles.actionCard}>
                <PreparationTimingPanel
                  order={order}
                  now={now}
                  pendingExtension={pendingExtension}
                  onExtend={extendPreparation}
                />
                <OrderActions
                  order={order}
                  pendingAction={pendingAction}
                  prepMinutes={
                    prepMinutes ?? snapPrepOption(order.preparationTiming?.baseMinutes ?? 20)
                  }
                  onPrepMinutesChange={setPrepMinutes}
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
              </View>
            ) : null}

            {/* CUSTOMER — demoted below the food + actions (least important to the kitchen). */}
            <View style={styles.sectionCard}>
              <SectionHeader icon="person-outline" title={t("orders.customer")} />
              <Text style={styles.customerName}>
                {order.customerSnapshot?.fullName || t("orders.customer")}
              </Text>
              <View style={styles.metaRow}>
                <Ionicons name="time-outline" size={14} color={palette.mutedForeground} />
                <Text style={styles.metaText}>
                  {formatTime(getOrderPlacedAt(order)) || t("orders.justNow")}
                </Text>
                <View style={styles.metaDot} />
                <Ionicons name="wallet-outline" size={14} color={palette.mutedForeground} />
                <Text style={styles.metaText}>{order.paymentMethod}</Text>
              </View>
              {order.customerSnapshot?.phone ? (
                <Pressable
                  style={({ pressed }) => [styles.callRow, pressed ? styles.callRowPressed : null]}
                  onPress={() => Linking.openURL(`tel:${order.customerSnapshot?.phone}`)}
                  accessibilityRole="button"
                >
                  <Ionicons name="call" size={15} color={palette.success} />
                  <Text style={styles.callText}>{order.customerSnapshot.phone}</Text>
                  <Ionicons name="chevron-forward" size={15} color={palette.success} />
                </Pressable>
              ) : null}
              {getCustomerOrderNote(order) ? (
                <View style={styles.notePanel}>
                  <View style={styles.notePanelHeader}>
                    <Ionicons name="chatbubble-ellipses-outline" size={15} color="#FFFFFF" />
                    <Text style={styles.notePanelTitle}>{t("orderDetails.customerNote")}</Text>
                  </View>
                  <Text style={styles.notePanelText}>{getCustomerOrderNote(order)}</Text>
                </View>
              ) : null}
            </View>

            {order.history?.length ? (
              <View style={styles.sectionCard}>
                <SectionHeader icon="git-commit-outline" title={t("orderDetails.timeline")} />
                {/* Horizontal, chronological (oldest → newest) chip trail. Consecutive
                    duplicate statuses are collapsed so the flow reads cleanly. */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.timelineRow}
                >
                  {order.history
                    .filter(
                      (entry, index, arr) =>
                        entry.status && arr[index - 1]?.status !== entry.status,
                    )
                    .map((entry, index) => (
                      <View
                        key={`${entry.status}-${entry.createdAt}-${index}`}
                        style={styles.timelinePillWrap}
                      >
                        {index > 0 ? (
                          <Ionicons
                            name="chevron-forward"
                            size={12}
                            color={palette.mutedForeground}
                            style={styles.timelineArrow}
                          />
                        ) : null}
                        <View style={styles.timelinePill}>
                          <View
                            style={[
                              styles.timelineDot,
                              { backgroundColor: getStatusDotColor(entry.status) },
                            ]}
                          />
                          <View>
                            <Text style={styles.timelinePillLabel} numberOfLines={1}>
                              {getLocalizedOrderStatusLabel(entry.status, t)}
                            </Text>
                            <Text style={styles.timelinePillTime}>
                              {formatTime(entry.createdAt)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                </ScrollView>
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
  onExtend: (minutes: 5 | 10 | 15) => void;
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
  // Surface add-time only when the deadline is near (< 5 min left) OR already overtime — the
  // moments the owner actually needs it. (The old rule required remaining > 0, which wrongly
  // hid it exactly when overtime.) The backend's canExtend/extensionOptions then hide it once
  // the admin-set max extra time is used up.
  const canShowExtensionOptions =
    isPreparing &&
    (isLate ||
      (prepRemainingSeconds !== null &&
        prepRemainingSeconds > 0 &&
        prepRemainingSeconds < 5 * 60));
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
        <View style={styles.extensionWrap}>
          <Text style={[styles.extensionPrompt, isLate ? styles.extensionPromptLate : null]}>
            {isLate ? t("prep.addTimeLate") : t("prep.addTime")}
          </Text>
          <View style={styles.extensionRow}>
            {timing.extensionOptions.map((minutes) => (
              <Pressable
                key={minutes}
                style={({ pressed }) => [
                  styles.extensionChip,
                  isLate ? styles.extensionChipLate : null,
                  pendingExtension === minutes ? styles.extensionChipDisabled : null,
                  pressed && pendingExtension === null
                    ? styles.extensionChipPressed
                    : null,
                ]}
                disabled={pendingExtension !== null}
                onPress={() => onExtend(minutes as 5 | 10 | 15)}
              >
                {pendingExtension === minutes ? (
                  <ActivityIndicator size="small" color={palette.primary} />
                ) : (
                  <Text
                    style={[
                      styles.extensionChipText,
                      isLate ? styles.extensionChipTextLate : null,
                    ]}
                  >
                    +{localizeDigits(String(minutes))} {t("prep.minSuffix")}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function SectionHeader({
  icon,
  title,
  count,
  dark,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  count?: number;
  dark?: boolean;
}) {
  return (
    <View style={styles.sectionHeaderRow}>
      <View style={styles.sectionHeaderLeft}>
        <View style={styles.sectionHeaderIcon}>
          <Ionicons name={icon} size={15} color={palette.primary} />
        </View>
        <Text style={[styles.sectionTitle, dark ? styles.sectionTitleDark : null]}>
          {title}
        </Text>
      </View>
      {typeof count === "number" ? (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{localizeDigits(String(count))}</Text>
        </View>
      ) : null}
    </View>
  );
}

function SummaryLine({
  label,
  value,
  strong,
  muted,
  dark,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  // Light text for lines rendered directly on the dark items card.
  dark?: boolean;
}) {
  return (
    <View style={styles.summaryLine}>
      <Text
        numberOfLines={1}
        style={[
          styles.summaryLabel,
          muted ? styles.summaryMuted : null,
          strong ? styles.summaryStrong : null,
          dark ? styles.summaryLabelDark : null,
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
          dark ? styles.summaryValueDark : null,
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
  prepMinutes,
  onPrepMinutesChange,
  onTransition,
  onReject,
  onCancel,
}: {
  order: OwnerOrder;
  pendingAction: string;
  prepMinutes: number;
  onPrepMinutesChange: (minutes: number) => void;
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
      <View style={styles.newActionsWrap}>
        {/* Prep time for THIS order — the owner tweaks it with − / + (no manual typing) before
            accepting so the customer's ETA is right from the start. Defaults to the average. */}
        <View style={styles.prepPickerWrap}>
          <View style={styles.prepPickerHeader}>
            <Ionicons name="timer-outline" size={15} color={palette.primary} />
            <Text style={styles.prepPickerLabel}>{t("prep.prepTimeLabel")}</Text>
          </View>
          <View style={styles.stepperRow}>
            <Pressable
              style={({ pressed }) => [
                styles.stepperButton,
                (hasPendingAction || prepMinutes <= PREP_MIN_MINUTES)
                  ? styles.stepperButtonDisabled
                  : null,
                pressed ? styles.stepperButtonPressed : null,
              ]}
              disabled={hasPendingAction || prepMinutes <= PREP_MIN_MINUTES}
              onPress={() => onPrepMinutesChange(clampPrepMinutes(prepMinutes - PREP_STEP_MINUTES))}
              accessibilityRole="button"
              accessibilityLabel="-5"
              hitSlop={6}
            >
              <Ionicons
                name="remove"
                size={22}
                color={prepMinutes <= PREP_MIN_MINUTES ? palette.mutedForeground : palette.primary}
              />
            </Pressable>
            <View style={styles.stepperValueWrap}>
              <Text style={styles.stepperValue}>{localizeDigits(String(prepMinutes))}</Text>
              <Text style={styles.stepperUnit}>{t("prep.minSuffix")}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.stepperButton,
                (hasPendingAction || prepMinutes >= PREP_MAX_MINUTES)
                  ? styles.stepperButtonDisabled
                  : null,
                pressed ? styles.stepperButtonPressed : null,
              ]}
              disabled={hasPendingAction || prepMinutes >= PREP_MAX_MINUTES}
              onPress={() => onPrepMinutesChange(clampPrepMinutes(prepMinutes + PREP_STEP_MINUTES))}
              accessibilityRole="button"
              accessibilityLabel="+5"
              hitSlop={6}
            >
              <Ionicons
                name="add"
                size={22}
                color={prepMinutes >= PREP_MAX_MINUTES ? palette.mutedForeground : palette.primary}
              />
            </Pressable>
          </View>
        </View>
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
      style={({ pressed }) => [
        styles.actionButton,
        tone === "danger" ? styles.dangerButton : styles.primaryButton,
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.actionButtonPressed : null,
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

// Selected variants + add-ons as individual chip labels (e.g. "Egg: Extra Egg") so the owner
// can scan each option at a glance instead of reading one long run-on line.
function getItemChips(item: NonNullable<OwnerOrder["itemsSnapshot"]>[number]) {
  const variants =
    item.selectedVariantOptions?.map(
      (option) => `${option.groupName}: ${option.optionLabel}`,
    ) ?? [];
  const addOns =
    item.selectedAddOnOptions?.map(
      (option) => `${option.groupName}: ${option.optionLabel}`,
    ) ?? [];
  return [...variants, ...addOns];
}

// Food photo with an instant fallback: a soft placeholder (fork/knife icon) renders
// immediately so the row never waits on the network; the real image draws on top once it
// loads, and falls back to the placeholder if the URL is empty or fails. The quantity sits
// as a bold badge on the corner so "how many" is unmissable.
function FoodThumb({ uri, quantity }: { uri?: string; quantity: number }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(uri) && !failed;
  return (
    <View style={styles.thumbWrap}>
      <View style={styles.thumbPlaceholder}>
        <Ionicons name="fast-food" size={22} color={palette.primary} />
      </View>
      {showImage ? (
        <Image
          source={{ uri }}
          style={styles.thumbImage}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : null}
      <View style={styles.qtyBadge}>
        <Text style={styles.qtyBadgeText}>{localizeDigits(String(quantity))}×</Text>
      </View>
    </View>
  );
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
  backButtonPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.9,
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
    fontSize: 19,
    // Generous line height + top padding so tall Bengali matras aren't clipped at the top.
    lineHeight: 28,
    paddingTop: 2,
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
    borderWidth: 1,
    borderColor: palette.border,
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
  callRow: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: palette.successSoft,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  callRowPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  callText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.success,
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
  extensionWrap: {
    gap: 6,
  },
  extensionPrompt: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    color: palette.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  extensionPromptLate: {
    color: palette.danger,
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
  extensionChipLate: {
    backgroundColor: palette.danger,
    borderColor: palette.danger,
  },
  extensionChipPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.9,
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
  extensionChipTextLate: {
    color: "#FFFFFF",
  },
  sectionCard: {
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 15,
    gap: 12,
  },
  autoCancelBanner: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: palette.dangerSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 14,
  },
  autoCancelBannerText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: palette.danger,
  },
  // The items card is the hero — a dark surface so the food list clearly stands apart from
  // the rest of the (light) screen, with light text tuned for contrast.
  itemsCard: {
    borderRadius: 22,
    backgroundColor: "#1E2330",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 16,
    gap: 14,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 4,
  },
  actionCard: {
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 13,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  // Highlighted total inside the dark card: a soft primary-tinted bar with light text.
  subtotalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(255,99,146,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,99,146,0.30)",
  },
  subtotalLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    letterSpacing: 0.3,
    color: "#E9EBF1",
  },
  subtotalValue: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  customerName: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
    color: palette.foreground,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  metaText: {
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.border,
    marginHorizontal: 3,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  sectionHeaderIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
    color: palette.foreground,
  },
  sectionTitleDark: {
    color: "#F5F6FA",
  },
  countBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 999,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  countBadgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    color: palette.primary,
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
  summaryLabelDark: {
    color: "#CBCFDD",
  },
  summaryValueDark: {
    color: "#F5F6FA",
  },
  voucherList: {
    borderRadius: 14,
    backgroundColor: palette.surfaceMuted,
    padding: 10,
    gap: 6,
  },
  newActionsWrap: {
    gap: 12,
  },
  prepPickerWrap: {
    gap: 8,
  },
  prepPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  prepPickerLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: palette.foreground,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  stepperButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  stepperButtonDisabled: {
    backgroundColor: palette.surfaceMuted,
  },
  stepperButtonPressed: {
    transform: [{ scale: 0.92 }],
    opacity: 0.9,
  },
  stepperValueWrap: {
    minWidth: 66,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 4,
  },
  stepperValue: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "900",
    color: palette.foreground,
  },
  stepperUnit: {
    fontSize: 13,
    fontWeight: "800",
    color: palette.mutedForeground,
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
  actionButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
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
  itemsList: {
    gap: 10,
  },
  // WHITE tiles on the dark card — the food items read as bright, easy-to-scan cards that
  // clearly lift off the dark surface.
  itemTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    paddingRight: 13,
    borderRadius: 16,
    backgroundColor: palette.surface,
  },
  thumbWrap: {
    width: 58,
    height: 58,
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor: palette.primarySoft,
  },
  thumbPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  thumbImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  qtyBadge: {
    position: "absolute",
    bottom: 3,
    left: 3,
    minWidth: 27,
    height: 21,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.foreground,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  qtyBadgeText: {
    fontSize: 12.5,
    lineHeight: 15,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  itemBody: {
    flex: 1,
    gap: 5,
  },
  itemName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: palette.foreground,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
  },
  chipText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: palette.foreground,
  },
  itemPriceCol: {
    alignItems: "flex-end",
    gap: 2,
  },
  itemUnit: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  itemLineTotal: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: palette.foreground,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 4,
  },
  timelinePillWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  timelineArrow: {
    marginHorizontal: 4,
  },
  timelinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  timelineDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  timelinePillLabel: {
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "800",
    color: palette.foreground,
  },
  timelinePillTime: {
    marginTop: 1,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
});
