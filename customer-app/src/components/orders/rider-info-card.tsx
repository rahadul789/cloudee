import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { palette } from "@/src/theme/palette";

function vehicleLabel(type?: string) {
  const value = (type ?? "").trim().toLowerCase();
  if (!value) return "Bicycle";
  if (/motor|bike|scooter/.test(value) && !/bicycle|cycle$/.test(value)) return "Motorbike";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function riderStatusLine(status: string) {
  switch (status) {
    case "PickedUp":
      return "On the way to you";
    case "Delivered":
      return "Delivered your order";
    case "ReadyForPickup":
      return "Picking up your order";
    default:
      return "Will pick up your order";
  }
}

// Delivery-partner card on the tracking screen: initials avatar, name, vehicle, the phone
// (only when admin allows it — see riderPhoneVisible) and a big call button. Before a rider
// is assigned it shows a calm "finding a rider" placeholder instead.
export function RiderInfoCard({
  assigned,
  name,
  phone,
  vehicleType,
  status,
  onCall,
  onChat,
  unreadCount = 0,
}: {
  assigned: boolean;
  name?: string;
  phone?: string;
  vehicleType?: string;
  status: string;
  onCall: () => void;
  /** Opens the rider ↔ customer chat (shown while a rider is assigned). */
  onChat?: () => void;
  unreadCount?: number;
}) {
  if (!assigned) {
    return (
      <View style={styles.card}>
        <View style={[styles.avatar, styles.avatarPending]}>
          <Ionicons name="bicycle" size={22} color={palette.mutedForeground} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>Delivery partner</Text>
          <Text style={styles.name}>Assigning a rider…</Text>
          <Text style={styles.meta}>We&apos;ll show their details here</Text>
        </View>
      </View>
    );
  }

  const displayName = name?.trim() || "Your rider";
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "R";
  const canCall = Boolean(phone) && status !== "Delivered";

  return (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Text style={styles.initials}>{initials}</Text>
        <View style={styles.vehicleBadge}>
          <Ionicons name="bicycle" size={11} color={palette.onPrimary} />
        </View>
      </View>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>{riderStatusLine(status)}</Text>
        <Text style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[vehicleLabel(vehicleType), phone].filter(Boolean).join("  ·  ")}
        </Text>
      </View>
      {onChat ? (
        <Pressable
          onPress={onChat}
          hitSlop={6}
          style={({ pressed }) => [styles.chat, pressed ? styles.callPressed : null]}
          accessibilityRole="button"
          accessibilityLabel={
            unreadCount > 0
              ? `Chat with ${displayName}, ${unreadCount} unread`
              : `Chat with ${displayName}`
          }
        >
          <Ionicons name="chatbubble-ellipses" size={19} color={palette.secondary} />
          {unreadCount > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}
      {canCall ? (
        <Pressable
          onPress={onCall}
          hitSlop={6}
          style={({ pressed }) => [styles.call, pressed ? styles.callPressed : null]}
          accessibilityRole="button"
          accessibilityLabel={`Call ${displayName}`}
        >
          <Ionicons name="call" size={19} color={palette.onPrimary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6E6E6",
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF1DC",
  },
  avatarPending: { backgroundColor: palette.surfaceMuted },
  initials: { fontSize: 18, lineHeight: 22, fontWeight: "700", color: palette.secondary },
  vehicleBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
    borderWidth: 2,
    borderColor: palette.surface,
  },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: "500", color: palette.secondary },
  name: { fontSize: 16.5, lineHeight: 22, fontWeight: "700", color: palette.foreground },
  meta: { fontSize: 12.5, lineHeight: 17, fontWeight: "400", color: palette.mutedForeground },
  call: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  callPressed: { opacity: 0.85, transform: [{ scale: 0.95 }] },
  chat: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: palette.primary,
    backgroundColor: "#FFF8EC",
  },
  unreadBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5484D",
    borderWidth: 2,
    borderColor: palette.surface,
  },
  unreadText: { fontSize: 10, lineHeight: 12, fontWeight: "700", color: "#FFFFFF" },
});
