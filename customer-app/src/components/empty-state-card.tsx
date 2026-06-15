import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { palette } from "@/src/theme/palette";

type Props = {
  title: string;
  description: string;
  actionLabel?: string;
  onPress?: () => void;
};

export function EmptyStateCard({
  title,
  description,
  actionLabel,
  onPress,
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name="storefront-outline" size={24} color={palette.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel && onPress ? (
        <Pressable style={styles.button} onPress={onPress}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
      {/* <Text style={styles.supportingText}>
        We’ll keep this screen clean until there’s something meaningful to show.
      </Text> */}
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
    borderRadius: 999,
    backgroundColor: palette.primaryStrong,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  supportingText: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: palette.placeholder,
    textAlign: "center",
  },
});
