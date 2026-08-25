import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  useAcceptOrderMutation,
  useActivateTrackingMutation,
  useDeliverOrderMutation,
  useFailDeliveryMutation,
  usePickupOrderMutation,
  useRiderDeliveryThresholdsQuery,
  useRiderOrderDetailsQuery,
  useRiderOrdersQuery,
  type RiderDeliveryFailureReason,
  type RiderOrder,
} from "@/src/hooks/use-rider-api";
import { getOrderStatusBadge, getPaymentMethodBadge } from "@/src/lib/rider-order-display";
import { useDeliveryCopy } from "@/src/lib/copy";
import { palette } from "@/src/theme/palette";
import {
  PersistentBottomSheet,
  type PersistentBottomSheetHandle,
} from "./persistent-bottom-sheet";

const SCREEN_HEIGHT = Dimensions.get("window").height;

// The active-language sheet strings (en | bn union) — used to type the module-level helpers.
type SheetCopy = ReturnType<typeof useDeliveryCopy>["copy"]["sheet"];

function formatTk(value?: number | null) {
  return `Tk ${Math.round(Number(value || 0)).toLocaleString()}`;
}

function formatKm(km?: number | null) {
  if (typeof km !== "number" || Number.isNaN(km)) return "--";
  if (km < 1) return `${Math.max(1, Math.round(km * 1000))} m`;
  return `${km.toFixed(1)} km`;
}

