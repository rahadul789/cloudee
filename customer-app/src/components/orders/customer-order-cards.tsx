import { Ionicons } from "@expo/vector-icons";
import {
  memo,
  type ComponentProps,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";

import { PreparationRuntime } from "@/src/components/orders/preparation-runtime";
import { styles } from "@/src/components/orders/orders-list.styles";
import { formatCurrency } from "@/src/lib/currency";
import { getCustomerOrderStatusMeta } from "@/src/lib/customer-order-display";
import { formatCustomerAddressLine } from "@/src/lib/location-address";
import { formatShortOrderIdLabel } from "@/src/lib/order-id";
import { palette } from "@/src/theme/palette";

export type CustomerOrderSummary = {
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
  preparationTiming?: {
    phase?: string;
    baseMinutes?: number;
    extraMinutes?: number;
    totalMinutes?: number;
    targetStartAt?: string | null;
    targetReadyAt?: string | null;
    remainingSeconds?: number | null;
    lateBySeconds?: number | null;
  } | null;
  timestamps?: {
    acceptedAt?: string | null;
    preparingAt?: string | null;
    placedAt?: string | null;
  } | null;
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

type IoniconName = ComponentProps<typeof Ionicons>["name"];

type CompactPreviewItem = {
  key: string;
  label: string;
};

type ProgressWidth = "18%" | "36%" | "62%" | "80%" | "100%";

export type OrderCardModel = {
  order: CustomerOrderSummary;
  id: string;
  signature: string;
  status: string;
  orderNumberLabel: string;
  createdAtLabel: string;
  itemCount: number;
  itemCountLabel: string;
  paymentMethod: string;
  totalLabel: string;
  deliveryAddress: string;
  statusMeta: ReturnType<typeof getCustomerOrderStatusMeta>;
  isActive: boolean;
  isCancelled: boolean;
  canRate: boolean;
  cancelledMessage: string | null;
  activeLine: string;
  activeIcon: IoniconName;
  progressWidth: ProgressWidth;
  compactPreviewItems: CompactPreviewItem[];
  remainingItemCount: number;
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

export function dedupeOrdersById<T extends { _id: string }>(orders: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const order of orders) {
    if (order?._id && seen.has(order._id)) continue;
    if (order?._id) seen.add(order._id);
    result.push(order);
  }
  return result;
}

export function isActiveStatus(status: string) {
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

function getActiveOrderCardIcon(order: CustomerOrderSummary): IoniconName {
  if (order.riderSnapshot?.name || order.status === "PickedUp") {
    return "bicycle-outline";
  }
  if (order.status === "Preparing") {
    return "restaurant-outline";
  }
  if (order.status === "ReadyForPickup") {
    return "bag-handle-outline";
  }
  return "receipt-outline";
}

function getActiveOrderProgressWidth(status: string): ProgressWidth {
  switch (status) {
    case "New":
      return "18%";
    case "Accepted":
      return "36%";
    case "Preparing":
      return "62%";
    case "ReadyForPickup":
      return "80%";
    default:
      return "100%";
  }
}

function buildCompactPreviewItems(order: CustomerOrderSummary) {
  return (order.itemsSnapshot ?? []).slice(0, 2).map((item, index) => ({
    key: `${item.itemId ?? item.name ?? "item"}-${index}`,
    label: `${item.quantity ?? 1}x ${item.name ?? "Food item"}`,
  }));
}

export function buildOrderCardModel(
  order: CustomerOrderSummary,
): OrderCardModel {
  const itemCount = order.itemsSnapshot?.length ?? 0;
  const compactPreviewItems = buildCompactPreviewItems(order);
  const isActive = isActiveStatus(order.status);
  const isCancelled = isCancelledStatus(order.status);
  const statusMeta = getCustomerOrderStatusMeta(order.status);
  const deliveryAddress = formatCustomerAddressLine(
    order.customerSnapshot?.deliveryAddress?.addressLine,
    "Delivery address unavailable",
  );
  const totalLabel = formatCurrency(order.pricing?.total ?? 0);
  const itemSignature = (order.itemsSnapshot ?? [])
    .map(
      (item) =>
        `${item.itemId ?? ""}:${item.name ?? ""}:${item.quantity ?? 0}:${
          item.unitPrice ?? 0
        }`,
    )
    .join(",");
  const signature = [
    order._id,
    order.orderNumber,
    order.status,
    order.paymentMethod,
    order.createdAt ?? "",
    totalLabel,
    deliveryAddress,
    order.riderSnapshot?.name ?? "",
    order.terminalReason ?? "",
    order.cancelledBy ?? "",
    order.hasCustomerReview ? "reviewed" : "unreviewed",
    order.preparationTiming?.phase ?? "",
    order.preparationTiming?.totalMinutes ?? "",
    order.preparationTiming?.targetStartAt ?? "",
    order.preparationTiming?.targetReadyAt ?? "",
    itemSignature,
  ].join("|");

  return {
    order,
    id: order._id,
    signature,
    status: order.status,
    orderNumberLabel: formatShortOrderIdLabel(order.orderNumber),
    createdAtLabel: formatDateTime(order.createdAt),
    itemCount,
    itemCountLabel: `${itemCount} item${itemCount === 1 ? "" : "s"}`,
    paymentMethod: order.paymentMethod,
    totalLabel,
    deliveryAddress,
    statusMeta,
    isActive,
    isCancelled,
    canRate: canRateOrder(order.status, order.hasCustomerReview),
    cancelledMessage: isCancelled ? getCancelledOrderMessage(order) : null,
    activeLine: isActive ? getActiveOrderCardLine(order) : "",
    activeIcon: getActiveOrderCardIcon(order),
    progressWidth: getActiveOrderProgressWidth(order.status),
    compactPreviewItems,
    remainingItemCount: Math.max(itemCount - compactPreviewItems.length, 0),
  };
}

export const OrdersListSeparator = memo(function OrdersListSeparator() {
  return <View style={styles.virtualizedSeparator} />;
});

export const OrdersSectionHeader = memo(function OrdersSectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.virtualizedSectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
});

export const OrderCard = memo(function OrderCard({
  card,
  onPress,
  onReorderPress,
  reorderPending,
  compact = false,
}: {
  card: OrderCardModel;
  onPress: () => void;
  onReorderPress?: () => void;
  reorderPending?: boolean;
  compact?: boolean;
}) {
  const { order, statusMeta } = card;
  if (card.isActive) {
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
              {card.orderNumberLabel} - {card.createdAtLabel}
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
                name={card.activeIcon}
                size={14}
                color={palette.secondary}
              />
              <Text style={styles.activeProgressChipText} numberOfLines={1}>
                {card.activeLine}
              </Text>
            </View>
            <View style={styles.activeProgressAmountRow}>
              <Text style={styles.orderTotal}>{card.totalLabel}</Text>
            </View>
          </View>

          <View style={styles.activeProgressTrack}>
            <View
              style={[styles.activeProgressFill, { width: card.progressWidth }]}
            />
          </View>

          {card.status === "Preparing" ? (
            <PreparationRuntime order={order} preciseUpdates={false}>
              {(estimate) =>
                estimate ? (
                  <View style={styles.activeEtaRow}>
                    <View style={styles.activeEtaIcon}>
                      <Ionicons
                        name={
                          estimate.state === "delayed"
                            ? "alert-circle-outline"
                            : "time-outline"
                        }
                        size={14}
                        color={
                          estimate.state === "delayed"
                            ? palette.warningText
                            : palette.secondary
                        }
                      />
                    </View>
                    <View style={styles.activeEtaCopy}>
                      <Text style={styles.activeEtaLabel}>
                        {estimate.rangeLabel}
                      </Text>
                      {estimate.supportingText ? (
                        <Text style={styles.activeEtaMeta} numberOfLines={1}>
                          {estimate.supportingText}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : null
              }
            </PreparationRuntime>
          ) : null}

          <View style={styles.activeDestinationRow}>
            <Ionicons
              name="location-outline"
              size={15}
              color={palette.mutedForeground}
            />
            <Text style={styles.orderAddress} numberOfLines={1}>
              {card.deliveryAddress}
            </Text>
          </View>
        </View>

        <View style={styles.activeTrackCta}>
          <View style={styles.activeTrackCtaLeft}>
            <Ionicons name="navigate" size={15} color={palette.secondary} />
            <Text style={styles.activeTrackCtaText}>
              Tap to track your order
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color={palette.secondary} />
        </View>
      </Pressable>
    );
  }

  if (compact) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.orderCard,
          styles.orderCardCompact,
          styles.orderCardHistory,
          pressed ? styles.orderCardPressed : null,
        ]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityHint="Opens order details"
      >
        <View style={styles.orderTopRow}>
          <View style={styles.orderCopy}>
            <Text style={styles.orderIdCompact} numberOfLines={1}>
              {card.orderNumberLabel}
            </Text>
            <Text style={styles.orderMeta}>
              {card.createdAtLabel} - {card.itemCountLabel}
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

        {card.status === "Delivered" && card.compactPreviewItems.length > 0 ? (
          <View style={styles.compactHistoryItems}>
            {card.compactPreviewItems.map((item) => (
              <Text
                key={item.key}
                style={styles.compactHistoryItemText}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            ))}
            {card.remainingItemCount > 0 ? (
              <Text style={styles.compactHistoryMoreText}>
                +{card.remainingItemCount} more
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.compactHistoryBottomRow}>
          <Text style={styles.orderTotal}>{card.totalLabel}</Text>
          <View style={styles.compactHistoryActions}>
            {card.status === "Delivered" && onReorderPress ? (
              <Pressable
                android_ripple={{ color: "rgba(216, 27, 96, 0.08)" }}
                style={({ pressed }) => [
                  styles.reorderButton,
                  styles.reorderButtonCompact,
                  reorderPending ? styles.reorderButtonDisabled : null,
                  pressed && !reorderPending
                    ? styles.reorderButtonPressed
                    : null,
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
            {card.orderNumberLabel}
          </Text>
          <Text style={styles.orderMeta}>{card.createdAtLabel}</Text>
          <Text style={styles.orderMeta}>
            {card.itemCountLabel} - {card.paymentMethod}
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
              {card.deliveryAddress}
            </Text>
          </View>

          {card.isCancelled ? (
            <Text style={styles.orderAddress} numberOfLines={2}>
              {card.cancelledMessage}
            </Text>
          ) : card.canRate ? (
            <Text style={styles.orderAddress}>Open to leave your review.</Text>
          ) : (
            <Text style={styles.orderAddress}>
              Open to see the full breakdown again.
            </Text>
          )}
        </View>
        <View style={styles.orderTrailingMeta}>
          {card.status === "Delivered" ? (
            <Text style={styles.orderTotal}>{card.totalLabel}</Text>
          ) : null}
          <Ionicons
            name="chevron-forward"
            size={16}
            color={palette.mutedForeground}
          />
        </View>
      </View>

      {card.status === "Delivered" && onReorderPress ? (
        <Pressable
          android_ripple={{ color: "rgba(216, 27, 96, 0.08)" }}
          style={({ pressed }) => [
            styles.reorderButton,
            reorderPending ? styles.reorderButtonDisabled : null,
            pressed && !reorderPending ? styles.reorderButtonPressed : null,
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
}, areOrderCardPropsEqual);

function areOrderCardPropsEqual(
  previous: {
    card: OrderCardModel;
    reorderPending?: boolean;
    compact?: boolean;
  },
  next: {
    card: OrderCardModel;
    reorderPending?: boolean;
    compact?: boolean;
  },
) {
  return (
    previous.compact === next.compact &&
    previous.reorderPending === next.reorderPending &&
    previous.card.signature === next.card.signature
  );
}
