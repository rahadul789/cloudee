import * as Updates from "expo-updates";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { initialWindowMetrics } from "react-native-safe-area-context";

// Lightweight OTA (EAS Update) prompt.
//
// expo-updates already downloads a runtime-compatible update on launch
// (checkAutomatically defaults to ON_LOAD). This component additionally re-checks when
// the app returns to the foreground, so a long-lived session still picks updates up.
//
// It only ever OFFERS a reload through a dismissible banner — it never force-reloads.
// A customer mid-checkout or a rider mid-delivery must not be interrupted; the update is
// applied only when they choose to, or naturally on the next cold start.
export function OtaUpdateGate() {
  const { isUpdatePending } = Updates.useUpdates();
  // Read the startup safe-area inset directly (no SafeAreaProvider dependency, so this
  // component drops into any app's root regardless of its provider tree).
  const bottomInset = initialWindowMetrics?.insets.bottom ?? 0;
  const [dismissed, setDismissed] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const checkingRef = useRef(false);

  const checkForUpdate = useCallback(async () => {
    // No-op in dev / Expo Go and when a check is already in flight.
    if (__DEV__ || !Updates.isEnabled || checkingRef.current) return;
    checkingRef.current = true;
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        await Updates.fetchUpdateAsync();
      }
    } catch {
      // Offline or transient — expo-updates retries on the next launch anyway.
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void checkForUpdate();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkForUpdate();
    });
    return () => subscription.remove();
  }, [checkForUpdate]);

  // A freshly downloaded update re-opens the prompt even if a previous one was dismissed.
  useEffect(() => {
    if (isUpdatePending) setDismissed(false);
  }, [isUpdatePending]);

  const handleReload = useCallback(async () => {
    setIsReloading(true);
    try {
      await Updates.reloadAsync();
    } catch {
      // Keep the app running if the reload could not start.
      setIsReloading(false);
    }
  }, []);

  if (!isUpdatePending || dismissed) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(bottomInset, 12) + 12 }]}
    >
      <View style={styles.card}>
        <View style={styles.copy}>
          <Text style={styles.title}>Update ready</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            Restart to get the latest improvements.
          </Text>
        </View>
        <Pressable
          style={styles.dismiss}
          onPress={() => setDismissed(true)}
          hitSlop={10}
          disabled={isReloading}
          accessibilityRole="button"
          accessibilityLabel="Dismiss update"
        >
          <Text style={styles.dismissText}>Later</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.reload,
            pressed ? styles.reloadPressed : null,
          ]}
          onPress={handleReload}
          disabled={isReloading}
          accessibilityRole="button"
          accessibilityLabel="Reload to apply update"
        >
          {isReloading ? (
            <ActivityIndicator size="small" color="#1F2430" />
          ) : (
            <Text style={styles.reloadText}>Reload</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
    maxWidth: 520,
    borderRadius: 18,
    backgroundColor: "#1F2430",
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
  },
  subtitle: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  dismiss: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  dismissText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
  },
  reload: {
    minHeight: 38,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  reloadPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  reloadText: {
    color: "#1F2430",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
  },
});
