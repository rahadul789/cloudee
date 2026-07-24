import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { RemoteImage } from "@/src/components/remote-image";
import {
  submitHomePollVote,
  type HomePollResults,
} from "@/src/hooks/use-customer-api";
import { getStableCustomerInstallId } from "@/src/lib/customer-install-id";
import { markPollVoted } from "@/src/lib/poll-vote-storage";
import { palette } from "@/src/theme/palette";
import type { CustomerActivePoll } from "@/src/types/restaurant";

// A calm, coarse "Ends in …" label computed once (no ticking timer) — the poll deadline is
// hours/days away, so a live per-second countdown would only waste renders.
function formatEndsLabel(endsAt: string | null): string | null {
  if (!endsAt) return null;
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(end)) return null;
  const diff = end - Date.now();
  if (diff <= 0) return null;
  const days = Math.floor(diff / (24 * 3600 * 1000));
  if (days >= 1) return `Ends in ${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.floor(diff / (3600 * 1000));
  if (hours >= 1) return `Ends in ${hours} hour${hours === 1 ? "" : "s"}`;
  const mins = Math.max(1, Math.floor(diff / (60 * 1000)));
  return `Ends in ${mins} min`;
}

export function HomePollModal({
  poll,
  onClose,
  onVoted,
}: {
  poll: CustomerActivePoll;
  onClose: () => void;
  onVoted: (pollId: string) => void;
}) {
  const imageUrl = poll.imageUrl;
  // Pink (not the coral primary) so the radios, borders, progress bars and buttons match
  // the rest of the app's pink UI.
  const accent = palette.secondary;
  const { height: windowHeight } = useWindowDimensions();

  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [result, setResult] = useState<{
    thanks: string;
    results: HomePollResults | null;
  } | null>(null);

  // Lift the centered card above the keyboard: reduce the centering space (paddingBottom on
  // the overlay) and cap the card height so its pinned Submit stays visible while typing.
  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (event) =>
      setKeyboardHeight(event.endCoordinates?.height ?? 0),
    );
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const endsLabel = useMemo(() => formatEndsLabel(poll.endsAt), [poll.endsAt]);

  async function handleSubmit() {
    if (!selectedOption || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const deviceId = await getStableCustomerInstallId();
      const response = await submitHomePollVote({
        pollId: poll.pollId,
        optionId: selectedOption,
        deviceId,
        feedback: poll.allowFeedback ? feedback.trim() : undefined,
      });
      await markPollVoted(poll.pollId);
      onVoted(poll.pollId);
      setResult({
        thanks: response.thanksMessage || "Thanks for your response!",
        results: response.results,
      });
    } catch (err) {
      // Surface the backend's own message ("Voting for this poll has ended.", etc.) so the
      // reason is clear instead of a blanket failure.
      const message = err instanceof Error && err.message ? err.message : "";
      setError(message || "Could not submit right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const cardStyle = [
    styles.card,
    { backgroundColor: palette.surface },
    keyboardHeight > 0
      ? { maxHeight: Math.max(240, windowHeight - keyboardHeight - 44) }
      : null,
  ];

  const overlayStyle = [
    styles.overlay,
    keyboardHeight > 0 ? { paddingBottom: keyboardHeight } : null,
  ];

  const card = result ? (
    <View style={cardStyle}>
      <Pressable style={styles.close} onPress={onClose} hitSlop={8}>
        <Ionicons name="close" size={18} color={palette.foreground} />
      </Pressable>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.thanksScroll}
      >
        <View style={[styles.thanksIcon, { backgroundColor: `${accent}22` }]}>
          <Ionicons name="checkmark-circle" size={42} color={accent} />
        </View>
        <Text style={styles.thanksTitle}>{result.thanks}</Text>
        {result.results ? (
          <View style={styles.resultsWrap}>
            {result.results.options.map((option) => {
              const pct =
                result.results!.total > 0
                  ? Math.round((option.count / result.results!.total) * 100)
                  : 0;
              return (
                <View key={option.id} style={styles.resultRow}>
                  <View style={styles.resultLabelRow}>
                    <Text style={styles.resultLabel} numberOfLines={1}>
                      {option.label}
                    </Text>
                    <Text style={styles.resultPct}>{pct}%</Text>
                  </View>
                  <View style={styles.resultTrack}>
                    <View
                      style={[
                        styles.resultFill,
                        { width: `${pct}%`, backgroundColor: accent },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
            <Text style={styles.resultTotal}>
              {result.results.total} vote{result.results.total === 1 ? "" : "s"}
            </Text>
          </View>
        ) : null}
      </ScrollView>
      <Pressable
        style={({ pressed }) => [
          styles.submit,
          { backgroundColor: accent },
          pressed ? styles.submitPressed : null,
        ]}
        onPress={onClose}
      >
        <Text style={styles.submitText}>Done</Text>
      </Pressable>
    </View>
  ) : (
    <View style={cardStyle}>
      <Pressable style={styles.close} onPress={onClose} hitSlop={8}>
        <Ionicons name="close" size={18} color={palette.foreground} />
      </Pressable>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {imageUrl ? (
          <RemoteImage
            uri={imageUrl}
            style={styles.image}
            fallbackIcon="image-outline"
          />
        ) : null}
        {endsLabel ? (
          <View style={[styles.endsPill, { backgroundColor: `${accent}18` }]}>
            <Ionicons name="time-outline" size={12} color={accent} />
            <Text style={[styles.endsText, { color: accent }]}>{endsLabel}</Text>
          </View>
        ) : null}
        {poll.question.trim() ? (
          <Text style={styles.question}>{poll.question.trim()}</Text>
        ) : null}
        <View style={styles.options}>
          {poll.options.map((option) => {
            const active = selectedOption === option.id;
            return (
              <Pressable
                key={option.id}
                style={({ pressed }) => [
                  styles.option,
                  active
                    ? { borderColor: accent, backgroundColor: `${accent}12` }
                    : null,
                  pressed ? styles.optionPressed : null,
                ]}
                onPress={() => setSelectedOption(option.id)}
              >
                <View style={[styles.radio, active ? { borderColor: accent } : null]}>
                  {active ? (
                    <View style={[styles.radioDot, { backgroundColor: accent }]} />
                  ) : null}
                </View>
                <Text style={styles.optionLabel}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {poll.allowFeedback ? (
          <TextInput
            style={styles.feedback}
            value={feedback}
            onChangeText={setFeedback}
            placeholder={poll.feedbackPrompt || "Tell us more (optional)"}
            placeholderTextColor={palette.mutedForeground}
            multiline
            maxLength={500}
          />
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <Pressable
        style={({ pressed }) => [
          styles.submit,
          { backgroundColor: accent },
          !selectedOption || submitting ? styles.submitDisabled : null,
          pressed && selectedOption && !submitting ? styles.submitPressed : null,
        ]}
        onPress={handleSubmit}
        disabled={!selectedOption || submitting}
      >
        {submitting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.submitText}>Submit</Text>
        )}
      </Pressable>
    </View>
  );

  return (
    <View style={overlayStyle}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      {card}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(35, 24, 30, 0.45)",
  },
  card: {
    width: "100%",
    maxHeight: "84%",
    borderRadius: 18,
    backgroundColor: palette.surface,
    padding: 14,
    gap: 12,
    overflow: "hidden",
  },
  close: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 5,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  scroll: {
    gap: 12,
    paddingBottom: 4,
  },
  image: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    backgroundColor: "#FFF1F6",
  },
  endsPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  endsText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  question: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    color: palette.foreground,
  },
  options: {
    gap: 9,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 13,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  optionPressed: {
    opacity: 0.92,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: palette.mutedForeground,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  optionLabel: {
    flex: 1,
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: "600",
    color: palette.foreground,
  },
  feedback: {
    minHeight: 72,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: palette.border,
    padding: 12,
    fontSize: 14,
    color: palette.foreground,
    textAlignVertical: "top",
  },
  error: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#C0392B",
  },
  submit: {
    marginTop: "auto",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
    borderRadius: 999,
    backgroundColor: palette.primary,
  },
  submitPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitText: {
    fontSize: 14.5,
    fontWeight: "900",
    color: "#fff",
  },
  thanksScroll: {
    alignItems: "center",
    gap: 12,
    paddingTop: 18,
    paddingBottom: 4,
  },
  thanksIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  thanksTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    textAlign: "center",
    color: palette.foreground,
  },
  resultsWrap: {
    width: "100%",
    gap: 11,
    marginTop: 4,
  },
  resultRow: {
    gap: 6,
  },
  resultLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  resultLabel: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "700",
    color: palette.foreground,
  },
  resultPct: {
    fontSize: 13,
    fontWeight: "800",
    color: palette.mutedForeground,
    fontVariant: ["tabular-nums"],
  },
  resultTrack: {
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: palette.surfaceMuted,
  },
  resultFill: {
    height: "100%",
    borderRadius: 999,
  },
  resultTotal: {
    fontSize: 12,
    fontWeight: "600",
    color: palette.mutedForeground,
    textAlign: "center",
    marginTop: 2,
  },
});
