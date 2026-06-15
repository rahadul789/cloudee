import { Ionicons } from "@expo/vector-icons";
import { useCallback } from "react";
import { ActivityIndicator, Alert, StyleSheet, Switch, Text, View } from "react-native";

import {
  useRiderOrdersQuery,
  useRiderPerformanceSummaryQuery,
  useRiderProfileQuery,
  useUpdateRiderAvailabilityMutation,
  useUpdateRiderProfileLocationMutation,
} from "@/src/hooks/use-rider-api";
import { useDeliveryCopy } from "@/src/lib/copy";
import {
  getBestAvailableRiderLocationPayload,
  openRiderLocationSettings,
  requestRiderBackgroundPermission,
  requestRiderForegroundPermission,
} from "@/src/lib/rider-location-permissions";
import { useNetworkStatus } from "@/src/hooks/use-network-status";
import { useRiderAuthStore, type RiderProfile } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";

export function RiderAvailabilityCard() {
  const rider = useRiderAuthStore((state: { rider: RiderProfile | null }) => state.rider);
  const { copy } = useDeliveryCopy();
  const isNetworkOnline = useNetworkStatus();
  const profileQuery = useRiderProfileQuery(Boolean(rider));
  const activeOrdersQuery = useRiderOrdersQuery("active");
  const performanceSummaryQuery = useRiderPerformanceSummaryQuery(Boolean(rider));
  const availabilityMutation = useUpdateRiderAvailabilityMutation();
  const locationMutation = useUpdateRiderProfileLocationMutation();
  const profile = profileQuery.data ?? rider;
  const activeOrders = activeOrdersQuery.data ?? [];
  const isOnline = profile?.isAvailableForAssignments !== false;
  const statusLabel = !isNetworkOnline ? copy.common.offline : isOnline ? copy.common.online : "Paused";
  const isBusy = availabilityMutation.isPending || locationMutation.isPending;
  const hasActiveAssignedOrders =
    (performanceSummaryQuery.data?.activeAssignedOrders ?? activeOrders.length) > 0 ||
    Boolean(profile?.activeTrackingOrderId);

  const handleAvailabilityToggle = useCallback(
    async (nextOnlineState: boolean) => {
      if (!isNetworkOnline) {
        Alert.alert(copy.common.offline, "Reconnect before updating rider availability.");
        return;
      }

      try {
        if (nextOnlineState) {
          const permission = await requestRiderForegroundPermission();
          if (permission.status !== "granted") {
            Alert.alert(copy.profile.locationPermissionTitle, copy.profile.locationPermissionText, [
              { text: "Not now", style: "cancel" },
              {
                text: "Settings",
                onPress: () => {
                  void openRiderLocationSettings();
                },
              },
            ]);
            return;
          }

          const locationPayload = await getBestAvailableRiderLocationPayload();
          void requestRiderBackgroundPermission().catch(() => undefined);
          await locationMutation.mutateAsync(locationPayload);
          await availabilityMutation.mutateAsync(true);
          void profileQuery.refetch();
          return;
        }

        await availabilityMutation.mutateAsync(false);
        void profileQuery.refetch();
      } catch (error) {
        Alert.alert(
          copy.profile.statusUpdateFailed,
          error instanceof Error ? error.message : copy.profile.statusUpdateFailedText
        );
      }
    },
    [availabilityMutation, copy, isNetworkOnline, locationMutation, profileQuery]
  );

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name={isOnline ? "radio" : "pause-circle"} size={18} color={palette.secondary} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{copy.profile.toggleTitle}</Text>
        <Text style={styles.subtitle}>
          {!isNetworkOnline
            ? "Reconnect before changing your rider status."
            : isOnline
              ? "You are visible for new pickup assignments."
              : copy.profile.toggleHint}
        </Text>
        {hasActiveAssignedOrders ? <Text style={styles.warning}>{copy.profile.toggleWarning}</Text> : null}
      </View>
      <View style={styles.statusBlock}>
        <View style={[styles.statusPill, isOnline ? styles.statusPillOnline : styles.statusPillPaused]}>
          <Text style={[styles.statusText, isOnline ? styles.statusTextOnline : styles.statusTextPaused]}>
            {statusLabel}
          </Text>
        </View>
        {isBusy ? (
          <ActivityIndicator size="small" color={palette.secondary} />
        ) : (
          <Switch
            value={isOnline}
            onValueChange={handleAvailabilityToggle}
            disabled={!isNetworkOnline || isBusy}
            trackColor={{ false: "#E2D5C8", true: "#FFD7E8" }}
            thumbColor={isOnline ? palette.secondary : palette.foreground}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 92,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFD7E8",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  title: {
    color: palette.foreground,
    fontSize: 15,
    fontWeight: "900",
  },
  subtitle: {
    color: palette.mutedForeground,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  warning: {
    color: palette.warningText,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  statusBlock: {
    alignItems: "flex-end",
    gap: 7,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  statusPillOnline: {
    backgroundColor: palette.successSurface,
    borderColor: "#BFE6D1",
  },
  statusPillPaused: {
    backgroundColor: palette.warningSurface,
    borderColor: "#F2D5A8",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "900",
  },
  statusTextOnline: {
    color: palette.successText,
  },
  statusTextPaused: {
    color: palette.warningText,
  },
});
