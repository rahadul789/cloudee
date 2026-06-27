import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/src/components/screen";
import { useCustomerDiscoveryHomeQuery } from "@/src/hooks/use-customer-api";
import { isTrustedYoutubeUrl } from "@/src/lib/youtube-url";
import { useLocationStore } from "@/src/store/location-store";
import { palette } from "@/src/theme/palette";

const orderSteps = [
  {
    id: "location",
    icon: "location-outline" as const,
    title: "Set your delivery point",
    body: "Choose your area first so restaurants, fees, and delivery time stay accurate.",
  },
  {
    id: "cart",
    icon: "restaurant-outline" as const,
    title: "Pick food and review cart",
    body: "Add items, check notes, apply any voucher, then place the order.",
  },
  {
    id: "track",
    icon: "bicycle-outline" as const,
    title: "Track and get help",
    body: "Open the order for live status. If something feels wrong, contact support from the app.",
  },
];

export default function OrderHelpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const selectedLocation = useLocationStore((state) => state.selectedLocation);
  const homeQuery = useCustomerDiscoveryHomeQuery({
    latitude: selectedLocation?.latitude,
    longitude: selectedLocation?.longitude,
    radiusKm: 8,
  });
  const videoUrl = isTrustedYoutubeUrl(homeQuery.data?.homeCms?.howToOrderGuide?.youtubeUrl)
    ? homeQuery.data?.homeCms?.howToOrderGuide?.youtubeUrl
    : "";

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: 8, paddingBottom: Math.max(insets.bottom, 16) + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable
            style={({ pressed }) => [
              styles.backButton,
              pressed
                ? {
                    transform: [{ scale: 0.97 }, { translateY: 1 }],
                    opacity: 0.92,
                  }
                : null,
            ]}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={20} color={palette.foreground} />
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="receipt-outline" size={26} color="#FFFFFF" />
          </View>
          <Text style={styles.kicker}>Order Help</Text>
          <Text style={styles.title}>How to order on Foodbela</Text>
          <Text style={styles.subtitle}>
            Set location, choose your meal, confirm checkout, then track the order live.
          </Text>

          {videoUrl ? (
            <Pressable
              style={({ pressed }) => [
                styles.videoAction,
                pressed
                  ? {
                      transform: [{ scale: 0.985 }, { translateY: 1 }],
                      opacity: 0.96,
                    }
                  : null,
              ]}
              onPress={() => void Linking.openURL(videoUrl)}
            >
              <View style={styles.videoIcon}>
                <Ionicons name="logo-youtube" size={21} color="#FFFFFF" />
              </View>
              <View style={styles.primaryActionCopy}>
                <Text style={styles.videoActionTitle}>Watch video guide</Text>
                <Text style={styles.videoActionSubtitle}>See the full order flow in one quick guide.</Text>
              </View>
              <Ionicons name="play" size={18} color="#FFFFFF" />
            </Pressable>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.primaryAction,
              pressed
                ? {
                    transform: [{ scale: 0.985 }, { translateY: 1 }],
                    opacity: 0.96,
                  }
                : null,
            ]}
            onPress={() => router.push("/(tabs)/browse")}
          >
            <View style={styles.primaryActionIcon}>
              <Ionicons name="open-outline" size={18} color={palette.foreground} />
            </View>
            <View style={styles.primaryActionCopy}>
              <Text style={styles.primaryActionTitle}>Start ordering</Text>
              <Text style={styles.primaryActionSubtitle}>Browse restaurants near your selected area.</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={palette.foreground} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Simple steps</Text>
          <Text style={styles.sectionSubtitle}>Everything starts from the correct delivery area.</Text>
          <View style={styles.stack}>
            {orderSteps.map((item) => (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardIconWrap}>
                  <Ionicons name={item.icon} size={18} color={palette.foreground} />
                </View>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardText}>{item.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Need support?</Text>
          <Text style={styles.sectionSubtitle}>For order, payment, delivery, or app issues, contact us from support.</Text>
          <View style={styles.tipCard}>
            <Text style={styles.tipText}>
              Share your order ID, a short issue summary, and a photo if an item is wrong or missing.
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.supportAction,
                pressed
                  ? {
                      transform: [{ scale: 0.985 }, { translateY: 1 }],
                      opacity: 0.96,
                    }
                  : null,
              ]}
              onPress={() => router.push("/support")}
            >
              <Ionicons name="headset-outline" size={18} color={palette.surface} />
              <Text style={styles.supportActionText}>Open support</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, gap: 18 },
  topBar: { flexDirection: "row", alignItems: "center" },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    borderRadius: 30,
    backgroundColor: palette.foreground,
    padding: 22,
    gap: 11,
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.secondary,
  },
  kicker: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#FFD8E6",
  },
  title: { fontSize: 28, lineHeight: 34, fontWeight: "800", color: "#FFFFFF" },
  subtitle: { fontSize: 14, lineHeight: 22, color: "rgba(255,255,255,0.78)" },
  primaryAction: {
    padding: 13,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  primaryActionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF0F6",
  },
  primaryActionCopy: { flex: 1, gap: 2 },
  primaryActionTitle: { fontSize: 14, lineHeight: 18, fontWeight: "800", color: palette.foreground },
  primaryActionSubtitle: { fontSize: 12, lineHeight: 17, color: palette.mutedForeground },
  videoAction: {
    marginTop: 4,
    padding: 14,
    borderRadius: 24,
    backgroundColor: palette.secondary,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  videoIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoActionTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  videoActionSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    color: "rgba(255,255,255,0.82)",
  },
  section: { gap: 8 },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: "800", color: palette.foreground },
  sectionSubtitle: { fontSize: 13, lineHeight: 19, color: palette.mutedForeground },
  stack: { gap: 10 },
  card: {
    padding: 14,
    borderRadius: 24,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: "row",
    gap: 12,
  },
  cardIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF0D8",
  },
  cardCopy: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 14, lineHeight: 19, fontWeight: "800", color: palette.foreground },
  cardText: { fontSize: 13, lineHeight: 19, color: palette.mutedForeground },
  tipCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 14,
    gap: 10,
  },
  supportAction: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: palette.foreground,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  supportActionText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
    color: palette.surface,
  },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  tipDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.secondary, marginTop: 6 },
  tipText: { flex: 1, fontSize: 13, lineHeight: 19, color: palette.foreground },
});
