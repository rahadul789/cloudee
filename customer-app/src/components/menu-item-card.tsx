import { Pressable, StyleSheet, Text, View } from "react-native";

import { RemoteImage } from "@/src/components/remote-image";
import { palette } from "@/src/theme/palette";

type Props = {
  name: string;
  description?: string;
  imageUrl?: string | null;
  priceLabel: string;
  isPopular?: boolean;
  onPress: () => void;
};

export function MenuItemCard({
  name,
  description,
  imageUrl,
  priceLabel,
  isPopular,
  onPress,
}: Props) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.copy}>
        {isPopular ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Popular</Text>
          </View>
        ) : null}
        <Text style={styles.name}>{name}</Text>
        {description ? (
          <Text numberOfLines={2} style={styles.description}>
            {description}
          </Text>
        ) : null}
        <Text style={styles.price}>{priceLabel}</Text>
      </View>
      <RemoteImage
        uri={imageUrl}
        style={styles.image}
        fallbackIcon="fast-food-outline"
        targetWidth={92}
        accessibilityLabel={`${name} food photo`}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 14,
    borderRadius: 24,
    backgroundColor: palette.surface,
    padding: 14,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  copy: {
    flex: 1,
    gap: 6,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: palette.primary,
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
    color: palette.foreground,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    color: palette.mutedForeground,
  },
  price: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.foreground,
  },
  image: {
    width: 92,
    height: 92,
    borderRadius: 18,
    backgroundColor: palette.primarySoft,
  },
});
