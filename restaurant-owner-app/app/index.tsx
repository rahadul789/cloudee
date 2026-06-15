import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useOwnerAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";

export default function Index() {
  const isHydrated = useOwnerAuthStore((state) => state.isHydrated);
  const accessToken = useOwnerAuthStore((state) => state.accessToken);

  if (!isHydrated) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={palette.primary} />
      </View>
    );
  }

  return <Redirect href={(accessToken ? "/(tabs)/today" : "/sign-in") as never} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.background,
  },
});
