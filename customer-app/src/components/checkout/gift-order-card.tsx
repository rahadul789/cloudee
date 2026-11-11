import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { palette } from "@/src/theme/palette";

export type GiftDraft = {
  enabled: boolean;
  recipientName: string;
  recipientPhone: string;
  message: string;
};

export const EMPTY_GIFT: GiftDraft = { enabled: false, recipientName: "", recipientPhone: "", message: "" };

const QUICK_MESSAGES = ["Happy birthday 🎂", "Eid Mubarak 🌙", "Miss you ❤️", "Enjoy your meal 😋"];

export function isGiftPhoneValid(phone: string) {
  const digits = phone.replace(/[^\d]/g, "").replace(/^880/, "0");
  return /^01[3-9]\d{8}$/.test(digits);
}

export function giftPayload(draft: GiftDraft) {
  if (!draft.enabled) return undefined;
  return {
    recipientName: draft.recipientName.trim(),
    recipientPhone: draft.recipientPhone.replace(/[^\d+]/g, ""),
    message: draft.message.trim() || undefined,
  };
}

/** Returns an error message, or "" when the gift is fine (or off). */
export function giftError(draft: GiftDraft) {
  if (!draft.enabled) return "";
  if (!draft.recipientName.trim()) return "Add the receiver's name.";
  if (!isGiftPhoneValid(draft.recipientPhone)) return "Add the receiver's mobile number (01XXXXXXXXX).";
  return "";
}

// Checkout card: "Send as a gift". Receiver gets the call + the food; the sender pays online.
export function GiftOrderCard({
  draft,
  onChange,
  available,
}: {
  draft: GiftDraft;
  onChange: (next: GiftDraft) => void;
  /** Gifts need online payment — false when bKash is off. */
  available: boolean;
}) {
  const set = (patch: Partial<GiftDraft>) => onChange({ ...draft, ...patch });
  const phoneInvalid = draft.recipientPhone.length >= 11 && !isGiftPhoneValid(draft.recipientPhone);

  return (
    <View style={[styles.card, draft.enabled ? styles.cardOn : null]}>
      <Pressable
        style={styles.header}
        onPress={() => available && set({ enabled: !draft.enabled })}
        disabled={!available}
        accessibilityRole="switch"
        accessibilityState={{ checked: draft.enabled, disabled: !available }}
      >
        <View style={styles.icon}>
          <Ionicons name="gift" size={18} color={palette.onPrimary} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Send as a gift</Text>
          <Text style={styles.subtitle}>
            {available
              ? "Order for family or friends — they pay nothing."
              : "Gifts need online payment, which is off right now."}
          </Text>
        </View>
        <Switch
          value={draft.enabled}
          onValueChange={(value) => set({ enabled: value })}
          disabled={!available}
          trackColor={{ false: "#D5D7DB", true: palette.primary }}
          thumbColor="#FFFFFF"
        />
      </Pressable>

      {draft.enabled ? (
        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Receiver&apos;s name</Text>
            <TextInput
              value={draft.recipientName}
              onChangeText={(value) => set({ recipientName: value.slice(0, 60) })}
              placeholder="e.g. Ammu"
              placeholderTextColor={palette.placeholder}
              style={styles.input}
              autoCapitalize="words"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Receiver&apos;s mobile (the rider calls this)</Text>
            <TextInput
              value={draft.recipientPhone}
              onChangeText={(value) => set({ recipientPhone: value.replace(/[^\d+]/g, "").slice(0, 14) })}
              placeholder="01XXXXXXXXX"
              placeholderTextColor={palette.placeholder}
              keyboardType="phone-pad"
              style={[styles.input, phoneInvalid ? styles.inputError : null]}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Message (optional)</Text>
            <View style={styles.chips}>
              {QUICK_MESSAGES.map((message) => {
                const active = draft.message === message;
                return (
                  <Pressable
                    key={message}
                    onPress={() => set({ message: active ? "" : message })}
                    style={[styles.chip, active ? styles.chipOn : null]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.chipText, active ? styles.chipTextOn : null]}>{message}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              value={draft.message}
              onChangeText={(value) => set({ message: value.slice(0, 160) })}
              placeholder="Write a short note"
              placeholderTextColor={palette.placeholder}
              style={[styles.input, styles.inputMultiline]}
              multiline
            />
          </View>
          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={15} color={palette.secondary} />
            <Text style={styles.noteText}>
              Set the delivery pin to the receiver&apos;s address above. You pay now with bKash; updates come to you.
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6E6E6",
    padding: 14,
    gap: 14,
    // Same side gutter as the other checkout cards, plus air under the address card.
    marginHorizontal: 18,
    marginTop: 6,
  },
  cardOn: { borderWidth: 1.5, borderColor: palette.primary },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  headerCopy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 15, fontWeight: "700", color: palette.foreground },
  subtitle: { fontSize: 12.5, lineHeight: 17, color: palette.mutedForeground },
  form: { gap: 12 },
  field: { gap: 6 },
  label: { fontSize: 12.5, fontWeight: "500", color: palette.mutedForeground },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E3E4E7",
    paddingHorizontal: 12,
    fontSize: 15,
    color: palette.foreground,
    backgroundColor: palette.surface,
  },
  inputError: { borderColor: "#D14B6A" },
  inputMultiline: { minHeight: 64, paddingTop: 10, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    height: 32,
    paddingHorizontal: 11,
    borderRadius: 16,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E3E4E7",
    backgroundColor: palette.surface,
  },
  chipOn: { borderColor: palette.primary, backgroundColor: palette.primary },
  chipText: { fontSize: 12.5, color: palette.foreground },
  chipTextOn: { fontWeight: "700", color: palette.onPrimary },
  note: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: palette.primarySoft,
  },
  noteText: { flex: 1, fontSize: 12, lineHeight: 17, color: palette.foreground },
});
