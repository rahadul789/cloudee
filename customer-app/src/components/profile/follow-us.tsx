import { Ionicons } from "@expo/vector-icons";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { useCustomerSocialLinksQuery, type SocialNetwork } from "@/src/hooks/use-customer-api";
import { trackCustomerEvent } from "@/src/lib/analytics";
import { palette } from "@/src/theme/palette";

const NETWORKS: Record<SocialNetwork, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  facebook: { label: "Facebook", icon: "logo-facebook", color: "#1877F2" },
  instagram: { label: "Instagram", icon: "logo-instagram", color: "#E1306C" },
  youtube: { label: "YouTube", icon: "logo-youtube", color: "#FF0000" },
  tiktok: { label: "TikTok", icon: "logo-tiktok", color: "#111111" },
};

// "Follow us" on the Account tab — only the networks the admin enabled with a link
// (admin Settings → Support → Social media). Renders nothing when none are set.
export function FollowUs() {
  const linksQuery = useCustomerSocialLinksQuery();
  const links = linksQuery.data ?? [];
  if (!links.length) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Follow Foodbela</Text>
      <Text style={styles.caption}>Be the first to see new offers, videos and fun updates</Text>
      <View style={styles.row}>
        {links.map(({ network, url }) => {
          const meta = NETWORKS[network];
          return (
            <Pressable
              key={network}
              onPress={() => {
                void trackCustomerEvent({
                  eventType: "custom",
                  path: "/(tabs)/profile",
                  screenName: "profile",
                  metadata: { action: "social_open", network },
                });
                void Linking.openURL(url).catch(() => undefined);
              }}
              style={({ pressed }) => [styles.item, pressed ? styles.pressed : null]}
              accessibilityRole="link"
              accessibilityLabel={`Foodbela on ${meta.label}`}
            >
              <View style={[styles.icon, { backgroundColor: meta.color }]}>
                <Ionicons name={meta.icon} size={22} color="#FFFFFF" />
              </View>
              <Text style={styles.label}>{meta.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 4,
    padding: 16,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E4E7",
  },
  title: { fontSize: 15.5, fontWeight: "700", color: palette.foreground },
  caption: { fontSize: 12.5, color: palette.mutedForeground },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 18, marginTop: 10 },
  item: { alignItems: "center", gap: 6 },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 12, fontWeight: "500", color: palette.foreground },
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
});
