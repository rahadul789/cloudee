import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyStateCard } from "@/src/components/empty-state-card";
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
    <View style={[styles.offerCard, styles.pendingCard]}>
      <View style={styles.offerCardTop}>
        <View style={[styles.offerCardIcon, styles.pendingCardIcon]}>
          <Ionicons name="hourglass-outline" size={18} color={palette.warningText} />
        </View>
        <View style={styles.offerCardCopy}>
          <Text style={styles.offerCardTitle} numberOfLines={1}>
            Voucher on the way
          </Text>
          <Text style={styles.offerCardSentence} numberOfLines={1}>
            We’re preparing your personal voucher.
          </Text>
        </View>
        <View style={[styles.offerStatusBadge, styles.pendingBadge]}>
          <Text style={[styles.offerStatusText, styles.pendingBadgeText]}>
            Pending
          </Text>
        </View>
      </View>

      <View style={[styles.offerCodeTicket, styles.pendingTicket]}>
        <Text style={styles.offerCodeTicketLabel}>
          {requestedCode ? "Requested code" : "Amount"}
        </Text>
        <Text style={styles.pendingTicketValue} numberOfLines={1}>
          {requestedCode ? requestedCode : "Set by our team soon"}
        </Text>
      </View>

      <View style={styles.offerMetaRow}>
        <View style={styles.offerMetaChip}>
          <Ionicons
            name="time-outline"
            size={12}
            color={palette.mutedForeground}
          />
          <Text style={styles.offerMetaText} numberOfLines={1}>
            {readyLabel}
          </Text>
        </View>
      </View>
    </View>
  );
});

