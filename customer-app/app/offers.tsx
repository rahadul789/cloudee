import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyStateCard } from "@/src/components/empty-state-card";
import { BelaPullToRefresh } from "@/src/components/bela-pull-to-refresh";
import { ShimmerBlock } from "@/src/components/loading-skeleton";
import { Screen } from "@/src/components/screen";
import {
  type CustomerCustomOfferSummary,
  type CustomerNotification,
  useCustomerCustomOfferRequestMutation,
  useCustomerCustomOfferSummaryQuery,
  useCustomerNotificationsInfiniteQuery,
} from "@/src/hooks/use-customer-api";
import { dedupeById } from "@/src/lib/dedupe";
import {
  formatOfferExpiry,
  getOfferAmountLabel,
  getOfferCodeLabel,
  getOfferConditionLabel,
} from "@/src/lib/customer-offer-copy";
import { useAppBannerStore } from "@/src/store/app-banner-store";
import { palette } from "@/src/theme/palette";
import { AppHeader } from "@/src/components/ui";

function isOfferExpired(notification: CustomerNotification) {
  if (notification.voucherUsageStatus === "expired") return true;
  if (!notification.voucherExpiresAt) return false;
  const date = new Date(notification.voucherExpiresAt);
  return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now();
}

function isOfferUsed(notification: CustomerNotification) {
  return notification.voucherUsageStatus === "used";
}

function getOfferStatusLabel(offer: CustomerNotification) {
  if (isOfferExpired(offer)) return "Expired";
  if (isOfferUsed(offer)) return "Used";
  return "Available";
}

function clampRequestedCodeLength(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 12;
  return Math.max(4, Math.min(24, Math.floor(value)));
}

function formatRequestedOfferCode(value: string, maxLength: number) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, maxLength);
}

function getCustomOfferCopy(
  summary: CustomerCustomOfferSummary | undefined,
  activeOfferCount: number,
) {
  if (summary?.enabled === false) {
    return {
      title: "My offer",
      description: "Not available right now",
    };
  }

  if (summary?.status === "requested") {
    return {
      title: "Request sent",
      description: "We are preparing it",
    };
  }

  if (summary?.status === "eligible") {
    return {
      title: "Offer unlocked",
      description:
        activeOfferCount > 0
          ? "Request your next voucher"
          : "Request your voucher",
    };
  }

  if (activeOfferCount > 0 || summary?.status === "ready") {
    return {
      title: "My offer",
      description: `${activeOfferCount || 1} voucher ready`,
    };
  }

  const remaining = summary?.remainingOrderCount ?? 10;
  return {
    title: "My offer",
    description: `${remaining} ${remaining === 1 ? "order" : "orders"} left to unlock.`,
  };
}

