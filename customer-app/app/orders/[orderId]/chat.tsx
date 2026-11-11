import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { Screen } from "@/src/components/screen";
import { AppHeader, Chip } from "@/src/components/ui";
import {
  makeClientMessageId,
  useCustomerMarkOrderChatReadMutation,
  useCustomerOrderChatQuery,
  useCustomerSendOrderChatMutation,
} from "@/src/hooks/use-order-chat";
import { useOrderChatLive } from "@/src/hooks/use-order-chat-live";
import { formatShortOrderIdLabel } from "@/src/lib/order-id";
import { CUSTOMER_QUICK_REPLIES, type OrderChatMessage } from "@/src/lib/order-chat";
import { palette } from "@/src/theme/palette";

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${suffix}`;
}

function Bubble({
  message,
  mine,
  onRetry,
}: {
  message: OrderChatMessage;
  mine: boolean;
  onRetry: (message: OrderChatMessage) => void;
}) {
  return (
    <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : null]}>
      <Pressable
        disabled={!message.failed}
        onPress={() => onRetry(message)}
        style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
      >
        <Text style={[styles.bubbleText, mine ? styles.bubbleTextMine : null]}>{message.text}</Text>
        <View style={styles.bubbleMeta}>
          <Text style={[styles.bubbleTime, mine ? styles.bubbleTimeMine : null]}>
            {formatTime(message.createdAt)}
          </Text>
          {mine ? (
            message.failed ? (
              <Ionicons name="alert-circle" size={13} color="#C62828" />
            ) : message.pending ? (
              <Ionicons name="time-outline" size={12} color="rgba(17,17,17,0.55)" />
            ) : (
              <Ionicons
                name={message.readAt ? "checkmark-done" : "checkmark"}
                size={14}
                color={message.readAt ? "#0B6E4F" : "rgba(17,17,17,0.55)"}
              />
            )
          ) : null}
        </View>
      </Pressable>
      {message.failed ? <Text style={styles.retryText}>Not sent · tap to retry</Text> : null}
    </View>
  );
}

// Rider ↔ customer chat for one order. Opens once a rider is assigned; read-only after the
// order is finished. Live via socket (use-customer-socket), optimistic sends, read receipts.
export default function OrderChatScreen() {
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId : undefined;
  const [isFocused, setIsFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );
  // Live socket while open; poll fast only if the socket is down, slow safety net otherwise.
  const socketLive = useOrderChatLive(id, isFocused);
  const threadQuery = useCustomerOrderChatQuery(id, isFocused, socketLive ? 20_000 : 3_000);
  const { refetch: refetchThread } = threadQuery;
  useFocusEffect(
    useCallback(() => {
      void refetchThread();
    }, [refetchThread]),
  );
  const sendMutation = useCustomerSendOrderChatMutation(id);
  const markRead = useCustomerMarkOrderChatReadMutation(id);
  const [draft, setDraft] = useState("");
  const thread = threadQuery.data;

  // Anything that arrives while the chat is on screen counts as read.
  const unread = thread?.unreadCount ?? 0;
  const { mutate: markReadMutate } = markRead;
  useEffect(() => {
    if (isFocused && unread > 0) markReadMutate();
  }, [isFocused, unread, markReadMutate]);

  const send = (text: string) => {
    const clean = text.trim();
    if (!clean || !thread?.canSend) return;
    sendMutation.mutate({ text: clean, clientMessageId: makeClientMessageId() });
    setDraft("");
  };
  const retry = (message: OrderChatMessage) =>
    sendMutation.mutate({ text: message.text, clientMessageId: message.clientMessageId });

  // Inverted list = newest at the bottom, keyboard-friendly.
  const reversed = useMemo(() => [...(thread?.messages ?? [])].reverse(), [thread?.messages]);
  const closedText =
    thread?.closedReason === "no_rider"
      ? "Chat opens once a rider is assigned to your order."
      : thread?.closedReason === "order_finished"
        ? "This order is finished, so the chat is closed."
        : null;

  return (
    <Screen>
      <AppHeader
        eyebrow="Your rider"
        title={thread?.counterpart.name || "Rider chat"}
        subtitle={thread ? `Order ${formatShortOrderIdLabel(thread.orderNumber)}` : undefined}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 60 : 0}
      >
        {threadQuery.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={palette.secondary} />
          </View>
        ) : threadQuery.isError || !thread ? (
          <View style={styles.centerPad}>
            <ErrorRetryCard
              title="Couldn't open the chat"
              description="Check your connection and try again."
              onRetry={() => void threadQuery.refetch()}
              retrying={threadQuery.isFetching}
            />
          </View>
        ) : (
          <>
            {reversed.length === 0 ? (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="chatbubbles" size={30} color={palette.onPrimary} />
                </View>
                <Text style={styles.emptyTitle}>Message your rider</Text>
                <Text style={styles.emptyText}>
                  Share directions or a quick note — {thread.counterpart.name} will see it
                  right away.
                </Text>
              </View>
            ) : (
              <FlatList
                inverted
                data={reversed}
                keyExtractor={(item) => item.id || item.clientMessageId}
                contentContainerStyle={styles.list}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Bubble message={item} mine={item.senderRole === "customer"} onRetry={retry} />
                )}
              />
            )}

            {thread.canSend ? (
              <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.quickRow}
                  keyboardShouldPersistTaps="handled"
                >
                  {CUSTOMER_QUICK_REPLIES.map((reply) => (
                    <Chip key={reply} label={reply} onPress={() => send(reply)} />
                  ))}
                </ScrollView>
                <View style={styles.inputRow}>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Write a message…"
                    placeholderTextColor={palette.placeholder}
                    multiline
                    maxLength={500}
                    style={styles.input}
                  />
                  <Pressable
                    onPress={() => send(draft)}
                    disabled={!draft.trim()}
                    style={({ pressed }) => [
                      styles.sendButton,
                      !draft.trim() ? styles.sendButtonDisabled : null,
                      pressed ? styles.pressed : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Send message"
                  >
                    <Ionicons
                      name="send"
                      size={18}
                      color={draft.trim() ? palette.onPrimary : palette.mutedForeground}
                    />
                  </Pressable>
                </View>
              </View>
            ) : closedText ? (
              <View style={[styles.closed, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                <Ionicons name="lock-closed-outline" size={15} color={palette.mutedForeground} />
                <Text style={styles.closedText}>{closedText}</Text>
              </View>
            ) : null}
          </>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  centerPad: { padding: 16 },
  list: { paddingHorizontal: 14, paddingVertical: 14, gap: 6, flexGrow: 1 },
  bubbleRow: { alignItems: "flex-start", marginVertical: 3 },
  bubbleRowMine: { alignItems: "flex-end" },
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: 13,
    paddingTop: 9,
    paddingBottom: 6,
    borderRadius: 18,
    gap: 3,
  },
  bubbleMine: { backgroundColor: palette.primary, borderBottomRightRadius: 6 },
  bubbleTheirs: {
    backgroundColor: palette.surface,
    borderBottomLeftRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E4E6",
  },
  bubbleText: { fontSize: 15, lineHeight: 20, color: palette.foreground },
  bubbleTextMine: { color: palette.onPrimary },
  bubbleMeta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 },
  bubbleTime: { fontSize: 10.5, lineHeight: 13, color: palette.mutedForeground },
  bubbleTimeMine: { color: "rgba(17,17,17,0.6)" },
  retryText: { marginTop: 2, fontSize: 11, lineHeight: 14, color: "#C62828" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 30,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, lineHeight: 24, fontWeight: "700", color: palette.foreground },
  emptyText: { fontSize: 13.5, lineHeight: 19, color: palette.mutedForeground, textAlign: "center" },
  composer: {
    paddingTop: 8,
    gap: 8,
    backgroundColor: palette.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E3E4E6",
  },
  quickRow: { paddingHorizontal: 12, gap: 8 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: 22,
    fontSize: 15,
    lineHeight: 20,
    color: palette.foreground,
    backgroundColor: palette.surfaceMuted,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  sendButtonDisabled: { backgroundColor: palette.surfaceMuted },
  pressed: { opacity: 0.8 },
  closed: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 12,
    paddingHorizontal: 16,
    backgroundColor: palette.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E3E4E6",
  },
  closedText: { fontSize: 13, lineHeight: 18, color: palette.mutedForeground },
});
