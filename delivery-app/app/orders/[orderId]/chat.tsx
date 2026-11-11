import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  makeClientMessageId,
  useRiderMarkOrderChatReadMutation,
  useRiderOrderChatQuery,
  useRiderSendOrderChatMutation,
} from "@/src/hooks/use-rider-order-chat";
import { useRiderOrderChatLive } from "@/src/hooks/use-rider-order-chat-live";
import { useDeliveryCopy } from "@/src/lib/copy";
import {
  RIDER_QUICK_REPLIES,
  setOpenChatOrderId,
  type OrderChatMessage,
} from "@/src/lib/order-chat";
import { palette } from "@/src/theme/palette";

const TEXT = {
  bn: {
    customer: "গ্রাহক",
    order: "অর্ডার",
    placeholder: "মেসেজ লিখুন…",
    emptyTitle: "গ্রাহককে মেসেজ দিন",
    emptyText: "লোকেশন বা দেরির খবর জানাতে নিচের দ্রুত বার্তা ব্যবহার করুন।",
    closedNoRider: "রাইডার অ্যাসাইন হলে চ্যাট চালু হবে।",
    closedFinished: "অর্ডার শেষ, তাই চ্যাট বন্ধ।",
    loadError: "চ্যাট খোলা যায়নি",
    retry: "আবার চেষ্টা করুন",
    notSent: "পাঠানো যায়নি · আবার চেষ্টা করতে চাপুন",
  },
  en: {
    customer: "Customer",
    order: "Order",
    placeholder: "Write a message…",
    emptyTitle: "Message the customer",
    emptyText: "Use a quick reply below to share your location or a delay.",
    closedNoRider: "Chat opens once a rider is assigned.",
    closedFinished: "This order is finished, so the chat is closed.",
    loadError: "Couldn't open the chat",
    retry: "Try again",
    notSent: "Not sent · tap to retry",
  },
} as const;

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${suffix}`;
}

// Rider side of the rider ↔ customer order chat (live via rider-socket-bridge).
export default function RiderOrderChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language } = useDeliveryCopy();
  const t = TEXT[language === "en" ? "en" : "bn"];
  const quickReplies = RIDER_QUICK_REPLIES[language === "en" ? "en" : "bn"];
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId : undefined;
  const [isFocused, setIsFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      setOpenChatOrderId(id ?? "");
      return () => {
        setIsFocused(false);
        setOpenChatOrderId("");
      };
    }, [id]),
  );
  // Live socket while open; poll fast only if the socket is down, slow safety net otherwise.
  const socketLive = useRiderOrderChatLive(id, isFocused);
  const threadQuery = useRiderOrderChatQuery(id, true, isFocused ? (socketLive ? 20_000 : 3_000) : false);
  const { refetch: refetchThread } = threadQuery;
  useFocusEffect(
    useCallback(() => {
      void refetchThread();
    }, [refetchThread]),
  );
  const sendMutation = useRiderSendOrderChatMutation(id);
  const { mutate: markRead } = useRiderMarkOrderChatReadMutation(id);
  const [draft, setDraft] = useState("");
  const thread = threadQuery.data;
  const unread = thread?.unreadCount ?? 0;

  useEffect(() => {
    if (isFocused && unread > 0) markRead();
  }, [isFocused, unread, markRead]);

  const send = (text: string) => {
    const clean = text.trim();
    if (!clean || !thread?.canSend) return;
    sendMutation.mutate({ text: clean, clientMessageId: makeClientMessageId() });
    setDraft("");
  };
  const retry = (message: OrderChatMessage) =>
    sendMutation.mutate({ text: message.text, clientMessageId: message.clientMessageId });

  const reversed = useMemo(() => [...(thread?.messages ?? [])].reverse(), [thread?.messages]);
  const closedText =
    thread?.closedReason === "no_rider"
      ? t.closedNoRider
      : thread?.closedReason === "order_finished"
        ? t.closedFinished
        : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={20} color={palette.foreground} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>{t.customer}</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {thread?.counterpart.name || t.customer}
          </Text>
        </View>
        {thread ? (
          <Text style={styles.headerOrder}>
            {t.order} #{thread.orderNumber}
          </Text>
        ) : null}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 56 : 0}
      >
        {threadQuery.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : threadQuery.isError || !thread ? (
          <View style={styles.center}>
            <Text style={styles.errorTitle}>{t.loadError}</Text>
            <Pressable style={styles.retryButton} onPress={() => void threadQuery.refetch()}>
              <Text style={styles.retryButtonText}>{t.retry}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {reversed.length === 0 ? (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="chatbubbles" size={28} color="#FFFFFF" />
                </View>
                <Text style={styles.emptyTitle}>{t.emptyTitle}</Text>
                <Text style={styles.emptyText}>{t.emptyText}</Text>
              </View>
            ) : (
              <FlatList
                inverted
                data={reversed}
                keyExtractor={(item) => item.id || item.clientMessageId}
                contentContainerStyle={styles.list}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const mine = item.senderRole === "rider";
                  return (
                    <View style={[styles.row, mine ? styles.rowMine : null]}>
                      <Pressable
                        disabled={!item.failed}
                        onPress={() => retry(item)}
                        style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
                      >
                        <Text style={[styles.bubbleText, mine ? styles.bubbleTextMine : null]}>
                          {item.text}
                        </Text>
                        <View style={styles.meta}>
                          <Text style={[styles.time, mine ? styles.timeMine : null]}>
                            {formatTime(item.createdAt)}
                          </Text>
                          {mine ? (
                            item.failed ? (
                              <Ionicons name="alert-circle" size={13} color="#FFE1E1" />
                            ) : item.pending ? (
                              <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.8)" />
                            ) : (
                              <Ionicons
                                name={item.readAt ? "checkmark-done" : "checkmark"}
                                size={14}
                                color="#FFFFFF"
                              />
                            )
                          ) : null}
                        </View>
                      </Pressable>
                      {item.failed ? <Text style={styles.failText}>{t.notSent}</Text> : null}
                    </View>
                  );
                }}
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
                  {quickReplies.map((reply) => (
                    <Pressable
                      key={reply}
                      onPress={() => send(reply)}
                      style={({ pressed }) => [styles.quick, pressed ? styles.pressed : null]}
                    >
                      <Text style={styles.quickText}>{reply}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={styles.inputRow}>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    placeholder={t.placeholder}
                    placeholderTextColor={palette.placeholder}
                    multiline
                    maxLength={500}
                    style={styles.input}
                  />
                  <Pressable
                    onPress={() => send(draft)}
                    disabled={!draft.trim()}
                    style={({ pressed }) => [
                      styles.send,
                      !draft.trim() ? styles.sendDisabled : null,
                      pressed ? styles.pressed : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Send"
                  >
                    <Ionicons
                      name="send"
                      size={18}
                      color={draft.trim() ? "#FFFFFF" : palette.mutedForeground}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.surface },
  flex: { flex: 1, backgroundColor: palette.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
    backgroundColor: palette.surface,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.border,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  headerEyebrow: { fontSize: 11.5, lineHeight: 15, color: palette.mutedForeground },
  headerTitle: { fontSize: 17, lineHeight: 22, fontWeight: "700", color: palette.foreground },
  headerOrder: { fontSize: 12.5, lineHeight: 16, fontWeight: "600", color: palette.mutedForeground },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  errorTitle: { fontSize: 15, fontWeight: "700", color: palette.foreground },
  retryButton: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: palette.primary },
  retryButtonText: { color: "#FFFFFF", fontWeight: "700" },
  list: { paddingHorizontal: 14, paddingVertical: 14, flexGrow: 1 },
  row: { alignItems: "flex-start", marginVertical: 3 },
  rowMine: { alignItems: "flex-end" },
  bubble: { maxWidth: "80%", paddingHorizontal: 13, paddingTop: 9, paddingBottom: 6, borderRadius: 18, gap: 3 },
  bubbleMine: { backgroundColor: palette.primary, borderBottomRightRadius: 6 },
  bubbleTheirs: {
    backgroundColor: palette.surface,
    borderBottomLeftRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  bubbleText: { fontSize: 15, lineHeight: 21, color: palette.foreground },
  bubbleTextMine: { color: "#FFFFFF" },
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 },
  time: { fontSize: 10.5, lineHeight: 13, color: palette.mutedForeground },
  timeMine: { color: "rgba(255,255,255,0.85)" },
  failText: { marginTop: 2, fontSize: 11, color: palette.danger },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 30,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: palette.foreground },
  emptyText: { fontSize: 13.5, lineHeight: 19, color: palette.mutedForeground, textAlign: "center" },
  composer: {
    paddingTop: 8,
    gap: 8,
    backgroundColor: palette.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  quickRow: { paddingHorizontal: 12, gap: 8 },
  quick: {
    paddingHorizontal: 14,
    height: 36,
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: palette.primarySoft,
  },
  quickText: { fontSize: 13.5, fontWeight: "600", color: palette.foreground },
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
    color: palette.foreground,
    backgroundColor: palette.surfaceMuted,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  sendDisabled: { backgroundColor: palette.surfaceMuted },
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
    borderTopColor: palette.border,
  },
  closedText: { fontSize: 13, color: palette.mutedForeground },
});