// Remaining time for a pending request, computed once per render (no live timer /
// setInterval). Uses the admin-response window (expectedReadyAt) the backend sets.
function formatPendingReadyLabel(expectedReadyAt?: string | null) {
  if (!expectedReadyAt) return "We’ll notify you when it’s ready";
  const target = new Date(expectedReadyAt).getTime();
  if (Number.isNaN(target)) return "We’ll notify you when it’s ready";
  const diffMs = target - Date.now();
  if (diffMs <= 0) return "Ready very soon";
  const hours = Math.ceil(diffMs / (60 * 60 * 1000));
  if (hours <= 48) {
    return `Usually ready within ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const days = Math.ceil(hours / 24);
  return `Usually ready within ${days} day${days === 1 ? "" : "s"}`;
}

// Shown while a requested personal voucher is awaiting admin approval. The amount is
// deliberately hidden (the admin sets it later) — once fulfilled it arrives as a normal
// voucher in the list and this card disappears (status stops being "requested").
const PendingOfferCard = memo(function PendingOfferCard({
  requestedCode,
  expectedReadyAt,
}: {
  requestedCode?: string;
  expectedReadyAt?: string | null;
}) {
  const readyLabel = formatPendingReadyLabel(expectedReadyAt);

  return (
    <View style={styles.ticket}>
      <View style={[styles.ticketStub, styles.ticketStubPending]}>
        <Ionicons name="hourglass-outline" size={20} color={palette.warningText} />
        <Text style={[styles.ticketAmount, styles.ticketAmountPending]} numberOfLines={2}>
          On the way
        </Text>
      </View>
      <TicketPerforation />
      <View style={styles.ticketBody}>
        <View style={styles.ticketTopRow}>
          <Text style={styles.ticketCodeLabel}>{requestedCode ? "Requested code" : "Personal voucher"}</Text>
          <View style={[styles.statusChip, styles.statusChipPending]}>
            <Text style={[styles.statusChipText, styles.statusChipTextPending]}>Pending</Text>
          </View>
        </View>
        <Text style={styles.ticketCode} numberOfLines={1}>
          {requestedCode || "Amount set soon"}
        </Text>
        <Text style={styles.ticketMeta} numberOfLines={1}>
          {readyLabel}
        </Text>
      </View>
    </View>
  );
});

// The bite-shaped notches + dashed line between the stub and the body.
function TicketPerforation() {
  return (
    <View style={styles.perforation} pointerEvents="none">
      <View style={[styles.notch, styles.notchTop]} />
      <View style={styles.dashes}>
        {Array.from({ length: 7 }, (_, index) => (
          <View key={index} style={styles.dash} />
        ))}
      </View>
      <View style={[styles.notch, styles.notchBottom]} />
    </View>
  );
}

function OffersScreenSkeleton() {
  return (
    <View style={styles.skeletonList}>
      <ShimmerBlock style={styles.skeletonReward} />
      <ShimmerBlock style={styles.skeletonHeading} />
      {Array.from({ length: 4 }, (_, index) => (
        <ShimmerBlock key={index} style={styles.skeletonTicket} />
      ))}
    </View>
  );
}

const OfferCard = memo(function OfferCard({
  item,
  onPress,
}: {
  item: CustomerNotification;
  onPress: () => void;
}) {
  const disabled = item.isOfferDisabled || isOfferExpired(item) || isOfferUsed(item);
  const statusLabel = getOfferStatusLabel(item);

  return (
    <Pressable
      style={({ pressed }) => [styles.ticket, disabled ? styles.ticketDisabled : null, pressed ? styles.pressed : null]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${getOfferAmountLabel(item)} voucher, code ${getOfferCodeLabel(item)}, ${statusLabel}`}
    >
      <View style={[styles.ticketStub, disabled ? styles.ticketStubDisabled : null]}>
        <Ionicons
          name={disabled ? "lock-closed" : "pricetag"}
          size={18}
          color={disabled ? palette.mutedForeground : palette.onPrimary}
        />
        <Text style={[styles.ticketAmount, disabled ? styles.ticketAmountDisabled : null]} numberOfLines={2}>
          {getOfferAmountLabel(item)}
        </Text>
      </View>
      <TicketPerforation />
      <View style={styles.ticketBody}>
        <View style={styles.ticketTopRow}>
          <Text style={styles.ticketCodeLabel}>Code</Text>
          <View style={[styles.statusChip, disabled ? styles.statusChipDisabled : null]}>
            <Text style={[styles.statusChipText, disabled ? styles.statusChipTextDisabled : null]}>
              {statusLabel}
            </Text>
          </View>
        </View>
        <Text style={[styles.ticketCode, disabled ? styles.ticketCodeDisabled : null]} numberOfLines={1}>
          {getOfferCodeLabel(item)}
        </Text>
        <View style={styles.ticketMetaRow}>
          <Ionicons name="calendar-outline" size={12} color={palette.mutedForeground} />
          <Text style={styles.ticketMeta} numberOfLines={1}>
            {formatOfferExpiry(item.voucherExpiresAt)}
          </Text>
        </View>
        <View style={styles.ticketMetaRow}>
          <Ionicons name="basket-outline" size={12} color={palette.mutedForeground} />
          <Text style={styles.ticketMeta} numberOfLines={1}>
            {getOfferConditionLabel(item)}
          </Text>
        </View>
      </View>
      <View style={styles.ticketChevron}>
        <Ionicons name="chevron-forward" size={16} color={palette.mutedForeground} />
      </View>
    </Pressable>
  );
});

