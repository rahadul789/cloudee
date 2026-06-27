import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/src/components/screen";
import { palette } from "@/src/theme/palette";

const privacyItems = [
  {
    id: "location",
    title: "Delivery location",
    body: "Used to show nearby restaurants, calculate distance, and guide delivery.",
    icon: "location-outline" as const,
    tint: "#FFF1E8",
  },
  {
    id: "orders",
    title: "Order details",
    body: "Used for checkout, live tracking, receipts, refunds, and order history.",
    icon: "receipt-outline" as const,
    tint: "#EEF5FF",
  },
  {
    id: "account",
    title: "Account profile",
    body: "Your phone number and name help with sign in, support, and delivery contact.",
    icon: "person-outline" as const,
    tint: "#FFF7D6",
  },
];

const controlItems = [
  "You can update your name from Personal info.",
  "You can update your delivery point from Profile.",
  "You can ask support for account or privacy help any time.",
];

export default function PrivacyPolicyScreen() {
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
          <Pressable
            style={({ pressed }) => [
              styles.iconButton,
              pressed
                ? {
                    transform: [{ scale: 0.97 }, { translateY: 1 }],
                    opacity: 0.92,
                  }
                : null,
            ]}
            onPress={() => router.back()}
          >
            <Ionicons
              name="chevron-back"
              size={20}
              color={palette.foreground}
            />
          </Pressable>
          <Text style={styles.topTitle}>Privacy policy</Text>
          <View style={styles.iconButtonGhost} />
        </View>

        <View style={styles.headerPanel}>
          <View style={styles.headerIcon}>
            <Ionicons
              name="shield-checkmark-outline"
              size={25}
              color={palette.secondary}
            />
          </View>
          <Text style={styles.title}>Your data stays purposeful</Text>
          <Text style={styles.subtitle}>
            Foodbela uses only the details needed to run ordering, delivery,
            support, and account safety.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Information we use</Text>
          <View style={styles.list}>
            {privacyItems.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.infoRow,
                  index === privacyItems.length - 1 ? styles.infoRowLast : null,
                ]}
              >
                <View style={[styles.rowIcon, { backgroundColor: item.tint }]}>
                  <Ionicons
                    name={item.icon}
                    size={18}
                    color={palette.foreground}
                  />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowBody}>{item.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your control</Text>
          <View style={styles.controlPanel}>
            {controlItems.map((item) => (
              <View key={item} style={styles.controlRow}>
                <View style={styles.checkIcon}>
                  <Ionicons name="checkmark" size={14} color="#fff" />
                </View>
                <Text style={styles.controlText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.actionPanel}>
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle}>Need privacy help?</Text>
            <Text style={styles.actionText}>
              Support can help with account changes, delivery point, and
              privacy questions.
            </Text>
          </View>
          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed
                  ? {
                      transform: [{ scale: 0.985 }, { translateY: 1 }],
                      opacity: 0.96,
                    }
                  : null,
              ]}
              onPress={() => router.push("/support")}
            >
              <Text style={styles.primaryButtonText}>Support</Text>
            </Pressable>
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
  iconButtonGhost: {
    width: 42,
    height: 42,
  },
  headerPanel: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 20,
    gap: 12,
    shadowColor: palette.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFE7F1",
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "900",
    color: palette.foreground,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "500",
    color: palette.mutedForeground,
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
  infoRow: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
    color: palette.foreground,
  },
  rowBody: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "500",
    color: palette.mutedForeground,
  },
  controlPanel: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 15,
    gap: 12,
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  checkIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.mint,
    marginTop: 1,
  },
  controlText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
    color: palette.foreground,
  },
  actionPanel: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#FFF1E8",
    padding: 16,
    gap: 14,
  },
  actionCopy: {
    gap: 4,
  },
  actionTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
    color: palette.foreground,
  },
  actionText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "500",
    color: palette.mutedForeground,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 18,
    backgroundColor: palette.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: "#fff",
  },
});
