import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { palette } from "@/src/theme/palette";

type Props = {
  title?: string;
  description?: string;
  onRetry: () => void;
  /** Show a spinner in the button while a retry is in flight. */
  retrying?: boolean;
};

/**
 * The one shared "this failed — try again" state, so every list/detail screen surfaces
 * load errors the same way (matching EmptyStateCard's card shell) instead of a blank or
 * a misleading "nothing here" message. Pass the query's `refetch` as `onRetry`.
 */
export function ErrorRetryCard({
  title = "Something went wrong",
  description = "We couldn't load this right now. Check your connection and try again.",
  onRetry,
  retrying = false,
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name="alert-circle-outline" size={26} color={palette.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <Pressable
        style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
        onPress={onRetry}
        disabled={retrying}
      >
        {retrying ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons name="refresh-outline" size={15} color="#fff" />
            <Text style={styles.buttonText}>Try again</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 38,
    backgroundColor: palette.surface,
    padding: 28,
    alignItems: "center",
    gap: 10,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  title: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "800",
    color: palette.foreground,
    textAlign: "center",
  },
  description: {
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "500",
    color: palette.mutedForeground,
    textAlign: "center",
  },
  button: {
    marginTop: 6,
    minHeight: 48,
    minWidth: 150,
    borderRadius: 999,
    backgroundColor: palette.primaryStrong,
    paddingHorizontal: 22,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
});