function OffersHeader(props: {
  activeOfferCount: number;
  canRequestCustomOffer: boolean;
  customOfferCopy: { title: string; description: string };
  customOfferProgressPercent: number;
  customOfferSummary?: CustomerCustomOfferSummary;
  isRequestPending: boolean;
  requestedCodeMaxLength: number;
  requestedOfferCode: string;
  onRequestCodeChange: (value: string) => void;
  onRequestOffer: () => void;
}) {
  return (
    <View style={styles.headerWrap}>
      <View style={styles.rewardCard}>
        {props.activeOfferCount > 0 ? (
          <View style={styles.rewardBadge}>
            <Text style={styles.rewardBadgeText}>{props.activeOfferCount}</Text>
          </View>
        ) : null}
        <View style={styles.rewardTopRow}>
          <View style={styles.rewardIcon}>
            <Ionicons name="gift" size={20} color={palette.onPrimary} />
          </View>
          <View style={styles.rewardCopy}>
            <Text style={styles.rewardTitle}>{props.customOfferCopy.title}</Text>
            <Text style={styles.rewardDescription}>{props.customOfferCopy.description}</Text>
          </View>
        </View>
        <View style={styles.rewardProgressMeta}>
          <Text style={styles.rewardProgressText}>
            {props.customOfferSummary?.status === "requested"
              ? "Request is in review"
              : props.canRequestCustomOffer
                ? "Ready to request"
                : `${props.customOfferSummary?.remainingOrderCount ?? 10} ${
                    (props.customOfferSummary?.remainingOrderCount ?? 10) === 1
                      ? "order"
                      : "orders"
                  } left`}
          </Text>
          <Text style={styles.rewardProgressCount}>
            {props.customOfferSummary?.completedOrderCount ?? 0}/
            {props.customOfferSummary?.targetOrderCount ?? 10}
          </Text>
        </View>
        <View style={styles.rewardProgressTrack}>
          <View
            style={[
              styles.rewardProgressFill,
              { width: `${props.customOfferProgressPercent}%` },
            ]}
          />
        </View>
        {props.canRequestCustomOffer ? (
          <>
            <View style={styles.codeFieldWrap}>
              <View style={styles.codeLabelRow}>
                <Text style={styles.codeLabel}>Preferred code (optional)</Text>
                <Text style={styles.codeLimitText}>
                  {props.requestedOfferCode.length}/{props.requestedCodeMaxLength}
                </Text>
              </View>
              <TextInput
                value={props.requestedOfferCode}
                onChangeText={props.onRequestCodeChange}
                placeholder="MYCODE"
                placeholderTextColor={palette.placeholder}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={props.requestedCodeMaxLength}
                style={styles.codeInput}
              />
              <Text style={styles.codeHintText}>
                Use A-Z, 0-9, underscore or dash.
              </Text>
            </View>
            <Pressable
              style={styles.rewardButton}
              disabled={props.isRequestPending}
              onPress={props.onRequestOffer}
            >
              {props.isRequestPending ? (
                <ActivityIndicator size="small" color={palette.onPrimary} />
              ) : (
                <Text style={styles.rewardButtonText}>Request my offer</Text>
              )}
            </Pressable>
          </>
        ) : null}
      </View>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Vouchers</Text>
      </View>

      {props.customOfferSummary?.status === "requested" ? (
        <PendingOfferCard
          requestedCode={props.customOfferSummary.requestedCode}
          expectedReadyAt={props.customOfferSummary.expectedReadyAt}
        />
      ) : null}
    </View>
  );
}

