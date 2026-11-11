import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AppBottomSheet } from "@/src/components/app-bottom-sheet";
import { RemoteImage } from "@/src/components/remote-image";
import {
  useAddHypePollCommentMutation,
  useHypePollCommentsQuery,
  type HypeItem,
} from "@/src/hooks/use-hype-api";
import { palette } from "@/src/theme/palette";

function timeAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function closesLabel(poll: HypeItem) {
  if (!poll.pollOpen) return "Poll closed";
  if (!poll.endsAt) return "";
  const ms = new Date(poll.endsAt).getTime() - Date.now();
  if (ms <= 0) return "Poll closed";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) return `Closes in ${Math.floor(hours / 24)}d`;
  if (hours >= 1) return `Closes in ${hours}h`;
  return `Closes in ${Math.max(1, Math.floor(ms / 60_000))}m`;
}

// One option: before voting a tappable pill; after voting a bar that fills to its share.
function PollOption({
  label,
  percent,
  mine,
  showResults,
  winner,
  disabled,
  onPress,
}: {
  label: string;
  percent: number;
  mine: boolean;
  showResults: boolean;
  winner: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const fill = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  useEffect(() => {
    Animated.timing(fill, {
      toValue: showResults ? percent / 100 : 0,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fill, percent, showResults]);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={({ pressed }) => [
        styles.option,
        mine ? styles.optionMine : null,
        pressed && !disabled ? styles.pressed : null,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: mine, disabled }}
      accessibilityLabel={showResults ? `${label}, ${percent} percent` : `Vote ${label}`}
    >
      {showResults && width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.optionFill,
            winner ? styles.optionFillWinner : null,
            {
              width,
              transform: [
                { translateX: fill.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] }) },
              ],
            },
          ]}
        />
      ) : null}
      <View style={styles.optionRow}>
        {mine ? <Ionicons name="checkmark-circle" size={17} color={palette.foreground} /> : null}
        <Text style={[styles.optionLabel, mine ? styles.optionLabelMine : null]} numberOfLines={2}>
          {label}
        </Text>
        {showResults ? <Text style={styles.optionPercent}>{percent}%</Text> : null}
      </View>
    </Pressable>
  );
}

