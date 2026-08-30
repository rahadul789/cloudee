import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
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
  getExternalDeliveryStats,
  listExternalDeliveries,
  type ExternalSettlementStatus,
  type OwnerExternalDelivery,
} from "@/src/lib/external-delivery-api";
import { localizeDigits } from "@/src/lib/format";
import { palette } from "@/src/theme/palette";

type MainTab = "new" | "live" | "history";
type DatePreset = "today" | "7d" | "30d" | "month" | "all" | "custom";
const HISTORY_PAGE_SIZE = 15;

const COPY = {
  bn: {
    title: "ফুডবেলা ডেলিভারি",
    intro:
      "নিজের চ্যানেলে (ফেসবুক/হোয়াটসঅ্যাপ) অর্ডার পেয়েছেন? ফুডবেলা রাইডার দিয়ে ডেলিভারি করান — আমরা টাকা তুলে আপনার অংশ ফেরত দিই।",
    notEnabled:
      "আপনার রেস্টুরেন্টের জন্য এই সেবা এখনো চালু হয়নি। চালু করতে ফুডবেলা সাপোর্টে যোগাযোগ করুন।",
    tabNew: "নতুন রিকোয়েস্ট",
    tabLive: "চলমান",
    tabHistory: "হিস্টোরি",
    feeLabel: "ফুডবেলা ফি",
    customerName: "কাস্টমারের নাম",
    customerPhone: "কাস্টমারের ফোন",
    phoneError: "১১ ডিজিটের সঠিক নম্বর দিন (01 দিয়ে শুরু)।",
    address: "ডেলিভারি ঠিকানা",
    orderValue: "অর্ডার মূল্য (খাবার)",
    payment: "পেমেন্ট",
    cod: "ক্যাশ অন ডেলিভারি",
    online: "অনলাইন",
    riderCollects: "রাইডার তুলবে",
    deliveryFee: "ফুডবেলা ফি",
    youReceive: "আপনি পাবেন",
    submit: "ডেলিভারি রিকোয়েস্ট করুন",
    emptyLive: "কোনো চলমান রিকোয়েস্ট নেই।",
    emptyHistory: "এই সময়ে কোনো রিকোয়েস্ট নেই।",
    cancel: "বাতিল",
    cancelConfirm: "রিকোয়েস্ট বাতিল করবেন?",
    requested: "রিকোয়েস্ট হয়েছে — শিগগিরই রাইডার অ্যাসাইন হবে।",
    cancelled: "রিকোয়েস্ট বাতিল হয়েছে।",
    fillAll: "সব তথ্য ঠিকভাবে পূরণ করুন।",
    rider: "রাইডার",
    kpiRequests: "রিকোয়েস্ট",
    kpiDelivered: "ডেলিভারড",
    kpiOrderValue: "অর্ডার মূল্য",
    kpiYouReceive: "আপনি পেয়েছেন",
    presetToday: "আজ",
    preset7d: "৭ দিন",
    preset30d: "৩০ দিন",
    presetMonth: "এ মাস",
    presetAll: "সব",
    presetCustom: "কাস্টম",
    apply: "প্রয়োগ",
    clear: "মুছুন",
    pickRange: "তারিখ বাছাই",
    loadMore: "আরও লোড হচ্ছে…",
  },
  en: {
    title: "Foodbela Delivery",
    intro:
      "Got an order on your own channel (Facebook/WhatsApp)? Let a Foodbela rider deliver it — we collect the payment and pay your share back.",
    notEnabled:
      "This service is not enabled for your restaurant yet. Please contact Foodbela support to turn it on.",
    tabNew: "New request",
    tabLive: "Live",
    tabHistory: "History",
    feeLabel: "Foodbela fee",
    customerName: "Customer name",
    customerPhone: "Customer phone",
    phoneError: "Enter a valid 11-digit number (starts with 01).",
    address: "Delivery address",
    orderValue: "Order value (food)",
    payment: "Payment",
    cod: "Cash on delivery",
    online: "Online",
    riderCollects: "Rider collects",
    deliveryFee: "Foodbela fee",
    youReceive: "You receive",
    submit: "Request delivery",
    emptyLive: "No active delivery requests.",
    emptyHistory: "No requests in this range.",
    cancel: "Cancel",
    cancelConfirm: "Cancel this request?",
    requested: "Requested — a rider will be assigned shortly.",
    cancelled: "Request cancelled.",
    fillAll: "Please fill in all fields correctly.",
    rider: "Rider",
    kpiRequests: "Requests",
    kpiDelivered: "Delivered",
    kpiOrderValue: "Order value",
    kpiYouReceive: "You received",
    presetToday: "Today",
    preset7d: "7 days",
    preset30d: "30 days",
    presetMonth: "This month",
    presetAll: "All",
    presetCustom: "Custom",
    apply: "Apply",
    clear: "Clear",
    pickRange: "Pick dates",
    loadMore: "Loading more…",
  },
};

