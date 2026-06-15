import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useNetworkStore } from "@/src/store/network-store";
import { palette } from "@/src/theme/palette";

export function NetworkStatusBanner() {
  const status = useNetworkStore((state) => state.status);
  const message = useNetworkStore((state) => state.message);

  if (status !== "offline") return null;

  const isOffline = true;
  const isServerIssue = false;

  return (
    <SafeAreaView pointerEvents="none" edges={["top"]} style={styles.safeArea}>
      <View
        style={[
          styles.banner,
          isOffline ? styles.offline : isServerIssue ? styles.server : styles.slow,
        ]}
      >
        <Ionicons
          name={
            isOffline
              ? "cloud-offline-outline"
              : isServerIssue
                ? "server-outline"
                : "cellular-outline"
          }
          size={17}
          color={
            isOffline ? palette.danger : isServerIssue ? palette.info : palette.warning
          }
        />
        <Text
          style={[
            styles.text,
            isOffline
              ? styles.offlineText
              : isServerIssue
                ? styles.serverText
                : styles.slowText,
          ]}
        >
          {message}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  },
  banner: {
    marginHorizontal: 14,
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  offline: {
    backgroundColor: palette.dangerSoft,
    borderColor: "#FFC6BE",
  },
  slow: {
    backgroundColor: palette.warningSoft,
    borderColor: "#FAD99B",
  },
  server: {
    backgroundColor: palette.infoSoft,
    borderColor: "#BFD0FF",
  },
  text: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  offlineText: {
    color: palette.danger,
  },
  slowText: {
    color: palette.warning,
  },
  serverText: {
    color: palette.info,
  },
});