export function HypePollCard({
  poll,
  voting,
  onVote,
  onOpenComments,
}: {
  poll: HypeItem;
  voting: boolean;
  onVote: (optionId: string) => void;
  onOpenComments: () => void;
}) {
  const options = poll.pollOptions ?? [];
  const showResults = Boolean(poll.myVote) || poll.pollOpen === false;
  const top = Math.max(0, ...options.map((option) => option.percent ?? 0));
  const meta = [
    typeof poll.voteCount === "number" ? `${poll.voteCount} vote${poll.voteCount === 1 ? "" : "s"}` : "Vote to see results",
    closesLabel(poll),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.card}>
      <View style={styles.badgeRow}>
        <View style={styles.badge}>
          <Ionicons name="stats-chart" size={12} color={palette.onPrimary} />
          <Text style={styles.badgeText}>POLL</Text>
        </View>
        {voting ? <ActivityIndicator size="small" color={palette.foreground} /> : null}
      </View>
      {poll.imageUrl ? (
        <RemoteImage uri={poll.imageUrl} style={styles.image} contentFit="cover" />
      ) : null}
      {poll.title ? <Text style={styles.question}>{poll.title}</Text> : null}
      {poll.description ? <Text style={styles.description}>{poll.description}</Text> : null}
      <View style={styles.options}>
        {options.map((option) => (
          <PollOption
            key={option.id}
            label={option.label}
            percent={option.percent ?? 0}
            mine={poll.myVote === option.id}
            showResults={showResults}
            winner={showResults && (option.percent ?? 0) === top && top > 0}
            disabled={showResults || voting || poll.pollOpen === false}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
              onVote(option.id);
            }}
          />
        ))}
      </View>
      <View style={styles.footer}>
        <Text style={styles.meta}>{meta}</Text>
        {poll.allowComments ? (
          <Pressable onPress={onOpenComments} hitSlop={8} style={styles.commentsButton} accessibilityRole="button">
            <Ionicons name="chatbubble-ellipses-outline" size={15} color={palette.foreground} />
            <Text style={styles.commentsText}>
              {poll.commentCount ? `${poll.commentCount} comments` : "Comment"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function HypePollCommentsSheet({
  poll,
  signedIn,
  onClose,
  onSignIn,
}: {
  poll: HypeItem | null;
  signedIn: boolean;
  onClose: () => void;
  onSignIn: () => void;
}) {
  const commentsQuery = useHypePollCommentsQuery(poll?.id ?? null);
  const addComment = useAddHypePollCommentMutation(poll?.id ?? null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const comments = commentsQuery.data?.items ?? [];

  const submit = () => {
    const value = text.trim();
    if (value.length < 2) return;
    setError("");
    addComment.mutate(value, {
      onSuccess: () => setText(""),
      onError: (err) => setError(err instanceof Error ? err.message : "Could not post your comment."),
    });
  };

  const footer = poll ? (
    signedIn ? (
      <View style={styles.composer}>
        <TextInput
          value={text}
          onChangeText={(value) => setText(value.slice(0, 300))}
          placeholder="Write a comment…"
          placeholderTextColor={palette.placeholder}
          style={styles.composerInput}
          multiline
        />
        <Pressable
          onPress={submit}
          disabled={addComment.isPending || text.trim().length < 2}
          style={[styles.sendButton, text.trim().length < 2 ? styles.sendDisabled : null]}
          accessibilityRole="button"
          accessibilityLabel="Post comment"
        >
          {addComment.isPending ? (
            <ActivityIndicator size="small" color={palette.onPrimary} />
          ) : (
            <Ionicons name="send" size={17} color={palette.onPrimary} />
          )}
        </Pressable>
      </View>
    ) : (
      <Pressable onPress={onSignIn} style={styles.signInButton} accessibilityRole="button">
        <Ionicons name="log-in-outline" size={17} color={palette.onPrimary} />
        <Text style={styles.signInText}>Sign in to comment</Text>
      </Pressable>
    )
  ) : null;

  return (
    <AppBottomSheet
      visible={Boolean(poll)}
      onClose={onClose}
      title="Comments"
      subtitle={poll?.title || undefined}
      leadingIcon="chatbubble-ellipses-outline"
      snapPoints={[0.7, 0.92]}
      footer={footer}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {commentsQuery.isLoading ? (
        <ActivityIndicator style={styles.loader} color={palette.foreground} />
      ) : comments.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={30} color={palette.mutedForeground} />
          <Text style={styles.emptyText}>No comments yet — say something!</Text>
        </View>
      ) : (
        <View style={styles.commentList}>
          {comments.map((comment) => (
            <View key={comment.id} style={styles.comment}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{comment.authorName.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={styles.commentBody}>
                <Text style={styles.commentAuthor}>
                  {comment.authorName} <Text style={styles.commentTime}>· {timeAgo(comment.createdAt)}</Text>
                </Text>
                <Text style={styles.commentText}>{comment.text}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  card: {
    gap: 12,
    padding: 16,
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6E6E6",
  },
  badgeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 12,
    backgroundColor: palette.primary,
  },
  badgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5, color: palette.onPrimary },
  image: { width: "100%", aspectRatio: 4 / 3, borderRadius: 16 },
  question: { fontSize: 18, lineHeight: 24, fontWeight: "800", color: palette.foreground },
  description: { fontSize: 13, lineHeight: 18, color: palette.mutedForeground },
  options: { gap: 8 },
  option: {
    minHeight: 48,
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E3E4E7",
    backgroundColor: palette.surface,
  },
  optionMine: { borderColor: palette.primary },
  optionFill: { ...StyleSheet.absoluteFillObject, backgroundColor: "#F2F3F5" },
  optionFillWinner: { backgroundColor: palette.primarySoft },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  optionLabel: { flex: 1, fontSize: 14.5, fontWeight: "500", color: palette.foreground },
  optionLabelMine: { fontWeight: "700" },
  optionPercent: { fontSize: 14, fontWeight: "800", color: palette.foreground, fontVariant: ["tabular-nums"] },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  meta: { flex: 1, fontSize: 12.5, color: palette.mutedForeground },
  commentsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 32,
    paddingHorizontal: 11,
    borderRadius: 16,
    backgroundColor: palette.surfaceMuted,
  },
  commentsText: { fontSize: 12.5, fontWeight: "700", color: palette.foreground },
  loader: { marginTop: 30 },
  empty: { alignItems: "center", gap: 8, paddingVertical: 36 },
  emptyText: { fontSize: 13.5, color: palette.mutedForeground },
  error: { fontSize: 12.5, color: "#B4234A", marginBottom: 8 },
  commentList: { gap: 14, paddingBottom: 8 },
  comment: { flexDirection: "row", gap: 10 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  avatarText: { fontSize: 14, fontWeight: "800", color: palette.secondary },
  commentBody: { flex: 1, gap: 2 },
  commentAuthor: { fontSize: 13, fontWeight: "700", color: palette.foreground },
  commentTime: { fontWeight: "400", color: palette.mutedForeground },
  commentText: { fontSize: 14, lineHeight: 20, color: palette.foreground },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  composerInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 110,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#E3E4E7",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    fontSize: 15,
    color: palette.foreground,
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  sendDisabled: { opacity: 0.5 },
  signInButton: {
    height: 50,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.primary,
  },
  signInText: { fontSize: 15, fontWeight: "700", color: palette.onPrimary },
});
