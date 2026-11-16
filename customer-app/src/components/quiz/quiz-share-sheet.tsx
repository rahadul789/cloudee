import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { OwnerQuiz } from "@/src/hooks/use-quiz-api";
import { trackCustomerEvent } from "@/src/lib/analytics";
import { appAlert } from "@/src/lib/app-alert";
import { captureStoryImage, saveImageFile, shareImageFile } from "@/src/lib/share-image";
import { palette } from "@/src/theme/palette";

const bela = require("@/assets/bela_mascot.png");
const logo = require("@/assets/images/icon.png");
const bn = (value: number) => String(value).replace(/\d/g, (digit) => "০১২৩৪৫৬৭৮৯"[Number(digit)]);
const MEDALS = ["🥇", "🥈", "🥉"];

function shortLink(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

// Branded 9:16 story image of the quiz leaderboard. Everything is sized from `u` (card width / 360)
// so the preview and the saved PNG are the same picture at any screen size.
function LeaderboardStory({ quiz, width }: { quiz: OwnerQuiz; width: number }) {
  const u = width / 360;
  const top = quiz.plays.slice(0, 3);
  const others = Math.max(0, quiz.playCount - top.length);
  return (
    <View style={[story.card, { width, height: (width * 16) / 9, padding: 22 * u, borderRadius: 18 * u }]}>
      <View style={[story.blob, { width: 260 * u, height: 260 * u, borderRadius: 130 * u, top: -70 * u, right: -80 * u }]} />
      <View style={[story.blob, { width: 180 * u, height: 180 * u, borderRadius: 90 * u, bottom: 90 * u, left: -70 * u }]} />

      <View style={[story.brandRow, { gap: 8 * u }]}>
        <Image source={logo} style={{ width: 28 * u, height: 28 * u, borderRadius: 8 * u }} />
        <Text style={[story.brand, { fontSize: 17 * u }]}>Foodbela</Text>
        <View style={[story.chip, { paddingHorizontal: 10 * u, paddingVertical: 4 * u, borderRadius: 12 * u }]}>
          <Text style={[story.chipText, { fontSize: 11 * u }]}>FRIEND QUIZ</Text>
        </View>
      </View>

      <Image source={bela} style={{ width: 120 * u, height: 120 * u, alignSelf: "center", marginTop: 18 * u }} resizeMode="contain" />
      <Text style={[story.headline, { fontSize: 27 * u, lineHeight: 40 * u, marginTop: 8 * u }]} numberOfLines={2}>
        {quiz.ownerName}-কে কে কতটা চেনে? 🏆
      </Text>

      <View style={[story.board, { marginTop: 18 * u, borderRadius: 18 * u, padding: 12 * u, gap: 8 * u }]}>
        {top.length ? (
          top.map((play, index) => (
            <View
              key={play.id}
              style={[story.row, index === 0 ? story.rowFirst : null, { borderRadius: 14 * u, paddingHorizontal: 12 * u, paddingVertical: 10 * u, gap: 10 * u }]}
            >
              <Text style={{ fontSize: 24 * u }}>{MEDALS[index]}</Text>
              <View style={story.rowCopy}>
                <Text style={[story.name, { fontSize: 17 * u, lineHeight: 25 * u }]} numberOfLines={1}>
                  {play.name}
                </Text>
                <Text style={[story.title, { fontSize: 12 * u, lineHeight: 18 * u }]} numberOfLines={1}>
                  {play.titleEmoji} {play.title}
                </Text>
              </View>
              <Text style={[story.score, { fontSize: 19 * u }]}>
                {bn(play.score)}/{bn(play.total)}
              </Text>
            </View>
          ))
        ) : (
          <Text style={[story.empty, { fontSize: 15 * u, lineHeight: 24 * u, padding: 10 * u }]}>
            এখনো কেউ খেলেনি — প্রথম হও! 🥇
          </Text>
        )}
        {others > 0 ? (
          <Text style={[story.more, { fontSize: 12.5 * u }]}>+ আরও {bn(others)} জন খেলেছে</Text>
        ) : null}
      </View>

      <View style={[story.footer, { borderRadius: 18 * u, padding: 14 * u, gap: 2 * u }]}>
        <Text style={[story.footerTop, { fontSize: 14 * u }]}>তুমিও খেলো — দেখো তুমি আসল দোস্ত কিনা 😏</Text>
        <Text style={[story.footerLink, { fontSize: 17 * u }]}>{shortLink(quiz.shareUrl)}</Text>
      </View>
    </View>
  );
}

export function QuizShareSheet({ quiz, visible, onClose }: { quiz: OwnerQuiz; visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const storyRef = useRef<View>(null);
  const [busy, setBusy] = useState<"share" | "save" | null>(null);
  // Fit the 9:16 preview between the top and the buttons.
  const cardWidth = Math.min(screenWidth - 64, ((screenHeight - insets.top - insets.bottom - 190) * 9) / 16, 340);

  const track = (action: string) =>
    void trackCustomerEvent({ eventType: "custom", path: "/quiz", screenName: "quiz", metadata: { action, quizCode: quiz.code } });

  const run = async (kind: "share" | "save") => {
    if (busy) return;
    setBusy(kind);
    try {
      const uri = await captureStoryImage(storyRef);
      if (kind === "share") {
        track("quiz_leaderboard_share");
        await shareImageFile(uri, "Leaderboard share করো");
      } else {
        const result = await saveImageFile(uri, `foodbela-quiz-${quiz.code}`);
        if (result !== "cancelled") {
          track("quiz_leaderboard_save");
          appAlert(
            "ছবি save হয়েছে ✅",
            result === "gallery" ? "Gallery / Photos-এ পাবে। এখন Facebook বা Instagram story-তে দাও!" : "তোমার বেছে নেওয়া folder-এ save হয়েছে।",
            undefined,
            { icon: "checkmark-circle-outline" },
          );
        }
      }
    } catch (error) {
      appAlert("হলো না", error instanceof Error ? error.message : "আবার চেষ্টা করো।");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.topRow}>
          <Text style={styles.heading}>Story-তে দাও 📸</Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.previewWrap}>
          <View ref={storyRef} collapsable={false}>
            <LeaderboardStory quiz={quiz} width={cardWidth} />
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => void run("save")}
            disabled={Boolean(busy)}
            style={({ pressed }) => [styles.action, styles.actionGhost, pressed ? styles.pressed : null]}
            accessibilityRole="button"
          >
            {busy === "save" ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="download-outline" size={19} color="#FFFFFF" />}
            <Text style={styles.actionGhostText}>Download</Text>
          </Pressable>
          <Pressable
            onPress={() => void run("share")}
            disabled={Boolean(busy)}
            style={({ pressed }) => [styles.action, styles.actionPrimary, pressed ? styles.pressed : null]}
            accessibilityRole="button"
          >
            {busy === "share" ? <ActivityIndicator color={palette.onPrimary} /> : <Ionicons name="share-social" size={19} color={palette.onPrimary} />}
            <Text style={styles.actionPrimaryText}>Share</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>Facebook · Instagram story · Messenger · WhatsApp — যেখানে খুশি</Text>
      </View>
    </Modal>
  );
}

