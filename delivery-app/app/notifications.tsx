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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  type RiderNotification,
  useMarkAllRiderNotificationsReadMutation,
  useMarkRiderNotificationReadMutation,
  useRiderNotificationsInfiniteQuery,
} from "@/src/hooks/use-rider-api";
import { dedupeById } from "@/src/lib/dedupe";
import { palette } from "@/src/theme/palette";

const allowedPaths = new Set([
  "/(app)/available",
  "/(app)/active",
  "/(app)/map",
  "/(app)/history",
  "/(app)/profile",
  "/notifications",
]);

function resolveRiderPath(path?: string) {
  const value = path?.trim() ?? "";
  if (allowedPaths.has(value)) return value;
  const orderPathMatch = value.match(/^\/orders\/([A-Za-z0-9_-]+)(?:[?#].*)?$/);
  return orderPathMatch?.[1] ? `/orders/${orderPathMatch[1]}` : "/(app)/available";
}

function formatTime(value?: string | null) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function iconFor(type: string) {
  if (type.includes("late")) return "time-outline" as const;
  if (type.includes("order") || type.includes("assignment")) return "receipt-outline" as const;
  if (type === "promotion" || type === "campaign") return "megaphone-outline" as const;
  return "notifications-outline" as const;
}

function chipLabel(notification: RiderNotification) {
  const type = notification.type.toLowerCase();
  const title = notification.title.toLowerCase();
  if (type.includes("late") || title.includes("late")) return "Late";
  if (type.includes("order") || type.includes("assignment")) return "Order";
  if (type === "promotion" || type === "campaign") return "Admin";
  return "System";
}

type NotificationRow =
  | { kind: "date"; id: string; label: string }
  | { kind: "notification"; id: string; notification: RiderNotification };

function formatDateGroup(value?: string | null) {
  if (!value) return "Today";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Today";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const dateKey = date.toDateString();
  if (dateKey === today.toDateString()) return "Today";
  if (dateKey === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

export default function RiderNotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const notificationsQuery = useRiderNotificationsInfiniteQuery(true, 20);
  const markReadMutation = useMarkRiderNotificationReadMutation();
  const markAllMutation = useMarkAllRiderNotificationsReadMutation();
  const notifications = useMemo(
    () =>
      dedupeById(
        notificationsQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [],
      ),
    [notificationsQuery.data?.pages],
  );
  const notificationRows = useMemo(() => {
    const rows: NotificationRow[] = [];
    let lastDateLabel = "";
    notifications.forEach((notification) => {
      const dateLabel = formatDateGroup(notification.createdAt);
      if (dateLabel !== lastDateLabel) {
        rows.push({ kind: "date", id: `date-${dateLabel}`, label: dateLabel });
        lastDateLabel = dateLabel;
      }
      rows.push({
        kind: "notification",
        id: notification.id,
        notification,
      });
    });
    return rows;
  }, [notifications]);
  const unreadCount = notificationsQuery.data?.pages[0]?.unreadCount ?? 0;
  const isRefreshing =
    notificationsQuery.isRefetching && !notificationsQuery.isFetchingNextPage;

  async function openNotification(notification: RiderNotification) {
    if (!notification.isRead) {
      await markReadMutation.mutateAsync(notification.id).catch(() => undefined);
    }
    router.push(resolveRiderPath(notification.path) as never);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={palette.foreground} />
          </Pressable>
          <View style={styles.topCopy}>
            <Text style={styles.eyebrow}>Rider inbox</Text>
            <Text style={styles.title}>Notifications</Text>
          </View>
          <Pressable
            disabled={!unreadCount || markAllMutation.isPending}
            style={[styles.markButton, !unreadCount ? styles.disabled : null]}
            onPress={() => markAllMutation.mutate()}
          >
            <Text style={styles.markText}>Read all</Text>
          </Pressable>
        </View>

        {notificationsQuery.isLoading ? (
          <View style={styles.feedbackWrap}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.feedbackWrap}>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyText}>Assignment alerts and admin messages will appear here.</Text>
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
                          {chipLabel(notification)}
                        </Text>
                      </View>
                      {!notification.isRead ? (
                        <View style={styles.unreadDot} />
                      ) : null}
                    </View>
                    <Text style={styles.cardText} numberOfLines={3}>
                      {notification.description}
                    </Text>
                    {notification.imageUrl ? (
                      <Image
                        source={{ uri: notification.imageUrl }}
                        style={styles.cardImage}
                      />
                    ) : null}
                    <View style={styles.cardFooter}>
                      <Text style={styles.cardTime}>
                        {formatTime(notification.createdAt)}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  container: { flex: 1 },
  topBar: {
    paddingHorizontal: 20,
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
    paddingHorizontal: 20,
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
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: palette.surface,
    padding: 14,
  },
  cardUnread: {
    borderColor: "#FFD0C3",
    backgroundColor: "#FFFDFB",
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