function formatMin(min?: number | null) {
  if (typeof min !== "number" || Number.isNaN(min)) return "--";
  const m = Math.max(1, Math.round(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function formatClock(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

function isCodPayment(method?: string | null) {
  const m = `${method ?? ""}`.toLowerCase();
  return m.includes("cash") || m.includes("cod");
}

function minutesAgo(iso: string | null | undefined, t: SheetCopy) {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  const mins = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (mins < 1) return t.justNow;
  if (mins < 60) return t.minAgo(mins);
  const hours = Math.floor(mins / 60);
  return t.hoursAgo(hours, mins % 60);
}

function destinationCoord(order: RiderOrder, pickedUp: boolean) {
  const c = pickedUp ? order.customer?.deliveryAddress : order.restaurant;
  if (c && typeof c.latitude === "number" && typeof c.longitude === "number") {
    return { latitude: c.latitude, longitude: c.longitude };
  }
  return null;
}

function openNavigation(order: RiderOrder) {
  const pickedUp = order.status === "PickedUp";
  const dest = destinationCoord(order, pickedUp);
  const address = pickedUp
    ? order.customer?.deliveryAddress?.addressLine
    : order.restaurant?.address;
  const query = dest ? `${dest.latitude},${dest.longitude}` : address;
  if (!query) return;
  void Linking.openURL(
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}&travelmode=driving`,
  );
}

function call(phone?: string) {
  if (phone) void Linking.openURL(`tel:${phone}`);
}

function minsSince(iso?: string | null) {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  return (Date.now() - time) / 60000;
}

type Lateness = { kind: "pickup" | "delivery"; minutes: number; critical: boolean } | null;

// Detects a genuinely-late order (past the admin threshold) — the red "act now" signal.
// Minor delays inside the grace window are NOT flagged, to keep the warning meaningful.
function getLateness(
  order: RiderOrder,
  pickupGrace: number,
  deliveryLate: number,
  deliveryCritical: number,
): Lateness {
  if (order.status === "ReadyForPickup") {
    const m = minsSince(order.timestamps?.ReadyForPickup);
    if (m != null && m > pickupGrace) {
      return { kind: "pickup", minutes: Math.max(1, Math.round(m - pickupGrace)), critical: false };
    }
  }
  if (order.status === "PickedUp") {
    const m = minsSince(order.timestamps?.PickedUp);
    if (m != null && m > deliveryLate) {
      return {
        kind: "delivery",
        minutes: Math.max(1, Math.round(m - deliveryLate)),
        critical: m > deliveryCritical,
      };
    }
  }
  return null;
}

function LateChip({ lateness }: { lateness: NonNullable<Lateness> }) {
  const { copy } = useDeliveryCopy();
  const t = copy.sheet;
  return (
    <View style={styles.lateChip}>
      <Ionicons name="alert-circle" size={12} color="#FFFFFF" />
      <Text style={styles.lateChipText}>
        {lateness.critical
          ? t.veryLateChip(lateness.minutes)
          : lateness.kind === "pickup"
            ? t.pickupLateChip(lateness.minutes)
            : t.deliveryLateChip(lateness.minutes)}
      </Text>
    </View>
  );
}

// A pin's order that isn't in the rider's task lists yet (e.g. still cooking, not assigned).
// Built from the live-map so the rider still gets useful info when they tap it.
export type SheetContextOrder = {
  id: string;
  orderNumber: string;
  status: string;
  amount: number;
  prepRemainingSeconds: number | null;
  prepLabel: string;
  restaurantName: string;
  restaurantAddress: string;
  restaurantLat: number | null;
  restaurantLng: number | null;
  customerName: string;
};

function prepText(remainingSeconds: number | null, label: string, t: SheetCopy) {
  if (typeof remainingSeconds !== "number") return label || t.preparing;
  if (remainingSeconds <= 0) return t.readyAnyMoment;
  const mins = Math.ceil(remainingSeconds / 60);
  return t.readyInMin(mins);
}

function openContextNavigation(context: SheetContextOrder) {
  const query =
    typeof context.restaurantLat === "number" && typeof context.restaurantLng === "number"
      ? `${context.restaurantLat},${context.restaurantLng}`
      : context.restaurantAddress;
  if (!query) return;
  void Linking.openURL(
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}&travelmode=driving`,
  );
}

// The rider's whole work surface, docked over the map. Two modes in one sheet:
//   • list   — Offers (accept) + My Tasks (with amount, "assigned X ago", LIVE badge,
//              Set-live), tap a card to open its detail.
//   • detail — the selected order's full info + Call / Navigate / confirm-based
//              Accept·Pickup·Delivered — so no separate order-details screen is needed.
export function HomeOrdersSheet({
  selectedOrderId,
  expandSignal = 0,
  isOnline = true,
  onSelectOrder,
  onFocusOrderOnMap,
  contextOrders = [],
}: {
  selectedOrderId: string;
  expandSignal?: number;
  isOnline?: boolean;
  onSelectOrder: (id: string) => void;
  onFocusOrderOnMap?: (coord: { latitude: number; longitude: number }) => void;
  contextOrders?: SheetContextOrder[];
}) {
  const activeQuery = useRiderOrdersQuery("active");
  const availableQuery = useRiderOrdersQuery("available");
  const thresholdsQuery = useRiderDeliveryThresholdsQuery();
  const pickupGrace = thresholdsQuery.data?.pickupLateGraceMinutes ?? 10;
  const deliveryLate = thresholdsQuery.data?.deliveryLateAfterPickupMinutes ?? 25;
  const deliveryCritical = thresholdsQuery.data?.deliveryCriticalAfterPickupMinutes ?? 30;
  const acceptMutation = useAcceptOrderMutation();
  const pickupMutation = usePickupOrderMutation();
  const deliverMutation = useDeliverOrderMutation();
  const trackingMutation = useActivateTrackingMutation();
  const failMutation = useFailDeliveryMutation();
  const [busyId, setBusyId] = useState("");
  const [failFor, setFailFor] = useState<RiderOrder | null>(null);
  const [failReason, setFailReason] = useState<RiderDeliveryFailureReason | null>(null);
  const [failNote, setFailNote] = useState("");
  const sheetRef = useRef<PersistentBottomSheetHandle>(null);
  const { copy } = useDeliveryCopy();
  const t = copy.sheet;
  const failReasons: { value: RiderDeliveryFailureReason; label: string }[] = [
    { value: "customer_no_response", label: t.reasonNoResponse },
    { value: "wrong_item", label: t.reasonWrongItem },
    { value: "others", label: t.reasonOther },
  ];

  // Selecting an order (tapping a map pin or a card) auto-expands the sheet to its detail.
  // `expandSignal` is included so re-tapping the same pin after a manual collapse still
  // expands (the id alone wouldn't change, so the effect wouldn't re-run otherwise).
  useEffect(() => {
    if (selectedOrderId) sheetRef.current?.expand();
  }, [selectedOrderId, expandSignal]);

  const tasks = activeQuery.data ?? [];
  const offers = (availableQuery.data ?? []).filter(
    (order) => order.assignmentState !== "assigned_to_other",
  );
  const isLoading = activeQuery.isLoading || availableQuery.isLoading;
  const selectedFromList =
    [...tasks, ...offers].find((order) => order.id === selectedOrderId) ?? null;
  // A live-map "context" order (still cooking, not an actionable task) keeps its own prep
  // view; everything else opens the full detail.
  const contextMatch =
    !selectedFromList && selectedOrderId
      ? contextOrders.find((order) => order.id === selectedOrderId) ?? null
      : null;
  // Fetch full details (route/ETA/timeline/items) for any selected order that isn't a context
  // order — covers active/available tasks AND deep-linked orders (e.g. from a notification or
  // history), so the sheet can show any order without a separate screen.
  const detailsQuery = useRiderOrderDetailsQuery(
    selectedOrderId && !contextMatch ? selectedOrderId : undefined,
  );
  // The details query keeps previous data (keepPreviousData), so after the selection is
  // cleared its `.data` still holds the old order — only use it when it matches the CURRENT
  // selection, otherwise "back" (selectedOrderId = "") would never close the detail.
  const detailData =
    detailsQuery.data && detailsQuery.data.id === selectedOrderId ? detailsQuery.data : null;
  const selected = selectedFromList
    ? ({ ...selectedFromList, ...(detailData ?? {}) } as RiderOrder)
    : selectedOrderId && !contextMatch
      ? detailData
      : null;
  const context = contextMatch;
  const detailHeader = selected
    ? {
        orderNumber: selected.orderNumber,
        amount: selected.pricing?.total,
        status: selected.status,
        isLive: Boolean(selected.isFocusedLiveTrip),
      }
    : context
      ? { orderNumber: context.orderNumber, amount: context.amount, status: context.status, isLive: false }
      : null;

  function onError(error: unknown) {
    Alert.alert(t.somethingWrong, error instanceof Error ? error.message : t.tryAgain);
  }

  function accept(order: RiderOrder) {
    setBusyId(order.id);
    acceptMutation.mutate(order.id, { onSettled: () => setBusyId(""), onError });
  }

  function pickup(order: RiderOrder) {
    Alert.alert(
      t.confirmPickupTitle,
      t.confirmPickupBody(order.orderNumber, order.restaurant?.name || copy.common.restaurant),
      [
        { text: t.cancel, style: "cancel" },
        {
          text: t.yesPickedUp,
          onPress: () => {
            setBusyId(order.id);
            pickupMutation.mutate({ orderId: order.id }, { onSettled: () => setBusyId(""), onError });
          },
        },
      ],
    );
  }

  function deliver(order: RiderOrder) {
    Alert.alert(t.confirmDeliveryTitle, t.confirmDeliveryBody(order.orderNumber), [
      { text: t.cancel, style: "cancel" },
      {
        text: t.yesDelivered,
        onPress: () => {
          setBusyId(order.id);
          deliverMutation.mutate(order.id, {
            onSettled: () => setBusyId(""),
            onSuccess: () => onSelectOrder(""),
            onError,
          });
        },
      },
    ]);
  }

  function setLive(order: RiderOrder) {
    trackingMutation.mutate(order.id, { onError });
  }

  // "Show on map" (from a card or the detail): zoom the map to this order's marker (drop
  // point once picked up, otherwise the restaurant) and collapse the sheet so the pin shows.
  function showOrderOnMap(order: RiderOrder) {
    const coord = destinationCoord(order, order.status === "PickedUp");
    if (!coord) return;
    onFocusOrderOnMap?.(coord);
    sheetRef.current?.collapse();
  }

  function openFail(order: RiderOrder) {
    setFailReason(null);
    setFailNote("");
    setFailFor(order);
  }

  function submitFail() {
    if (!failFor || !failReason) return;
    failMutation.mutate(
      { orderId: failFor.id, reason: failReason, note: failNote.trim() || undefined },
      {
        onSuccess: () => {
          setFailFor(null);
          onSelectOrder("");
        },
        onError,
      },
    );
  }

  const collapsedHeight = 132 + Math.max(0, 8);
  const expandedHeight = Math.min(SCREEN_HEIGHT * 0.78, 640);

  const detailStatus = detailHeader ? getOrderStatusBadge(detailHeader.status) : null;
  const peek = detailHeader ? (
    <View style={styles.peek}>
      <Pressable style={styles.peekBack} onPress={() => onSelectOrder("")} hitSlop={8}>
        <Ionicons name="chevron-back" size={20} color={palette.foreground} />
      </Pressable>
      <View style={styles.peekTextBlock}>
        <View style={styles.peekIdRow}>
          <Text style={styles.peekTitle} numberOfLines={1}>
            {detailHeader.orderNumber}
          </Text>
          {detailStatus ? (
            <View
              style={[
                styles.statusChip,
                { backgroundColor: detailStatus.backgroundColor, borderColor: detailStatus.borderColor },
              ]}
            >
              <Text style={[styles.statusText, { color: detailStatus.color }]}>
                {detailStatus.label}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.peekMetaRow}>
          {detailHeader.isLive ? (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          ) : null}
          <Text style={styles.peekMeta} numberOfLines={1}>
            {formatTk(detailHeader.amount)} · {t.pullUpForDetails}
          </Text>
        </View>
      </View>
    </View>
  ) : (
    <View style={styles.peek}>
      {offers.length > 0 ? (
        <>
          <View style={[styles.peekIcon, { backgroundColor: palette.secondary }]}>
            <Ionicons name="notifications" size={18} color="#FFFFFF" />
          </View>
          <View style={styles.peekTextBlock}>
            <Text style={styles.peekTitle}>{t.newOffers(offers.length)}</Text>
            <Text style={styles.peekMeta}>{t.pullUpToAccept}</Text>
          </View>
        </>
      ) : tasks.length > 0 ? (
        <>
          <View style={[styles.peekIcon, { backgroundColor: palette.foreground }]}>
            <Ionicons name="bicycle" size={18} color="#FFFFFF" />
          </View>
          <View style={styles.peekTextBlock}>
            <Text style={styles.peekTitle}>{t.activeDeliveries(tasks.length)}</Text>
            <Text style={styles.peekMeta} numberOfLines={1}>
              {t.pullUpForDetails}
            </Text>
          </View>
        </>
      ) : isOnline ? (
        <>
          <View style={[styles.peekIcon, { backgroundColor: palette.success }]}>
            <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
          </View>
          <View style={styles.peekTextBlock}>
            <Text style={styles.peekTitle}>{t.youreOnline}</Text>
            <Text style={styles.peekMeta}>{t.waitingForOrders}</Text>
          </View>
        </>
      ) : (
        <>
          <View style={[styles.peekIcon, { backgroundColor: palette.mutedForeground }]}>
            <Ionicons name="moon" size={18} color="#FFFFFF" />
          </View>
          <View style={styles.peekTextBlock}>
            <Text style={styles.peekTitle}>{t.youreOffline}</Text>
            <Text style={styles.peekMeta} numberOfLines={1}>
              {t.goOnlineReceive}
            </Text>
          </View>
        </>
      )}
      {isLoading ? <ActivityIndicator size="small" color={palette.secondary} /> : null}
    </View>
  );

  return (
    <>
    <PersistentBottomSheet
      ref={sheetRef}
      collapsedHeight={collapsedHeight}
      expandedHeight={expandedHeight}
      peekDragHeight={92}
      peek={peek}
    >
      {selected ? (
        <OrderDetail
          order={selected}
          lateness={getLateness(selected, pickupGrace, deliveryLate, deliveryCritical)}
          busy={busyId === selected.id}
          onAccept={() => accept(selected)}
          onPickup={() => pickup(selected)}
          onDeliver={() => deliver(selected)}
          onSetLive={() => setLive(selected)}
          onCantDeliver={() => openFail(selected)}
          onShowOnMap={() => showOrderOnMap(selected)}
        />
      ) : context ? (
        <ContextDetail context={context} />
      ) : (
        <>
          {offers.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t.newOffersTitle}</Text>
              {offers.map((order) => (
                <OfferCard
                  key={order.id}
                  order={order}
                  accepting={busyId === order.id}
                  onOpen={() => onSelectOrder(order.id)}
                  onAccept={() => accept(order)}
                />
              ))}
            </View>
          ) : null}

          {tasks.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t.yourDeliveries}</Text>
              {tasks.map((order) => (
                <TaskCard
                  key={order.id}
                  order={order}
                  lateness={getLateness(order, pickupGrace, deliveryLate, deliveryCritical)}
                  busy={busyId === order.id}
                  onOpen={() => onSelectOrder(order.id)}
                  onAdvance={() =>
                    order.status === "PickedUp" ? deliver(order) : pickup(order)
                  }
                  onShowOnMap={() => showOrderOnMap(order)}
                  onSetLive={() => setLive(order)}
                  settingLive={trackingMutation.isPending}
                />
              ))}
            </View>
          ) : null}

          {!isLoading && offers.length === 0 && tasks.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons
                name={isOnline ? "cafe-outline" : "moon-outline"}
                size={26}
                color={palette.mutedForeground}
              />
              <Text style={styles.emptyTitle}>
                {isOnline ? t.noOrdersTitle : t.youreOffline}
              </Text>
              <Text style={styles.emptyText}>
                {isOnline ? t.noOrdersText : t.goOnlineStart}
              </Text>
            </View>
          ) : null}
        </>
      )}
      </PersistentBottomSheet>

      <Modal
        visible={failFor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setFailFor(null)}
      >
        <Pressable style={styles.failBackdrop} onPress={() => setFailFor(null)} />
        <View style={styles.failSheet}>
          <Text style={styles.failTitle}>{t.cantDeliver}</Text>
          <Text style={styles.failSubtitle}>{t.cantDeliverSubtitle}</Text>

          {failReasons.map((option) => {
            const chosen = failReason === option.value;
            return (
              <Pressable
                key={option.value}
                style={[styles.failOption, chosen && styles.failOptionSelected]}
                onPress={() => setFailReason(option.value)}
              >
                <Ionicons
                  name={chosen ? "radio-button-on" : "radio-button-off"}
                  size={18}
                  color={chosen ? palette.danger : palette.mutedForeground}
                />
                <Text style={styles.failOptionText}>{option.label}</Text>
              </Pressable>
            );
          })}

          <TextInput
            style={styles.failNoteInput}
            placeholder={t.addNote}
            placeholderTextColor={palette.mutedForeground}
            value={failNote}
            onChangeText={setFailNote}
            multiline
            maxLength={500}
          />

          <View style={styles.failActions}>
            <Pressable style={styles.failCancelButton} onPress={() => setFailFor(null)}>
              <Text style={styles.failCancelText}>{t.keepDelivering}</Text>
            </Pressable>
            <Pressable
              style={[
                styles.failConfirmButton,
                (!failReason || failMutation.isPending) && styles.buttonDisabled,
              ]}
              disabled={!failReason || failMutation.isPending}
              onPress={submitFail}
            >
              {failMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.failConfirmText}>{t.submit}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function OfferCard({
  order,
  accepting,
  onOpen,
  onAccept,
}: {
  order: RiderOrder;
  accepting: boolean;
  onOpen: () => void;
  onAccept: () => void;
}) {
  const { copy } = useDeliveryCopy();
  const payment = getPaymentMethodBadge(order.paymentMethod);
  return (
    <View style={[styles.card, styles.offerCard, order.isExternal ? styles.cardExternal : null]}>
      <Pressable onPress={onOpen}>
        <View style={styles.cardTop}>
          <Text style={styles.orderNumber} numberOfLines={1}>
            {order.orderNumber}
          </Text>
          <View style={styles.badgeRow}>
            {order.isExternal ? (
              <View style={styles.externalChip}>
                <Ionicons name="storefront" size={11} color="#6D28D9" />
                <Text style={styles.externalChipText}>{copy.sheet.external}</Text>
              </View>
            ) : null}
            {order.isUrgent ? (
              <View style={styles.urgentChip}>
                <Text style={styles.urgentChipText}>⚡ {copy.common.urgent}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Text style={styles.restaurant} numberOfLines={1}>
          {order.restaurant?.name || copy.common.restaurant}
        </Text>
        <Text style={styles.address} numberOfLines={1}>
          {order.customer?.deliveryAddress?.addressLine || order.customer?.name || "—"}
        </Text>
      </Pressable>
      <View style={styles.cardBottom}>
        <View style={styles.moneyRow}>
          <Ionicons name={payment.icon} size={14} color={payment.color} />
          <Text style={[styles.amount, { color: payment.color }]}>
            {formatTk(order.pricing?.total)} · {payment.label}
          </Text>
        </View>
        <Pressable
          style={[styles.acceptButton, accepting && styles.buttonDisabled]}
          disabled={accepting}
          onPress={onAccept}
        >
          {accepting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.acceptText}>{copy.sheet.accept}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function TaskCard({
  order,
  lateness,
  busy,
  onOpen,
  onAdvance,
  onShowOnMap,
  onSetLive,
  settingLive,
}: {
  order: RiderOrder;
  lateness: Lateness;
  busy: boolean;
  onOpen: () => void;
  onAdvance: () => void;
  onShowOnMap: () => void;
  onSetLive: () => void;
  settingLive: boolean;
}) {
  const { copy } = useDeliveryCopy();
  const t = copy.sheet;
  const status = getOrderStatusBadge(order.status);
  const payment = getPaymentMethodBadge(order.paymentMethod);
  const isPicked = order.status === "PickedUp";
  // The card's own next-step action (replaces the redundant "Open" — tapping the card body
  // already opens the detail): Pickup for a ready order, Deliver once picked up.
  const isActionable = order.status === "ReadyForPickup" || order.status === "PickedUp";
  // A compact map-jump icon on the card, mirroring the detail's "Show on map".
  const hasMapTarget = Boolean(destinationCoord(order, isPicked));
  const assigned = minutesAgo(order.assignedAt, t);
  const showSetLive = isPicked && !order.isFocusedLiveTrip;
  return (
    <View
      style={[
        styles.card,
        order.isExternal ? styles.cardExternal : null,
        lateness ? styles.cardLate : null,
      ]}
    >
      <Pressable onPress={onOpen}>
        {/* Top row: order number · round map-jump icon (badge-sized) · status badge. */}
        <View style={styles.cardTop}>
          <Text style={[styles.orderNumber, styles.flexShrink]} numberOfLines={1}>
            {order.orderNumber}
          </Text>
          <View style={styles.cardTopRight}>
            {hasMapTarget ? (
              <Pressable
                style={styles.cardMapIcon}
                onPress={onShowOnMap}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t.showOnMap}
              >
                <Ionicons name="map-outline" size={15} color={palette.secondary} />
              </Pressable>
            ) : null}
            <View
              style={[
                styles.statusChip,
                { backgroundColor: status.backgroundColor, borderColor: status.borderColor },
              ]}
            >
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>
        </View>
        {order.isExternal || order.isFocusedLiveTrip || lateness ? (
          <View style={styles.cardChipsRow}>
            {order.isExternal ? (
              <View style={styles.externalChip}>
                <Ionicons name="storefront" size={11} color="#6D28D9" />
                <Text style={styles.externalChipText}>{copy.sheet.external}</Text>
              </View>
            ) : null}
            {order.isFocusedLiveTrip ? (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            ) : null}
            {lateness ? <LateChip lateness={lateness} /> : null}
          </View>
        ) : null}
        {/* Name row: restaurant/customer name · Set-live parked at the far right. */}
        <View style={styles.cardNameRow}>
          <Text style={[styles.restaurant, styles.flexShrink]} numberOfLines={1}>
            {isPicked ? "→ " : ""}
            {isPicked
              ? order.customer?.name || copy.common.customer
              : order.restaurant?.name || copy.common.restaurant}
          </Text>
          {showSetLive ? (
            <Pressable style={styles.liveButton} disabled={settingLive} onPress={onSetLive}>
              {settingLive ? (
                <ActivityIndicator size="small" color={palette.secondary} />
              ) : (
                <>
                  <Ionicons name="radio-outline" size={14} color={palette.secondary} />
                  <Text style={styles.liveButtonText}>{t.setLive}</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.address} numberOfLines={1}>
          {isPicked
            ? order.customer?.deliveryAddress?.addressLine || t.collectFromCustomer
            : order.restaurant?.address || t.navigateToRestaurant}
        </Text>
      </Pressable>
      {/* Bottom row: amount + payment badge · the single next-step action button. */}
      <View style={styles.cardBottom}>
        <View style={styles.taskMoneyBlock}>
          <View style={styles.taskAmountRow}>
            <Text style={styles.amount}>{formatTk(order.pricing?.total)}</Text>
            <View
              style={[
                styles.cardPayBadge,
                { backgroundColor: payment.backgroundColor, borderColor: payment.borderColor },
              ]}
            >
              <Ionicons name={payment.icon} size={11} color={payment.color} />
              <Text style={[styles.cardPayBadgeText, { color: payment.color }]}>
                {payment.label}
              </Text>
            </View>
          </View>
          {assigned ? <Text style={styles.assignedText}>{t.assignedAgo(assigned)}</Text> : null}
        </View>
        {isActionable ? (
          <Pressable
            style={[styles.cardActionButton, busy && styles.buttonDisabled]}
            disabled={busy}
            onPress={onAdvance}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name={isPicked ? "flag" : "cube"} size={14} color="#FFFFFF" />
                <Text style={styles.cardActionText}>
                  {isPicked ? t.deliverShort : t.pickupShort}
                </Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function OrderDetail({
  order,
  lateness,
  busy,
  onAccept,
  onPickup,
  onDeliver,
  onSetLive,
  onCantDeliver,
  onShowOnMap,
}: {
  order: RiderOrder;
  lateness: Lateness;
  busy: boolean;
  onAccept: () => void;
  onPickup: () => void;
  onDeliver: () => void;
  onSetLive: () => void;
  onCantDeliver: () => void;
  onShowOnMap: () => void;
}) {
  const { copy } = useDeliveryCopy();
  const t = copy.sheet;
  const payment = getPaymentMethodBadge(order.paymentMethod);
  const isOffer = order.assignmentState === "unassigned";
  const isPicked = order.status === "PickedUp";
  // Only offer the "Show on map" jump when this order actually has a marker to zoom to.
  const hasMapTarget = Boolean(destinationCoord(order, order.status === "PickedUp"));
  // Only ReadyForPickup / PickedUp orders have a next action; a deep-linked past order
  // (Delivered / Cancelled) or a still-cooking one shows read-only.
  const isActionable = order.status === "ReadyForPickup" || order.status === "PickedUp";
  const isCod = isCodPayment(order.paymentMethod);
  const distanceKm = order.routeToNext?.distanceKm ?? order.riderTracking?.remainingDistanceKm ?? null;
  const durationMin =
    order.routeToNext?.durationMinutes ?? order.riderTracking?.remainingDurationMinutes ?? null;

  return (
    <View style={styles.detail}>
      {lateness ? (
        <View style={styles.lateBanner}>
          <Ionicons name="alert-circle" size={18} color="#FFFFFF" />
          <Text style={styles.lateBannerText}>
            {lateness.critical
              ? t.veryLate(lateness.minutes)
              : lateness.kind === "pickup"
                ? t.pickupLate(lateness.minutes)
                : t.deliveryLate(lateness.minutes)}
          </Text>
        </View>
      ) : null}

      {order.isExternal ? (
        <View style={styles.externalBanner}>
          <View style={styles.externalBannerIcon}>
            <Ionicons name="storefront" size={16} color="#FFFFFF" />
          </View>
          <View style={styles.externalBannerBody}>
            <Text style={styles.externalBannerTitle}>{t.externalOrder}</Text>
            <Text style={styles.externalBannerText}>{t.externalNote}</Text>
          </View>
        </View>
      ) : null}

      {/* Distance · ETA · amount at a glance, with the payment method beside it. */}
      <View style={styles.metricsRow}>
        <View style={styles.metricBlock}>
          <Text style={styles.metricLabel}>{t.distance}</Text>
          <Text style={styles.metricValue}>{formatKm(distanceKm)}</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricBlock}>
          <Text style={styles.metricLabel}>{t.eta}</Text>
          <Text style={styles.metricValue}>{formatMin(durationMin)}</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricBlock}>
          <Text style={styles.metricLabel}>{isPicked && isCod ? t.collect : t.amount}</Text>
          <Text style={[styles.metricValue, isCod && styles.metricValueCod]}>
            {formatTk(order.pricing?.total)}
          </Text>
        </View>
      </View>
      <View style={styles.payChipRow}>
        <View
          style={[
            styles.payTag,
            { backgroundColor: payment.backgroundColor, borderColor: payment.borderColor },
          ]}
        >
          <Ionicons name={payment.icon} size={13} color={payment.color} />
          <Text style={[styles.payTagText, { color: payment.color }]}>{payment.label}</Text>
        </View>
        {hasMapTarget ? (
          <Pressable style={styles.showMapButton} onPress={onShowOnMap}>
            <Ionicons name="map-outline" size={14} color={palette.secondary} />
            <Text style={styles.showMapText}>{t.showOnMap}</Text>
          </Pressable>
        ) : null}
      </View>

      <DetailRow
        icon="storefront"
        title={order.restaurant?.name || "Restaurant"}
        subtitle={order.restaurant?.address || "—"}
        onCall={order.restaurant?.phone ? () => call(order.restaurant?.phone) : undefined}
      />
      <DetailRow
        icon="location"
        title={order.customer?.name || "Customer"}
        subtitle={
          order.customer?.deliveryAddress?.addressLine ||
          order.customer?.deliveryAddress?.label ||
          "—"
        }
        onCall={order.customer?.phone ? () => call(order.customer?.phone) : undefined}
      />

      <OrderTimeline history={order.history} />
      <OrderItems items={order.items} />

      {isActionable ? (
        <>
          <View style={styles.detailActionsRow}>
            <Pressable style={styles.detailSecondary} onPress={() => openNavigation(order)}>
              <Ionicons name="navigate" size={17} color={palette.foreground} />
              <Text style={styles.detailSecondaryText}>{t.navigate}</Text>
            </Pressable>
            {isPicked && !order.isFocusedLiveTrip ? (
              <Pressable style={styles.detailSecondary} onPress={onSetLive}>
                <Ionicons name="radio-outline" size={17} color={palette.foreground} />
                <Text style={styles.detailSecondaryText}>{t.setLive}</Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable
            style={[styles.primaryAction, busy && styles.buttonDisabled]}
            disabled={busy}
            onPress={isOffer ? onAccept : isPicked ? onDeliver : onPickup}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons
                  name={isOffer ? "checkmark-circle" : isPicked ? "flag" : "cube"}
                  size={19}
                  color="#FFFFFF"
                />
                <Text style={styles.primaryActionText}>
                  {isOffer ? t.acceptDelivery : isPicked ? t.markDelivered : t.markPickedUp}
                </Text>
              </>
            )}
          </Pressable>

          {isPicked ? (
            <Pressable style={styles.cantDeliverButton} onPress={onCantDeliver}>
              <Ionicons name="close-circle-outline" size={16} color={palette.danger} />
              <Text style={styles.cantDeliverText}>{t.cantDeliver}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

// Compact horizontal status timeline with the time each step happened. De-duplicates
// consecutive identical statuses (the backend history can repeat a status).
function OrderTimeline({ history }: { history?: RiderOrder["history"] }) {
  const { copy } = useDeliveryCopy();
  const rows = (history ?? []).filter(
    (entry, index, arr) => entry.status && arr[index - 1]?.status !== entry.status,
  );
  if (rows.length === 0) return null;
  return (
    <View style={styles.blockCard}>
      <Text style={styles.blockTitle}>{copy.sheet.timeline}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.timelineRow}
      >
        {rows.map((entry, index) => {
          const badge = getOrderStatusBadge(entry.status);
          return (
            <View key={`${entry.status}-${index}`} style={styles.timelinePillWrap}>
              {index > 0 ? (
                <Ionicons
                  name="chevron-forward"
                  size={12}
                  color={palette.mutedForeground}
                  style={styles.timelineArrow}
                />
              ) : null}
              <View style={styles.timelinePill}>
                <View style={[styles.timelineDot, { backgroundColor: badge.color }]} />
                <View>
                  <Text style={styles.timelinePillLabel} numberOfLines={1}>
                    {badge.label}
                  </Text>
                  <Text style={styles.timelinePillTime}>{formatClock(entry.createdAt)}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function OrderItems({ items }: { items?: RiderOrder["items"] }) {
  const { copy } = useDeliveryCopy();
  const rows = items ?? [];
  if (rows.length === 0) return null;
  return (
    <View style={styles.blockCard}>
      <View style={styles.blockTitleRow}>
        <Text style={styles.blockTitle}>{copy.sheet.items}</Text>
        <View style={styles.blockCount}>
          <Text style={styles.blockCountText}>{rows.length}</Text>
        </View>
      </View>
      <View style={styles.itemsList}>
        {rows.map((item, index) => (
          <View key={`${item.name}-${index}`} style={styles.itemRow}>
            <Text style={styles.itemQty}>{item.quantity ?? 1}×</Text>
            <Text style={styles.itemName} numberOfLines={1}>
              {item.name}
            </Text>
            {typeof item.totalPrice === "number" ? (
              <Text style={styles.itemPrice}>Tk {Math.round(item.totalPrice)}</Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function ContextDetail({ context }: { context: SheetContextOrder }) {
  const { copy } = useDeliveryCopy();
  const t = copy.sheet;
  const status = getOrderStatusBadge(context.status);
  const isCooking = context.status === "Preparing" || context.status === "Accepted";
  return (
    <View style={styles.detail}>
      <View style={styles.detailHeader}>
        <Text style={styles.detailOrderNumber}>{context.orderNumber}</Text>
        <View
          style={[
            styles.statusChip,
            { backgroundColor: status.backgroundColor, borderColor: status.borderColor },
          ]}
        >
          <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>

      <View style={styles.amountCard}>
        <View>
          <Text style={styles.amountLabel}>{t.orderAmount}</Text>
          <Text style={styles.amountBig}>{formatTk(context.amount)}</Text>
        </View>
        {isCooking ? (
          <View style={styles.prepTag}>
            <Ionicons name="time" size={14} color={palette.warning} />
            <Text style={styles.prepTagText}>
              {prepText(context.prepRemainingSeconds, context.prepLabel, t)}
            </Text>
          </View>
        ) : null}
      </View>

      <DetailRow
        icon="storefront"
        title={context.restaurantName || copy.common.restaurant}
        subtitle={context.restaurantAddress || "—"}
      />
      {context.customerName ? (
        <DetailRow icon="location" title={context.customerName} subtitle={copy.common.customer} />
      ) : null}

      <Pressable style={styles.detailSecondary} onPress={() => openContextNavigation(context)}>
        <Ionicons name="navigate" size={17} color={palette.foreground} />
        <Text style={styles.detailSecondaryText}>{t.navigateToRestaurant}</Text>
      </Pressable>

      <View style={styles.noteCard}>
        <Ionicons name="information-circle" size={16} color={palette.info} />
        <Text style={styles.noteText}>
          {isCooking ? t.stillPreparing : t.notAssignedYet}
        </Text>
      </View>
    </View>
  );
}

function DetailRow({
  icon,
  title,
  subtitle,
  onCall,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onCall?: () => void;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailRowIcon}>
        <Ionicons name={icon} size={17} color={palette.foreground} />
      </View>
      <View style={styles.detailRowText}>
        <Text style={styles.detailRowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.detailRowSubtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      {onCall ? (
        <Pressable style={styles.callButton} onPress={onCall} hitSlop={8}>
          <Ionicons name="call" size={16} color={palette.success} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  peek: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
  },
  peekBack: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
  },
  peekIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  peekTextBlock: { flex: 1, minWidth: 0 },
  peekTitle: { fontSize: 15, fontWeight: "900", color: palette.foreground, flexShrink: 1 },
  peekMeta: { marginTop: 2, fontSize: 12, fontWeight: "700", color: palette.mutedForeground },
  section: { paddingHorizontal: 12, paddingTop: 2, paddingBottom: 8, gap: 8 },
  sectionTitle: {
    paddingHorizontal: 2,
    fontSize: 13,
    fontWeight: "900",
    color: palette.mutedForeground,
    textTransform: "uppercase",
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 13,
    paddingVertical: 11,
    gap: 3,
  },
  offerCard: { borderColor: "#FFCEE0", backgroundColor: "#FFF7FA" },
  cardLate: { borderColor: "#F6B8B8", backgroundColor: "#FEF3F3" },
  lateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#DC2626",
  },
  lateChipText: { fontSize: 10.5, fontWeight: "900", color: "#FFFFFF", letterSpacing: 0.3 },
  lateBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: "#DC2626",
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  lateBannerText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "900", color: "#FFFFFF" },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTopRight: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  cardMapIcon: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FFCEE0",
    backgroundColor: "#FFF1F6",
    alignItems: "center",
    justifyContent: "center",
  },
  cardNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  flexShrink: { flexShrink: 1, minWidth: 0 },
  orderNumber: { fontSize: 14, fontWeight: "900", color: palette.foreground, flexShrink: 1 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  cardChipsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" },
  peekIdRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  peekMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  externalChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    backgroundColor: "#EDE9FE",
    borderColor: "#C4B5FD",
  },
  externalChipText: { fontSize: 11, fontWeight: "900", color: "#6D28D9", letterSpacing: 0.3 },
  // A violet accent so off-platform (external) orders are unmistakable in the list.
  cardExternal: { borderColor: "#C4B5FD", backgroundColor: "#FAF8FF" },
  externalBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D8B4FE",
    backgroundColor: "#F5F0FF",
    padding: 12,
  },
  externalBannerIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#7C3AED",
  },
  externalBannerBody: { flex: 1, minWidth: 0 },
  externalBannerTitle: {
    fontSize: 12.5,
    fontWeight: "900",
    letterSpacing: 0.4,
    color: "#6D28D9",
  },
  externalBannerText: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: "#7C3AED",
  },
  urgentChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    backgroundColor: palette.warningSoft,
    borderColor: palette.warning,
  },
  urgentChipText: { fontSize: 11, fontWeight: "900", color: palette.warning },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#DC2626",
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#FFFFFF" },
  liveText: { fontSize: 10.5, fontWeight: "900", color: "#FFFFFF", letterSpacing: 0.5 },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  statusText: { fontSize: 12, fontWeight: "800" },
  restaurant: { fontSize: 15, fontWeight: "800", color: palette.foreground },
  address: { fontSize: 12, fontWeight: "600", color: palette.mutedForeground },
  cardBottom: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  moneyRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  amount: { fontSize: 15, fontWeight: "900", color: palette.foreground },
  taskMoneyBlock: { flexShrink: 1, minWidth: 0 },
  taskAmountRow: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" },
  cardPayBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  cardPayBadgeText: { fontSize: 10.5, fontWeight: "900" },
  assignedText: { marginTop: 1, fontSize: 11, fontWeight: "700", color: palette.mutedForeground },
  cardActionButton: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minWidth: 96,
    borderRadius: 13,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: palette.secondary,
  },
  cardActionText: { fontSize: 13, fontWeight: "900", color: "#FFFFFF" },
  liveButton: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FFCEE0",
    backgroundColor: "#FFF1F6",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  liveButtonText: { fontSize: 12, fontWeight: "900", color: palette.secondary },
  acceptButton: {
    minWidth: 92,
    borderRadius: 13,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: palette.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptText: { fontSize: 14, fontWeight: "900", color: "#FFFFFF" },
  buttonDisabled: { opacity: 0.6 },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  emptyTitle: { fontSize: 16, fontWeight: "900", color: palette.foreground },
  emptyText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    color: palette.mutedForeground,
    textAlign: "center",
  },
  // ── detail mode ──
  detail: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 8, gap: 12 },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  detailOrderNumber: { fontSize: 16, fontWeight: "900", color: palette.foreground, flexShrink: 1 },
  amountCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    padding: 14,
  },
  amountLabel: { fontSize: 12, fontWeight: "800", color: palette.mutedForeground },
  amountBig: { marginTop: 2, fontSize: 24, fontWeight: "900", color: palette.foreground },
  payTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  payTagText: { fontSize: 13, fontWeight: "900" },
  // ── compact detail: metrics / timeline / items ──
  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    paddingVertical: 12,
  },
  metricBlock: { flex: 1, alignItems: "center", gap: 3 },
  metricLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
    color: palette.mutedForeground,
  },
  metricValue: { fontSize: 16, fontWeight: "900", color: palette.foreground },
  metricValueCod: { color: palette.warning },
  metricDivider: { width: 1, height: 30, backgroundColor: palette.border },
  payChipRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: -2,
  },
  showMapButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FFCEE0",
    backgroundColor: "#FFF1F6",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  showMapText: { fontSize: 12.5, fontWeight: "900", color: palette.secondary },
  blockCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 12,
    gap: 10,
  },
  blockTitle: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.3,
    color: palette.mutedForeground,
    textTransform: "uppercase",
  },
  blockTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  blockCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  blockCountText: { fontSize: 11, fontWeight: "900", color: palette.foreground },
  timelineRow: { flexDirection: "row", alignItems: "center", paddingRight: 4 },
  timelinePillWrap: { flexDirection: "row", alignItems: "center" },
  timelineArrow: { marginHorizontal: 4 },
  timelinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  timelineDot: { width: 9, height: 9, borderRadius: 5 },
  timelinePillLabel: { fontSize: 12, fontWeight: "800", color: palette.foreground },
  timelinePillTime: { fontSize: 10.5, fontWeight: "700", color: palette.mutedForeground },
  itemsList: { gap: 8 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  itemQty: {
    fontSize: 12,
    fontWeight: "900",
    color: palette.secondary,
    minWidth: 26,
  },
  itemName: { flex: 1, fontSize: 13, fontWeight: "700", color: palette.foreground },
  itemPrice: { fontSize: 13, fontWeight: "800", color: palette.foreground },
  cantDeliverButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F6C2C2",
    backgroundColor: "#FEF3F3",
    paddingVertical: 12,
  },
  cantDeliverText: { fontSize: 13, fontWeight: "800", color: palette.danger },
  // ── can't-deliver modal ──
  failBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(17,13,16,0.4)" },
  failSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: palette.background,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 10,
  },
  failTitle: { fontSize: 18, fontWeight: "900", color: palette.foreground },
  failSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.mutedForeground,
    marginBottom: 4,
  },
  failOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  failOptionSelected: { borderColor: palette.danger, backgroundColor: "#FFF1F2" },
  failOptionText: { fontSize: 14, fontWeight: "700", color: palette.foreground },
  failNoteInput: {
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 14,
    color: palette.foreground,
    textAlignVertical: "top",
  },
  failActions: { flexDirection: "row", gap: 10, marginTop: 6 },
  failCancelButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  failCancelText: { fontSize: 14, fontWeight: "800", color: palette.foreground },
  failConfirmButton: {
    flex: 1.4,
    minHeight: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.danger,
  },
  failConfirmText: { fontSize: 14, fontWeight: "800", color: "#fff" },
  prepTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#F2D5A8",
    backgroundColor: palette.warningSoft,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  prepTagText: { fontSize: 13, fontWeight: "900", color: palette.warning },
  noteCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 14,
    backgroundColor: palette.infoSoft,
    padding: 12,
  },
  noteText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: "700", color: palette.info },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 12,
  },
  detailRowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
  },
  detailRowText: { flex: 1, minWidth: 0 },
  detailRowTitle: { fontSize: 14, fontWeight: "800", color: palette.foreground },
  detailRowSubtitle: { marginTop: 2, fontSize: 12, fontWeight: "600", color: palette.mutedForeground },
  callButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.successSoft,
  },
  detailActionsRow: { flexDirection: "row", gap: 10 },
  detailSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingVertical: 12,
  },
  detailSecondaryText: { fontSize: 14, fontWeight: "800", color: palette.foreground },
  primaryAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 15,
    backgroundColor: palette.secondary,
    paddingVertical: 15,
  },
  primaryActionText: { fontSize: 15, fontWeight: "900", color: "#FFFFFF" },
  fullScreenLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
  },
  fullScreenLinkText: { fontSize: 13, fontWeight: "800", color: palette.mutedForeground },
});
