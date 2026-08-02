import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressableScale } from "@/src/components/pressable-scale";
import { Screen } from "@/src/components/screen";
import { palette } from "@/src/theme/palette";

const paymentIssueCards = [
  {
    id: "failed",
    icon: "close-circle-outline" as const,
    tint: "#FFE7EE",
    title: "Payment failed",
    body: "Check your network and balance first, then try one more time. Repeated taps can create confusion around duplicate attempts.",
  },
  {
    id: "charged",
    icon: "alert-circle-outline" as const,
    tint: "#FFF0D8",
    title: "Charged but order not confirmed",
    body: "Wait a short moment and refresh your orders. If the order still does not appear, contact support with the transaction details.",
  },
  {
    id: "pending",
    icon: "time-outline" as const,
    tint: "#EAF2FF",
    title: "bKash still pending",
    body: "Sometimes wallet confirmation takes a little time to reflect. If it stays pending for too long, share the transaction ID with support.",
  },
  {
    id: "cod",
    icon: "cash-outline" as const,
    tint: "#EAFBF4",
    title: "Cash on delivery unavailable",
    body: "COD may not show for some restaurants, offers, or delivery zones. In that case, use the available payment method for checkout.",
  },
];

const refundChecklist = [
  "Refunds usually go back to the original payment method",
  "Cancelled orders before handoff are the clearest refund case",
  "COD orders do not need a refund because nothing was charged yet",
  "Wrong or missing item reviews may need a quick photo",
  "bKash refunds can take a little time depending on the provider",
];

export default function PaymentRefundsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons
              name="chevron-back"
              size={20}
              color={palette.foreground}
            />
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroGlowPrimary} />
          <View style={styles.heroGlowSecondary} />
          <Text style={styles.kicker}>Payment Help</Text>
          <Text style={styles.title}>
            Payment and refund help, without the stress
          </Text>
          <Text style={styles.subtitle}>
            Failed payments, pending bKash, COD limits, and refund timing all
            stay easier to understand here.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Common payment issues</Text>
          <Text style={styles.sectionSubtitle}>
            These are the questions users ask most often.
          </Text>
          <View style={styles.stack}>
            {paymentIssueCards.map((item) => (
              <View key={item.id} style={styles.card}>
                <View
                  style={[styles.cardIconWrap, { backgroundColor: item.tint }]}
                >
                  <Ionicons
                    name={item.icon}
                    size={18}
                    color={palette.foreground}
                  />
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
          <Text style={styles.sectionTitle}>Refund basics</Text>
          <Text style={styles.sectionSubtitle}>
            What usually happens when money has to come back.
          </Text>
          <View style={styles.tipCard}>
            {refundChecklist.map((item) => (
              <View key={item} style={styles.tipRow}>
                <View style={styles.tipDot} />
                <Text style={styles.tipText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Need written support?</Text>
          <Text style={styles.sectionSubtitle}>
            Use chat for speed or email when you want a clear trail.
          </Text>
          <View style={styles.ctaRow}>
            <PressableScale
              scaleTo={0.96}
              containerStyle={styles.ctaButton}
              style={[styles.secondaryAction, styles.primaryAction]}
              onPress={() => router.push("/support-chat")}
            >
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={18}
                color={palette.surface}
              />
              <Text style={[styles.secondaryActionText, styles.primaryActionText]}>
                Open live chat
              </Text>
            </PressableScale>
            <PressableScale
              scaleTo={0.96}
              containerStyle={styles.ctaButton}
              style={styles.secondaryAction}
              onPress={() => {
                const subject = encodeURIComponent("Payment or refund support");
                const body = encodeURIComponent(
                  "Hi support team,\n\nI need help with a payment or refund issue.\n\nOrder ID:\nPayment method:\nTransaction ID (if any):\nIssue summary:\n",
                );
                void Linking.openURL(
                  `mailto:support@foodbela.com?subject=${subject}&body=${body}`,
                );
              }}
            >
              <Ionicons
                name="mail-outline"
                size={18}
                color={palette.foreground}
              />
              <Text style={styles.secondaryActionText}>Email support</Text>
            </PressableScale>
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
    overflow: "hidden",
    borderRadius: 30,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 22,
    gap: 10,
  },
  heroGlowPrimary: {
    position: "absolute",
    top: -50,
    right: -18,
    width: 138,
    height: 138,
    borderRadius: 69,
    backgroundColor: "#FFE7F1",
  },
  heroGlowSecondary: {
    position: "absolute",
    bottom: -52,
    left: -36,
    width: 122,
    height: 122,
    borderRadius: 61,
    backgroundColor: "#FFF0C8",
  },
  kicker: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: palette.secondary,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    color: palette.foreground,
  },
  subtitle: { fontSize: 14, lineHeight: 22, color: palette.mutedForeground },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    color: palette.foreground,
  },
  sectionSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: palette.mutedForeground,
  },
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
  },
  cardCopy: { flex: 1, gap: 4 },
  cardTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
    color: palette.foreground,
  },
  cardText: { fontSize: 13, lineHeight: 19, color: palette.mutedForeground },
  tipCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 14,
    gap: 10,
  },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  tipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.secondary,
    marginTop: 6,
  },
  tipText: { flex: 1, fontSize: 13, lineHeight: 19, color: palette.foreground },
  ctaRow: { flexDirection: "row", gap: 10 },
  ctaButton: { flex: 1 },
  secondaryAction: {
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 10,
  },
  secondaryActionText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.foreground,
  },
  primaryAction: {
    borderColor: palette.secondary,
    backgroundColor: palette.secondary,
  },
  primaryActionText: {
    color: palette.surface,
  },
});
