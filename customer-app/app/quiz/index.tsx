import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";

import { BelaPullToRefresh } from "@/src/components/bela-pull-to-refresh";

import { EmptyStateCard } from "@/src/components/empty-state-card";
import { QuizShareSheet } from "@/src/components/quiz/quiz-share-sheet";
import { ErrorRetryCard } from "@/src/components/error-retry-card";
import { ShimmerBlock } from "@/src/components/loading-skeleton";
import { Screen } from "@/src/components/screen";
import { AppHeader } from "@/src/components/ui";
import { quizShareMessage, useCustomerQuizQuery, type OwnerQuiz, type QuizPlay } from "@/src/hooks/use-quiz-api";
import { trackCustomerEvent } from "@/src/lib/analytics";
import { appAlert } from "@/src/lib/app-alert";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";

const bela = require("@/assets/bela_mascot.png");
const bn = (value: number) => String(value).replace(/\d/g, (digit) => "০১২৩৪৫৬৭৮৯"[Number(digit)]);
const MEDALS = ["🥇", "🥈", "🥉"];

function daysLeft(iso: string) {
  const ms = Date.parse(iso) - Date.now();
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 86_400_000)) : 0;
}

async function shareQuiz(quiz: OwnerQuiz, template?: string) {
  void trackCustomerEvent({
    eventType: "custom",
    path: "/quiz",
    screenName: "quiz",
    metadata: { action: "quiz_share", quizCode: quiz.code },
  });
  await Share.share({ message: quizShareMessage(quiz, template) }).catch(() => undefined);
}