export default function OffersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [requestedOfferCode, setRequestedOfferCode] = useState("");
  const offersQuery = useCustomerNotificationsInfiniteQuery(true, 20, "personal_offers");
  const customOfferSummaryQuery = useCustomerCustomOfferSummaryQuery(true);
  const customOfferRequestMutation = useCustomerCustomOfferRequestMutation();
  const showBanner = useAppBannerStore((state) => state.showBanner);
  const offers = useMemo(
    () =>
      dedupeById(offersQuery.data?.pages.flatMap((page) => page.items) ?? []),
    [offersQuery.data?.pages],
  );
  const activeOfferCount = useMemo(
    () =>
      offers.filter(
        (offer) => !isOfferExpired(offer) && !isOfferUsed(offer),
      ).length,
    [offers],
  );
  const customOfferSummary = customOfferSummaryQuery.data;
  const customOfferCopy = getCustomOfferCopy(customOfferSummary, activeOfferCount);
  const requestedCodeMaxLength = clampRequestedCodeLength(
    customOfferSummary?.requestedCodeMaxLength,
  );
  const customOfferProgressPercent = Math.round(
    Math.max(0, Math.min(customOfferSummary?.progressRatio ?? 0, 1)) * 100,
  );
  const canRequestCustomOffer =
    customOfferSummary?.enabled !== false &&
    customOfferSummary?.status === "eligible";
  const isInitialLoading =
    (offersQuery.isLoading && offers.length === 0) || customOfferSummaryQuery.isLoading;

  // Manual pull only — binding the RefreshControl to isRefetching also showed the spinner on
  // background refetches (on focus / re-mount), so it appeared without the user pulling.
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const refreshAll = useCallback(() => {
    void customOfferSummaryQuery.refetch();
    void offersQuery.refetch();
  }, [customOfferSummaryQuery, offersQuery]);

  const handleRequestedOfferCodeChange = useCallback(
    (value: string) =>
      setRequestedOfferCode(formatRequestedOfferCode(value, requestedCodeMaxLength)),
    [requestedCodeMaxLength],
  );

  const requestCustomOffer = useCallback(() => {
    if (!canRequestCustomOffer) return;

    customOfferRequestMutation.mutate(
      { requestedCode: requestedOfferCode.trim().toUpperCase() },
      {
        onSuccess: () => {
          setRequestedOfferCode("");
          showBanner({
            title: "My offer requested",
            description: "We will prepare your personal voucher soon.",
            tone: "success",
            path: "/offers",
            actionLabel: "View offers",
            dedupeKey: "custom-offer-requested",
          });
        },
        onError: (error) => {
          showBanner({
            title: "Could not request offer",
            description:
              error instanceof Error
                ? error.message
                : "Please try again after a moment.",
            tone: "warning",
            dedupeKey: "custom-offer-request-failed",
          });
        },
      },
    );
  }, [
    canRequestCustomOffer,
    customOfferRequestMutation,
    requestedOfferCode,
    showBanner,
  ]);

  const renderOfferItem = useCallback(
    ({ item }: { item: CustomerNotification }) => (
      <OfferCard
        item={item}
        onPress={() =>
          router.push({
            pathname: "/offer-details",
            params: {
              notificationId: item.id,
              voucherId: item.voucherId ?? "",
              voucherCode: item.voucherCode ?? "",
              voucherLabel: item.voucherLabel ?? "",
              voucherExpiresAt: item.voucherExpiresAt ?? "",
              voucherMinOrder:
                typeof item.voucherMinOrder === "number"
                  ? String(item.voucherMinOrder)
                  : "",
              voucherUsageStatus: item.voucherUsageStatus ?? "",
              voucherDiscountType: item.voucherDiscountType ?? "",
              voucherDiscountValue:
                typeof item.voucherDiscountValue === "number" ? String(item.voucherDiscountValue) : "",
              voucherMaxDiscount:
                typeof item.voucherMaxDiscount === "number" ? String(item.voucherMaxDiscount) : "",
              voucherAppliedAt: item.voucherAppliedAt ?? "",
              personalOffer: item.personalOffer ? "1" : "",
              title: item.title,
              description: item.description,
              imageUrl: item.imageUrl ?? "",
              contentType: item.contentType ?? "",
              createdAt: item.createdAt,
            },
          } as never)
        }
      />
    ),
    [router],
  );

  return (
    <Screen>
      <View style={styles.container}>
        <AppHeader inline style={styles.headerInset} eyebrow="Stamp card" title="Rewards & vouchers" />

        {isInitialLoading ? (
          <OffersScreenSkeleton />
        ) : offersQuery.isError || customOfferSummaryQuery.isError ? (
          <View style={styles.feedbackWrap}>
            <EmptyStateCard
              title="Could not load offers"
              description="Pull to refresh or try again in a moment."
              actionLabel="Try again"
              onPress={refreshAll}
            />
          </View>
        ) : (
          <BelaPullToRefresh
            refreshing={isManualRefreshing}
            onRefresh={async () => {
                  setIsManualRefreshing(true);
                  try {
                    await Promise.all([
                      customOfferSummaryQuery.refetch(),
                      offersQuery.refetch(),
                    ]);
                  } finally {
                    setIsManualRefreshing(false);
                  }
                }}
          >
          <FlashList
            data={offers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: Math.max(insets.bottom, 16) + 18 },
            ]}
            showsVerticalScrollIndicator={false}
            onEndReachedThreshold={0.25}
            onEndReached={() => {
              if (offersQuery.hasNextPage && !offersQuery.isFetchingNextPage) {
                void offersQuery.fetchNextPage();
              }
            }}
            ListHeaderComponent={
              <OffersHeader
                activeOfferCount={activeOfferCount}
                canRequestCustomOffer={canRequestCustomOffer}
                customOfferCopy={customOfferCopy}
                customOfferProgressPercent={customOfferProgressPercent}
                customOfferSummary={customOfferSummary}
                isRequestPending={customOfferRequestMutation.isPending}
                requestedCodeMaxLength={requestedCodeMaxLength}
                requestedOfferCode={requestedOfferCode}
                onRequestCodeChange={handleRequestedOfferCodeChange}
                onRequestOffer={requestCustomOffer}
              />
            }
            ListEmptyComponent={
              customOfferSummary?.status === "requested" ? null : (
                <View style={styles.emptyOffersWrap}>
                  <EmptyStateCard
                    title="No vouchers yet"
                    description="Complete more orders or request my offer when it unlocks."
                    actionLabel="Order more"
                    onPress={() => router.push("/(tabs)")}
                  />
                </View>
              )
            }
            ListFooterComponent={
              offersQuery.isFetchingNextPage ? (
                <View style={styles.footerLoading}>
                  <ActivityIndicator size="small" color={palette.secondary} />
                </View>
              ) : null
            }
            drawDistance={720}
            removeClippedSubviews
            renderItem={renderOfferItem}
          />
          </BelaPullToRefresh>
        )}
      </View>
    </Screen>
  );
}

