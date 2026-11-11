import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyStateCard } from "@/src/components/empty-state-card";
import { Screen } from "@/src/components/screen";
import { AppHeader } from "@/src/components/ui";
import { YoutubePlayer } from "@/src/components/youtube-player";
import { parseYoutubeId } from "@/src/lib/youtube-url";
import { palette } from "@/src/theme/palette";

const STEPS: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }[] = [
  { icon: "location", title: "Set your location", text: "Pick where the food should come." },
  { icon: "restaurant", title: "Choose a restaurant", text: "Add what you like to the cart." },
  { icon: "card", title: "Checkout", text: "Pay cash on delivery or with bKash." },
  { icon: "bicycle", title: "Track live", text: "Watch your rider on the map." },
];

// "How to order" guide played inside the app (same YouTube player as the Hype videos),
// with the steps under it and a button to start ordering right away.
export default function GuideVideoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ url?: string; title?: string; subtitle?: string }>();
  const youtubeId = parseYoutubeId(params.url);
  const title = params.title?.trim() || "How to order on Foodbela";

  return (
    <Screen>
      <AppHeader title={title} subtitle={params.subtitle?.trim() || "A quick walkthrough"} />
      <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 96 }}>
        {youtubeId ? (
          <YoutubePlayer youtubeId={youtubeId} />
        ) : (
          <View style={styles.pad}>
            <EmptyStateCard
              title="Video not available"
              description="This guide video can't be played right now."
              icon="videocam-off-outline"
              mascot={false}
            />
          </View>
        )}
        <View style={styles.steps}>
          <Text style={styles.stepsTitle}>4 easy steps</Text>
          {STEPS.map((step, index) => (
            <View key={step.title} style={styles.step}>
              <View style={styles.stepIcon}>
                <Ionicons name={step.icon} size={17} color={palette.onPrimary} />
              </View>
              <View style={styles.stepCopy}>
                <Text style={styles.stepTitle}>
                  {index + 1}. {step.title}
                </Text>
                <Text style={styles.stepText}>{step.text}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={[styles.ctaBar, { bottom: Math.max(insets.bottom, 12) + 8 }]}>
        <Pressable
          style={({ pressed }) => [styles.cta, pressed ? styles.pressed : null]}
          onPress={() => router.replace("/(tabs)")}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>Start ordering</Text>
          <Ionicons name="arrow-forward" size={18} color={palette.onPrimary} />
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16 },
  steps: {
    margin: 16,
    padding: 16,
    gap: 14,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E4E7",
  },
  stepsTitle: { fontSize: 16, fontWeight: "700", color: palette.foreground },
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  stepCopy: { flex: 1, gap: 1 },
  stepTitle: { fontSize: 14.5, fontWeight: "700", color: palette.foreground },
  stepText: { fontSize: 12.5, color: palette.mutedForeground },
  ctaBar: { position: "absolute", left: 16, right: 16 },
  cta: {
    height: 56,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.primary,
    shadowColor: "#000000",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  ctaText: { fontSize: 16, fontWeight: "700", color: palette.onPrimary },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
});
