import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyStateCard } from "@/src/components/empty-state-card";
import { ErrorRetryCard } from "@/src/components/error-retry-card";
import { ShimmerBlock } from "@/src/components/loading-skeleton";
import { Screen } from "@/src/components/screen";
import { AppHeader } from "@/src/components/ui";
import {
  useQuizSubmissionsQuery,
  useSubmitQuizQuestionMutation,
  type QuizSubmission,
} from "@/src/hooks/use-quiz-api";
import { appAlert } from "@/src/lib/app-alert";
import { palette } from "@/src/theme/palette";

const bn = (value: number) => String(value).replace(/\d/g, (digit) => "০১২৩৪৫৬৭৮৯"[Number(digit)]);

const CATEGORIES: { id: string; label: string }[] = [
  { id: "favourite", label: "🍗 প্রিয় খাবার" },
  { id: "habit", label: "🌶️ অভ্যাস" },
  { id: "hunger", label: "🌙 খিদে" },
  { id: "treat", label: "🧾 ট্রিট" },
  { id: "fun", label: "😂 মজার" },
];

const STATUS: Record<QuizSubmission["status"], { label: string; bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending: { label: "দেখা হচ্ছে", bg: "#FFF4E0", fg: "#A86300", icon: "time-outline" },
  approved: { label: "Approve হয়েছে", bg: "#EFFAF5", fg: "#14985B", icon: "checkmark-circle" },
  rejected: { label: "নেওয়া হয়নি", bg: "#FDECEC", fg: "#C0392B", icon: "close-circle" },
};

function SubmissionRow({ item }: { item: QuizSubmission }) {
  const status = STATUS[item.status];
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <View style={[styles.badge, { backgroundColor: status.bg }]}>
          <Ionicons name={status.icon} size={13} color={status.fg} />
          <Text style={[styles.badgeText, { color: status.fg }]}>{status.label}</Text>
        </View>
        {item.status === "approved" && item.rewardCoins > 0 ? (
          <Text style={styles.coins}>+{bn(item.rewardCoins)} coin 🪙</Text>
        ) : null}
      </View>
      <Text style={styles.rowText}>{item.text}</Text>
      <Text style={styles.rowOptions} numberOfLines={2}>
        {item.options.join(" · ")}
      </Text>
      {item.status === "approved" ? (
        <Text style={styles.rowMeta}>
          {item.useCount ? `🔥 ${bn(item.useCount)}টা quiz-এ তোমার প্রশ্ন আছে` : "এখন সবার quiz-এ আসবে"}
        </Text>
      ) : null}
      {item.status === "rejected" && item.rejectReason ? <Text style={styles.rowMeta}>কারণ: {item.rejectReason}</Text> : null}
    </View>
  );
}

