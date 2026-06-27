import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyStateCard } from "@/src/components/empty-state-card";
import { ShimmerBlock } from "@/src/components/loading-skeleton";
import { RemoteImage } from "@/src/components/remote-image";
import { Screen } from "@/src/components/screen";
import {
  useCustomerNotificationsInfiniteQuery,
  useCustomerMarkAllNotificationsReadMutation,
  useCustomerMarkNotificationReadMutation,
  useCustomerNotificationsQuery,
} from "@/src/hooks/use-customer-api";
import { resolveCustomerPushRoute } from "@/src/lib/customer-routes";
import { refreshCustomerOrderCacheForPath } from "@/src/lib/customer-order-cache";
import { formatDateTimeAmPm } from "@/src/lib/date-time";
import { dedupeById } from "@/src/lib/dedupe";
import { palette } from "@/src/theme/palette";

type NotificationTab = "all" | "orders" | "offers";

const notificationTabs: { key: NotificationTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "orders", label: "Orders" },
  { key: "offers", label: "Offers" },
];

// FlashList ignores `gap` in contentContainerStyle, so cards render flush against
// each other. An explicit separator restores consistent vertical spacing.
function NotificationSeparator() {
  return <View style={styles.notificationSeparator} />;
}

function isOfferNotification(type: string) {
  return type === "promotion" || type === "voucher" || type === "campaign";
}

function isOrderNotification(type: string) {
  return (
    type === "order_status" ||
    type === "rider_assigned" ||
    type === "rider_near"
  );
}

function getToneStyle(type: string) {
  switch (type) {
    case "order_status":
      return {
        cardTint: "#FFE8F0",
        icon: "receipt-outline" as const,
        iconColor: palette.secondary,
      };
    case "support_reply":
      return {
        cardTint: "#EAF2FF",
        icon: "chatbubble-ellipses-outline" as const,
        iconColor: palette.sky,
      };
    case "restaurant_status":
      return {
        cardTint: "#FFF2E6",
        icon: "storefront-outline" as const,
        iconColor: palette.primary,
      };
    case "promotion":
    case "voucher":
    case "campaign":
      return {
        cardTint: "#FFF0F6",
        icon: "gift-outline" as const,
        iconColor: palette.secondary,
      };
    default:
      return {
        cardTint: "#EAF2FF",
        icon: "notifications-outline" as const,
        iconColor: palette.sky,
      };
  }
}

function NotificationListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.skeletonList}>
      <View style={styles.skeletonChipRow}>
        <ShimmerBlock style={styles.skeletonChipWide} />
        <ShimmerBlock style={styles.skeletonChip} />
        <ShimmerBlock style={styles.skeletonChipSmall} />
      </View>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.skeletonCard}>
          <ShimmerBlock style={styles.skeletonIcon} />
          <View style={styles.skeletonCopy}>
            <View style={styles.skeletonTopRow}>
              <ShimmerBlock style={styles.skeletonTitle} />
              <ShimmerBlock style={styles.skeletonDot} />
            </View>
            <ShimmerBlock style={styles.skeletonLine} />
            <ShimmerBlock style={styles.skeletonLineShort} />
            <View style={styles.skeletonFooter}>
              <ShimmerBlock style={styles.skeletonTime} />
              <ShimmerBlock style={styles.skeletonChevron} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    fromPush?: string;
    notificationId?: string;
    campaignId?: string;
    targetPath?: string;
  }>();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<NotificationTab>("all");
  useCustomerNotificationsQuery();
  const notificationsQuery = useCustomerNotificationsInfiniteQuery(true, 20, activeTab);
  const markReadMutation = useCustomerMarkNotificationReadMutation();
  const markAllMutation = useCustomerMarkAllNotificationsReadMutation();
  const pushedNotificationKey = params.notificationId || params.campaignId || "";
  const allNotifications = useMemo(() => {
    const rawNotifications = dedupeById(
      notificationsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    );
    if (!pushedNotificationKey) return rawNotifications;
    return [...rawNotifications].sort((left, right) => {
      const leftMatch =
        left.id === pushedNotificationKey || left.campaignId === pushedNotificationKey;
      const rightMatch =
        right.id === pushedNotificationKey || right.campaignId === pushedNotificationKey;
      return Number(rightMatch) - Number(leftMatch);
    });
  }, [pushedNotificationKey, notificationsQuery.data?.pages]);
  const notifications = useMemo(() => {
    if (activeTab === "orders") {
      return allNotifications.filter((notification) => isOrderNotification(notification.type));
    }
    if (activeTab === "offers") {
      return allNotifications.filter((notification) => isOfferNotification(notification.type));
    }
    return allNotifications;
  }, [activeTab, allNotifications]);
  const isInitialLoading = notificationsQuery.isLoading && notifications.length === 0;
  const isRefreshing = notificationsQuery.isRefetching && !notificationsQuery.isFetchingNextPage;
  const targetPath = Array.isArray(params.targetPath) ? params.targetPath[0] : params.targetPath;
  const safePushTargetPath = useMemo(
    () => resolveCustomerPushRoute({ path: targetPath }),
    [targetPath],
  );
  const openedFromPush = params.fromPush === "1";

  const openNotification = async (notification: {
    id: string;
    path: string;
    type: string;
    campaignId?: string;
    isRead: boolean;
  }) => {
    if (!notification.isRead) {
      await markReadMutation.mutateAsync(notification.id).catch(() => undefined);
    }

    const safePath = resolveCustomerPushRoute({
      type: notification.type,
      path: notification.path,
      campaignId: notification.campaignId,
    });
    if (safePath) {
      await refreshCustomerOrderCacheForPath(queryClient, safePath);
      router.push(safePath as never);
      return;
    }

    router.push("/(tabs)/orders");
  };

  return (
    <Screen>
      <View style={styles.container}>
        <View style={[styles.topBar, { paddingTop: 4 }]}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={palette.foreground} />
          </Pressable>

          <Text style={styles.title}>Notifications</Text>

          <Pressable
            style={[
              styles.markAllButton,
              (markAllMutation.isPending || notifications.length === 0) && styles.buttonDisabled,
            ]}
            disabled={markAllMutation.isPending || notifications.length === 0}
            onPress={() => markAllMutation.mutate()}
          >
            {markAllMutation.isPending ? (
              <ActivityIndicator size="small" color={palette.foreground} />
            ) : (
              <Text style={styles.markAllText}>Mark all read</Text>
            )}
          </Pressable>
        </View>

        {openedFromPush && safePushTargetPath ? (
          <View style={styles.pushContextCard}>
            <View style={styles.pushContextIcon}>
              <Ionicons name="open-outline" size={18} color={palette.secondary} />
            </View>
            <View style={styles.pushContextCopy}>
              <Text style={styles.pushContextTitle}>Notification opened</Text>
              <Text style={styles.pushContextText}>
                Review the update here, or continue to the related screen.
              </Text>
            </View>
            <Pressable
              style={styles.pushContextAction}
              onPress={async () => {
                await refreshCustomerOrderCacheForPath(
                  queryClient,
                  safePushTargetPath,
                );
                router.push(safePushTargetPath as never);
              }}
            >
              <Text style={styles.pushContextActionText}>Open</Text>
            </Pressable>
          </View>
        ) : null}

        {!isInitialLoading ? (
          <View style={styles.tabs}>
            {notificationTabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  style={[styles.tabChip, isActive ? styles.tabChipActive : null]}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Text style={[styles.tabText, isActive ? styles.tabTextActive : null]}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {isInitialLoading ? (
          <View style={styles.skeletonWrap}>
            <NotificationListSkeleton count={4} />
          </View>
        ) : notificationsQuery.isError ? (
          <View style={styles.feedbackWrap}>
            <EmptyStateCard
              title="Could not load notifications"
              description="Please try again in a moment."
              actionLabel="Retry"
              onPress={() => notificationsQuery.refetch()}
            />
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.feedbackWrap}>
            <EmptyStateCard
              title={
                activeTab === "offers"
                  ? "No offers yet"
                  : activeTab === "orders"
                    ? "No order updates yet"
                    : "No notifications yet"
              }
              description={
                activeTab === "offers"
                  ? "Foodbela offers and promo updates will appear here."
                  : activeTab === "orders"
                    ? "Order status updates will appear here."
                    : "Order updates and offers will appear here."
              }
            />
          </View>
        ) : (
          <FlashList
            data={notifications}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: Math.max(insets.bottom, 16) + 18 },
            ]}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={NotificationSeparator}
            onRefresh={() => notificationsQuery.refetch()}
            refreshing={isRefreshing}
            onEndReachedThreshold={0.35}
            onEndReached={() => {
              if (notificationsQuery.hasNextPage && !notificationsQuery.isFetchingNextPage) {
                void notificationsQuery.fetchNextPage();
              }
            }}
            ListFooterComponent={
              notificationsQuery.isFetchingNextPage ? (
                <View style={styles.footerLoading}>
                  <ActivityIndicator size="small" color={palette.primary} />
                </View>
              ) : null
            }
            renderItem={({ item: notification }) => {
              const tone = getToneStyle(notification.type);
              const isPushMatch =
                Boolean(pushedNotificationKey) &&
                (notification.id === pushedNotificationKey ||
                  notification.campaignId === pushedNotificationKey);

              return (
                <Pressable
                  key={notification.id}
                  style={[
                    styles.card,
                    !notification.isRead ? styles.cardUnread : null,
                    isPushMatch ? styles.cardFocused : null,
                  ]}
                  onPress={() => openNotification(notification)}
                >
                  <View style={[styles.cardIconWrap, { backgroundColor: tone.cardTint }]}>
                    <Ionicons name={tone.icon} size={18} color={tone.iconColor} />
                  </View>

                  <View style={styles.cardCopy}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle}>{notification.title}</Text>
                      {!notification.isRead ? <View style={styles.unreadDot} /> : null}
                    </View>
                    <Text style={styles.cardDescription}>{notification.description}</Text>
                    {notification.imageUrl ? (
                      <RemoteImage
                        uri={notification.imageUrl}
                        style={styles.cardImage}
                        fallbackIcon="notifications-outline"
                        accessibilityLabel={`${notification.title} notification image`}
                      />
                    ) : null}
                    {notification.voucherCode ? (
                      <View style={styles.voucherChip}>
                        <Ionicons name="ticket-outline" size={15} color={palette.secondary} />
                        <Text style={styles.voucherLabel} numberOfLines={1}>
                          {notification.voucherLabel || "Voucher code"}
                        </Text>
                        <Text style={styles.voucherCode} numberOfLines={1}>
                          {notification.voucherCode}
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.cardFooter}>
                      <Text style={styles.cardTime}>{formatDateTimeAmPm(notification.createdAt)}</Text>
                      <Ionicons name="chevron-forward" size={16} color={palette.mutedForeground} />
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
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
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
  title: {
    flex: 1,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "800",
    color: palette.foreground,
  },
  markAllButton: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  markAllText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: palette.foreground,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  feedbackWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    // Bias the centred card upward so it lands on the screen's optical centre rather
    // than the centre of the shorter region left below the header and tab chips.
    paddingBottom: 96,
  },
  skeletonWrap: {
    paddingHorizontal: 18,
    paddingTop: 2,
  },
  skeletonList: {
    gap: 12,
  },
  skeletonChipRow: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 2,
  },
  skeletonChipWide: {
    width: 82,
    height: 36,
    borderRadius: 18,
  },
  skeletonChip: {
    width: 68,
    height: 36,
    borderRadius: 18,
  },
  skeletonChipSmall: {
    width: 58,
    height: 36,
    borderRadius: 18,
  },
  skeletonCard: {
    flexDirection: "row",
    gap: 12,
    borderRadius: 24,
    backgroundColor: palette.surface,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.border,
  },
  skeletonIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  skeletonCopy: {
    flex: 1,
    gap: 8,
  },
  skeletonTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  skeletonTitle: {
    flex: 1,
    height: 16,
    borderRadius: 8,
  },
  skeletonDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  skeletonLine: {
    width: "92%",
    height: 12,
    borderRadius: 6,
  },
  skeletonLineShort: {
    width: "58%",
    height: 12,
    borderRadius: 6,
  },
  skeletonFooter: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  skeletonTime: {
    width: 112,
    height: 12,
    borderRadius: 6,
  },
  skeletonChevron: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  loadingCard: {
    borderRadius: 24,
    backgroundColor: palette.surface,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  list: {
    paddingHorizontal: 18,
  },
  notificationSeparator: {
    height: 12,
  },
  pushContextCard: {
    marginHorizontal: 18,
    marginBottom: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#F8BBD0",
    backgroundColor: "#FFF4F8",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pushContextIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFE3EE",
    alignItems: "center",
    justifyContent: "center",
  },
  pushContextCopy: {
    flex: 1,
    gap: 2,
  },
  pushContextTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  pushContextText: {
    fontSize: 12,
    lineHeight: 17,
    color: palette.mutedForeground,
  },
  pushContextAction: {
    minHeight: 36,
    borderRadius: 18,
    backgroundColor: palette.foreground,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  pushContextActionText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: palette.surface,
  },
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  tabChip: {
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  tabChipActive: {
    borderColor: "#FFC0D4",
    backgroundColor: "#FFF0F6",
  },
  tabText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  tabTextActive: {
    color: palette.secondary,
  },
  footerLoading: {
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    flexDirection: "row",
    gap: 12,
    borderRadius: 24,
    backgroundColor: palette.surface,
    padding: 14,
    borderWidth: 1,
    borderColor: "transparent",
  },
  cardUnread: {
    borderColor: "#F5D0DF",
    backgroundColor: "#FFF9FC",
  },
  cardFocused: {
    borderColor: palette.secondary,
    shadowColor: palette.secondary,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  cardCopy: {
    flex: 1,
    gap: 6,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: palette.foreground,
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: palette.secondary,
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 19,
    color: palette.mutedForeground,
  },
  cardImage: {
    width: "100%",
    height: 132,
    borderRadius: 18,
    backgroundColor: palette.surfaceMuted,
  },
  voucherChip: {
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#FFC0D4",
    backgroundColor: "#FFF0F6",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  voucherLabel: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  voucherCode: {
    maxWidth: 120,
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
    fontWeight: "600",
    color: palette.mutedForeground,
  },
});
