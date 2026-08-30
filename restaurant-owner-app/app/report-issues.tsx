import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Screen } from "@/src/components/screen";
import {
  useCreateOwnerSupportCaseMutation,
  useOwnerSupportCasesQuery,
  type OwnerSupportCase,
} from "@/src/hooks/use-owner-api";
import { useOwnerTranslation } from "@/src/i18n/translations";
import { palette } from "@/src/theme/palette";

const CATEGORIES: { id: string; bn: string; en: string }[] = [
  { id: "orders", bn: "অর্ডার", en: "Orders" },
  { id: "payouts", bn: "পেআউট", en: "Payouts" },
  { id: "menu", bn: "মেনু", en: "Menu" },
  { id: "account", bn: "অ্যাকাউন্ট", en: "Account" },
  { id: "technical", bn: "টেকনিক্যাল", en: "Technical" },
  { id: "other", bn: "অন্যান্য", en: "Other" },
];

function statusStyle(status: OwnerSupportCase["status"]) {
  switch (status) {
    case "resolved":
      return { bg: "#DCFCE7", fg: "#15803D", bn: "সমাধান হয়েছে", en: "Resolved" };
    case "closed":
      return { bg: "#F1F5F9", fg: "#475569", bn: "বন্ধ", en: "Closed" };
    case "in_progress":
      return { bg: "#DBEAFE", fg: "#1D4ED8", bn: "চলমান", en: "In progress" };
    default:
      return { bg: "#FEF3C7", fg: "#B45309", bn: "খোলা", en: "Open" };
  }
}

