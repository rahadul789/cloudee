import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useOwnerNotificationsQuery } from "@/src/hooks/use-owner-api";
import { useOwnerTranslation } from "@/src/i18n/translations";
import { useNetworkStore } from "@/src/store/network-store";
import { palette } from "@/src/theme/palette";

function signalLevel(status: "online" | "slow" | "offline" | "server") {
  if (status === "online") return 4;
  if (status === "slow") return 2;
  if (status === "server") return 1;
  return 0;
}

function signalColor(status: "online" | "slow" | "offline" | "server") {
  if (status === "online") return palette.success;
  if (status === "slow") return palette.warning;
  if (status === "server") return palette.info;
  return palette.mutedForeground;
}

export function OwnerNetworkSignalBars() {
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

export function OwnerHeaderActions() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { t } = useOwnerTranslation();
  const notificationsQuery = useOwnerNotificationsQuery(isFocused);
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;

  return (
    <View style={styles.actions}>
      <OwnerNetworkSignalBars />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("header.notifications")}
        hitSlop={8}
        style={styles.notificationButton}
        onPress={() => router.push("/notifications" as never)}
      >
        <Ionicons
          name="notifications-outline"
          size={19}
          color="#FFFFFF"
        />
        {unreadCount > 0 ? (
          <View style={styles.notificationBadge}>
            <Text style={styles.notificationBadgeText}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  signalWrap: {
    width: 32,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(31, 36, 48, 0.07)",
    backgroundColor: "rgba(255,255,255,0.88)",
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
    backgroundColor: palette.foreground,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "rgba(31, 36, 48, 0.22)",
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
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
