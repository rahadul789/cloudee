import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { useRiderNotificationsQuery } from "@/src/hooks/use-rider-api";
import { useNetworkStore } from "@/src/store/network-store";
import { palette } from "@/src/theme/palette";

type RiderScreenHeaderProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  statusTone?: "online" | "offline" | "paused";
  statusLabel?: string;
  rightSlot?: ReactNode;
  // When set, the left icon becomes a menu button that opens the rider sidebar.
  onMenuPress?: () => void;
};

function signalLevel(status: "online" | "slow" | "offline" | "server") {
  if (status === "online") return 4;
  if (status === "slow") return 2;
  if (status === "server") return 1;
  return 0;
}

function signalColor(status: "online" | "slow" | "offline" | "server") {
  if (status === "online") return palette.success;
  if (status === "slow") return palette.warningText;
  if (status === "server") return palette.info;
  return palette.mutedForeground;
}

function RiderNetworkSignalBars() {
  const status = useNetworkStore((state) => state.status);
  const level = signalLevel(status);
  const color = signalColor(status);

  return (
    <View style={styles.signalWrap} accessibilityLabel={`Network ${status}`}>
      {[1, 2, 3, 4].map((bar) => (
        <View
          key={bar}
          style={[
            styles.signalBar,
            { height: 5 + bar * 3 },
            bar <= level ? { backgroundColor: color } : styles.signalBarIdle,
          ]}
        />
      ))}
    </View>
  );
}

function RiderNotificationButton() {
  const router = useRouter();
  const notificationsQuery = useRiderNotificationsQuery();
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open notifications"
      hitSlop={8}
      style={styles.notificationButton}
      onPress={() => router.push("/notifications" as never)}
    >
      <Ionicons name="notifications-outline" color={palette.foreground} size={19} />
      {unreadCount > 0 ? (
        <View style={styles.notificationBadge}>
          <Text style={styles.notificationBadgeText}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function RiderScreenHeader({
  icon,
  title,
  subtitle,
  statusTone = "online",
  statusLabel = statusTone === "online" ? "Online" : statusTone === "paused" ? "Paused" : "Offline",
  rightSlot,
  onMenuPress,
}: RiderScreenHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {onMenuPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open menu"
            hitSlop={8}
            style={styles.iconShell}
            onPress={onMenuPress}
          >
            <Ionicons name="menu" size={20} color={palette.foreground} />
          </Pressable>
        ) : (
          <View style={styles.iconShell}>
            <Ionicons name={icon} size={18} color={palette.primaryStrong} />
          </View>
        )}
        <View style={styles.copyWrap}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <View
              style={[
                styles.statusPill,
                statusTone === "online"
                  ? styles.statusPillOnline
                  : statusTone === "paused"
                    ? styles.statusPillPaused
                    : styles.statusPillOffline,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  statusTone === "online"
                    ? styles.statusTextOnline
                    : statusTone === "paused"
                      ? styles.statusTextPaused
                      : styles.statusTextOffline,
                ]}
              >
                {statusLabel}
              </Text>
            </View>
          </View>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>

      <View style={styles.right}>
        {rightSlot}
        <RiderNetworkSignalBars />
        <RiderNotificationButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 66,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconShell: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
  },
  copyWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: palette.foreground,
    flexShrink: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: palette.mutedForeground,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  statusPillOnline: {
    backgroundColor: palette.successSoft,
    borderColor: "#BFE6D1",
  },
  statusPillOffline: {
    backgroundColor: palette.surfaceMuted,
    borderColor: palette.border,
  },
  statusPillPaused: {
    backgroundColor: palette.warningSoft,
    borderColor: "#F2D5A8",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
  },
  statusTextOnline: {
    color: palette.successText,
  },
  statusTextOffline: {
    color: palette.mutedForeground,
  },
  statusTextPaused: {
    color: palette.warning,
  },
  signalWrap: {
    width: 32,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(31, 36, 48, 0.08)",
    backgroundColor: "rgba(255,255,255,0.78)",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 2,
    paddingBottom: 7,
  },
  signalBar: {
    width: 3,
    borderRadius: 999,
  },
  signalBarIdle: {
    backgroundColor: "rgba(31, 36, 48, 0.16)",
  },
  notificationButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(31, 36, 48, 0.08)",
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  notificationBadge: {
    position: "absolute",
    top: -3,
    right: -4,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  notificationBadgeText: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "900",
    color: "#fff",
  },
});
