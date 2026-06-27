import { PropsWithChildren } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAppStartup } from "@/src/hooks/use-app-startup";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";

export function AppBootstrapGate({ children }: PropsWithChildren) {
  // Kicks off location permission + GPS in the background (does not block render).
  useAppStartup();
  // Gate ONLY on auth hydration (a few ms reading AsyncStorage) — matching the
  // owner app. Location hydrates in the background; the home screen already
  // handles a not-yet-set location gracefully, so there is no need to hold the
  // app behind a long branded "setting up" screen.
  const isAuthHydrated = useCustomerAuthStore((state) => state.isHydrated);

  if (!isAuthHydrated) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={palette.secondary} />
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
    backgroundColor: palette.background,
  },
});