export default function ReportIssuesScreen() {
  const { language } = useOwnerTranslation();
  const router = useRouter();
  const bn = language === "bn";
  const casesQuery = useOwnerSupportCasesQuery();
  const createMutation = useCreateOwnerSupportCaseMutation();

  const [subject, setSubject] = useState("");
  const [categoryId, setCategoryId] = useState("orders");
  const [message, setMessage] = useState("");

  const cases = casesQuery.data?.items ?? [];
  const canSubmit = subject.trim().length >= 3 && message.trim().length >= 10;

  async function submit() {
    if (!canSubmit || createMutation.isPending) return;
    try {
      await createMutation.mutateAsync({
        kind: "report",
        subject: subject.trim(),
        categoryId,
        message: message.trim(),
      });
      setSubject("");
      setMessage("");
      setCategoryId("orders");
      Alert.alert(
        bn ? "রিপোর্ট পাঠানো হয়েছে" : "Report sent",
        bn
          ? "আমরা শিগগিরই দেখব। নিচে স্ট্যাটাস দেখতে পারবেন।"
          : "We'll review it soon. You can track the status below.",
      );
    } catch (error) {
      Alert.alert(
        bn ? "পাঠানো যায়নি" : "Could not send",
        error instanceof Error
          ? error.message
          : bn
            ? "আবার চেষ্টা করুন।"
            : "Please try again.",
      );
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 18 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={21} color={palette.foreground} />
          </Pressable>
          <Text style={styles.title}>
            {bn ? "সমস্যা রিপোর্ট" : "Report issues"}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="help-buoy-outline" size={24} color="#FFFFFF" />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>
              {bn ? "কোনো সমস্যা?" : "Facing an issue?"}
            </Text>
            <Text style={styles.heroText}>
              {bn
                ? "নিচে বিস্তারিত লিখুন — আমাদের টিম দেখে জবাব দেবে।"
                : "Describe it below — our team will review and reply."}
            </Text>
          </View>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.label}>{bn ? "বিষয়" : "Subject"}</Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder={bn ? "সমস্যার সংক্ষিপ্ত শিরোনাম" : "Short summary"}
            placeholderTextColor={palette.mutedForeground}
            style={styles.input}
          />

          <Text style={styles.label}>{bn ? "ধরন" : "Category"}</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((cat) => {
              const active = cat.id === categoryId;
              return (
                <Pressable
                  key={cat.id}
                  accessibilityRole="button"
                  onPress={() => setCategoryId(cat.id)}
                  style={[styles.chip, active ? styles.chipActive : null]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      active ? styles.chipTextActive : null,
                    ]}
                  >
                    {bn ? cat.bn : cat.en}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>{bn ? "বিস্তারিত" : "Details"}</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder={
              bn
                ? "সমস্যাটি পরিষ্কার করে লিখুন (অর্ডার নম্বর/তারিখ থাকলে দিন)।"
                : "Describe the issue clearly (add order no. / date if relevant)."
            }
            placeholderTextColor={palette.mutedForeground}
            style={[styles.input, styles.textArea]}
            multiline
            textAlignVertical="top"
          />

          <Pressable
            accessibilityRole="button"
            disabled={!canSubmit || createMutation.isPending}
            onPress={submit}
            style={[
              styles.submitButton,
              !canSubmit || createMutation.isPending
                ? styles.submitDisabled
                : null,
            ]}
          >
            {createMutation.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>
                {bn ? "রিপোর্ট পাঠান" : "Send report"}
              </Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>
          {bn ? "আগের রিপোর্ট" : "Your reports"}
        </Text>
        {casesQuery.isLoading ? (
          <ActivityIndicator
            size="small"
            color={palette.primary}
            style={{ marginTop: 12 }}
          />
        ) : cases.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons
              name="chatbubbles-outline"
              size={24}
              color={palette.mutedForeground}
            />
            <Text style={styles.emptyText}>
              {bn ? "এখনো কোনো রিপোর্ট নেই।" : "No reports yet."}
            </Text>
          </View>
        ) : (
          <View style={styles.caseStack}>
            {cases.map((item) => {
              const s = statusStyle(item.status);
              const latestReply = item.replies?.[item.replies.length - 1];
              return (
                <View key={item._id} style={styles.caseCard}>
                  <View style={styles.caseTop}>
                    <Text numberOfLines={1} style={styles.caseSubject}>
                      {item.subject}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                      <Text style={[styles.statusText, { color: s.fg }]}>
                        {bn ? s.bn : s.en}
                      </Text>
                    </View>
                  </View>
                  <Text numberOfLines={2} style={styles.caseMessage}>
                    {item.message}
                  </Text>
                  {latestReply ? (
                    <View style={styles.replyCard}>
                      <Text style={styles.replyLabel}>
                        {bn ? "টিমের জবাব" : "Team reply"}
                      </Text>
                      <Text style={styles.replyText}>{latestReply.message}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { paddingBottom: 140, paddingHorizontal: 20, paddingTop: 8, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  title: { flex: 1, fontSize: 18, fontWeight: "900", color: palette.foreground },
  headerSpacer: { width: 38 },
  heroCard: {
    flexDirection: "row",
    gap: 12,
    borderRadius: 20,
    backgroundColor: palette.primarySoft,
    padding: 16,
    alignItems: "center",
  },
  heroIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCopy: { flex: 1, gap: 3 },
  heroTitle: { fontSize: 15, fontWeight: "800", color: palette.foreground },
  heroText: { fontSize: 12.5, lineHeight: 18, color: palette.mutedForeground },
  formCard: {
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 10,
  },
  label: { fontSize: 12.5, fontWeight: "800", color: palette.foreground, marginTop: 4 },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.background,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: palette.foreground,
  },
  textArea: { minHeight: 110 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.background,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  chipText: { fontSize: 13, fontWeight: "700", color: palette.foreground },
  chipTextActive: { color: "#FFFFFF" },
  submitButton: {
    marginTop: 6,
    borderRadius: 16,
    backgroundColor: palette.primary,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { fontSize: 15, fontWeight: "900", color: "#FFFFFF" },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: palette.foreground,
    marginTop: 6,
  },
  emptyCard: {
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  emptyText: { fontSize: 13, color: palette.mutedForeground },
  caseStack: { gap: 10 },
  caseCard: {
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    gap: 6,
  },
  caseTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  caseSubject: { flex: 1, fontSize: 14.5, fontWeight: "800", color: palette.foreground },
  statusBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: "900" },
  caseMessage: { fontSize: 13, lineHeight: 19, color: palette.mutedForeground },
  replyCard: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: palette.primarySoft,
    padding: 10,
    gap: 3,
  },
  replyLabel: { fontSize: 11, fontWeight: "900", color: palette.primary },
  replyText: { fontSize: 13, lineHeight: 19, color: palette.foreground },
});
