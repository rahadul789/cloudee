import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from "react-native";

import type { OwnerQuiz } from "@/src/hooks/use-quiz-api";
import { palette } from "@/src/theme/palette";

const bela = require("@/assets/bela_mascot.png");
const bn = (value: number) => String(value).replace(/\d/g, (digit) => "০১২৩৪৫৬৭৮৯"[Number(digit)]);
const MEDALS = ["🥇", "🥈", "🥉"];
const BUBBLE_COLORS = ["#FFB84C", "#FFFFFF", "#F4D9A8"];

function initialOf(name: string) {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}

// Top-of-Hype card for the friend quiz. Left: copy + CTA. Right: Bela with the top-3 friends
// as medal bubbles (or a waiting Bela with "?" bubbles before anyone plays).
// `compact` = the slim version used on the delivered-order screen.
export function QuizHypeCard({
  quiz,
  onPress,
  compact = false,
  active = true,
}: {
  quiz: OwnerQuiz | null;
  onPress: () => void;
  compact?: boolean;
  /** Pauses the little Bela wobble when the screen isn't focused. */
  active?: boolean;
}) {
  const wobble = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wobble, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(wobble, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, wobble]);

  const live = Boolean(quiz?.live);
  const top = live ? quiz!.plays.slice(0, 3) : [];
  // Short lines: Bangla glyphs are wide, so keep each line to one idea.
  const title = live
    ? quiz!.playCount
      ? `${bn(quiz!.playCount)} জন বন্ধু খেলেছে 🔥`
      : "Quiz তৈরি! বন্ধুদের পাঠাও"
    : "তুমি আমাকে কতটা চেনো? 😏";
  const detail = live
    ? top[0]
      ? `${top[0].name} এগিয়ে · ${bn(top[0].score)}/${bn(top[0].total)}`
      : "কেউ খেললেই notification পাবে"
    : "বানাও, দেখো কে আসল দোস্ত";
  const cta = live ? "Leaderboard" : "বানাও";
  // The slim card lives on the (English) order details screen → English copy there.
  const shownTitle = compact ? (live ? "Your friend quiz is live 🔥" : "How well do your friends know you? 😏") : title;
  const shownDetail = compact ? (live ? "See who knows you best" : "Make a quick food quiz and challenge them") : detail;
  const shownCta = compact ? (live ? "Leaderboard" : "Create") : cta;

  const bubbles = top.length ? top : [null, null, null];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, compact ? styles.cardCompact : null, pressed ? styles.pressed : null]}
      accessibilityRole="button"
      accessibilityLabel={shownTitle}
    >
      <View style={styles.glow} />
      <View style={styles.copy}>
        {!compact ? <Text style={styles.eyebrow}>FRIEND QUIZ · নতুন</Text> : null}
        <Text style={[styles.title, compact ? styles.titleCompact : null]} numberOfLines={2}>
          {shownTitle}
        </Text>
        <Text style={styles.detail} numberOfLines={1}>
          {shownDetail}
        </Text>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>{shownCta}</Text>
          <Ionicons name="arrow-forward" size={14} color={palette.onPrimary} />
        </View>
      </View>

      <View style={[styles.art, compact ? styles.artCompact : null]}>
        <Animated.View
          style={{
            transform: [
              { rotate: wobble.interpolate({ inputRange: [0, 1], outputRange: ["-6deg", "6deg"] }) },
              { translateY: wobble.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
            ],
          }}
        >
          <Image source={bela} style={compact ? styles.belaCompact : styles.bela} resizeMode="contain" />
        </Animated.View>
        {!compact ? (
          <View style={styles.bubbles}>
            {bubbles.map((play, index) => (
              <View
                key={play?.id ?? `empty-${index}`}
                style={[
                  styles.bubble,
                  { backgroundColor: play ? BUBBLE_COLORS[index] : "rgba(255,255,255,0.14)", marginLeft: index ? -8 : 0, zIndex: 3 - index },
                ]}
              >
                <Text style={[styles.bubbleText, !play ? styles.bubbleTextEmpty : null]}>
                  {play ? initialOf(play.name) : "?"}
                </Text>
                {play ? <Text style={styles.medal}>{MEDALS[index]}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.92 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 16,
    paddingLeft: 18,
    paddingRight: 12,
    borderRadius: 24,
    backgroundColor: "#111111",
    overflow: "hidden",
  },
  cardCompact: { paddingVertical: 12, paddingLeft: 14, borderRadius: 20 },
  // Soft amber light behind Bela so the right side never looks empty.
  glow: {
    position: "absolute",
    right: -40,
    top: -30,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: "rgba(255,184,76,0.16)",
  },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, color: palette.primary },
  title: { fontSize: 17, lineHeight: 26, fontWeight: "700", color: "#FFFFFF" },
  titleCompact: { fontSize: 15, lineHeight: 23 },
  detail: { fontSize: 13, lineHeight: 20, color: "rgba(255,255,255,0.72)" },
  cta: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 34,
    marginTop: 6,
    paddingHorizontal: 16,
    borderRadius: 17,
    backgroundColor: palette.primary,
  },
  ctaText: { fontSize: 13.5, fontWeight: "700", color: palette.onPrimary },
  art: { width: 112, alignItems: "center", gap: 6 },
  artCompact: { width: 60 },
  bela: { width: 86, height: 86 },
  belaCompact: { width: 50, height: 50 },
  bubbles: { flexDirection: "row", alignItems: "center" },
  bubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#111111",
  },
  bubbleText: { fontSize: 14, fontWeight: "700", color: "#111111" },
  bubbleTextEmpty: { color: "rgba(255,255,255,0.7)" },
  medal: { position: "absolute", bottom: -6, right: -4, fontSize: 12 },
});