// "💡 তোমার প্রশ্ন দাও": customers suggest a fun food question; the admin approves it and it joins
// everyone's quiz bank with their name on it.
export default function QuizQuestionsScreen() {
  const submissionsQuery = useQuizSubmissionsQuery();
  const submitMutation = useSubmitQuizQuestionMutation();
  const [text, setText] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [category, setCategory] = useState("fun");
  const insets = useSafeAreaInsets();
  // Keyboard: on focus, scroll the field to a comfortable spot above the keyboard
  // (Android edge-to-edge doesn't resize the window, so do it ourselves).
  const scrollRef = useRef<ScrollView>(null);
  const cardY = useRef(0);
  const fieldY = useRef<Record<string, number>>({});
  const revealField = (key: string) => {
    setTimeout(() => {
      const y = cardY.current + (fieldY.current[key] ?? 0);
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 140), animated: true });
    }, 280);
  };

  const data = submissionsQuery.data;
  const pending = data?.items.filter((item) => item.status === "pending").length ?? 0;
  const atLimit = Boolean(data && pending >= data.pendingLimit);
  const filled = options.filter((option) => option.trim()).length;
  const canSubmit = text.trim().length >= 6 && filled >= 2 && !atLimit && !submitMutation.isPending;

  const submit = () => {
    if (!canSubmit) return;
    submitMutation.mutate(
      { text: text.trim(), options: options.map((option) => option.trim()).filter(Boolean), category },
      {
        onSuccess: (result) => {
          setText("");
          setOptions(["", "", "", ""]);
          appAlert(
            result.status === "approved" ? "সরাসরি চালু হয়ে গেছে! 🎉" : "জমা হয়েছে ✅",
            result.status === "approved"
              ? "তুমি বিশ্বস্ত লেখক — প্রশ্নটা এখনই সবার quiz-এ আসবে।"
              : "Foodbela টিম দেখে approve করলে notification পাবে।",
            undefined,
            { icon: "checkmark-circle-outline" },
          );
        },
        onError: (error) => appAlert("জমা হয়নি", error instanceof Error ? error.message : "আবার চেষ্টা করো।"),
      },
    );
  };

  return (
    <Screen>
      <AppHeader title="তোমার প্রশ্ন দাও 💡" subtitle="Approve হলে সবার quiz-এ তোমার নামসহ আসবে" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 56 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 48 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {submissionsQuery.isLoading ? (
            <ShimmerBlock style={styles.skeleton} />
          ) : submissionsQuery.isError ? (
            <ErrorRetryCard
              title="লোড হয়নি"
              description="ইন্টারনেট দেখে আবার চেষ্টা করো।"
              onRetry={() => void submissionsQuery.refetch()}
              retrying={submissionsQuery.isFetching}
            />
          ) : !data?.enabled ? (
            <EmptyStateCard
              title="প্রশ্ন জমা দেওয়া এখন বন্ধ"
              description="শীঘ্রই চালু হবে — তখন তোমার মজার প্রশ্ন সবাই খেলবে!"
              icon="bulb-outline"
              mascot={false}
            />
          ) : (
            <>
              <View style={styles.card} onLayout={(event) => (cardY.current = event.nativeEvent.layout.y)}>
                <View style={styles.perks}>
                  <Text style={styles.perk}>✍️ তোমার নাম প্রশ্নের নিচে দেখাবে</Text>
                  {data.rewardCoins > 0 ? <Text style={styles.perk}>🪙 Approve হলে {bn(data.rewardCoins)} coin</Text> : null}
                  <Text style={styles.perkMuted}>শুধু মজার, খাবার নিয়ে প্রশ্ন — ব্যক্তিগত কিছু না।</Text>
                </View>

                <Text style={styles.label}>প্রশ্ন</Text>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  maxLength={140}
                  placeholder="যেমন: পিৎজার কোন অংশটা আমি আগে খাই?"
                  placeholderTextColor={palette.mutedForeground}
                  style={[styles.input, styles.inputMulti]}
                  multiline
                  onLayout={(event) => (fieldY.current.text = event.nativeEvent.layout.y)}
                  onFocus={() => revealField("text")}
                />

                <Text style={styles.label}>উত্তরগুলো (২–৪টা)</Text>
                {options.map((option, index) => (
                  <TextInput
                    key={index}
                    value={option}
                    onChangeText={(value) => setOptions((current) => current.map((item, i) => (i === index ? value : item)))}
                    maxLength={80}
                    placeholder={`উত্তর ${bn(index + 1)}${index >= 2 ? " (ঐচ্ছিক)" : ""}`}
                    placeholderTextColor={palette.mutedForeground}
                    style={styles.input}
                    onLayout={(event) => (fieldY.current[`o${index}`] = event.nativeEvent.layout.y)}
                    onFocus={() => revealField(`o${index}`)}
                    returnKeyType={index < 3 ? "next" : "done"}
                  />
                ))}

                <Text style={styles.label}>ধরন</Text>
                <View style={styles.chips}>
                  {CATEGORIES.map((item) => {
                    const selected = item.id === category;
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => setCategory(item.id)}
                        style={[styles.chip, selected ? styles.chipSelected : null]}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                      >
                        <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{item.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {atLimit ? (
                  <Text style={styles.limit}>
                    {bn(data.pendingLimit)}টা প্রশ্ন দেখার অপেক্ষায় আছে — সেগুলো দেখা হলে আবার দিতে পারবে।
                  </Text>
                ) : null}

                <Pressable
                  onPress={submit}
                  disabled={!canSubmit}
                  style={({ pressed }) => [styles.primary, !canSubmit ? styles.disabled : null, pressed ? styles.pressed : null]}
                  accessibilityRole="button"
                >
                  {submitMutation.isPending ? (
                    <ActivityIndicator color={palette.onPrimary} />
                  ) : (
                    <Text style={styles.primaryText}>জমা দাও 🚀</Text>
                  )}
                </Pressable>
              </View>

              {data.items.length ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>আমার প্রশ্ন</Text>
                  {data.items.map((item) => (
                    <SubmissionRow key={item.id} item={item} />
                  ))}
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: 16, gap: 14, paddingBottom: 48 },
  skeleton: { height: 420, borderRadius: 24 },
  card: {
    gap: 10,
    padding: 18,
    borderRadius: 24,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E4E7",
  },
  perks: { gap: 4, padding: 12, borderRadius: 16, backgroundColor: palette.primarySoft, marginBottom: 4 },
  perk: { fontSize: 14, fontWeight: "500", color: palette.foreground },
  perkMuted: { fontSize: 12.5, color: palette.mutedForeground },
  label: { fontSize: 13, fontWeight: "700", color: palette.foreground, marginTop: 4 },
  input: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E3E4E7",
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: palette.foreground,
    backgroundColor: palette.surfaceMuted,
  },
  inputMulti: { minHeight: 76, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E3E4E7",
    backgroundColor: palette.surface,
  },
  chipSelected: { backgroundColor: palette.primary, borderColor: palette.primary },
  chipText: { fontSize: 13.5, color: palette.foreground },
  chipTextSelected: { fontWeight: "700", color: palette.onPrimary },
  limit: { fontSize: 13, lineHeight: 19, fontWeight: "500", color: "#C2410C" },
  primary: {
    height: 54,
    marginTop: 6,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  primaryText: { fontSize: 16, fontWeight: "700", color: palette.onPrimary },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.5 },
  section: {
    gap: 4,
    padding: 16,
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E4E7",
  },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: palette.foreground, marginBottom: 4 },
  row: { gap: 4, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#ECECEE" },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, height: 24, borderRadius: 12 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  coins: { fontSize: 12.5, fontWeight: "700", color: palette.secondary },
  rowText: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: palette.foreground },
  rowOptions: { fontSize: 13, color: palette.mutedForeground },
  rowMeta: { fontSize: 12.5, color: palette.foreground },
});