const TICKET_HEIGHT = 128;

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Unpadded container → give the inline header the standard 16px gutter.
  headerInset: { paddingHorizontal: 16 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  feedbackWrap: { flex: 1, justifyContent: "center", paddingHorizontal: 20, paddingBottom: 72 },
  list: { paddingHorizontal: 16 },
  headerWrap: { gap: 14, paddingTop: 6, paddingBottom: 12 },

  // Progress-to-reward card (light, flat).
  rewardCard: {
    position: "relative",
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E4E7",
    backgroundColor: palette.surface,
    padding: 16,
    gap: 12,
  },
  rewardBadge: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 2,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.foreground,
  },
  rewardBadgeText: { fontSize: 12, lineHeight: 16, fontWeight: "700", color: "#FFFFFF" },
  rewardTopRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  rewardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  rewardCopy: { flex: 1, gap: 3, paddingRight: 36 },
  rewardTitle: { fontSize: 17, lineHeight: 22, fontWeight: "700", color: palette.foreground },
  rewardDescription: { fontSize: 13, lineHeight: 18, color: palette.mutedForeground },
  rewardProgressMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  rewardProgressText: { flex: 1, fontSize: 12.5, lineHeight: 17, fontWeight: "500", color: palette.mutedForeground },
  rewardProgressCount: { fontSize: 13, lineHeight: 17, fontWeight: "700", color: palette.foreground },
  rewardProgressTrack: { height: 8, borderRadius: 999, overflow: "hidden", backgroundColor: "#EEEFF2" },
  rewardProgressFill: { height: "100%", borderRadius: 999, backgroundColor: palette.primary },
  codeFieldWrap: { gap: 6 },
  codeLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  codeLabel: { fontSize: 12.5, lineHeight: 16, fontWeight: "500", color: palette.mutedForeground },
  codeLimitText: { fontSize: 11.5, lineHeight: 14, color: palette.mutedForeground },
  codeInput: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E3E4E7",
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "700",
    letterSpacing: 1,
    color: palette.foreground,
  },
  codeHintText: { fontSize: 11.5, lineHeight: 15, color: palette.mutedForeground },
  rewardButton: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  rewardButtonText: { fontSize: 15, lineHeight: 19, fontWeight: "700", color: palette.onPrimary },
  sectionHeading: { gap: 2, marginTop: 4 },
  sectionTitle: { fontSize: 17, lineHeight: 23, fontWeight: "700", color: palette.foreground },
  emptyOffersWrap: { paddingTop: 8, paddingBottom: 20 },

  // Voucher ticket: amber stub · perforation · details.
  ticket: {
    minHeight: TICKET_HEIGHT,
    marginBottom: 12,
    flexDirection: "row",
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E4E7",
    backgroundColor: palette.surface,
    overflow: "hidden",
  },
  ticketDisabled: { backgroundColor: "#FAFAFB" },
  ticketStub: {
    width: 104,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: palette.primary,
  },
  ticketStubDisabled: { backgroundColor: "#ECEDEF" },
  ticketStubPending: { backgroundColor: "#FFF1DD" },
  ticketAmount: { fontSize: 17, lineHeight: 21, fontWeight: "800", textAlign: "center", color: palette.onPrimary },
  ticketAmountDisabled: { color: palette.mutedForeground },
  ticketAmountPending: { fontSize: 13.5, color: palette.warningText },
  perforation: { width: 14, alignItems: "center", justifyContent: "space-between", marginLeft: -7, marginRight: -7, zIndex: 2 },
  notch: { width: 14, height: 14, borderRadius: 7, backgroundColor: palette.background },
  notchTop: { marginTop: -7 },
  notchBottom: { marginBottom: -7 },
  dashes: { flex: 1, justifyContent: "space-evenly", alignItems: "center", paddingVertical: 6 },
  dash: { width: 2, height: 6, borderRadius: 1, backgroundColor: "#E3E4E7" },
  ticketBody: { flex: 1, minWidth: 0, paddingLeft: 16, paddingRight: 6, paddingVertical: 12, gap: 4 },
  ticketTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  ticketCodeLabel: { fontSize: 11.5, fontWeight: "500", color: palette.mutedForeground },
  ticketCode: { fontSize: 18, lineHeight: 24, fontWeight: "800", letterSpacing: 0.6, color: palette.foreground },
  ticketCodeDisabled: { color: palette.mutedForeground, textDecorationLine: "line-through" },
  ticketMetaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  ticketMeta: { flex: 1, fontSize: 12, lineHeight: 16, color: palette.mutedForeground },
  ticketChevron: { width: 26, alignItems: "center", justifyContent: "center" },
  statusChip: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    justifyContent: "center",
    backgroundColor: "#E7F7EE",
  },
  statusChipDisabled: { backgroundColor: "#ECEDEF" },
  statusChipPending: { backgroundColor: "#FFF1DD" },
  statusChipText: { fontSize: 11, fontWeight: "700", color: palette.successText },
  statusChipTextDisabled: { color: palette.mutedForeground },
  statusChipTextPending: { color: palette.warningText },

  footerLoading: { paddingVertical: 18, alignItems: "center", justifyContent: "center" },
  skeletonList: { paddingHorizontal: 16, paddingTop: 6, gap: 12 },
  skeletonReward: { height: 150, borderRadius: 22 },
  skeletonHeading: { width: "32%", height: 18, borderRadius: 8, marginTop: 4 },
  skeletonTicket: { height: TICKET_HEIGHT, borderRadius: 20 },
});
