import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { useEffect, useMemo, useState } from "react";
import { AppState, Image, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useAppUpdateConfigQuery } from "@/src/hooks/use-customer-api";
import { decideAppUpdate, shouldShowSoftPrompt } from "@/src/lib/app-update";
import { palette } from "@/src/theme/palette";

// "Update required" gate. Admin → Settings → App update decides:
//   installed < minimumVersion → FORCE: full-screen, can't be dismissed (back button too)
//   installed < latestVersion  → SOFT: "Update" / "Later" (Later hides it for 3 days)
// Re-checks when the app returns to the foreground, so a force flip reaches open apps too.

const SNOOZE_KEY = "foodbela.app-update.snooze";
const PACKAGE = "com.foodbela.app";
const PLAY_MARKET = `market://details?id=${PACKAGE}`;
const PLAY_WEB = `https://play.google.com/store/apps/details?id=${PACKAGE}`;
const bela = require("../../assets/mascot_signin.png");

async function openStore(customUrl?: string) {
  const url = customUrl?.trim();
  try {
    if (url) return await Linking.openURL(url);
    if (Platform.OS === "android") return await Linking.openURL(PLAY_MARKET);
  } catch {
    // no Play Store app (rare) → web listing below
  }
  try {
    await Linking.openURL(url || PLAY_WEB);
  } catch {
    // nothing else we can do
  }
}

export function AppUpdateGate() {
  const configQuery = useAppUpdateConfigQuery();
  const config = configQuery.data;
  const currentVersion = Application.nativeApplicationVersion;
  const decision = useMemo(() => decideAppUpdate(currentVersion, config), [config, currentVersion]);
  const [snooze, setSnooze] = useState<{ version?: string; at?: number } | null | undefined>(undefined);

  // Refresh the rule whenever the app comes back to the foreground.
  const refetch = configQuery.refetch;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refetch();
    });
    return () => sub.remove();
  }, [refetch]);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(SNOOZE_KEY)
      .then((raw) => {
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
    void AsyncStorage.setItem(SNOOZE_KEY, JSON.stringify(next)).catch(() => undefined);
  };

  const message =
    config?.message?.trim() ||
    (force
      ? "এই ভার্সনটি আর চালু নেই। অর্ডার চালিয়ে যেতে অ্যাপটি আপডেট করুন।"
      : "নতুন ফিচার আর আরও দ্রুত অভিজ্ঞতার জন্য অ্যাপটি আপডেট করুন।");

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      // Force: back button does nothing. Soft: back = Later.
      onRequestClose={force ? () => undefined : later}
    >
      <View style={[styles.backdrop, force ? styles.backdropForce : null]}>
        <View style={styles.card}>
          <Image source={bela} style={styles.bela} resizeMode="contain" />
          <Text style={styles.title}>{force ? "আপডেট করা প্রয়োজন" : "নতুন আপডেট এসেছে 🎉"}</Text>
          <Text style={styles.message}>{message}</Text>
          {config?.latestVersion ? (
            <Text style={styles.version}>
              {currentVersion ? `আপনার ভার্সন ${currentVersion} → ` : ""}নতুন {config.latestVersion}
            </Text>
          ) : null}
          <Pressable
            onPress={() => void openStore(config?.storeUrl)}
            style={({ pressed }) => [styles.primary, pressed ? styles.pressed : null]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>আপডেট করুন</Text>
          </Pressable>
          {force ? null : (
            <Pressable onPress={later} style={styles.secondary} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.secondaryText}>পরে</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(10,10,12,0.6)",
  },
  backdropForce: { backgroundColor: palette.background },
  card: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 16,
    borderRadius: 28,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E4E7",
  },
  bela: { width: 120, height: 120 },
  title: { fontSize: 20, fontWeight: "700", color: palette.foreground, textAlign: "center" },
  message: { fontSize: 14.5, lineHeight: 22, color: palette.mutedForeground, textAlign: "center" },
  version: { fontSize: 12.5, color: palette.secondary, fontWeight: "700" },
  primary: {
    alignSelf: "stretch",
    height: 52,
    marginTop: 6,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  pressed: { opacity: 0.9 },
  primaryText: { fontSize: 16, fontWeight: "700", color: palette.onPrimary },
  secondary: { paddingVertical: 8, paddingHorizontal: 24 },
  secondaryText: { fontSize: 14.5, fontWeight: "500", color: palette.mutedForeground },
});