const story = StyleSheet.create({
  card: { backgroundColor: "#FFB84C", overflow: "hidden" },
  blob: { position: "absolute", backgroundColor: "rgba(255,255,255,0.22)" },
  brandRow: { flexDirection: "row", alignItems: "center" },
  brand: { flex: 1, fontWeight: "700", color: "#1A1A1A" },
  chip: { backgroundColor: "#1A1A1A" },
  chipText: { fontWeight: "700", color: "#FFB84C", letterSpacing: 0.6 },
  headline: { fontWeight: "700", color: "#1A1A1A", textAlign: "center" },
  board: { backgroundColor: "rgba(255,255,255,0.92)" },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF6E6" },
  rowFirst: { backgroundColor: "#FFE7B8" },
  rowCopy: { flex: 1, minWidth: 0 },
  name: { fontWeight: "700", color: "#1A1A1A" },
  title: { color: "#6B6F76" },
  score: { fontWeight: "700", color: "#1A1A1A" },
  empty: { color: "#1A1A1A", textAlign: "center", fontWeight: "700" },
  more: { color: "#6B6F76", textAlign: "center", fontWeight: "500" },
  footer: { position: "absolute", left: "6%", right: "6%", bottom: "4%", backgroundColor: "#1A1A1A", alignItems: "center" },
  footerTop: { color: "#FFFFFF", fontWeight: "500", textAlign: "center" },
  footerLink: { color: "#FFB84C", fontWeight: "700" },
});

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(10,10,10,0.92)", paddingHorizontal: 20, gap: 14 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { fontSize: 18, fontWeight: "700", color: "#FFFFFF" },
  close: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  previewWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", gap: 12 },
  action: { flex: 1, height: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  actionGhost: { borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" },
  actionGhostText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  actionPrimary: { backgroundColor: palette.primary },
  actionPrimaryText: { fontSize: 16, fontWeight: "700", color: palette.onPrimary },
  pressed: { opacity: 0.88 },
  hint: { fontSize: 12.5, color: "rgba(255,255,255,0.6)", textAlign: "center" },
});
