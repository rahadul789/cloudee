import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Screen } from "@/src/components/screen";
import { useOwnerLanguageStore } from "@/src/i18n/language-store";
import {
  cancelExternalDelivery,
  createExternalDelivery,
  getExternalDeliveryConfig,
  listExternalDeliveries,
  type ExternalSettlementStatus,
  type OwnerExternalDelivery,
} from "@/src/lib/external-delivery-api";
import { palette } from "@/src/theme/palette";

const COPY = {
  bn: {
    title: "ফুডবেলা ডেলিভারি",
    intro:
      "নিজের চ্যানেলে (ফেসবুক/হোয়াটসঅ্যাপ) অর্ডার পেয়েছেন? ফুডবেলা রাইডার দিয়ে ডেলিভারি করান — আমরা টাকা তুলে আপনার অংশ ফেরত দিই।",
    notEnabled:
      "আপনার রেস্টুরেন্টের জন্য এই সেবা এখনো চালু হয়নি। চালু করতে ফুডবেলা সাপোর্টে যোগাযোগ করুন।",
    newRequest: "নতুন ডেলিভারি রিকোয়েস্ট",
    feeLabel: "ফুডবেলা ডেলিভারি ফি",
    customerName: "কাস্টমারের নাম",
    customerPhone: "কাস্টমারের ফোন",
    address: "ডেলিভারি ঠিকানা",
    orderValue: "অর্ডার মূল্য (খাবার)",
    payment: "পেমেন্ট",
    cod: "ক্যাশ অন ডেলিভারি",
    online: "অনলাইন",
    riderCollects: "রাইডার তুলবে",
    deliveryFee: "ফুডবেলা ফি",
    youReceive: "আপনি পাবেন",
    submit: "ডেলিভারি রিকোয়েস্ট করুন",
    yourRequests: "আপনার রিকোয়েস্ট",
    live: "চলমান",
    history: "হিস্টোরি",
    emptyLive: "কোনো চলমান রিকোয়েস্ট নেই।",
    emptyHistory: "কোনো পুরনো রিকোয়েস্ট নেই।",
    cancel: "বাতিল",
    cancelConfirm: "রিকোয়েস্ট বাতিল করবেন?",
    requested: "রিকোয়েস্ট হয়েছে — শিগগিরই রাইডার অ্যাসাইন হবে।",
    cancelled: "রিকোয়েস্ট বাতিল হয়েছে।",
    fillAll: "সব তথ্য ঠিকভাবে পূরণ করুন।",
    rider: "রাইডার",
  },
  en: {
    title: "Foodbela Delivery",
    intro:
      "Got an order on your own channel (Facebook/WhatsApp)? Let a Foodbela rider deliver it — we collect the payment and pay your share back.",
    notEnabled:
      "This service is not enabled for your restaurant yet. Please contact Foodbela support to turn it on.",
    newRequest: "New delivery request",
    feeLabel: "Foodbela delivery fee",
    customerName: "Customer name",
    customerPhone: "Customer phone",
    address: "Delivery address",
    orderValue: "Order value (food)",
    payment: "Payment",
    cod: "Cash on delivery",
    online: "Online",
    riderCollects: "Rider collects",
    deliveryFee: "Foodbela fee",
    youReceive: "You receive",
    submit: "Request delivery",
    yourRequests: "Your requests",
    live: "Live",
    history: "History",
    emptyLive: "No active delivery requests.",
    emptyHistory: "No past delivery requests.",
    cancel: "Cancel",
    cancelConfirm: "Cancel this request?",
    requested: "Requested — a rider will be assigned shortly.",
    cancelled: "Request cancelled.",
    fillAll: "Please fill in all fields correctly.",
    rider: "Rider",
  },
};

function formatTk(value?: number | null) {
  return `Tk ${Math.round(Number(value || 0)).toLocaleString()}`;
}

const SETTLEMENT_TONE: Record<
  ExternalSettlementStatus,
  { bg: string; border: string; color: string; bn: string; en: string }
