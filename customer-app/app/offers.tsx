import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyStateCard } from "@/src/components/empty-state-card";
import { ShimmerBlock } from "@/src/components/loading-skeleton";
import { RemoteImage } from "@/src/components/remote-image";
import { Screen } from "@/src/components/screen";
import {
  type CustomerNotification,
  useCustomerMarkNotificationReadMutation,
  useCustomerNotificationsInfiniteQuery,
} from "@/src/hooks/use-customer-api";
import { resolveCustomerPushRoute } from "@/src/lib/customer-routes";
import { formatDateTimeAmPm } from "@/src/lib/date-time";
import { dedupeById } from "@/src/lib/dedupe";
import { palette } from "@/src/theme/palette";

function offerTarget(notification: CustomerNotification) {
  return resolveCustomerPushRoute({
    type: notification.type,
    path: notification.path,
    campaignId: notification.campaignId,
  });
}

function isOfferExpired(notification: CustomerNotification) {
  if (!notification.voucherExpiresAt) return false;
  const date = new Date(notification.voucherExpiresAt);
  return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now();
}

function OffersScreenSkeleton() {
  return (
    <View style={styles.skeletonList}>
      {Array.from({ length: 4 }, (_, index) => (
        <View key={index} style={styles.skeletonCard}>
          <ShimmerBlock style={styles.skeletonImage} />
          <View style={styles.skeletonBody}>
            <View style={styles.skeletonTitleRow}>
              <View style={styles.skeletonTitleBlock}>
                <ShimmerBlock style={styles.skeletonTitle} />
                <ShimmerBlock style={styles.skeletonDescription} />
              </View>
              <ShimmerBlock style={styles.skeletonBadge} />
            </View>
            <ShimmerBlock style={styles.skeletonVoucher} />
            <View style={styles.skeletonFooter}>
              <ShimmerBlock style={styles.skeletonTime} />
              <ShimmerBlock style={styles.skeletonArrow} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function OffersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const offersQuery = useCustomerNotificationsInfiniteQuery(true, 20, "personal_offers");
  const markReadMutation = useCustomerMarkNotificationReadMutation();
  const offers = useMemo(
    () =>
      dedupeById(offersQuery.data?.pages.flatMap((page) => page.items) ?? []),
    [offersQuery.data?.pages],
  );
  const isInitialLoading = offersQuery.isLoading && offers.length === 0;

  async function openOffer(offer: CustomerNotification) {
    if (!offer.isRead) {
      await markReadMutation.mutateAsync(offer.id).catch(() => undefined);
    }
    router.push(offerTarget(offer) as never);
  }

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={palette.foreground} />
          </Pressable>
          <View style={styles.topCopy}>
            <Text style={styles.eyebrow}>Personalized</Text>
            <Text style={styles.title}>My offers</Text>
          </View>
        </View>

        {isInitialLoading ? (
          <OffersScreenSkeleton />
        ) : offersQuery.isError ? (
          <View style={styles.feedbackWrap}>
            <EmptyStateCard
              title="Could not load offers"
              description="Pull to refresh or try again in a moment."
              actionLabel="Try again"
              onPress={() => offersQuery.refetch()}
            />
          </View>
        ) : offers.length === 0 ? (
          <View style={styles.feedbackWrap}>
            <EmptyStateCard
              title="No offers yet"
              description="Order more with Foodbela to unlock account-only vouchers and special offers."
              actionLabel="Order more"
              onPress={() => router.push("/(tabs)/browse" as never)}
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
                refreshing={offersQuery.isRefetching && !offersQuery.isFetchingNextPage}
                onRefresh={() => offersQuery.refetch()}
                tintColor={palette.primary}
              />
            }
            onEndReachedThreshold={0.25}
            onEndReached={() => {
              if (offersQuery.hasNextPage && !offersQuery.isFetchingNextPage) {
                void offersQuery.fetchNextPage();
              }
            }}
            ListFooterComponent={
              offersQuery.isFetchingNextPage ? (
                <View style={styles.footerLoading}>
                  <ActivityIndicator size="small" color={palette.primary} />
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const expired = isOfferExpired(item);
              const expiryText = item.voucherExpiresAt
                ? `Expires ${formatDateTimeAmPm(item.voucherExpiresAt)}`
                : "No expiry shown";
              return (
              <Pressable
                style={[styles.card, expired ? styles.cardExpired : null]}
                onPress={() => openOffer(item)}
              >
                {item.imageUrl ? (
                  <RemoteImage
                    uri={item.imageUrl}
                    style={[styles.image, expired ? styles.imageExpired : null]}
                    fallbackIcon="gift-outline"
                    accessibilityLabel={`${item.title} offer image`}
                  />
                ) : (
                  <View style={[styles.imageFallback, expired ? styles.imageExpired : null]}>
                    <Ionicons name="gift-outline" size={28} color={palette.secondary} />
                  </View>
                )}
                <View style={styles.cardBody}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.voucherLabel || item.title}
                    </Text>
                    {expired ? (
                      <View style={styles.expiredBadge}>
                        <Text style={styles.expiredBadgeText}>Expired</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.cardDescription} numberOfLines={1}>
                    {item.description}
                  </Text>
                  {item.voucherCode || item.voucherId ? (
                    <View style={styles.voucherChip}>
                      <Text style={styles.voucherLabel} numberOfLines={1}>
                        {item.voucherLabel || "Voucher"}
                      </Text>
                      <Text style={styles.voucherCode} numberOfLines={1}>
                        {item.voucherCode || "Auto applied"}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.cardFooter}>
                    <Text style={styles.cardTime}>{expiryText}</Text>
                    <Ionicons name="arrow-forward" size={17} color={palette.secondary} />
                  </View>
                </View>
              </Pressable>
              );
            }}
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
    gap: 10,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    overflow: "hidden",
    flexDirection: "row",
  },
  cardExpired: {
    opacity: 0.72,
    borderColor: "#E7D8C8",
    backgroundColor: "#FFFDF9",
  },
  image: {
    width: 96,
    minHeight: 132,
    backgroundColor: palette.surfaceMuted,
  },
  imageExpired: {
    opacity: 0.55,
  },
  imageFallback: {
    width: 96,
    minHeight: 132,
    backgroundColor: "#FFF0F6",
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    flex: 1,
    padding: 14,
    gap: 7,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: palette.foreground,
  },
  expiredBadge: {
    borderRadius: 999,
    backgroundColor: "#FFF1D6",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  expiredBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
    color: "#9A5C00",
  },
  cardDescription: {
    fontSize: 12,
    lineHeight: 17,
    color: palette.mutedForeground,
  },
  voucherChip: {
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#FFC0D4",
    backgroundColor: "#FFF0F6",
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  voucherLabel: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  voucherCode: {
    maxWidth: 96,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
    color: palette.secondary,
    letterSpacing: 0,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cardTime: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
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
  skeletonCard: {
    minHeight: 132,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    overflow: "hidden",
    flexDirection: "row",
  },
  skeletonImage: {
    width: 96,
    minHeight: 132,
    backgroundColor: "#FFF0F6",
  },
  skeletonBody: {
    flex: 1,
    minWidth: 0,
    padding: 14,
    gap: 10,
  },
  skeletonTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  skeletonTitleBlock: {
    flex: 1,
    gap: 8,
  },
  skeletonTitle: {
    width: "72%",
    height: 16,
    borderRadius: 8,
  },
  skeletonDescription: {
    width: "92%",
    height: 12,
    borderRadius: 6,
  },
  skeletonBadge: {
    width: 54,
    height: 22,
    borderRadius: 999,
  },
  skeletonVoucher: {
    width: "100%",
    height: 34,
    borderRadius: 14,
  },
  skeletonFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  skeletonTime: {
    width: "58%",
    height: 12,
    borderRadius: 6,
  },
  skeletonArrow: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
});
