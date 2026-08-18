import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  useRiderProfileQuery,
  useUpdateRiderAvailabilityMutation,
} from "@/src/hooks/use-rider-api";
import { useDeliveryCopy } from "@/src/lib/copy";
import { useRiderAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";

const WIDTH = Math.min(Dimensions.get("window").width * 0.82, 340);

type NavItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
};

// The rider's navigation drawer — replaces the bottom tabs. Online/offline toggle sits at
// the top; below it the former tabs are plain menu rows that route to their screen.
export function RiderSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { copy } = useDeliveryCopy();
  const rider = useRiderAuthStore((state) => state.rider);
  const profileQuery = useRiderProfileQuery();
  const availabilityMutation = useUpdateRiderAvailabilityMutation();
  const isOnline =
    (profileQuery.data?.isAvailableForAssignments ??
      rider?.isAvailableForAssignments) !== false;

  const translateX = useRef(new Animated.Value(-WIDTH)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: open ? 0 : -WIDTH,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(backdrop, {
        toValue: open ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [open, translateX, backdrop]);

  if (!open) return null;

  const navItems: NavItem[] = [
    { label: copy.tabs.home, icon: "home-outline", route: "/(app)/map" },
    { label: copy.tabs.myRides, icon: "stats-chart-outline", route: "/(app)/history" },
    { label: copy.tabs.account, icon: "person-circle-outline", route: "/(app)/profile" },
    { label: copy.tabs.notifications ?? "Notifications", icon: "notifications-outline", route: "/notifications" },
  ];

  function go(route: string) {
    onClose();
    router.push(route as never);
  }

  const name = rider?.fullName || "Rider";
  const phone = rider?.phone || "";
  const initials =
    name
      .split(" ")
      .map((part) => part.trim().charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase() || "RD";

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          { width: WIDTH, paddingTop: insets.top + 16, transform: [{ translateX }] },
        ]}
      >
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.profileText}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {phone ? (
              <Text style={styles.phone} numberOfLines={1}>
                {phone}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Online / offline toggle at the top of the drawer. */}
        <Pressable
          style={styles.toggleRow}
          disabled={availabilityMutation.isPending}
          onPress={() =>
            availabilityMutation.mutate(!isOnline, {
              onError: (error) =>
                Alert.alert(
                  "Couldn't update status",
                  error instanceof Error ? error.message : "Please try again.",
                ),
            })
          }
        >
          <View
            style={[
              styles.toggleIcon,
              { backgroundColor: isOnline ? palette.success : palette.mutedForeground },
            ]}
          >
            <Ionicons name="power" size={18} color="#FFFFFF" />
          </View>
          <View style={styles.toggleTextBlock}>
            <Text style={styles.toggleTitle}>
              {isOnline ? copy.common.online : copy.common.offline}
            </Text>
            <Text style={styles.toggleHint}>
              {isOnline ? "Receiving new orders" : "Not receiving orders"}
            </Text>
          </View>
          {availabilityMutation.isPending ? (
            <ActivityIndicator size="small" color={palette.secondary} />
          ) : (
            <View style={[styles.switch, isOnline && styles.switchOn]}>
              <View style={[styles.knob, isOnline && styles.knobOn]} />
            </View>
          )}
        </Pressable>

        <View style={styles.navList}>
          {navItems.map((item) => (
            <Pressable
              key={item.route}
              style={({ pressed }) => [styles.navItem, pressed && styles.navItemPressed]}
              onPress={() => go(item.route)}
            >
              <Ionicons name={item.icon} size={21} color={palette.foreground} />
              <Text style={styles.navLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={17} color={palette.mutedForeground} />
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.35)" },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingBottom: 24,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 24,
    shadowOffset: { width: 8, height: 0 },
    elevation: 24,
    gap: 16,
  },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: palette.foreground,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  profileText: { flex: 1, minWidth: 0 },
  name: { fontSize: 17, fontWeight: "900", color: palette.foreground },
  phone: { marginTop: 2, fontSize: 13, fontWeight: "700", color: palette.mutedForeground },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 12,
  },
  toggleIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleTextBlock: { flex: 1, minWidth: 0 },
  toggleTitle: { fontSize: 15, fontWeight: "900", color: palette.foreground },
  toggleHint: { marginTop: 1, fontSize: 12, fontWeight: "700", color: palette.mutedForeground },
  switch: {
    width: 46,
    height: 28,
    borderRadius: 999,
    backgroundColor: palette.border,
    padding: 3,
    justifyContent: "center",
  },
  switchOn: { backgroundColor: palette.success },
  knob: { width: 22, height: 22, borderRadius: 999, backgroundColor: "#FFFFFF" },
  knobOn: { alignSelf: "flex-end" },
  navList: { gap: 6, marginTop: 4 },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  navItemPressed: { backgroundColor: palette.surfaceMuted },
  navLabel: { flex: 1, fontSize: 15, fontWeight: "800", color: palette.foreground },
});
