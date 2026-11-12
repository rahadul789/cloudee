import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useEffect, useMemo, useState } from "react";
import { AppState, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useRiderAppUpdateConfigQuery } from "@/src/hooks/use-rider-api";
import { decideAppUpdate, shouldShowSoftPrompt } from "@/src/lib/app-update";
import { useDeliveryCopy } from "@/src/lib/copy";
import { secureStateStorage } from "@/src/lib/secure-storage";
import { palette } from "@/src/theme/palette";
import { useRiderAuthStore } from "@/src/store/auth-store";

// Rider "update required" gate. Admin → Settings → App update → Rider app decides:
//   installed < minimumVersion → FORCE (blocking, back button disabled)
//   installed < latestVersion  → SOFT (Update / Later; Later hides it for 3 days)
// Uses app.json "version" — bump it every release. Re-checks on app foreground.

const SNOOZE_KEY = "foodbela-rider-app-update-snooze";
const PACKAGE = "com.haqrahadul.deliveryapp";

async function openStore(customUrl?: string) {
  const url = customUrl?.trim();
  try {
    if (url) return await Linking.openURL(url);
    if (Platform.OS === "android") return await Linking.openURL(`market://details?id=${PACKAGE}`);
  } catch {
    // fall through to the web listing
  }
  try {
    await Linking.openURL(url || `https://play.google.com/store/apps/details?id=${PACKAGE}`);
  } catch {
    // nothing else to try
  }
}

export function AppUpdateGate() {
  const signedIn = useRiderAuthStore((state) => Boolean(state.accessToken));
  const configQuery = useRiderAppUpdateConfigQuery(signedIn);
  const config = configQuery.data;
  const currentVersion = Constants.expoConfig?.version ?? null;
  const decision = useMemo(() => decideAppUpdate(currentVersion, config), [config, currentVersion]);
  const [snooze, setSnooze] = useState<{ version?: string; at?: number } | null | undefined>(undefined);
  const { copy } = useDeliveryCopy();
  const t = copy.appUpdate;

  const refetch = configQuery.refetch;
  useEffect(() => {
    if (!signedIn) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refetch();
    });
    return () => sub.remove();
  }, [refetch, signedIn]);

  useEffect(() => {
    let alive = true;
    Promise.resolve(secureStateStorage.getItem(SNOOZE_KEY))
      .then((raw: string | null) => {
        if (alive) setSnooze(raw ? (JSON.parse(raw) as { version?: string; at?: number }) : null);
      })
      .catch(() => alive && setSnooze(null));
    return () => {
      alive = false;
    };
  }, []);

  if (Platform.OS === "web" || decision === "none") return null;
  const force = decision === "force";
  if (!force && (snooze === undefined || !shouldShowSoftPrompt(config?.latestVersion, snooze))) return null;

  const later = () => {
    const next = { version: (config?.latestVersion ?? "").trim(), at: Date.now() };
    setSnooze(next);
    void Promise.resolve(secureStateStorage.setItem(SNOOZE_KEY, JSON.stringify(next))).catch(() => undefined);
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={force ? () => undefined : later}
    >
      <View style={[styles.backdrop, force ? styles.backdropForce : null]}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name={force ? "alert-circle" : "rocket"} size={34} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>{force ? t.forceTitle : t.softTitle}</Text>
          <Text style={styles.message}>{config?.message?.trim() || (force ? t.forceBody : t.softBody)}</Text>
          {config?.latestVersion ? (
            <Text style={styles.version}>
              {currentVersion ? `${t.yourVersion} ${currentVersion} → ` : ""}
              {t.newVersion} {config.latestVersion}
            </Text>
          ) : null}
          <Pressable
            onPress={() => void openStore(config?.storeUrl)}
            style={({ pressed }) => [styles.primary, pressed ? styles.pressed : null]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>{t.update}</Text>
          </Pressable>
          {force ? null : (
            <Pressable onPress={later} style={styles.secondary} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.secondaryText}>{t.later}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(10,10,12,0.6)" },
  backdropForce: { backgroundColor: palette.background },
  card: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    gap: 10,
    padding: 22,
    borderRadius: 26,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  title: { fontSize: 20, fontWeight: "800", color: palette.foreground, textAlign: "center" },
  message: { fontSize: 14.5, lineHeight: 22, color: palette.mutedForeground, textAlign: "center" },
  version: { fontSize: 12.5, fontWeight: "700", color: palette.primary },
  primary: {
    alignSelf: "stretch",
    height: 52,
    marginTop: 6,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primaryStrong,
  },
  pressed: { opacity: 0.9 },
  primaryText: { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },
  secondary: { paddingVertical: 8, paddingHorizontal: 24 },
  secondaryText: { fontSize: 14.5, fontWeight: "600", color: palette.mutedForeground },
});