function formatTk(value?: number | null) {
  return `Tk ${Math.round(Number(value || 0)).toLocaleString()}`;
}

function toDayString(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function presetRange(preset: DatePreset): { from?: string; to?: string } {
  const now = new Date();
  const today = toDayString(now);
  if (preset === "today") return { from: today, to: today };
  if (preset === "7d") {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { from: toDayString(start), to: today };
  }
  if (preset === "30d") {
    const start = new Date(now);
    start.setDate(now.getDate() - 29);
    return { from: toDayString(start), to: today };
  }
  if (preset === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toDayString(start), to: today };
  }
  return {};
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

  const [tab, setTab] = useState<MainTab>("new");
  const [preset, setPreset] = useState<DatePreset>("today");
  const [customFrom, setCustomFrom] = useState<string | null>(null);
  const [customTo, setCustomTo] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [orderValue, setOrderValue] = useState("");
  const [paymentMode, setPaymentMode] = useState<"cod" | "online">("cod");

  const range = useMemo(
    () =>
      preset === "custom"
        ? { from: customFrom ?? undefined, to: customTo ?? undefined }
        : presetRange(preset),
    [preset, customFrom, customTo],
  );
  const rangeKey = `${range.from ?? ""}:${range.to ?? ""}`;

  const configQuery = useQuery({
    queryKey: ["owner-external-delivery-config"],
    queryFn: getExternalDeliveryConfig,
    staleTime: 60_000,
  });
  const enabled = configQuery.data?.enabled === true;
  const deliveryFee = configQuery.data?.deliveryFeeTaka ?? 0;

  const statsQuery = useQuery({
    queryKey: ["owner-external-stats", rangeKey],
    queryFn: () => getExternalDeliveryStats(range),
    enabled,
    staleTime: 10_000,
  });
  const stats = statsQuery.data;

  // Always fetch the live list (not only on the Live tab) so the tab can show a live count badge.
  const liveQuery = useQuery({
    queryKey: ["owner-external-list", "live"],
    queryFn: () => listExternalDeliveries({ tab: "live", pageSize: 50 }),
    enabled,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const historyQuery = useInfiniteQuery({
    queryKey: ["owner-external-history", rangeKey],
    enabled: enabled && tab === "history",
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listExternalDeliveries({
        tab: "history",
        from: range.from,
        to: range.to,
        page: pageParam,
        pageSize: HISTORY_PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.page * lastPage.pageSize;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    staleTime: 10_000,
  });

  const valueNum = Number(orderValue);
  const hasValidValue = orderValue.trim() !== "" && valueNum > 0;
  const phoneDigits = customerPhone.replace(/\D/g, "");
  const phoneValid = phoneDigits.length === 11 && phoneDigits.startsWith("01");
  const showPhoneError = customerPhone.length > 0 && !phoneValid;

  const createMutation = useMutation({
    mutationFn: () =>
      createExternalDelivery({
        customerName: customerName.trim(),
        customerPhone: phoneDigits,
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
      void queryClient.invalidateQueries({ queryKey: ["owner-external-list"] });
      void queryClient.invalidateQueries({ queryKey: ["owner-external-history"] });
      void queryClient.invalidateQueries({ queryKey: ["owner-external-stats"] });
      setTab("live");
    },
    onError: (error) =>
      Alert.alert(c.title, error instanceof Error ? error.message : c.fillAll),
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => cancelExternalDelivery(orderId),
    onSuccess: () => {
      Alert.alert(c.title, c.cancelled);
      void queryClient.invalidateQueries({ queryKey: ["owner-external-list"] });
      void queryClient.invalidateQueries({ queryKey: ["owner-external-history"] });
      void queryClient.invalidateQueries({ queryKey: ["owner-external-stats"] });
    },
    onError: (error) =>
      Alert.alert(c.title, error instanceof Error ? error.message : c.fillAll),
  });

  const canSubmit =
    customerName.trim() !== "" &&
    phoneValid &&
    address.trim() !== "" &&
    hasValidValue;

  const collectAmount = hasValidValue ? valueNum + deliveryFee : null;

  function confirmCancel(order: OwnerExternalDelivery) {
    Alert.alert(c.title, `${c.cancelConfirm}\n${order.orderNumber}`, [
      { text: c.cancel, style: "cancel" },
      { text: "OK", onPress: () => cancelMutation.mutate(order.orderId) },
    ]);
  }

  const historyItems = historyQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const liveItems = liveQuery.data?.items ?? [];

  const header = (
    <View style={styles.listHeader}>
      <View style={styles.kpiRow}>
        <KpiTile label={c.kpiRequests} value={String(stats?.requests ?? 0)} tone="primary" loading={statsQuery.isLoading} />
        <KpiTile label={c.kpiDelivered} value={String(stats?.delivered ?? 0)} tone="success" loading={statsQuery.isLoading} />
      </View>
      <View style={styles.kpiRow}>
        <KpiTile label={c.kpiOrderValue} value={formatTk(stats?.orderValue)} tone="neutral" loading={statsQuery.isLoading} />
        <KpiTile label={c.kpiYouReceive} value={formatTk(stats?.youReceive)} tone="success" loading={statsQuery.isLoading} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.presetRow}
      >
        {(["today", "7d", "30d", "month", "all"] as DatePreset[]).map((key) => (
          <PresetChip
            key={key}
            label={
              key === "today"
                ? c.presetToday
                : key === "7d"
                  ? c.preset7d
                  : key === "30d"
                    ? c.preset30d
                    : key === "month"
                      ? c.presetMonth
                      : c.presetAll
            }
            active={preset === key}
            onPress={() => setPreset(key)}
          />
        ))}
        <PresetChip
          label={
            preset === "custom" && (customFrom || customTo)
              ? `${customFrom ?? "…"} → ${customTo ?? "…"}`
              : c.presetCustom
          }
          icon="calendar-outline"
          active={preset === "custom"}
          onPress={() => setCalendarOpen(true)}
        />
      </ScrollView>
    </View>
  );

  function renderOrder(order: OwnerExternalDelivery) {
    const tone = SETTLEMENT_TONE[order.settlementStatus];
    // Owner can cancel any in-flight external delivery (ready or picked up), even after a
    // rider is assigned — the rider gets an immediate cancel popup from the backend.
    const canCancel =
      order.status === "ReadyForPickup" || order.status === "PickedUp";
    return (
      <View style={styles.orderCard}>
        <View style={styles.orderTop}>
          <Text style={styles.orderNumber}>{order.orderNumber}</Text>
          <View style={[styles.statusChip, { backgroundColor: tone.bg, borderColor: tone.border }]}>
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
  }

  return (
    <Screen>
      <View style={styles.headerBar}>
        <Pressable hitSlop={10} style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={21} color={palette.foreground} />
        </Pressable>
        <Text style={styles.title}>{c.title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.tabBar}>
        <TabButton label={c.tabNew} icon="add-circle-outline" active={tab === "new"} onPress={() => setTab("new")} />
        <TabButton label={c.tabLive} icon="bicycle-outline" active={tab === "live"} onPress={() => setTab("live")} badge={liveItems.length} />
        <TabButton label={c.tabHistory} icon="time-outline" active={tab === "history"} onPress={() => setTab("history")} />
      </View>

      {configQuery.isLoading ? (
        <ActivityIndicator style={styles.loader} color={palette.primary} />
      ) : !enabled ? (
        <View style={[styles.card, styles.notEnabledCard]}>
          <Ionicons name="lock-closed-outline" size={26} color={palette.mutedForeground} />
          <Text style={styles.notEnabled}>{c.notEnabled}</Text>
        </View>
      ) : tab === "new" ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 18 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.intro}>{c.intro}</Text>
            <View style={styles.card}>
              <View style={styles.feeChip}>
                <Ionicons name="bicycle-outline" size={13} color={palette.primary} />
                <Text style={styles.feeChipText}>
                  {c.feeLabel}: {formatTk(deliveryFee)}
                </Text>
              </View>

              <Field label={c.customerName}>
                <TextInput
                  value={customerName}
                  onChangeText={setCustomerName}
                  style={styles.input}
                  placeholderTextColor={palette.mutedForeground}
                />
              </Field>
              <Field label={c.customerPhone} error={showPhoneError ? c.phoneError : undefined}>
                <TextInput
                  value={customerPhone}
                  onChangeText={(text) => setCustomerPhone(text.replace(/\D/g, "").slice(0, 11))}
                  keyboardType="phone-pad"
                  maxLength={11}
                  style={[styles.input, showPhoneError ? styles.inputError : null]}
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
                  onChangeText={(text) => setOrderValue(text.replace(/[^\d]/g, ""))}
                  keyboardType="numeric"
                  style={styles.input}
                  placeholderTextColor={palette.mutedForeground}
                />
              </Field>

              <Text style={styles.fieldLabel}>{c.payment}</Text>
              <View style={styles.segment}>
                <SegmentButton label={c.cod} active={paymentMode === "cod"} onPress={() => setPaymentMode("cod")} />
                <SegmentButton label={c.online} active={paymentMode === "online"} onPress={() => setPaymentMode("online")} />
              </View>

              {collectAmount != null ? (
                <View style={styles.splitCard}>
                  <SplitRow label={c.riderCollects} value={formatTk(collectAmount)} />
                  <SplitRow label={c.deliveryFee} value={`− ${formatTk(deliveryFee)}`} tone={palette.danger} />
                  <SplitRow label={c.youReceive} value={formatTk(valueNum)} tone={palette.success} strong />
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
          </ScrollView>
        </KeyboardAvoidingView>
      ) : tab === "live" ? (
        <FlatList
          data={liveItems}
          keyExtractor={(item) => item.orderId}
          renderItem={({ item }) => renderOrder(item)}
          ListHeaderComponent={header}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            liveQuery.isLoading ? (
              <ActivityIndicator style={styles.loader} color={palette.primary} />
            ) : (
              <Text style={styles.empty}>{c.emptyLive}</Text>
            )
          }
          onRefresh={() => liveQuery.refetch()}
          refreshing={liveQuery.isFetching && !liveQuery.isLoading}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={historyItems}
          keyExtractor={(item) => item.orderId}
          renderItem={({ item }) => renderOrder(item)}
          ListHeaderComponent={header}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            historyQuery.isLoading ? (
              <ActivityIndicator style={styles.loader} color={palette.primary} />
            ) : (
              <Text style={styles.empty}>{c.emptyHistory}</Text>
            )
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (historyQuery.hasNextPage && !historyQuery.isFetchingNextPage) {
              void historyQuery.fetchNextPage();
            }
          }}
          ListFooterComponent={
            historyQuery.isFetchingNextPage ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={palette.primary} />
                <Text style={styles.footerLoaderText}>{c.loadMore}</Text>
              </View>
            ) : null
          }
          onRefresh={() => historyQuery.refetch()}
          refreshing={historyQuery.isRefetching}
          showsVerticalScrollIndicator={false}
        />
      )}

      <CalendarRangeModal
        visible={calendarOpen}
        initialFrom={customFrom}
        initialTo={customTo}
        copy={c}
        onClose={() => setCalendarOpen(false)}
        onApply={(from, to) => {
          setCustomFrom(from);
          setCustomTo(to);
          setPreset("custom");
          setCalendarOpen(false);
        }}
      />
    </Screen>
  );
}

function KpiTile({
  label,
  value,
  tone,
  loading,
}: {
  label: string;
  value: string;
  tone: "primary" | "success" | "neutral";
  loading?: boolean;
}) {
  const color =
    tone === "primary" ? palette.primary : tone === "success" ? palette.success : palette.foreground;
  return (
    <View style={styles.kpiTile}>
      <Text style={styles.kpiLabel}>{label}</Text>
      {loading ? (
        <ActivityIndicator size="small" color={palette.primary} style={styles.kpiLoader} />
      ) : (
        <Text style={[styles.kpiValue, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {value}
        </Text>
      )}
    </View>
  );
}

function PresetChip({
  label,
  active,
  icon,
  onPress,
}: {
  label: string;
  active: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.presetChip, active && styles.presetChipActive]} onPress={onPress}>
      {icon ? (
        <Ionicons name={icon} size={13} color={active ? "#FFFFFF" : palette.mutedForeground} />
      ) : null}
      <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.segmentButton, active && styles.segmentButtonActive]} onPress={onPress}>
      <Text style={[styles.segmentButtonText, active && styles.segmentButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function TabButton({
  label,
  icon,
  active,
  onPress,
  badge = 0,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <Pressable style={[styles.mainTab, active && styles.mainTabActive]} onPress={onPress}>
      <Ionicons name={icon} size={16} color={active ? palette.primary : palette.mutedForeground} />
      <Text style={[styles.mainTabText, active && styles.mainTabTextActive]}>{label}</Text>
      {badge > 0 ? (
        <View style={styles.mainTabBadge}>
          <Text style={styles.mainTabBadgeText}>{localizeDigits(String(badge))}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function SplitRow({ label, value, tone, strong }: { label: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <View style={styles.splitRow}>
      <Text style={styles.splitLabel}>{label}</Text>
      <Text style={[styles.splitValue, tone ? { color: tone } : null, strong ? styles.splitValueStrong : null]}>
        {value}
      </Text>
    </View>
  );
}

// A compact in-app month calendar for picking a custom [from, to] range — OTA-safe, no native
// date-picker dependency. Tap a start day, then an end day.
function CalendarRangeModal({
  visible,
  initialFrom,
  initialTo,
  copy,
  onClose,
  onApply,
}: {
  visible: boolean;
  initialFrom: string | null;
  initialTo: string | null;
  copy: (typeof COPY)["en"];
  onClose: () => void;
  onApply: (from: string, to: string) => void;
}) {
  const [month, setMonth] = useState(() => new Date());
  const [from, setFrom] = useState<string | null>(initialFrom);
  const [to, setTo] = useState<string | null>(initialTo);

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const todayStr = toDayString(new Date());

  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDay; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(toDayString(new Date(year, monthIndex, d)));

  function pickDay(day: string) {
    if (!from || (from && to)) {
      setFrom(day);
      setTo(null);
      return;
    }
    if (day < from) {
      setFrom(day);
      return;
    }
    setTo(day);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.calBackdrop} onPress={onClose} />
      <View style={styles.calSheet}>
        <View style={styles.calHeader}>
          <Text style={styles.calTitle}>{copy.pickRange}</Text>
          <Pressable hitSlop={8} onPress={onClose}>
            <Ionicons name="close" size={22} color={palette.foreground} />
          </Pressable>
        </View>

        <View style={styles.calMonthRow}>
          <Pressable style={styles.calNav} onPress={() => setMonth(new Date(year, monthIndex - 1, 1))}>
            <Ionicons name="chevron-back" size={18} color={palette.foreground} />
          </Pressable>
          <Text style={styles.calMonthLabel}>
            {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </Text>
          <Pressable style={styles.calNav} onPress={() => setMonth(new Date(year, monthIndex + 1, 1))}>
            <Ionicons name="chevron-forward" size={18} color={palette.foreground} />
          </Pressable>
        </View>

        <View style={styles.calWeekRow}>
          {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
            <Text key={i} style={styles.calWeekLabel}>
              {w}
            </Text>
          ))}
        </View>

        <View style={styles.calGrid}>
          {cells.map((day, index) => {
            if (!day) return <View key={`e-${index}`} style={styles.calCell} />;
            const inRange = from && to && day >= from && day <= to;
            const isEdge = day === from || day === to;
            const isFuture = day > todayStr;
            return (
              <Pressable
                key={day}
                style={styles.calCell}
                disabled={isFuture}
                onPress={() => pickDay(day)}
              >
                <View
                  style={[
                    styles.calDay,
                    inRange && !isEdge ? styles.calDayInRange : null,
                    isEdge ? styles.calDayEdge : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.calDayText,
                      isFuture ? styles.calDayTextMuted : null,
                      isEdge ? styles.calDayTextEdge : null,
                    ]}
                  >
                    {Number(day.slice(-2))}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.calActions}>
          <Pressable
            style={styles.calClear}
            onPress={() => {
              setFrom(null);
              setTo(null);
            }}
          >
            <Text style={styles.calClearText}>{copy.clear}</Text>
          </Pressable>
          <Pressable
            style={[styles.calApply, !(from && to) && styles.disabled]}
            disabled={!(from && to)}
            onPress={() => {
              if (from && to) onApply(from, to);
            }}
          >
            <Text style={styles.calApplyText}>{copy.apply}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerBar: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 8,
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
    lineHeight: 26,
    fontWeight: "900",
    color: palette.foreground,
  },
  headerSpacer: { width: 40 },
  tabBar: {
    flexDirection: "row",
    gap: 6,
    marginHorizontal: 18,
    marginTop: 12,
    marginBottom: 4,
    padding: 4,
    borderRadius: 16,
    backgroundColor: palette.surfaceMuted,
  },
  mainTab: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  mainTabActive: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  mainTabText: { fontSize: 12.5, fontWeight: "800", color: palette.mutedForeground },
  mainTabTextActive: { color: palette.primary },
  mainTabBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  mainTabBadgeText: { fontSize: 11, fontWeight: "900", color: "#FFFFFF" },
  formContent: { padding: 18, paddingBottom: 140, gap: 14 },
  listContent: { padding: 18, paddingBottom: 40 },
  listHeader: { gap: 12, marginBottom: 12 },
  kpiRow: { flexDirection: "row", gap: 12 },
  kpiTile: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 13,
    gap: 4,
    minHeight: 68,
  },
  kpiLabel: { fontSize: 11.5, fontWeight: "800", color: palette.mutedForeground },
  kpiValue: { fontSize: 20, lineHeight: 25, fontWeight: "900" },
  kpiLoader: { alignSelf: "flex-start", marginTop: 4 },
  presetRow: { flexDirection: "row", gap: 8, paddingVertical: 2, paddingRight: 4 },
  presetChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  presetChipActive: { backgroundColor: palette.foreground, borderColor: palette.foreground },
  presetChipText: { fontSize: 12, fontWeight: "800", color: palette.mutedForeground },
  presetChipTextActive: { color: "#FFFFFF" },
  intro: { fontSize: 13, lineHeight: 20, fontWeight: "600", color: palette.mutedForeground },
  notEnabledCard: {
    marginHorizontal: 18,
    marginTop: 16,
    alignItems: "center",
    gap: 8,
  },
  notEnabled: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
    color: palette.mutedForeground,
    textAlign: "center",
  },
  card: {
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 12,
  },
  feeChip: {
    alignSelf: "flex-start",
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
  fieldError: { fontSize: 11.5, fontWeight: "700", color: palette.danger },
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
  inputError: { borderColor: palette.danger },
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
  segmentButtonActive: { backgroundColor: palette.primarySoft, borderColor: palette.primary },
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
  loader: { marginTop: 24 },
  empty: {
    marginTop: 20,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  footerLoader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  footerLoaderText: { fontSize: 12, fontWeight: "700", color: palette.mutedForeground },
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
  statusChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
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
  // calendar
  calBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(17,13,16,0.4)" },
  calSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
    paddingBottom: 28,
    gap: 12,
  },
  calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  calTitle: { fontSize: 17, fontWeight: "900", color: palette.foreground },
  calMonthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  calNav: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
  },
  calMonthLabel: { fontSize: 15, fontWeight: "900", color: palette.foreground },
  calWeekRow: { flexDirection: "row" },
  calWeekLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  calDay: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  calDayInRange: { backgroundColor: palette.primarySoft },
  calDayEdge: { backgroundColor: palette.primary },
  calDayText: { fontSize: 13, fontWeight: "800", color: palette.foreground },
  calDayTextMuted: { color: palette.border },
  calDayTextEdge: { color: "#FFFFFF" },
  calActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  calClear: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  calClearText: { fontSize: 14, fontWeight: "800", color: palette.foreground },
  calApply: {
    flex: 1.4,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: palette.foreground,
    alignItems: "center",
    justifyContent: "center",
  },
  calApplyText: { fontSize: 14, fontWeight: "900", color: "#FFFFFF" },
});
