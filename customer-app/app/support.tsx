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

import { Screen } from "@/src/components/screen";
import { resolveCustomerRoute } from "@/src/lib/customer-routes";
import { palette } from "@/src/theme/palette";

const quickTopics = [
  {
    id: "orders",
    title: "Order help",
    subtitle: "Tracking, delays, missing items",
    icon: "receipt-outline" as const,
    route: "/order-help",
    tint: "#FFF1E8",
  },
  {
    id: "payments",
    title: "Payment & refunds",
    subtitle: "bKash, COD, failed payments",
    icon: "wallet-outline" as const,
    route: "/payment-refunds",
    tint: "#EEF5FF",
  },
  {
    id: "vouchers",
    title: "Offers & vouchers",
    subtitle: "Deals, codes, and discounts",
    icon: "pricetag-outline" as const,
    route: "/voucher-help",
    tint: "#FFF7D6",
  },
];

const faqItems = [
  {
    id: "refund",
    question: "How do refunds work?",
    answer:
      "Online payments are reviewed and returned to the original wallet after processing. COD orders do not need a refund step.",
  },
  {
    id: "late",
    question: "What if my order is late?",
    answer:
      "Open the order first to check the latest status. If it has not moved for a while, start a support chat with the order details.",
  },
  {
    id: "wrong-item",
    question: "Wrong or missing item?",
    answer:
      "Send the issue in chat with a quick photo if possible. It helps support review the order clearly.",
  },
];

export default function SupportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const openEmailSupport = () => {
    const subject = encodeURIComponent("Customer support request");
    const body = encodeURIComponent(
      "Hi Foodbela support,\n\nI need help with an order / delivery / payment issue.\n\nOrder details:\nIssue summary:\n",
    );
    void Linking.openURL(
      `mailto:support@foodbela.app?subject=${subject}&body=${body}`,
    );
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: 8, paddingBottom: Math.max(insets.bottom, 36) + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable style={styles.iconButton} onPress={() => router.back()}>
            <Ionicons
              name="chevron-back"
              size={20}
              color={palette.foreground}
            />
          </Pressable>
          <Text style={styles.topTitle}>Help center</Text>
          <Pressable
            style={styles.iconButton}
            onPress={() => router.push("/support-chat")}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={18}
              color={palette.foreground}
            />
          </Pressable>
        </View>

        <View style={styles.assistPanel}>
          <View style={styles.assistIcon}>
            <Ionicons
              name="headset-outline"
              size={24}
              color={palette.secondary}
            />
          </View>
          <Text style={styles.assistTitle}>Get support faster</Text>
          <Text style={styles.assistText}>
            Choose chat for live order issues, or email when you want to share
            longer details.
          </Text>

          <View style={styles.contactRow}>
            <Pressable
              style={styles.primaryContact}
              onPress={() => router.push("/support-chat")}
            >
              <Ionicons name="chatbubble-outline" size={17} color="#fff" />
              <Text style={styles.primaryContactText}>Chat now</Text>
            </Pressable>
            <Pressable style={styles.secondaryContact} onPress={openEmailSupport}>
              <Ionicons
                name="mail-outline"
                size={17}
                color={palette.foreground}
              />
              <Text style={styles.secondaryContactText}>Email</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick help</Text>
          <View style={styles.list}>
            {quickTopics.map((topic, index) => (
              <Pressable
                key={topic.id}
                style={[
                  styles.topicRow,
                  index === quickTopics.length - 1 ? styles.topicRowLast : null,
                ]}
                onPress={() =>
                  router.push(resolveCustomerRoute(topic.route, "/support") as never)
                }
              >
                <View
                  style={[styles.topicIcon, { backgroundColor: topic.tint }]}
                >
                  <Ionicons
                    name={topic.icon}
                    size={18}
                    color={palette.foreground}
                  />
                </View>
                <View style={styles.topicCopy}>
                  <Text style={styles.topicTitle}>{topic.title}</Text>
                  <Text style={styles.topicSubtitle}>{topic.subtitle}</Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={palette.mutedForeground}
                />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Common questions</Text>
          <View style={styles.faqList}>
            {faqItems.map((item) => (
              <View key={item.id} style={styles.faqItem}>
                <Text style={styles.faqQuestion}>{item.question}</Text>
                <Text style={styles.faqAnswer}>{item.answer}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 18,
    gap: 18,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
    color: palette.foreground,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  assistPanel: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 20,
    gap: 12,
    shadowColor: palette.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  assistIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFE7F1",
  },
  assistTitle: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "900",
    color: palette.foreground,
  },
  assistText: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "500",
    color: palette.mutedForeground,
  },
  contactRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  primaryContact: {
    flex: 1,
    minHeight: 50,
    borderRadius: 20,
    backgroundColor: palette.secondary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryContactText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: "#fff",
  },
  secondaryContact: {
    minWidth: 104,
    minHeight: 50,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.background,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
  },
  secondaryContactText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
    color: palette.foreground,
  },
  list: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    overflow: "hidden",
  },
  topicRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  topicRowLast: {
    borderBottomWidth: 0,
  },
  topicIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  topicCopy: {
    flex: 1,
    gap: 2,
  },
  topicTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
    color: palette.foreground,
  },
  topicSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  faqList: {
    gap: 10,
  },
  faqItem: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 15,
    gap: 6,
  },
  faqQuestion: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
    color: palette.foreground,
  },
  faqAnswer: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "500",
    color: palette.mutedForeground,
  },
});