> = {
  pending: { bg: palette.surfaceMuted, border: palette.border, color: palette.mutedForeground, bn: "চলছে", en: "In progress" },
  collected: { bg: "#EAF2FF", border: "#C8D4FF", color: "#1D4ED8", bn: "পেমেন্ট প্রসেসিং", en: "Payout processing" },
  reconciled: { bg: "#EAF2FF", border: "#C8D4FF", color: "#1D4ED8", bn: "পেমেন্ট প্রসেসিং", en: "Payout processing" },
  settled: { bg: palette.successSoft, border: "#BFE6D1", color: palette.success, bn: "পরিশোধ হয়েছে", en: "Paid to you" },
  held: { bg: "#F3E8FF", border: "#D8B4FE", color: "#7E22CE", bn: "হোল্ড", en: "On hold" },
  cancelled: { bg: palette.dangerSoft, border: "#F5B8B0", color: palette.danger, bn: "বাতিল", en: "Cancelled" },
};

export default function ExternalDeliveryScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const language = useOwnerLanguageStore((state) => state.language);
  const c = COPY[language];

  const [tab, setTab] = useState<"live" | "history">("live");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [orderValue, setOrderValue] = useState("");
  const [paymentMode, setPaymentMode] = useState<"cod" | "online">("cod");

  const configQuery = useQuery({
    queryKey: ["owner-external-delivery-config"],
    queryFn: getExternalDeliveryConfig,
    staleTime: 60_000,
  });
  const enabled = configQuery.data?.enabled === true;
  const deliveryFee = configQuery.data?.deliveryFeeTaka ?? 0;

  const valueNum = Number(orderValue);
  const hasValidValue = orderValue.trim() !== "" && valueNum > 0;

  const listQuery = useQuery({
    queryKey: ["owner-external-deliveries", tab],
    queryFn: () => listExternalDeliveries({ tab, pageSize: 50 }),
    staleTime: 10_000,
    enabled,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createExternalDelivery({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        dropAddress: address.trim(),
        orderValue: valueNum,
        paymentMode,
      }),
    onSuccess: () => {
      Alert.alert(c.title, c.requested);
      setCustomerName("");
      setCustomerPhone("");
      setAddress("");
      setOrderValue("");
      void queryClient.invalidateQueries({ queryKey: ["owner-external-deliveries"] });
    },
    onError: (error) =>
      Alert.alert(c.title, error instanceof Error ? error.message : c.fillAll),
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => cancelExternalDelivery(orderId),
    onSuccess: () => {
      Alert.alert(c.title, c.cancelled);
      void queryClient.invalidateQueries({ queryKey: ["owner-external-deliveries"] });
    },
    onError: (error) =>
      Alert.alert(c.title, error instanceof Error ? error.message : c.fillAll),
  });

  const canSubmit =
    customerName.trim() !== "" &&
    customerPhone.trim() !== "" &&
    address.trim() !== "" &&
    hasValidValue;

  // Customer always pays the delivery fee on top; the owner receives the order value.
  const collectAmount = hasValidValue ? valueNum + deliveryFee : null;

  function confirmCancel(order: OwnerExternalDelivery) {
    Alert.alert(c.title, `${c.cancelConfirm}\n${order.orderNumber}`, [
      { text: c.cancel, style: "cancel" },
      { text: "OK", onPress: () => cancelMutation.mutate(order.orderId) },
    ]);
  }

  const orders = listQuery.data?.items ?? [];

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Pressable hitSlop={10} style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={21} color={palette.foreground} />
            </Pressable>
            <Text style={styles.title}>{c.title}</Text>
            <View style={styles.headerSpacer} />
          </View>

          <Text style={styles.intro}>{c.intro}</Text>

          {configQuery.isLoading ? (
            <ActivityIndicator style={styles.loader} color={palette.primary} />
          ) : !enabled ? (
            <View style={styles.card}>
              <Text style={styles.notEnabled}>{c.notEnabled}</Text>
            </View>
          ) : (
            <>
              <View style={styles.card}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>{c.newRequest}</Text>
                  <View style={styles.feeChip}>
                    <Ionicons name="bicycle-outline" size={13} color={palette.primary} />
                    <Text style={styles.feeChipText}>
                      {c.feeLabel}: {formatTk(deliveryFee)}
                    </Text>
                  </View>
                </View>

                <Field label={c.customerName}>
                  <TextInput
                    value={customerName}
                    onChangeText={setCustomerName}
                    style={styles.input}
                    placeholderTextColor={palette.mutedForeground}
                  />
                </Field>
                <Field label={c.customerPhone}>
                  <TextInput
                    value={customerPhone}
                    onChangeText={setCustomerPhone}
                    keyboardType="phone-pad"
                    style={styles.input}
                    placeholder="01XXXXXXXXX"
                    placeholderTextColor={palette.mutedForeground}
                  />
                </Field>
                <Field label={c.address}>
                  <TextInput
                    value={address}
                    onChangeText={setAddress}
                    style={styles.input}
                    placeholder="House, road, area…"
                    placeholderTextColor={palette.mutedForeground}
                  />
                </Field>
                <Field label={c.orderValue}>
                  <TextInput
                    value={orderValue}
                    onChangeText={setOrderValue}
                    keyboardType="numeric"
                    style={styles.input}
                    placeholderTextColor={palette.mutedForeground}
                  />
                </Field>

                <Text style={styles.fieldLabel}>{c.payment}</Text>
                <View style={styles.segment}>
                  <SegmentButton
                    label={c.cod}
                    active={paymentMode === "cod"}
                    onPress={() => setPaymentMode("cod")}
                  />
                  <SegmentButton
                    label={c.online}
                    active={paymentMode === "online"}
                    onPress={() => setPaymentMode("online")}
                  />
                </View>

                {collectAmount != null ? (
                  <View style={styles.splitCard}>
                    <SplitRow label={c.riderCollects} value={formatTk(collectAmount)} />
                    <SplitRow
                      label={c.deliveryFee}
                      value={`− ${formatTk(deliveryFee)}`}
                      tone={palette.danger}
                    />
                    <SplitRow
                      label={c.youReceive}
                      value={formatTk(valueNum)}
                      tone={palette.success}
                      strong
                    />
                  </View>
                ) : null}

                <Pressable
                  style={[styles.primaryButton, !canSubmit && styles.disabled]}
                  disabled={!canSubmit || createMutation.isPending}
                  onPress={() => createMutation.mutate()}
                >
                  {createMutation.isPending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="cube-outline" size={18} color="#FFFFFF" />
                  )}
                  <Text style={styles.primaryButtonText}>{c.submit}</Text>
                </Pressable>
              </View>

              <View style={styles.listHeaderRow}>
                <Text style={styles.sectionTitle}>{c.yourRequests}</Text>
                <View style={styles.tabs}>
                  <TabButton label={c.live} active={tab === "live"} onPress={() => setTab("live")} />
                  <TabButton
                    label={c.history}
                    active={tab === "history"}
                    onPress={() => setTab("history")}
                  />
                </View>
              </View>

              {listQuery.isLoading ? (
                <ActivityIndicator style={styles.loader} color={palette.primary} />
              ) : orders.length === 0 ? (
                <Text style={styles.empty}>
                  {tab === "live" ? c.emptyLive : c.emptyHistory}
                </Text>
              ) : (
                orders.map((order) => {
                  const tone = SETTLEMENT_TONE[order.settlementStatus];
                  const canCancel = order.status === "ReadyForPickup" && !order.riderId;
                  return (
                    <View key={order.orderId} style={styles.orderCard}>
                      <View style={styles.orderTop}>
                        <Text style={styles.orderNumber}>{order.orderNumber}</Text>
                        <View
                          style={[styles.statusChip, { backgroundColor: tone.bg, borderColor: tone.border }]}
                        >
                          <Text style={[styles.statusChipText, { color: tone.color }]}>
                            {language === "bn" ? tone.bn : tone.en}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.orderMeta}>
                        {order.customerName} · {order.customerPhone}
                      </Text>
                      {order.drop.address ? (
                        <Text style={styles.orderMetaMuted}>{order.drop.address}</Text>
                      ) : null}
                      {order.riderName ? (
                        <Text style={styles.orderMetaMuted}>
                          {c.rider}: {order.riderName}
                        </Text>
                      ) : null}
                      <View style={styles.orderBottom}>
                        <View>
                          <Text style={styles.orderMetaMuted}>{c.youReceive}</Text>
                          <Text style={styles.orderNet}>{formatTk(order.netToOwner)}</Text>
                        </View>
                        {canCancel ? (
                          <Pressable
                            style={styles.cancelButton}
                            disabled={cancelMutation.isPending}
                            onPress={() => confirmCancel(order)}
                          >
                            <Text style={styles.cancelButtonText}>{c.cancel}</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.segmentButton, active && styles.segmentButtonActive]} onPress={onPress}>
      <Text style={[styles.segmentButtonText, active && styles.segmentButtonTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.tabButton, active && styles.tabButtonActive]} onPress={onPress}>
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function SplitRow({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.splitRow}>
      <Text style={styles.splitLabel}>{label}</Text>
      <Text
        style={[
          styles.splitValue,
          tone ? { color: tone } : null,
          strong ? styles.splitValueStrong : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 18, paddingBottom: 48, gap: 14 },
  header: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
    color: palette.foreground,
  },
  headerSpacer: { width: 40 },
  intro: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  notEnabled: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
    color: palette.mutedForeground,
    textAlign: "center",
    paddingVertical: 8,
  },
  card: {
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 12,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  cardTitle: { fontSize: 16, fontWeight: "900", color: palette.foreground },
  feeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  feeChipText: { fontSize: 12, fontWeight: "800", color: palette.primary },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: "800", color: palette.foreground },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: 13,
    paddingVertical: Platform.OS === "ios" ? 13 : 10,
    fontSize: 14,
    fontWeight: "700",
    color: palette.foreground,
  },
  segment: { flexDirection: "row", gap: 8 },
  segmentButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    paddingVertical: 11,
    alignItems: "center",
  },
  segmentButtonActive: {
    backgroundColor: palette.primarySoft,
    borderColor: palette.primary,
  },
  segmentButtonText: { fontSize: 13, fontWeight: "800", color: palette.mutedForeground },
  segmentButtonTextActive: { color: palette.primary },
  splitCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.background,
    padding: 12,
    gap: 8,
  },
  splitRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  splitLabel: { fontSize: 13, fontWeight: "700", color: palette.mutedForeground },
  splitValue: { fontSize: 14, fontWeight: "800", color: palette.foreground },
  splitValueStrong: { fontSize: 16, fontWeight: "900" },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: palette.primary,
    paddingVertical: 14,
  },
  primaryButtonText: { fontSize: 15, fontWeight: "900", color: "#FFFFFF" },
  disabled: { opacity: 0.5 },
  listHeaderRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: palette.foreground },
  tabs: { flexDirection: "row", gap: 6 },
  tabButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  tabButtonActive: { backgroundColor: palette.foreground, borderColor: palette.foreground },
  tabButtonText: { fontSize: 12, fontWeight: "800", color: palette.mutedForeground },
  tabButtonTextActive: { color: "#FFFFFF" },
  loader: { marginTop: 24 },
  empty: {
    marginTop: 20,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  orderCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 14,
    gap: 4,
  },
  orderTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  orderNumber: { fontSize: 14, fontWeight: "900", color: palette.foreground, flexShrink: 1 },
  statusChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  statusChipText: { fontSize: 11, fontWeight: "900" },
  orderMeta: { fontSize: 13, fontWeight: "700", color: palette.foreground },
  orderMetaMuted: { fontSize: 12, fontWeight: "600", color: palette.mutedForeground },
  orderBottom: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  orderNet: { fontSize: 16, fontWeight: "900", color: palette.success },
  cancelButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cancelButtonText: { fontSize: 13, fontWeight: "800", color: palette.danger },
});
