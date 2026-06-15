import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { RiderLocationAccessCard } from "@/src/components/rider-location-access-card";
import {
  useLogoutRiderMutation,
  useRiderOrdersQuery,
  useRiderPerformanceSummaryQuery,
  useRiderProfileQuery,
} from "@/src/hooks/use-rider-api";
import { useDeliveryCopy } from "@/src/lib/copy";
import { useRiderAuthStore, type RiderProfile } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";
import { RiderScreenHeader } from "@/src/components/rider-screen-header";
import { useNetworkStatus } from "@/src/hooks/use-network-status";

export default function ProfileScreen() {
  const router = useRouter();
  const rider = useRiderAuthStore((state: { rider: RiderProfile | null }) => state.rider);
  const logoutMutation = useLogoutRiderMutation();
  const profileQuery = useRiderProfileQuery(Boolean(rider));
  const activeOrdersQuery = useRiderOrdersQuery("active");
  const historyQuery = useRiderOrdersQuery("history");
  const performanceSummaryQuery = useRiderPerformanceSummaryQuery(Boolean(rider));
  const { copy, language, setLanguage } = useDeliveryCopy();
  const isNetworkOnline = useNetworkStatus();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        profileQuery.refetch(),
        activeOrdersQuery.refetch(),
        historyQuery.refetch(),
        performanceSummaryQuery.refetch(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [activeOrdersQuery, historyQuery, performanceSummaryQuery, profileQuery]);

  const handleLogoutPress = useCallback(() => {
    if (logoutMutation.isPending) {
      return;
    }

    Alert.alert("Sign out", "Do you want to sign out from the rider app now?", [
      { text: "Stay here", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => logoutMutation.mutate(),
      },
    ]);
  }, [logoutMutation]);

  if (!rider) {
    return <Redirect href="/sign-in" />;
  }

  const profile = profileQuery.data ?? rider;
  const activeOrders = activeOrdersQuery.data ?? [];
  const historyOrders = historyQuery.data ?? [];
  const performanceSummary = performanceSummaryQuery.data;
  const deliveredOrders = historyOrders.filter((order) => order.status === "Delivered");
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const todayDelivered = deliveredOrders.filter((order) => {
    const updatedAt = new Date(order.updatedAt ?? order.createdAt ?? 0).getTime();
    return updatedAt >= todayStart.getTime() && updatedAt <= now;
  });
  const weeklyDelivered = deliveredOrders.filter((order) => {
    const updatedAt = new Date(order.updatedAt ?? order.createdAt ?? 0).getTime();
    return updatedAt >= weekStart.getTime() && updatedAt <= now;
  });
  const isOnline = profile.isAvailableForAssignments !== false;
  const statusTone = !isNetworkOnline ? "offline" : isOnline ? "online" : "paused";
  const statusLabel = !isNetworkOnline ? copy.common.offline : isOnline ? copy.common.online : "Paused";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void handleRefresh();
            }}
            tintColor={palette.primary}
          />
        }
      >
        <RiderScreenHeader
          icon="bicycle"
          title={profile.fullName}
          subtitle={profile.phone}
          statusTone={statusTone}
          statusLabel={statusLabel}
          rightSlot={<Text style={styles.profileMiniLabel}>{copy.profile.title}</Text>}
        />
        <RiderLocationAccessCard />

        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, styles.summaryPink]}>
            <Text style={styles.summaryLabel}>{copy.profile.today}</Text>
            <Text style={styles.summaryValue}>
              {performanceSummary?.deliveredToday ?? todayDelivered.length}
            </Text>
            <Text style={styles.summaryMeta}>{copy.profile.delivered}</Text>
          </View>
          <View style={[styles.summaryCard, styles.summarySky]}>
            <Text style={styles.summaryLabel}>{copy.profile.last7Days}</Text>
            <Text style={styles.summaryValue}>
              {performanceSummary?.deliveredLast7Days ?? weeklyDelivered.length}
            </Text>
            <Text style={styles.summaryMeta}>{copy.profile.delivered}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{copy.profile.vehicle}</Text>
            <Text style={styles.infoValue}>{profile.vehicleType ?? "cycle"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{copy.profile.riderStatus}</Text>
            <Text style={styles.infoValue}>{statusLabel}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{copy.profile.liveTrip}</Text>
            <Text style={styles.infoValue}>{profile.activeTrackingOrderId || copy.profile.noActiveLiveTrip}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{copy.profile.activeAssignedOrders}</Text>
            <Text style={styles.infoValue}>
              {performanceSummary?.activeAssignedOrders ?? activeOrders.length}
            </Text>
          </View>
        </View>

        <Pressable style={styles.navButton} onPress={() => router.push("/notifications" as never)}>
          <View style={styles.navIconWrap}>
            <Ionicons name="notifications-outline" size={18} color={palette.primary} />
          </View>
          <View style={styles.navCopy}>
            <Text style={styles.navTitle}>Notifications</Text>
            <Text style={styles.navText}>Assignments, admin messages, and delivery alerts</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={palette.mutedForeground} />
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{copy.profile.languageTitle ?? copy.common.language}</Text>
          <View style={styles.languageRow}>
            <Pressable
              style={[styles.languageChip, language === "en" ? styles.languageChipActive : null]}
              onPress={() => setLanguage("en")}
            >
              <Text
                style={[
                  styles.languageChipText,
                  language === "en" ? styles.languageChipTextActive : null,
                ]}
              >
                English
              </Text>
            </Pressable>
            <Pressable
              style={[styles.languageChip, language === "bn" ? styles.languageChipActive : null]}
              onPress={() => setLanguage("bn")}
            >
              <Text
                style={[
                  styles.languageChipText,
                  language === "bn" ? styles.languageChipTextActive : null,
                ]}
              >
                বাংলা
              </Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          style={[styles.logoutButton, logoutMutation.isPending && styles.buttonDisabled]}
          onPress={handleLogoutPress}
          disabled={logoutMutation.isPending}
        >
          {logoutMutation.isPending ? (
              <ActivityIndicator size="small" color={palette.primary} />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={18} color={palette.foreground} />
              <Text style={styles.logoutButtonText}>{copy.common.signOut}</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  container: { padding: 20, gap: 16, paddingBottom: 120 },
  profileMiniLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: palette.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  summaryRow: { flexDirection: "row", gap: 12 },
  summaryCard: {
    flex: 1,
    borderRadius: 18,
    padding: 16,
    gap: 6,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  summaryPink: {},
  summarySky: {},
  summaryLabel: { fontSize: 12, fontWeight: "800", color: palette.mutedForeground, textTransform: "uppercase" },
  summaryValue: { fontSize: 18, fontWeight: "800", color: palette.foreground },
  summaryMeta: { fontSize: 12, color: palette.mutedForeground },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 18,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  navButton: {
    minHeight: 64,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  navIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  navCopy: { flex: 1, gap: 2 },
  navTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: palette.foreground,
  },
  navText: {
    fontSize: 12,
    lineHeight: 17,
    color: palette.mutedForeground,
  },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  infoLabel: { fontSize: 14, color: palette.mutedForeground, flex: 1 },
  infoValue: { fontSize: 14, fontWeight: "700", color: palette.foreground, flex: 1, textAlign: "right" },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: palette.foreground },
  languageRow: { flexDirection: "row", gap: 10 },
  languageChip: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
  },
  languageChipActive: {
    backgroundColor: palette.primarySoft,
    borderColor: "#FFD0C3",
  },
  languageChipText: { fontSize: 14, fontWeight: "700", color: palette.mutedForeground },
  languageChipTextActive: { color: palette.primary },
  logoutButton: {
    minHeight: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  buttonDisabled: { opacity: 0.72 },
  logoutButtonText: { fontSize: 16, fontWeight: "800", color: palette.foreground },
});
