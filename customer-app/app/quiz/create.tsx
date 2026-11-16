import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
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

import { ErrorRetryCard } from "@/src/components/error-retry-card";
import { ShimmerBlock } from "@/src/components/loading-skeleton";
import { QuizQuestionPicker } from "@/src/components/quiz/quiz-question-picker";
import { Screen } from "@/src/components/screen";
import { AppHeader } from "@/src/components/ui";
import {
  pickRandomQuestions,
  useCreateQuizMutation,
  useQuizBankQuery,
  type QuizBankQuestion,
} from "@/src/hooks/use-quiz-api";
import { appAlert } from "@/src/lib/app-alert";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";

const bn = (value: number) => String(value).replace(/\d/g, (digit) => "০১২৩৪৫৬৭৮৯"[Number(digit)]);

// Make a friend quiz, one question at a time with free back-and-forth:
//   • the customer's own approved questions come first, the rest are random
//   • numbered dots jump to any question; ← আগের / পরের → move one step
//   • "তালিকা থেকে বাছো" opens the whole bank (filter by type / "আমার"), 🔀 = random swap
// Then confirm the name friends will see and share.
export default function QuizCreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bankQuery = useQuizBankQuery();
  const createMutation = useCreateQuizMutation();
  const fullName = useCustomerAuthStore((state) => state.customer?.fullName ?? "");

  const [picked, setPicked] = useState<QuizBankQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [name, setName] = useState(() => fullName.trim().split(/\s+/)[0] ?? "");
  const anim = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef<ScrollView>(null);

  const bank = useMemo(() => bankQuery.data?.questions ?? [], [bankQuery.data?.questions]);
  const count = Math.min(bankQuery.data?.questionCount ?? 10, bank.length);

  useEffect(() => {
    if (picked.length || !bank.length) return;
    // Own questions first (that's why they wrote them), then random ones to fill up.
    const mine = bank.filter((question) => question.mine).slice(0, count);
    const rest = pickRandomQuestions(bank, count - mine.length, new Set(mine.map((q) => q.id)), (q) => q.id);
    setPicked([...mine, ...rest]);
  }, [bank, count, picked.length]);

  const usedIds = useMemo(() => new Set(picked.map((question) => question.id)), [picked]);
  const question = picked[step];
  const onNameStep = picked.length > 0 && step >= picked.length;
  const answeredCount = picked.filter((item) => answers[item.id]).length;
  const allAnswered = picked.length > 0 && answeredCount === picked.length;

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(next, picked.length));
    anim.setValue(0);
    setStep(clamped);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    Animated.timing(anim, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };

  // After answering: go to the next UNANSWERED question (or the name step when all are done).
  const nextAfterAnswer = (current: number, nextAnswers: Record<string, string>) => {
    for (let offset = 1; offset <= picked.length; offset += 1) {
      const index = (current + offset) % picked.length;
      if (!nextAnswers[picked[index].id]) return index;
    }
    return picked.length;
  };

  const choose = (optionId: string) => {
    if (!question) return;
    const nextAnswers = { ...answers, [question.id]: optionId };
    setAnswers(nextAnswers);
    setTimeout(() => goTo(nextAfterAnswer(step, nextAnswers)), 180);
  };

  const replaceCurrent = (replacement: QuizBankQuestion) => {
    if (!question) return;
    setPicked((current) => current.map((item, index) => (index === step ? replacement : item)));
    setAnswers((current) => {
      const next = { ...current };
      delete next[question.id];
      return next;
    });
    anim.setValue(0.4);
    Animated.timing(anim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  };

  const randomSwap = () => {
    const [replacement] = pickRandomQuestions(bank, 1, usedIds, (item) => item.id);
    if (!replacement) {
      appAlert("আর প্রশ্ন নেই", "ভাণ্ডারের সব প্রশ্ন এখানেই আছে।");
      return;
    }
    replaceCurrent(replacement);
  };

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      appAlert("নাম লেখো", "বন্ধুরা যে নামে তোমাকে চেনে, সেটা লেখো (অন্তত ২ অক্ষর)।");
      return;
    }
    createMutation.mutate(
      {
        answers: picked.map((item) => ({ questionId: item.id, optionId: answers[item.id] ?? "" })),
        displayName: trimmed,
      },
      {
        onSuccess: () => router.replace({ pathname: "/quiz", params: { created: "1" } } as never),
        onError: (error) =>
          appAlert("Quiz বানানো যায়নি", error instanceof Error ? error.message : "আবার চেষ্টা করো।"),
      },
    );
  };

  return (
    <Screen>
      {/* Header back always leaves the screen; moving between questions uses the dots / আগের-পরের. */}
      <AppHeader title="তোমার quiz বানাও" subtitle="নিজের সম্পর্কে সঠিক উত্তরগুলো বাছো" />
      {bankQuery.isLoading ? (
        <View style={styles.body}>
          <ShimmerBlock style={styles.skeletonBar} />
          <ShimmerBlock style={styles.skeletonCard} />
        </View>
      ) : bankQuery.isError || !bank.length ? (
        <View style={styles.body}>
          <ErrorRetryCard
            title="প্রশ্ন লোড হয়নি"
            description={bankQuery.error instanceof Error ? bankQuery.error.message : "ইন্টারনেট দেখে আবার চেষ্টা করো।"}
            onRetry={() => void bankQuery.refetch()}
            retrying={bankQuery.isFetching}
          />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 56 : 0}
        >
          {/* Numbered steps: tap any to jump back or forth. Filled = answered. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dots}
            style={styles.dotsBar}
          >
            {picked.map((item, index) => {
              const current = index === step;
              const done = Boolean(answers[item.id]);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => goTo(index)}
                  style={[styles.dot, done ? styles.dotDone : null, current ? styles.dotCurrent : null]}
                  accessibilityRole="button"
                  accessibilityLabel={`প্রশ্ন ${index + 1}${done ? ", উত্তর দেওয়া" : ""}`}
                >
                  {done && !current ? (
                    <Ionicons name="checkmark" size={15} color={palette.onPrimary} />
                  ) : (
                    <Text style={[styles.dotText, current ? styles.dotTextCurrent : null]}>{bn(index + 1)}</Text>
                  )}
                  {item.mine ? <View style={styles.dotMine} /> : null}
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => goTo(picked.length)}
              style={[styles.dot, styles.dotFinish, onNameStep ? styles.dotCurrent : null]}
              accessibilityRole="button"
              accessibilityLabel="শেষ ধাপ"
            >
              <Ionicons name="flag" size={14} color={onNameStep ? palette.onPrimary : palette.foreground} />
            </Pressable>
          </ScrollView>

          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              style={{
                opacity: anim,
                transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
              }}
            >
              {question && !onNameStep ? (
                <View style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.eyebrow}>
                      প্রশ্ন {bn(step + 1)}/{bn(picked.length)} · তোমার সঠিক উত্তর কোনটা?
                    </Text>
                  </View>
                  {question.mine ? <Text style={styles.mineTag}>✍️ তোমার প্রশ্ন</Text> : null}
                  <Text style={styles.question}>{question.text}</Text>
                  {question.authorName && !question.mine ? (
                    <Text style={styles.author}>✍️ প্রশ্ন: {question.authorName}</Text>
                  ) : null}
                  <View style={styles.options}>
                    {question.options.map((option) => {
                      const selected = answers[question.id] === option.id;
                      return (
                        <Pressable
                          key={option.id}
                          onPress={() => choose(option.id)}
                          style={({ pressed }) => [styles.option, selected ? styles.optionSelected : null, pressed ? styles.pressed : null]}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                        >
                          <Text style={[styles.optionText, selected ? styles.optionTextSelected : null]}>{option.label}</Text>
                          {selected ? <Ionicons name="checkmark-circle" size={22} color={palette.foreground} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={styles.changeRow}>
                    <Pressable onPress={() => setPickerOpen(true)} style={styles.changeButton} accessibilityRole="button">
                      <Ionicons name="list" size={16} color={palette.secondary} />
                      <Text style={styles.changeText}>তালিকা থেকে বাছো</Text>
                    </Pressable>
                    <Pressable onPress={randomSwap} style={styles.changeButton} accessibilityRole="button">
                      <Ionicons name="shuffle" size={16} color={palette.secondary} />
                      <Text style={styles.changeText}>এলোমেলো</Text>
                    </Pressable>
                  </View>

                  <View style={styles.navRow}>
                    <Pressable
                      onPress={() => goTo(step - 1)}
                      disabled={step === 0}
                      style={[styles.navButton, step === 0 ? styles.disabled : null]}
                      accessibilityRole="button"
                    >
                      <Ionicons name="arrow-back" size={16} color={palette.foreground} />
                      <Text style={styles.navText}>আগের</Text>
                    </Pressable>
                    <Pressable onPress={() => goTo(step + 1)} style={styles.navButton} accessibilityRole="button">
                      <Text style={styles.navText}>{step === picked.length - 1 ? "শেষ ধাপ" : "পরের"}</Text>
                      <Ionicons name="arrow-forward" size={16} color={palette.foreground} />
                    </Pressable>
                  </View>
                </View>
              ) : onNameStep ? (
                <View style={styles.card}>
                  <Text style={styles.bigEmoji}>🎉</Text>
                  <Text style={styles.question}>প্রায় শেষ! বন্ধুরা তোমাকে কী নামে চেনে?</Text>
                  <Text style={styles.hint}>Link-এ দেখাবে: “{name.trim() || "তোমার নাম"}-কে তুমি কতটা চেনো? 😏”</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    maxLength={24}
                    placeholder="যেমন: রাকিব"
                    placeholderTextColor={palette.mutedForeground}
                    style={styles.input}
                    returnKeyType="done"
                    onSubmitEditing={submit}
                    onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250)}
                  />
                  {!allAnswered ? (
                    <Pressable
                      onPress={() => goTo(picked.findIndex((item) => !answers[item.id]))}
                      style={styles.missing}
                      accessibilityRole="button"
                    >
                      <Text style={styles.missingText}>
                        {bn(picked.length - answeredCount)}টা প্রশ্নের উত্তর বাকি — দেখাও
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={submit}
                    disabled={createMutation.isPending || !allAnswered}
                    style={({ pressed }) => [
                      styles.primary,
                      pressed ? styles.pressed : null,
                      createMutation.isPending || !allAnswered ? styles.disabled : null,
                    ]}
                    accessibilityRole="button"
                  >
                    {createMutation.isPending ? (
                      <ActivityIndicator color={palette.onPrimary} />
                    ) : (
                      <Text style={styles.primaryText}>Quiz বানাও আর শেয়ার করো 🚀</Text>
                    )}
                  </Pressable>
                </View>
              ) : null}
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <QuizQuestionPicker
        visible={pickerOpen}
        bank={bank}
        usedIds={usedIds}
        onClose={() => setPickerOpen(false)}
        onPick={(replacement) => {
          setPickerOpen(false);
          replaceCurrent(replacement);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: 16, gap: 14 },
  skeletonBar: { height: 36, borderRadius: 18 },
  skeletonCard: { height: 380, borderRadius: 24 },
  dotsBar: { flexGrow: 0 },
  dots: { gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  dot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#E3E4E7",
    backgroundColor: palette.surface,
  },
  dotDone: { backgroundColor: palette.primary, borderColor: palette.primary },
  dotCurrent: { backgroundColor: palette.foreground, borderColor: palette.foreground },
  dotFinish: { borderStyle: "dashed" },
  dotText: { fontSize: 14, fontWeight: "700", color: palette.foreground },
  dotTextCurrent: { color: "#FFFFFF" },
  dotMine: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#14985B",
    borderWidth: 1.5,
    borderColor: palette.surface,
  },
  card: {
    gap: 14,
    padding: 18,
    borderRadius: 24,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E4E7",
  },
  cardTop: { flexDirection: "row", alignItems: "center" },
  eyebrow: { fontSize: 12, fontWeight: "700", letterSpacing: 0.3, color: palette.secondary },
  mineTag: {
    alignSelf: "flex-start",
    marginBottom: -6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: "hidden",
    fontSize: 12,
    fontWeight: "700",
    color: "#14985B",
    backgroundColor: "#EFFAF5",
  },
  question: { fontSize: 21, lineHeight: 31, fontWeight: "700", color: palette.foreground },
  author: { marginTop: -8, fontSize: 12.5, fontWeight: "500", color: palette.secondary },
  options: { gap: 10 },
  option: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#E3E4E7",
    backgroundColor: palette.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  optionSelected: { backgroundColor: palette.primary, borderColor: palette.primary },
  optionText: { flex: 1, fontSize: 16, lineHeight: 23, fontWeight: "500", color: palette.foreground },
  optionTextSelected: { fontWeight: "700" },
  changeRow: { flexDirection: "row", gap: 10 },
  changeButton: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: palette.primarySoft,
  },
  changeText: { fontSize: 13.5, fontWeight: "700", color: palette.secondary },
  navRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  navButton: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#E3E4E7",
  },
  navText: { fontSize: 14, fontWeight: "700", color: palette.foreground },
  bigEmoji: { fontSize: 44, textAlign: "center" },
  hint: { fontSize: 13.5, lineHeight: 20, color: palette.mutedForeground },
  input: {
    height: 54,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#E3E4E7",
    paddingHorizontal: 16,
    fontSize: 17,
    color: palette.foreground,
    backgroundColor: palette.surfaceMuted,
  },
  missing: { paddingVertical: 4 },
  missingText: { fontSize: 14, fontWeight: "700", color: "#C2410C", textAlign: "center" },
  primary: {
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  primaryText: { fontSize: 16, fontWeight: "700", color: palette.onPrimary },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.45 },
});
