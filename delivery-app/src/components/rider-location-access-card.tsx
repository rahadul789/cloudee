import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";

import { useUpdateRiderProfileLocationMutation } from "@/src/hooks/use-rider-api";
import {
  getBestAvailableRiderLocationPayload,
  getRiderForegroundPermission,
  openRiderLocationSettings,
  requestRiderBackgroundPermission,
  requestRiderForegroundPermission,
} from "@/src/lib/rider-location-permissions";
import { palette } from "@/src/theme/palette";

export function RiderLocationAccessCard() {
  const updateLocationMutation = useUpdateRiderProfileLocationMutation();
  const [permission, setPermission] =
    useState<Location.LocationPermissionResponse | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [backgroundPermission, setBackgroundPermission] = useState<Location.PermissionResponse | null>(null);

  const refreshPermission = useCallback(async () => {
    const nextPermission = await getRiderForegroundPermission().catch(
      () => null,
    );
    setPermission(nextPermission);
    if (Platform.OS !== "web") {
      setBackgroundPermission(await Location.getBackgroundPermissionsAsync().catch(() => null));
    }
  }, []);

  useEffect(() => {
    void refreshPermission();
  }, [refreshPermission]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refreshPermission();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [refreshPermission]);

  const handleAllowLocation = useCallback(async () => {
    setIsRequesting(true);
    try {
      const nextPermission = await requestRiderForegroundPermission();
      setPermission(nextPermission);

      if (nextPermission.status !== "granted") {
        return;
      }

      const background = await requestRiderBackgroundPermission().catch(() => null);
      setBackgroundPermission(background);

      const payload = await getBestAvailableRiderLocationPayload();
      await updateLocationMutation.mutateAsync(payload);
    } catch {
      await refreshPermission();
    } finally {
      setIsRequesting(false);
    }
  }, [refreshPermission, updateLocationMutation]);

  const needsPrecise = Platform.OS === "android" && permission?.status === "granted" && permission.android?.accuracy === "coarse";
  const needsBackground = Platform.OS !== "web" && permission?.status === "granted" && backgroundPermission?.status !== "granted";
  if (permission?.status === "granted" && !needsBackground && !needsPrecise) {
    return null;
  }

  const shouldShowSettings =
    (permission?.status === "denied" && permission.canAskAgain === false) ||
    (needsBackground && backgroundPermission?.canAskAgain === false);
  const isBusy = isRequesting || updateLocationMutation.isPending;

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name="navigate-outline" size={18} color={palette.primary} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{needsPrecise ? "Precise location needed" : needsBackground ? "Background location needed" : "Location access needed"}</Text>
        <Text style={styles.text}>
          {needsPrecise ? "Turn on Use precise location in the app location settings for accurate rider tracking." : needsBackground
            ? "Allow location all the time so customers can track you when the screen is locked."
            : "Go online and pick up orders with accurate live tracking."}
        </Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          style={[styles.primaryButton, isBusy ? styles.buttonDisabled : null]}
          onPress={needsPrecise ? () => { void openRiderLocationSettings(); } : handleAllowLocation}
          disabled={isBusy}
        >
          {isBusy ? (
            <ActivityIndicator size="small" color={palette.surface} />
          ) : (
            <Text style={styles.primaryButtonText}>{needsPrecise ? "Settings" : "Allow"}</Text>
          )}
        </Pressable>
        {shouldShowSettings ? (
          <Pressable
            style={styles.ghostButton}
            onPress={() => {
              void openRiderLocationSettings();
            }}
          >
            <Text style={styles.ghostButtonText}>Settings</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 76,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: "#FFF8F5",
    borderWidth: 1,
    borderColor: "#F9D8CF",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  text: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  actions: {
    alignItems: "flex-end",
    gap: 6,
  },
  primaryButton: {
    minWidth: 70,
    minHeight: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
    paddingHorizontal: 12,
  },
  buttonDisabled: {
    opacity: 0.68,
  },
  primaryButtonText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: palette.surface,
  },
  ghostButton: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  ghostButtonText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    color: palette.primary,
  },
});
