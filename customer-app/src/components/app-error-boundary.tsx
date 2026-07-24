import { Ionicons } from "@expo/vector-icons";
import type { ErrorBoundaryProps } from "expo-router";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Sentry } from "@/src/lib/sentry";
import { palette } from "@/src/theme/palette";

/**
 * App-wide fallback rendered by Expo Router when a screen throws during render. Without this
 * an uncaught render error would leave the user on a blank screen with no way to recover;
 * here they get an on-brand message and a one-tap retry that re-mounts the route subtree.
 */
export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const insets = useSafeAreaInsets();

  // Report the caught render error — Expo Router's boundary shows this fallback but does not
  // send the crash anywhere on its own. No-op when Sentry has no DSN configured.
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.iconWrap}>
        <Ionicons name="warning-outline" size={28} color={palette.secondary} />
      </View>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.subtitle}>
        We hit an unexpected error. Please try again — your cart and account are safe.
      </Text>
      {__DEV__ ? (
        <Text style={styles.debug} numberOfLines={4}>
          {error.message}
        </Text>
      ) : null}
      <Pressable
        style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
        onPress={() => {
          void retry();
        }}
      >
        <Ionicons name="refresh" size={16} color={palette.surface} />
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 12,
    backgroundColor: palette.background,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFE9F0",
    marginBottom: 4,
  },
  title: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "900",
    color: palette.foreground,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    color: palette.mutedForeground,
    textAlign: "center",
  },
  debug: {
    fontSize: 11,
    lineHeight: 15,
    color: palette.placeholder,
    textAlign: "center",
  },
  button: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 999,
    backgroundColor: palette.secondary,
  },
  buttonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "800",
    color: palette.surface,
  },
});
