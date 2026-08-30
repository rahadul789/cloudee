import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/src/components/screen";
import {
  type OwnerNotification,
  useMarkAllOwnerNotificationsReadMutation,
  useMarkOwnerNotificationReadMutation,
  useOwnerNotificationsInfiniteQuery,
} from "@/src/hooks/use-owner-api";
import { formatTime } from "@/src/lib/format";
import {
  useOwnerTranslation,
  type TranslationKey,
} from "@/src/i18n/translations";
import { palette } from "@/src/theme/palette";

const allowedPaths = new Set([
  "/(tabs)/today",
  "/(tabs)/orders",
  "/(tabs)/menu",
  "/(tabs)/payouts",
  "/(tabs)/account",
  "/notifications",
]);

function notificationId(notification: OwnerNotification) {
  return notification.id || notification._id;
}

function resolveOwnerPath(path?: string) {
  const value = path?.trim() ?? "";
  if (allowedPaths.has(value)) return value;

  const orderPathMatch = value.match(/^\/orders\/([A-Za-z0-9_-]+)(?:[?#].*)?$/);
  if (orderPathMatch?.[1]) return `/orders/${orderPathMatch[1]}`;

  // Voucher deep-links (e.g. /vouchers?mode=details&voucherId=...) keep their query so the
  // voucher screen opens the right voucher's details.
  if (value.match(/^\/vouchers(?:[?#].*)?$/)) return value;

  const query = value.split("?", 2)[1] ?? "";
  const orderId = query ? new URLSearchParams(query).get("order") || new URLSearchParams(query).get("orderId") : "";
  return orderId ? `/orders/${orderId}` : "/(tabs)/today";
}

function iconFor(type: string) {
  if (type === "order") return "receipt-outline" as const;
  if (type === "payout") return "wallet-outline" as const;
  if (type === "promotion") return "megaphone-outline" as const;
  if (type === "support") return "chatbubble-ellipses-outline" as const;
  return "notifications-outline" as const;
}

// Returns a translation key rather than a label: these helpers live outside the
// component, so they have no access to `t` — the caller translates.
function chipLabelKey(notification: OwnerNotification): TranslationKey {
  const event = notification.eventType?.toLowerCase() ?? "";
  const type = notification.type.toLowerCase();
  if (event.includes("admin") || notification.entityType === "admin_notification")
    return "notif.tag.admin";
  if (event.includes("late") || notification.title.toLowerCase().includes("late"))
    return "notif.tag.late";
  if (type === "order" || event.includes("order")) return "notif.tag.order";
  if (type === "promotion") return "notif.tag.promo";
  if (type === "payout") return "notif.tag.payout";
  if (type === "support") return "notif.tag.support";
  return "notif.tag.system";
}

type NotificationRow =
  | { kind: "date"; id: string; label: string }
  | { kind: "notification"; id: string; notification: OwnerNotification };

function formatDateGroup(
  value: string | null | undefined,
  t: (key: TranslationKey) => string,
) {
  if (!value) return t("notif.today");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("notif.today");
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const dateKey = date.toDateString();
  if (dateKey === today.toDateString()) return t("notif.today");
  if (dateKey === yesterday.toDateString()) return t("notif.yesterday");
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

export default function OwnerNotificationsScreen() {
  const { t } = useOwnerTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const notificationsQuery = useOwnerNotificationsInfiniteQuery(true, 20);
  const markReadMutation = useMarkOwnerNotificationReadMutation();
  const markAllMutation = useMarkAllOwnerNotificationsReadMutation();
  const notifications = useMemo(
    () =>
      notificationsQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [notificationsQuery.data?.pages],
  );
  const notificationRows = useMemo(() => {
    const rows: NotificationRow[] = [];
    let lastDateLabel = "";
    notifications.forEach((notification) => {
      const dateLabel = formatDateGroup(notification.createdAt, t);
      if (dateLabel !== lastDateLabel) {
        rows.push({ kind: "date", id: `date-${dateLabel}`, label: dateLabel });
        lastDateLabel = dateLabel;
      }
      rows.push({
        kind: "notification",
        id: notificationId(notification),
        notification,
      });
    });
    return rows;
  }, [notifications, t]);
  const unreadCount = notificationsQuery.data?.pages[0]?.unreadCount ?? 0;
  const isRefreshing =
    notificationsQuery.isRefetching && !notificationsQuery.isFetchingNextPage;

  async function openNotification(notification: OwnerNotification) {
    if (!notification.isRead) {
      await markReadMutation.mutateAsync(notificationId(notification)).catch(() => undefined);
    }
    router.push(resolveOwnerPath(notification.actionPath) as never);
  }

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={palette.foreground} />
          </Pressable>
          <View style={styles.topCopy}>
            <Text style={styles.eyebrow}>{t("notif.kicker")}</Text>
            <Text style={styles.title}>{t("notif.title")}</Text>
          </View>
          <Pressable
            disabled={!unreadCount || markAllMutation.isPending}
            style={[styles.markButton, !unreadCount ? styles.disabled : null]}
            onPress={() => markAllMutation.mutate()}
          >
            <Text style={styles.markText}>{t("notif.readAll")}</Text>
          </Pressable>
        </View>

        {notificationsQuery.isLoading ? (
          <View style={styles.feedbackWrap}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.feedbackWrap}>
            <Text style={styles.emptyTitle}>{t("notif.emptyTitle")}</Text>
            <Text style={styles.emptyText}>{t("notif.emptyBody")}</Text>
          </View>
        ) : (
          <FlatList
            data={notificationRows}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: Math.max(insets.bottom, 16) + 18 },
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => notificationsQuery.refetch()}
                tintColor={palette.primary}
              />
            }
            onEndReachedThreshold={0.35}
            onEndReached={() => {
              if (
                notificationsQuery.hasNextPage &&
                !notificationsQuery.isFetchingNextPage
              ) {
                void notificationsQuery.fetchNextPage();
              }
            }}
            ListFooterComponent={
              notificationsQuery.isFetchingNextPage ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator size="small" color={palette.primary} />
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              if (item.kind === "date") {
                return <Text style={styles.dateHeader}>{item.label}</Text>;
              }
              const notification = item.notification;
              return (
                <Pressable
                  style={[
                    styles.card,
                    !notification.isRead ? styles.cardUnread : null,
                  ]}
                  onPress={() => openNotification(notification)}
                >
                  <View style={styles.iconWrap}>
                    <Ionicons
                      name={iconFor(notification.type)}
                      size={18}
                      color={palette.primary}
                    />
                  </View>
                  <View style={styles.cardCopy}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {notification.title}
                      </Text>
                      <View style={styles.chip}>
                        <Text style={styles.chipText}>
                          {t(chipLabelKey(notification))}
                        </Text>
                      </View>
                      {!notification.isRead ? (
                        <View style={styles.unreadDot} />
                      ) : null}
                    </View>
                    {notification.description ? (
                      <Text style={styles.cardText} numberOfLines={3}>
                        {notification.description}
                      </Text>
                    ) : null}
                    {notification.imageUrl ? (
                      <Image
                        source={{ uri: notification.imageUrl }}
                        style={styles.cardImage}
                      />
                    ) : null}
                    <View style={styles.cardFooter}>
                      <Text style={styles.cardTime}>
                        {formatTime(notification.createdAt) || t("notif.justNow")}
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={palette.mutedForeground}
                      />
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
    color: palette.primary,
  },
  title: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "900",
    color: palette.foreground,
  },
  markButton: {
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  markText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: palette.foreground,
  },
  disabled: { opacity: 0.45 },
  feedbackWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  emptyTitle: {
    textAlign: "center",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
    color: palette.foreground,
  },
  emptyText: {
    marginTop: 6,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    color: palette.mutedForeground,
  },
  list: {
    paddingHorizontal: 18,
    gap: 12,
  },
  footerLoader: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  dateHeader: {
    marginTop: 4,
    marginBottom: -2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    color: palette.mutedForeground,
    textTransform: "uppercase",
  },
  card: {
    flexDirection: "row",
    gap: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 14,
  },
  cardUnread: {
    borderColor: "#FFC0D4",
    backgroundColor: "#FFF9FC",
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  cardCopy: {
    flex: 1,
    gap: 7,
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
    fontWeight: "900",
    color: palette.foreground,
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: palette.primary,
  },
  chip: {
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
    color: palette.primary,
  },
  cardText: {
    fontSize: 13,
    lineHeight: 19,
    color: palette.mutedForeground,
  },
  cardImage: {
    width: "100%",
    height: 124,
    borderRadius: 16,
    backgroundColor: palette.surfaceMuted,
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
});
