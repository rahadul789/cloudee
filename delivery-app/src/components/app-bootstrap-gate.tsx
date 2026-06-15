import type { PropsWithChildren } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useDeliveryCopy } from "@/src/lib/copy";
import { useRiderAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";

export function AppBootstrapGate({ children }: PropsWithChildren) {
  const isHydrated = useRiderAuthStore((state: { isHydrated: boolean }) => state.isHydrated);
  const { copy } = useDeliveryCopy();

  if (!isHydrated) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={palette.primaryStrong} />
        <Text style={styles.text}>{copy.bootstrap.text}</Text>
      </View>
    );
  }

  return children;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: palette.background,
  },
  text: {
    fontSize: 14,
    color: palette.mutedForeground,
  },
});
