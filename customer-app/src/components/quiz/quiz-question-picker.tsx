import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { QuizBankQuestion } from "@/src/hooks/use-quiz-api";
import { palette } from "@/src/theme/palette";

const FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "সব" },
  { id: "mine", label: "✍️ আমার" },
  { id: "favourite", label: "🍗 প্রিয় খাবার" },
  { id: "habit", label: "🌶️ অভ্যাস" },
  { id: "hunger", label: "🌙 খিদে" },
  { id: "treat", label: "🧾 ট্রিট" },
  { id: "fun", label: "😂 মজার" },
];

// Bottom sheet to choose a specific question from the whole bank (instead of a random swap).
// The customer's own approved questions sit on top and have their own filter.
export function QuizQuestionPicker({
  visible,
  bank,
  usedIds,
  onPick,
  onClose,
}: {
  visible: boolean;
  bank: QuizBankQuestion[];
  /** Questions already in the quiz (hidden from the list). */
  usedIds: Set<string>;
  onPick: (question: QuizBankQuestion) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const hasMine = bank.some((question) => question.mine);
  const [filter, setFilter] = useState(hasMine ? "mine" : "all");

  const list = useMemo(() => {
    const available = bank.filter((question) => !usedIds.has(question.id));
    const filtered =
      filter === "all" ? available : filter === "mine" ? available.filter((q) => q.mine) : available.filter((q) => q.category === filter);
    return [...filtered].sort((a, b) => Number(Boolean(b.mine)) - Number(Boolean(a.mine)));
  }, [bank, filter, usedIds]);

  const filters = hasMine ? FILTERS : FILTERS.filter((item) => item.id !== "mine");

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>প্রশ্ন বেছে নাও</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={palette.foreground} />
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {filters.map((item) => {
            const selected = item.id === filter;
            return (
              <Pressable
                key={item.id}
                onPress={() => setFilter(item.id)}
                style={[styles.chip, selected ? styles.chipSelected : null]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {filter === "mine" ? "তোমার সব প্রশ্ন এই quiz-এ আছে 🎉" : "এই ধরনের আর কোনো প্রশ্ন নেই"}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPick(item)}
              style={({ pressed }) => [styles.item, item.mine ? styles.itemMine : null, pressed ? styles.pressed : null]}
              accessibilityRole="button"
            >
              <View style={styles.itemCopy}>
                {item.mine ? <Text style={styles.mineTag}>✍️ তোমার প্রশ্ন</Text> : null}
                <Text style={styles.itemText}>{item.text}</Text>
                <Text style={styles.itemOptions} numberOfLines={1}>
                  {item.options.map((option) => option.label).join(" · ")}
                </Text>
              </View>
              <Ionicons name="add-circle" size={24} color={palette.secondary} />
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    maxHeight: "80%",
    backgroundColor: palette.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 8,
  },
  handle: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: "#DADCE0" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 10 },
  title: { fontSize: 18, fontWeight: "700", color: palette.foreground },
  filters: { gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E3E4E7",
    backgroundColor: palette.surface,
  },
  chipSelected: { backgroundColor: palette.primary, borderColor: palette.primary },
  chipText: { fontSize: 13.5, color: palette.foreground },
  chipTextSelected: { fontWeight: "700", color: palette.onPrimary },
  list: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ECECEE",
    backgroundColor: palette.surface,
  },
  itemMine: { backgroundColor: palette.primarySoft, borderColor: "#F3D8A8" },
  itemCopy: { flex: 1, minWidth: 0, gap: 3 },
  mineTag: { fontSize: 12, fontWeight: "700", color: palette.secondary },
  itemText: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: palette.foreground },
  itemOptions: { fontSize: 12.5, color: palette.mutedForeground },
  empty: { padding: 24, textAlign: "center", fontSize: 14, color: palette.mutedForeground },
  pressed: { opacity: 0.85 },
});