function OffersScreenSkeleton() {
  return (
    <View style={styles.skeletonList}>
      <View style={styles.skeletonRewardCard}>
        <View style={styles.skeletonRewardTop}>
          <ShimmerBlock style={styles.skeletonRewardIcon} />
          <View style={styles.skeletonRewardCopy}>
            <ShimmerBlock style={styles.skeletonRewardTitle} />
            <ShimmerBlock style={styles.skeletonRewardLine} />
          </View>
        </View>
        <ShimmerBlock style={styles.skeletonRewardTrack} />
      </View>
      {Array.from({ length: 5 }, (_, index) => (
        <View key={index} style={styles.skeletonOfferCard}>
          <View style={styles.skeletonOfferTop}>
            <ShimmerBlock style={styles.skeletonOfferIcon} />
            <View style={styles.skeletonOfferCopy}>
              <ShimmerBlock style={styles.skeletonOfferTitle} />
              <ShimmerBlock style={styles.skeletonOfferLine} />
            </View>
            <ShimmerBlock style={styles.skeletonOfferBadge} />
          </View>
          <ShimmerBlock style={styles.skeletonOfferCodeTicket} />
          <View style={styles.skeletonOfferMetaRow}>
            <ShimmerBlock style={styles.skeletonOfferMetaChip} />
            <ShimmerBlock style={styles.skeletonOfferMetaChip} />
          </View>
        </View>
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
      style={[styles.offerCard, disabled ? styles.offerCardDisabled : null]}
      onPress={onPress}
    >
      <View style={styles.offerCardTop}>
        <View style={styles.offerCardIcon}>
          <Ionicons
            name={disabled ? "lock-closed-outline" : "ticket-outline"}
            size={18}
            color={disabled ? palette.mutedForeground : palette.secondary}
          />
        </View>
        <View style={styles.offerCardCopy}>
          <Text style={styles.offerCardTitle} numberOfLines={1}>
            {getOfferAmountLabel(item)}
          </Text>
          <Text style={styles.offerCardSentence} numberOfLines={1}>
            Use this voucher at checkout.
          </Text>
        </View>
        <View
          style={[
            styles.offerStatusBadge,
            disabled ? styles.offerStatusBadgeDisabled : null,
          ]}
        >
          <Text
            style={[
              styles.offerStatusText,
              disabled ? styles.offerStatusTextDisabled : null,
            ]}
          >
            {statusLabel}
          </Text>
        </View>
      </View>

      <View style={styles.offerCodeTicket}>
        <Text style={styles.offerCodeTicketLabel}>Code</Text>
        <Text style={styles.offerCodeTicketValue} numberOfLines={1}>
          {getOfferCodeLabel(item)}
        </Text>
      </View>

      <View style={styles.offerMetaRow}>
        <View style={styles.offerMetaChip}>
          <Ionicons
            name="calendar-outline"
            size={12}
            color={palette.mutedForeground}
          />
          <Text style={styles.offerMetaText} numberOfLines={1}>
            {formatOfferExpiry(item.voucherExpiresAt)}
          </Text>
        </View>
        <View style={styles.offerMetaChip}>
          <Ionicons
            name="basket-outline"
            size={12}
            color={palette.mutedForeground}
          />
          <Text style={styles.offerMetaText} numberOfLines={1}>
            {getOfferConditionLabel(item)}
          </Text>
        </View>
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
            <Ionicons name="ticket-outline" size={22} color={palette.secondary} />
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
                placeholderTextColor={palette.mutedForeground}
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
                <ActivityIndicator size="small" color="#FFFFFF" />
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
        <View style={styles.topBar}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={palette.foreground} />
          </Pressable>
          <View style={styles.topCopy}>
            <Text style={styles.eyebrow}>Personalized</Text>
            <Text style={styles.title}>My offer</Text>
          </View>
        </View>

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
          <FlashList
            data={offers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: Math.max(insets.bottom, 16) + 18 },
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
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
                tintColor={palette.primary}
              />
            }
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
                    onPress={() => router.push("/(tabs)/browse" as never)}
                  />
                </View>
              )
            }
            ListFooterComponent={
              offersQuery.isFetchingNextPage ? (
                <View style={styles.footerLoading}>
                  <ActivityIndicator size="small" color={palette.primary} />
                </View>
              ) : null
            }
            drawDistance={720}
            removeClippedSubviews
            renderItem={renderOfferItem}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  topCopy: { flex: 1 },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: palette.secondary,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
    color: palette.foreground,
  },
  feedbackWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingBottom: 72,
  },
  list: {
    paddingHorizontal: 18,
  },
  headerWrap: {
    gap: 14,
    paddingTop: 8,
    paddingBottom: 10,
  },
  rewardCard: {
    position: "relative",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    backgroundColor: "#171923",
    padding: 12,
    gap: 9,
  },
  rewardBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 2,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#171923",
    paddingHorizontal: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.secondary,
  },
  rewardBadgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  rewardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
  },
  rewardIcon: {
    width: 40,
    height: 40,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 92, 147, 0.16)",
  },
  rewardCopy: {
    flex: 1,
    gap: 3,
    paddingRight: 42,
  },
  rewardTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  rewardDescription: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: "#C9CEDA",
  },
  rewardProgressMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rewardProgressText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
    color: "#C9CEDA",
    textTransform: "uppercase",
  },
  rewardProgressCount: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  rewardProgressTrack: {
    height: 7,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.14)",
  },
  rewardProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: palette.secondary,
  },
  codeFieldWrap: {
    gap: 6,
  },
  codeLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  codeLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  codeLimitText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: "#C9CEDA",
  },
  codeInput: {
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 143, 188, 0.35)",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 13,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  codeHintText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    color: "#C9CEDA",
  },
  requestedCodeRow: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#FFC0D4",
    backgroundColor: "#FFF7FA",
    padding: 11,
    gap: 4,
  },
  requestedCodeText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.secondary,
  },
  rewardButton: {
    minHeight: 43,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.secondary,
  },
  rewardButtonText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  sectionHeading: {
    gap: 2,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
    color: palette.foreground,
  },
  emptyOffersWrap: {
    paddingTop: 8,
    paddingBottom: 20,
  },
  offerCard: {
    minHeight: 128,
    marginBottom: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(228, 17, 111, 0.12)",
    backgroundColor: palette.surface,
    padding: 13,
    gap: 10,
  },
  offerCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  offerCardDisabled: {
    opacity: 0.72,
    backgroundColor: "#F7F8FA",
  },
  pendingCard: {
    borderColor: "rgba(231, 139, 39, 0.22)",
    backgroundColor: "#FFFBF3",
  },
  pendingCardIcon: {
    backgroundColor: "#FFF3E0",
  },
  pendingBadge: {
    backgroundColor: "#FFF1DD",
  },
  pendingBadgeText: {
    color: palette.warningText,
  },
  pendingTicket: {
    borderColor: "rgba(231, 139, 39, 0.32)",
    backgroundColor: "#FFFBF3",
  },
  pendingTicketValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.warningText,
    letterSpacing: 0,
  },
  offerCardIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF0F6",
  },
  offerCardCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  offerCardTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "900",
    color: palette.foreground,
  },
  offerCardSentence: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  offerCodeTicket: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(228, 17, 111, 0.36)",
    backgroundColor: "#FFF7FA",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  offerCodeTicketLabel: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
    color: palette.secondary,
    textTransform: "uppercase",
  },
  offerCodeTicketValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "900",
    color: palette.foreground,
    letterSpacing: 0,
  },
  offerMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  offerMetaChip: {
    maxWidth: "100%",
    borderRadius: 999,
    backgroundColor: "#F7F8FA",
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  offerMetaText: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "800",
    color: palette.foreground,
  },
  offerConditionText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  offerCodeChip: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    marginTop: 3,
    borderRadius: 999,
    backgroundColor: "#FFF0F6",
    paddingHorizontal: 9,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  offerCodeLabel: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "900",
    color: palette.secondary,
    textTransform: "uppercase",
  },
  offerCodeValue: {
    maxWidth: 118,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "900",
    color: palette.foreground,
    letterSpacing: 0,
  },
  offerStatusBadge: {
    borderRadius: 999,
    backgroundColor: "#FFF0F6",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  offerStatusBadgeDisabled: {
    backgroundColor: "#EAEDF1",
  },
  offerStatusText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
    color: palette.secondary,
  },
  offerStatusTextDisabled: {
    color: palette.mutedForeground,
  },
  footerLoading: {
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  skeletonList: {
    paddingHorizontal: 18,
    paddingTop: 2,
    gap: 10,
  },
  skeletonRewardCard: {
    minHeight: 126,
    borderRadius: 20,
    backgroundColor: "#171923",
    padding: 14,
    gap: 13,
  },
  skeletonRewardTop: {
    flexDirection: "row",
    gap: 11,
  },
  skeletonRewardIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
  },
  skeletonRewardCopy: {
    flex: 1,
    gap: 8,
  },
  skeletonRewardTitle: {
    width: "58%",
    height: 18,
    borderRadius: 9,
  },
  skeletonRewardLine: {
    width: "88%",
    height: 13,
    borderRadius: 7,
  },
  skeletonRewardTrack: {
    width: "100%",
    height: 8,
    borderRadius: 999,
  },
  skeletonOfferCard: {
    minHeight: 128,
    borderRadius: 20,
    backgroundColor: palette.surface,
    padding: 13,
    gap: 10,
  },
  skeletonOfferTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  skeletonOfferIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
  },
  skeletonOfferCopy: {
    flex: 1,
    gap: 8,
  },
  skeletonOfferTitle: {
    width: "52%",
    height: 18,
    borderRadius: 9,
  },
  skeletonOfferMetaRow: {
    flexDirection: "row",
    gap: 7,
  },
  skeletonOfferMetaChip: {
    width: 86,
    height: 24,
    borderRadius: 999,
  },
  skeletonOfferLine: {
    width: "68%",
    height: 12,
    borderRadius: 6,
  },
  skeletonOfferCodeTicket: {
    width: "100%",
    height: 42,
    borderRadius: 16,
  },
  skeletonOfferBadge: {
    width: 62,
    height: 24,
    borderRadius: 12,
  },
});
