import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";

import { useDeliveryCopy } from "@/src/lib/copy";
import {
  openRiderLocationSettings,
  requestRiderBackgroundPermission,
} from "@/src/lib/rider-location-permissions";
import { secureStateStorage } from "@/src/lib/secure-storage";
import { palette } from "@/src/theme/palette";

const BATTERY_TIP_DISMISSED_KEY = "foodbela-rider-battery-tip-dismissed";

// Surfaces the two things that silently break live tracking once the phone is locked
// after pickup — the OS pipeline itself is sound (see rider-background-location.ts), the
// failures are (1) background location not set to "Allow all the time" and (2) OEM battery
// optimization killing the foreground service. We can't deep-link reliably to the wildly
// varied OEM battery/autostart screens, so we open app settings and spell out the steps.
export function RiderTrackingHealthCard() {
  const { copy } = useDeliveryCopy();
  const t = copy.trackingHealth;

  const [foregroundGranted, setForegroundGranted] = useState<boolean | null>(
    null,
  );
  const [backgroundGranted, setBackgroundGranted] = useState<boolean | null>(
    null,
  );
  const [isRequesting, setIsRequesting] = useState(false);
  // Default true = hidden until we've loaded the stored flag, so the tip never flashes.
  const [batteryTipDismissed, setBatteryTipDismissed] = useState(true);

  const refreshPermissions = useCallback(async () => {
    const [foreground, background] = await Promise.all([
      Location.getForegroundPermissionsAsync().catch(() => null),
      Location.getBackgroundPermissionsAsync().catch(() => null),
    ]);
    setForegroundGranted(
      foreground ? foreground.status === "granted" : false,
    );
    setBackgroundGranted(
      background ? background.status === "granted" : false,
    );
  }, []);

  useEffect(() => {
    void refreshPermissions();
    void (async () => {
      try {
        const value = await secureStateStorage.getItem(BATTERY_TIP_DISMISSED_KEY);
        setBatteryTipDismissed(value === "1");
      } catch {
        setBatteryTipDismissed(false);
      }
    })();
  }, [refreshPermissions]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshPermissions();
    });
    return () => subscription.remove();
  }, [refreshPermissions]);

  const handleAllowAlways = useCallback(async () => {
    setIsRequesting(true);
    try {
      const response = await requestRiderBackgroundPermission();
      if (response?.status === "granted") {
        setBackgroundGranted(true);
        return;
      }
      // Android won't re-prompt once dismissed — send the rider to app settings where
      // they can pick "Allow all the time" manually.
      await openRiderLocationSettings();
    } catch {
      await refreshPermissions();
    } finally {
      setIsRequesting(false);
    }
  }, [refreshPermissions]);

  const handleDismissBattery = useCallback(() => {
    setBatteryTipDismissed(true);
    void Promise.resolve(
      secureStateStorage.setItem(BATTERY_TIP_DISMISSED_KEY, "1"),
    ).catch(() => undefined);
  }, []);

  // The foreground-permission card (RiderLocationAccessCard) owns that state; stay silent
  // until foreground is granted so the two cards never stack.
  if (!foregroundGranted) return null;

  const needsAlways = backgroundGranted === false;
  const showBatteryTip = backgroundGranted === true && !batteryTipDismissed;

  if (!needsAlways && !showBatteryTip) return null;

  return (
    <View style={[styles.card, needsAlways ? styles.cardWarn : styles.cardTip]}>
      {needsAlways ? (
        <View style={styles.section}>
          <View style={styles.headingRow}>
            <Ionicons
              name="navigate-circle"
              size={18}
              color={palette.danger}
            />
            <Text style={styles.title}>{t.alwaysTitle}</Text>
          </View>
          <Text style={styles.body}>{t.alwaysBody}</Text>
          <Pressable
            style={[styles.primaryButton, isRequesting ? styles.disabled : null]}
            onPress={handleAllowAlways}
            disabled={isRequesting}
          >
            <Text style={styles.primaryButtonText}>{t.alwaysAction}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.headingRow}>
          <Ionicons name="battery-charging" size={18} color={palette.warning} />
          <Text style={styles.title}>{t.batteryTitle}</Text>
        </View>
        <Text style={styles.body}>{t.batteryBody}</Text>
        <View style={styles.actionRow}>
          <Pressable
            style={styles.ghostButton}
            onPress={() => {
              void openRiderLocationSettings();
            }}
          >
            <Ionicons name="settings-outline" size={14} color={palette.primary} />
            <Text style={styles.ghostButtonText}>{t.batteryAction}</Text>
          </Pressable>
          {showBatteryTip && !needsAlways ? (
            <Pressable style={styles.dismissButton} onPress={handleDismissBattery}>
              <Text style={styles.dismissText}>{t.dismiss}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    gap: 12,
  },
  cardWarn: {
    backgroundColor: "#FEF3F3",
    borderColor: "#F6C2C2",
  },
  cardTip: {
    backgroundColor: "#FFF8F0",
    borderColor: "#F5DCA9",
  },
  section: { gap: 6 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  body: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  primaryButton: {
    alignSelf: "flex-start",
    minHeight: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.danger,
    paddingHorizontal: 16,
    marginTop: 2,
  },
  disabled: { opacity: 0.68 },
  primaryButtonText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: palette.surface,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  ghostButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
  },
  ghostButtonText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: palette.primary,
  },
  dismissButton: { paddingHorizontal: 8, paddingVertical: 4 },
  dismissText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
});