function PlayRow({ play }: { play: QuizPlay }) {
  const [open, setOpen] = useState(false);
  const perfect = play.misses.length === 0;
  return (
    <Pressable
      onPress={() => setOpen((value) => !value)}
      style={({ pressed }) => [styles.playRow, pressed ? styles.pressed : null]}
      accessibilityRole="button"
      accessibilityLabel={`${play.name} ${play.score}/${play.total}`}
    >
      <View style={styles.playTop}>
        <Text style={styles.playRank}>{MEDALS[play.rank - 1] ?? bn(play.rank)}</Text>
        <View style={styles.playCopy}>
          <Text style={styles.playName} numberOfLines={1}>
            {play.name}
          </Text>
          <Text style={styles.playTitle}>
            {play.titleEmoji} {play.title}
          </Text>
        </View>
        <Text style={styles.playScore}>
          {bn(play.score)}/{bn(play.total)}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={palette.mutedForeground} />
      </View>
      {open ? (
        <View style={styles.misses}>
          {perfect ? (
            <Text style={styles.missPerfect}>সব ঠিক! 👑 এ তো তোমার আত্মার আত্মীয়।</Text>
          ) : (
            play.misses.map((miss, index) => (
              <View key={index} style={styles.miss}>
                <Text style={styles.missQuestion}>{miss.question}</Text>
                <Text style={styles.missLine}>
                  <Text style={styles.missWrong}>{play.name} ভাবে: {miss.theirAnswer} 😤</Text>
                </Text>
                <Text style={styles.missLine}>
                  <Text style={styles.missRight}>আসলে: {miss.correctAnswer}</Text>
                </Text>
              </View>
            ))
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

// "তুমি আমাকে কতটা চেনো?" — your quiz: share it, watch the leaderboard, see who got what wrong.
export default function QuizScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ created?: string }>();
  const signedIn = useCustomerAuthStore((state) => Boolean(state.customer));
  const quizQuery = useCustomerQuizQuery();
  const [refreshing, setRefreshing] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
  const autoShared = useRef(false);

  const data = quizQuery.data;
  const quiz = data?.quiz ?? null;

  const shareTemplate = data?.copy?.shareMessage;
  // Right after creating: open the share sheet once.
  useEffect(() => {
    if (params.created === "1" && quiz && !autoShared.current) {
      autoShared.current = true;
      void shareQuiz(quiz, shareTemplate);
    }
  }, [params.created, quiz, shareTemplate]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await quizQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [quizQuery]);

  const makeNew = () => {
    if (!quiz) {
      router.push("/quiz/create" as never);
      return;
    }
    appAlert(
      "নতুন quiz বানাবে?",
      "নতুন quiz বানালে পুরনো link আর কাজ করবে না, leaderboard-ও নতুন করে শুরু হবে।",
      [
        { text: "না", style: "cancel" },
        { text: "হ্যাঁ, নতুন বানাও", onPress: () => router.push("/quiz/create" as never) },
      ],
    );
  };

  if (!signedIn) {
    return (
      <Screen>
        <AppHeader title="তুমি আমাকে কতটা চেনো?" />
        <View style={styles.body}>
          <EmptyStateCard
            title="Quiz বানাতে sign in করো"
            description="তোমার quiz-এর leaderboard আর বন্ধুদের ভুলগুলো দেখতে account লাগবে।"
            icon="person-circle-outline"
            actionLabel="Sign in"
            onPress={() => router.push({ pathname: "/sign-in", params: { redirectTo: "/quiz" } })}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title="তুমি আমাকে কতটা চেনো?" subtitle="বন্ধুদের চ্যালেঞ্জ দাও 😏" />
      <BelaPullToRefresh refreshing={refreshing} onRefresh={refresh}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {quizQuery.isLoading ? (
          <>
            <ShimmerBlock style={styles.skeletonHero} />
            <ShimmerBlock style={styles.skeletonList} />
          </>
        ) : quizQuery.isError ? (
          <ErrorRetryCard
            title="Quiz লোড হয়নি"
            description="ইন্টারনেট দেখে আবার চেষ্টা করো।"
            onRetry={() => void quizQuery.refetch()}
            retrying={quizQuery.isFetching}
          />
        ) : !data?.enabled ? (
          <EmptyStateCard
            title="Quiz এখন বন্ধ আছে"
            description="শীঘ্রই আবার আসছে — Hype tab-এ চোখ রাখো!"
            icon="game-controller-outline"
            mascot={false}
          />
        ) : !quiz ? (
          <View style={styles.intro}>
            <Image source={bela} style={styles.introBela} resizeMode="contain" />
            <Text style={styles.introTitle}>বন্ধুরা তোমাকে কতটা চেনে?</Text>
            <Text style={styles.introText}>নিজের সম্পর্কে {bn(data.questionCount)}টা মজার খাবারের প্রশ্নের উত্তর দাও, link পাঠাও — বন্ধুরা খেলবে অ্যাপ ছাড়াই।</Text>
            <View style={styles.steps}>
              {[
                ["create-outline", "নিজের উত্তর বাছো (১ মিনিট)"],
                ["paper-plane-outline", "Messenger-এ link পাঠাও"],
                ["trophy-outline", "কে আসল দোস্ত — leaderboard-এ দেখো"],
              ].map(([icon, label]) => (
                <View key={label} style={styles.stepRow}>
                  <View style={styles.stepIcon}>
                    <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={palette.foreground} />
                  </View>
                  <Text style={styles.stepText}>{label}</Text>
                </View>
              ))}
            </View>
            <Pressable onPress={makeNew} style={({ pressed }) => [styles.primary, pressed ? styles.pressed : null]} accessibilityRole="button">
              <Text style={styles.primaryText}>Quiz বানাও 🚀</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <View style={styles.heroTop}>
                <Image source={bela} style={styles.heroBela} resizeMode="contain" />
                <View style={styles.heroCopy}>
                  <Text style={styles.heroEyebrow}>{quiz.live ? "তোমার quiz চালু আছে" : "এই quiz-এর সময় শেষ"}</Text>
                  <Text style={styles.heroTitle}>
                    {quiz.playCount ? `${bn(quiz.playCount)} জন খেলেছে 🔥` : "এখনো কেউ খেলেনি"}
                  </Text>
                  <Text style={styles.heroMeta}>
                    {bn(quiz.viewCount)} জন link খুলেছে{quiz.live ? ` · আর ${bn(daysLeft(quiz.expiresAt))} দিন` : ""}
                  </Text>
                </View>
              </View>
              {quiz.live ? (
                <View style={styles.shareRow}>
                  <Pressable
                    onPress={() => void shareQuiz(quiz, data?.copy?.shareMessage)}
                    style={({ pressed }) => [styles.shareButton, pressed ? styles.pressed : null]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="paper-plane" size={18} color={palette.primary} />
                    <Text style={styles.shareText}>Link পাঠাও</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setStoryOpen(true)}
                    style={({ pressed }) => [styles.shareButton, styles.storyButton, pressed ? styles.pressed : null]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="images" size={18} color={palette.onPrimary} />
                    <Text style={[styles.shareText, styles.storyText]}>Story / ছবি</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🏆 Leaderboard</Text>
              {quiz.plays.length ? (
                <>
                  <Text style={styles.sectionHint}>নামে চাপ দিলে দেখবে কে কোথায় ভুল করেছে 😂</Text>
                  {quiz.plays.map((play) => (
                    <PlayRow key={play.id} play={play} />
                  ))}
                </>
              ) : (
                <Text style={styles.emptyBoard}>Link পাঠাও — প্রথম যে খেলবে সে এখানে আসবে। কেউ খেললে notification পাবে!</Text>
              )}
            </View>

            <Pressable onPress={() => setShowAnswers((value) => !value)} style={styles.answersToggle} accessibilityRole="button">
              <Text style={styles.answersToggleText}>আমার উত্তরগুলো {showAnswers ? "লুকাও" : "দেখো"}</Text>
              <Ionicons name={showAnswers ? "chevron-up" : "chevron-down"} size={16} color={palette.secondary} />
            </Pressable>
            {showAnswers ? (
              <View style={styles.section}>
                {quiz.questions.map((question, index) => (
                  <View key={index} style={styles.answerRow}>
                    <Text style={styles.answerQuestion}>{bn(index + 1)}. {question.text}</Text>
                    <Text style={styles.answerValue}>{question.answer}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Pressable onPress={makeNew} style={({ pressed }) => [styles.secondary, pressed ? styles.pressed : null]} accessibilityRole="button">
              <Ionicons name="refresh" size={17} color={palette.foreground} />
              <Text style={styles.secondaryText}>নতুন quiz বানাও</Text>
            </Pressable>
          </>
        )}
        {data?.enabled && data.submissionsEnabled ? (
          <Pressable
            onPress={() => router.push("/quiz/questions" as never)}
            style={({ pressed }) => [styles.suggest, pressed ? styles.pressed : null]}
            accessibilityRole="button"
          >
            <Text style={styles.suggestEmoji}>💡</Text>
            <View style={styles.suggestCopy}>
              <Text style={styles.suggestTitle}>নিজের মজার প্রশ্ন দাও</Text>
              <Text style={styles.suggestText}>Approve হলে সবার quiz-এ তোমার নামসহ আসবে</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.mutedForeground} />
          </Pressable>
        ) : null}
      </ScrollView>
      </BelaPullToRefresh>
      {quiz ? <QuizShareSheet quiz={quiz} visible={storyOpen} onClose={() => setStoryOpen(false)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 14, paddingBottom: 48 },
  pressed: { opacity: 0.9 },
  skeletonHero: { height: 170, borderRadius: 24 },
  skeletonList: { height: 260, borderRadius: 24 },
  intro: {
    alignItems: "center",
    gap: 12,
    padding: 20,
    borderRadius: 24,
    backgroundColor: palette.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#F3D8A8",
  },
  introBela: { width: 120, height: 120 },
  introTitle: { fontSize: 22, lineHeight: 32, fontWeight: "700", color: palette.foreground, textAlign: "center" },
  introText: { fontSize: 14.5, lineHeight: 22, color: palette.mutedForeground, textAlign: "center" },
  steps: { alignSelf: "stretch", gap: 10, marginVertical: 4 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
  stepText: { flex: 1, fontSize: 15, fontWeight: "500", color: palette.foreground },
  primary: {
    alignSelf: "stretch",
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  primaryText: { fontSize: 16.5, fontWeight: "700", color: palette.onPrimary },
  hero: { gap: 14, padding: 18, borderRadius: 24, backgroundColor: "#111111" },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  heroBela: { width: 72, height: 72 },
  heroCopy: { flex: 1, minWidth: 0, gap: 3 },
  heroEyebrow: { fontSize: 12.5, fontWeight: "700", color: palette.primary },
  heroTitle: { fontSize: 21, lineHeight: 29, fontWeight: "700", color: "#FFFFFF" },
  heroMeta: { fontSize: 13, color: "rgba(255,255,255,0.7)" },
  shareRow: { flexDirection: "row", gap: 10 },
  storyButton: { backgroundColor: palette.primary, borderColor: palette.primary },
  storyText: { color: palette.onPrimary },
  shareButton: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255,184,76,0.16)",
    borderWidth: 1,
    borderColor: palette.primary,
  },
  shareText: { fontSize: 16, fontWeight: "700", color: palette.primary },
  section: {
    gap: 8,
    padding: 16,
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E4E7",
  },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: palette.foreground },
  sectionHint: { fontSize: 12.5, color: palette.mutedForeground, marginBottom: 2 },
  emptyBoard: { fontSize: 14, lineHeight: 21, color: palette.mutedForeground },
  playRow: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#ECECEE" },
  playTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  playRank: { width: 30, textAlign: "center", fontSize: 17, fontWeight: "700", color: palette.mutedForeground },
  playCopy: { flex: 1, minWidth: 0 },
  playName: { fontSize: 15.5, fontWeight: "700", color: palette.foreground },
  playTitle: { fontSize: 12.5, color: palette.mutedForeground },
  playScore: { fontSize: 16, fontWeight: "700", color: palette.foreground },
  misses: { gap: 10, marginTop: 10, marginLeft: 40 },
  missPerfect: { fontSize: 14, fontWeight: "700", color: palette.successText },
  miss: { gap: 2, padding: 10, borderRadius: 12, backgroundColor: palette.surfaceMuted },
  missQuestion: { fontSize: 13, fontWeight: "700", color: palette.foreground },
  missLine: { fontSize: 13 },
  missWrong: { color: "#C0392B" },
  missRight: { color: palette.successText, fontWeight: "700" },
  answersToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 4 },
  answersToggleText: { fontSize: 14, fontWeight: "700", color: palette.secondary },
  answerRow: { gap: 2, paddingVertical: 6 },
  answerQuestion: { fontSize: 13.5, color: palette.mutedForeground },
  answerValue: { fontSize: 15, fontWeight: "700", color: palette.foreground },
  secondary: {
    height: 50,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: "#D5D7DB",
  },
  suggest: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: palette.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#F3D8A8",
  },
  suggestEmoji: { fontSize: 26 },
  suggestCopy: { flex: 1, minWidth: 0, gap: 2 },
  suggestTitle: { fontSize: 15.5, fontWeight: "700", color: palette.foreground },
  suggestText: { fontSize: 12.5, lineHeight: 18, color: palette.mutedForeground },
  secondaryText: { fontSize: 15, fontWeight: "700", color: palette.foreground },
});
