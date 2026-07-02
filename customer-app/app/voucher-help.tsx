import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/src/components/screen";
import { palette } from "@/src/theme/palette";

const voucherIssueCards = [
  {
    id: "minimum",
    icon: "receipt-outline" as const,
    tint: "#FFF0D8",
    title: "Minimum order not reached",
    body: "Some codes only work after your subtotal reaches a required amount. Delivery fee usually does not count toward that rule.",
  },
  {
    id: "restaurant",
    icon: "storefront-outline" as const,
    tint: "#EAFBF4",
    title: "Restaurant not eligible",
    body: "Many deals only work on selected restaurants, categories, or campaign partners.",
  },
  {
    id: "payment",
    icon: "wallet-outline" as const,
    tint: "#E9F1FF",
    title: "Payment method restriction",
    body: "Some vouchers only work with bKash or only with cash on delivery.",
  },
  {
    id: "expiry",
    icon: "time-outline" as const,
    tint: "#FFE7EE",
    title: "Expired or already used",
    body: "Promo codes can expire, pause, or become unavailable after one successful use.",
  },
];

const voucherChecklist = [
  "Check the minimum order amount first",
  "Confirm the restaurant is included in the offer",
  "Use the payment method required by the campaign",
  "Try one voucher only, not multiple discounts together",
];

export default function VoucherHelpScreen() {
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
          <Text style={styles.kicker}>Voucher Help</Text>
          <Text style={styles.title}>
            Offer and voucher rules, made clearer
          </Text>
          <Text style={styles.subtitle}>
            If a deal does not apply, these are the most common reasons and the
            quickest checks to try first.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Why a voucher may not work</Text>
          <Text style={styles.sectionSubtitle}>
            These are the reasons users hit most often.
          </Text>
          <View style={styles.stack}>
            {voucherIssueCards.map((item) => (
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
          <Text style={styles.sectionTitle}>Before you try again</Text>
          <Text style={styles.sectionSubtitle}>
            A quick checklist saves time at cart or checkout.
          </Text>
          <View style={styles.tipCard}>
            {voucherChecklist.map((item) => (
              <View key={item} style={styles.tipRow}>
                <View style={styles.tipDot} />
                <Text style={styles.tipText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Still looks valid?</Text>
          <Text style={styles.sectionSubtitle}>
            Use support if the campaign should still work.
          </Text>
          <View style={styles.ctaRow}>
            <Pressable
              style={styles.secondaryAction}
              onPress={() => router.push("/support-chat")}
            >
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={18}
                color={palette.foreground}
              />
              <Text style={styles.secondaryActionText}>Open live chat</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryAction}
              onPress={() => router.push("/offers")}
            >
              <Ionicons
                name="search-outline"
                size={18}
                color={palette.foreground}
              />
              <Text style={styles.secondaryActionText}>Browse offers</Text>
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
  secondaryAction: {
    flex: 1,
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
});
