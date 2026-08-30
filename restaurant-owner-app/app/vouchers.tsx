import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
} from "react-native";

import { AppBottomSheet } from "@/src/components/app-bottom-sheet";
import { Screen } from "@/src/components/screen";
import {
  useCreateOwnerVoucherMutation,
  useDeleteOwnerVoucherMutation,
  useOwnerVouchersQuery,
  useUpdateOwnerVoucherMutation,
  type OwnerVoucher,
  type OwnerVoucherPayload,
} from "@/src/hooks/use-owner-api";
import {
  useOwnerTranslation,
  type TranslationKey,
} from "@/src/i18n/translations";
import { formatCurrency, localizeDigits } from "@/src/lib/format";
import { palette } from "@/src/theme/palette";

type VoucherForm = {
  name: string;
  code: string;
  mode: "auto" | "coupon";
  type: "flat" | "percentage";
  discountValue: string;
  minimumOrderAmount: string;
  maxTotalUses: string;
  maxUsesPerUser: string;
  allowRepeatUsage: boolean;
  // Platform co-funding request: "0" = owner funds it fully; >0 = ask the platform to fund
  // that % of each discount (a "shared" voucher). Admin decides on approval.
  platformSharePercent: string;
  status: "Active" | "Draft";
  startsAt: string;
  endsAt: string;
};

type DatePickerTarget = "startsAt" | "endsAt";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const QUICK_HOURS = [0, 6, 9, 12, 15, 18, 21, 23];
const QUICK_MINUTES = [0, 15, 30, 45, 59];

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 0, 0);
  return next;
}

function createDefaultForm(): VoucherForm {
  const startsAt = startOfDay(new Date());
  const endsAt = endOfDay(new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000));

  return {
    name: "",
    code: "",
    mode: "coupon",
    type: "flat",
    discountValue: "",
    minimumOrderAmount: "",
    maxTotalUses: "",
    maxUsesPerUser: "1",
    allowRepeatUsage: false,
    platformSharePercent: "0",
    status: "Active",
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
  };
}

function formatDiscount(
  voucher: OwnerVoucher,
  t: (key: TranslationKey) => string,
) {
  if (voucher.type === "percentage")
    return `${localizeDigits(String(voucher.discountValue ?? 0))}% ${t("voucher.off")}`;
  if (voucher.type === "free_delivery") return t("voucher.freeDelivery");
  return `${formatCurrency(voucher.discountValue ?? 0)} ${t("voucher.off")}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function formatDateTime(value: string, t: (key: TranslationKey) => string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("voucher.chooseDateTime");
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value?: number | null) {
  return formatCurrency(value ?? 0);
}

function monthTitle(date: Date) {
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function getCalendarDays(viewDate: Date) {
  const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const firstWeekday = first.getDay();
  const start = new Date(first);
  start.setDate(first.getDate() - firstWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function isSameDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export default function VouchersScreen() {
  const { t } = useOwnerTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string | string[]; voucherId?: string | string[] }>();
  const vouchersQuery = useOwnerVouchersQuery();
  const createMutation = useCreateOwnerVoucherMutation();
  const updateMutation = useUpdateOwnerVoucherMutation();
  const deleteMutation = useDeleteOwnerVoucherMutation();
  const [form, setForm] = useState<VoucherForm>(() => createDefaultForm());
  const [editingVoucher, setEditingVoucher] = useState<OwnerVoucher | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OwnerVoucher | null>(null);
  const [datePickerTarget, setDatePickerTarget] = useState<DatePickerTarget | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const screenMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const routeVoucherId = Array.isArray(params.voucherId)
    ? params.voucherId[0]
    : params.voucherId;
  const isFormScreen = screenMode === "create" || screenMode === "edit";
  const vouchers = useMemo(
    () => vouchersQuery.data?.items ?? [],
    [vouchersQuery.data?.items],
  );
  const selectedVoucher = useMemo(
    () => vouchers.find((voucher) => voucher._id === routeVoucherId) ?? null,
    [routeVoucherId, vouchers],
  );
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const activeCount = useMemo(
    () => vouchers.filter((voucher) => voucher.status === "Active").length,
    [vouchers],
  );
  const voucherAnalytics = useMemo(
    () =>
      vouchers.reduce(
        (summary, voucher) => ({
          uses: summary.uses + (voucher.analytics?.totalUses ?? 0),
          revenue: summary.revenue + (voucher.analytics?.revenueGenerated ?? 0),
          discount: summary.discount + (voucher.analytics?.totalDiscountGiven ?? 0),
        }),
        { uses: 0, revenue: 0, discount: 0 },
      ),
    [vouchers],
  );

  function updateForm<K extends keyof VoucherForm>(key: K, value: VoucherForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setEditingVoucher(null);
    setForm(createDefaultForm());
  }

  function editVoucher(voucher: OwnerVoucher) {
    setEditingVoucher(voucher);
    setForm({
      name: voucher.name,
      code: voucher.code ?? "",
      mode: voucher.mode,
      type: voucher.type === "percentage" ? "percentage" : "flat",
      discountValue: String(voucher.discountValue ?? ""),
      minimumOrderAmount: String(voucher.minimumOrderAmount ?? ""),
      maxTotalUses: String(voucher.maxTotalUses ?? ""),
      maxUsesPerUser: String(voucher.maxUsesPerUser ?? 1),
      allowRepeatUsage: voucher.allowRepeatUsage === true,
      platformSharePercent: String(voucher.platformSharePercent ?? 0),
      // The form only tracks Active/Draft; the real status (pending/rejected) is admin-driven
      // and shown on the card. Editing always re-submits for approval on the backend anyway.
      status: voucher.status === "Draft" ? "Draft" : "Active",
      startsAt: voucher.startsAt,
      endsAt: voucher.endsAt,
    });
  }

  useEffect(() => {
    if (screenMode === "create") {
      resetForm();
      return;
    }

    if (screenMode === "edit" && selectedVoucher) {
      editVoucher(selectedVoucher);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenMode, selectedVoucher?._id]);

  function validateForm() {
    const discount = Number(form.discountValue);
    const startsAt = new Date(form.startsAt).getTime();
    const endsAt = new Date(form.endsAt).getTime();
    const maxTotalUses = form.maxTotalUses ? Number(form.maxTotalUses) : null;
    const maxUsesPerUser = form.allowRepeatUsage ? Number(form.maxUsesPerUser) : 1;

    if (!form.name.trim()) {
      Alert.alert(t("voucher.errNameTitle"), t("voucher.errNameBody"));
      return false;
    }

    if (!form.code.trim()) {
      Alert.alert(t("voucher.errCodeTitle"), t("voucher.errCodeBody"));
      return false;
    }

    if (!Number.isFinite(discount) || discount <= 0) {
      Alert.alert(t("voucher.errDiscountTitle"), t("voucher.errDiscountBody"));
      return false;
    }

    if (form.type === "percentage" && discount > 100) {
      Alert.alert(t("voucher.errPercentTitle"), t("voucher.errPercentBody"));
      return false;
    }

    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || startsAt > endsAt) {
      Alert.alert(t("voucher.errDatesTitle"), t("voucher.errDatesBody"));
      return false;
    }

    if (maxTotalUses !== null && (!Number.isInteger(maxTotalUses) || maxTotalUses < 1)) {
      Alert.alert(t("voucher.errMaxUsesTitle"), t("voucher.errMaxUsesBody"));
      return false;
    }

    if (form.allowRepeatUsage && (!Number.isInteger(maxUsesPerUser) || maxUsesPerUser < 2)) {
      Alert.alert(t("voucher.errRepeatTitle"), t("voucher.errRepeatBody"));
      return false;
    }

    return true;
  }

  function buildPayload(): OwnerVoucherPayload {
    // Owner proposes how much the platform should co-fund. 0 → owner funds it fully;
    // >0 → a "shared" voucher request the admin decides on.
    const platformShare = Math.min(
      100,
      Math.max(0, Math.round(Number(form.platformSharePercent || "0"))),
    );
    return {
      fundedBy: platformShare > 0 ? "shared" : "owner",
      ownerSharePercent: 100 - platformShare,
      platformSharePercent: platformShare,
      stackingRule: "exclusive",
      mode: "coupon",
      type: form.type,
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      discountValue: Number(form.discountValue),
      minimumOrderAmount: Number(form.minimumOrderAmount || "0"),
      maxTotalUses: form.maxTotalUses ? Number(form.maxTotalUses) : undefined,
      maxUsesPerUser: form.allowRepeatUsage ? Number(form.maxUsesPerUser) : 1,
      allowRepeatUsage: form.allowRepeatUsage,
      status: form.status,
      applicability: "all",
      categoryIds: [],
      itemIds: [],
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
    };
  }

  async function submitVoucher() {
    if (!validateForm()) return;

    try {
      const payload = buildPayload();
      if (editingVoucher) {
        await updateMutation.mutateAsync({ id: editingVoucher._id, body: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      resetForm();
      Alert.alert(t("voucher.okTitle"), t("voucher.okBody"));
      router.replace("/vouchers" as never);
    } catch (error) {
      Alert.alert(
        t("voucher.errSaveTitle"),
        error instanceof Error ? error.message : t("prep.tryAgain"),
      );
    }
  }

  function confirmDelete(voucher: OwnerVoucher) {
    setDeleteTarget(voucher);
  }

  async function deleteVoucher() {
    if (!deleteTarget) return;

    try {
      await deleteMutation.mutateAsync(deleteTarget._id);
      if (editingVoucher?._id === deleteTarget._id) resetForm();
      setDeleteTarget(null);
      router.replace("/vouchers" as never);
    } catch (error) {
      Alert.alert(
        t("voucher.errDeleteTitle"),
        error instanceof Error ? error.message : t("prep.tryAgain"),
      );
    }
  }

  async function refreshVouchers() {
    setIsRefreshing(true);
    try {
      await vouchersQuery.refetch();
    } finally {
      setIsRefreshing(false);
    }
  }

  function openCreateVoucher() {
    resetForm();
    router.push({
      pathname: "/vouchers",
      params: { mode: "create" },
    } as never);
  }

  function openVoucherDetails(voucher: OwnerVoucher) {
    router.push({
      pathname: "/vouchers",
      params: { mode: "details", voucherId: voucher._id },
    } as never);
  }

  function openVoucherEdit(voucher: OwnerVoucher) {
    editVoucher(voucher);
    router.push({
      pathname: "/vouchers",
      params: { mode: "edit", voucherId: voucher._id },
    } as never);
  }

  const deleteConfirmationSheet = (
    <DeleteVoucherConfirmationSheet
      voucher={deleteTarget}
      visible={Boolean(deleteTarget)}
      isDeleting={deleteMutation.isPending}
      onClose={() => {
        if (!deleteMutation.isPending) setDeleteTarget(null);
      }}
      onConfirm={deleteVoucher}
    />
  );

  if (!isFormScreen) {
    return (
      <Screen>
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refreshVouchers}
              tintColor={palette.primary}
            />
          }
        >
          <View style={styles.header}>
            <Pressable accessibilityRole="button" hitSlop={10} style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={21} color={palette.foreground} />
            </Pressable>
            <Text style={styles.title}>{t("voucher.title")}</Text>
            <Pressable accessibilityRole="button" style={styles.headerCreateButton} onPress={openCreateVoucher}>
              <Ionicons name="add" size={18} color="#FFFFFF" />
            </Pressable>
          </View>

          {screenMode === "details" ? (
            selectedVoucher ? (
              <VoucherDetailsView
                voucher={selectedVoucher}
                onEdit={() => openVoucherEdit(selectedVoucher)}
                onDelete={() => confirmDelete(selectedVoucher)}
              />
            ) : (
              <View style={styles.feedbackCard}>
                {vouchersQuery.isLoading ? (
                  <ActivityIndicator size="small" color={palette.primary} />
                ) : (
                  <Ionicons name="alert-circle-outline" size={28} color={palette.danger} />
                )}
                <Text style={styles.feedbackText}>
                  {vouchersQuery.isLoading ? t("voucher.loadingOne") : t("voucher.notFound")}
                </Text>
              </View>
            )
          ) : (
            <>
              <View style={styles.heroCard}>
                <View style={styles.heroIcon}>
                  <Ionicons name="ticket-outline" size={26} color="#FFFFFF" />
                </View>
                <View style={styles.heroCopy}>
                  <Text style={styles.heroTitle}>{t("voucher.kicker")}</Text>
                  <Text style={styles.heroText}>
                    {t("voucher.heroText")}
                  </Text>
                </View>
                <View style={styles.heroStats}>
                  <Text style={styles.heroStatsValue}>{activeCount}</Text>
                  <Text style={styles.heroStatsLabel}>{t("voucher.active")}</Text>
                </View>
              </View>

              <View style={styles.analyticsGrid}>
                <AnalyticsCard
                  icon="repeat-outline"
                  label={t("voucher.uses")}
                  value={`${voucherAnalytics.uses}`}
                  tint="#FFF0F6"
                />
                <AnalyticsCard
                  icon="trending-up-outline"
                  label={t("voucher.sales")}
                  value={formatMoney(voucherAnalytics.revenue)}
                  tint="#EEF8F2"
                />
                <AnalyticsCard
                  icon="pricetag-outline"
                  label={t("voucher.discountCost")}
                  value={formatMoney(voucherAnalytics.discount)}
                  tint="#FFF6E3"
                />
              </View>

              <Pressable accessibilityRole="button" style={styles.createVoucherButton} onPress={openCreateVoucher}>
                <Text style={styles.createVoucherText}>{t("voucher.create")}</Text>
                <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
              </Pressable>

              <View style={styles.listHeader}>
                <Text style={styles.sectionTitle}>{t("voucher.current")}</Text>
                <Text style={styles.sectionCount}>{vouchers.length}</Text>
              </View>

              {vouchersQuery.isLoading ? (
                <View style={styles.feedbackCard}>
                  <ActivityIndicator size="small" color={palette.primary} />
                  <Text style={styles.feedbackText}>{t("voucher.loadingList")}</Text>
                </View>
              ) : vouchers.length ? (
                <View style={styles.voucherList}>
                  {vouchers.map((voucher) => (
                    <VoucherListCard
                      key={voucher._id}
                      voucher={voucher}
                      onPress={() => openVoucherDetails(voucher)}
                      onDelete={() => confirmDelete(voucher)}
                    />
                  ))}
                </View>
              ) : (
                <View style={styles.emptyCard}>
                  <Ionicons name="ticket-outline" size={28} color={palette.primary} />
                  <Text style={styles.emptyTitle}>{t("voucher.empty")}</Text>
                  <Text style={styles.emptyText}>
                    {t("voucher.emptyBody")}
                  </Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
        {deleteConfirmationSheet}
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshVouchers}
            tintColor={palette.primary}
          />
        }
      >
        <View style={styles.header}>
          <Pressable accessibilityRole="button" hitSlop={10} style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={21} color={palette.foreground} />
          </Pressable>
          <Text style={styles.title}>{t("voucher.title")}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="ticket-outline" size={26} color="#FFFFFF" />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>{t("voucher.kicker")}</Text>
            <Text style={styles.heroText}>{t("voucher.formHeroText")}</Text>
          </View>
          <View style={styles.heroStats}>
            <Text style={styles.heroStatsValue}>{activeCount}</Text>
            <Text style={styles.heroStatsLabel}>{t("voucher.active")}</Text>
          </View>
        </View>

        <View style={styles.analyticsGrid}>
          <AnalyticsCard
            icon="repeat-outline"
            label={t("voucher.uses")}
            value={`${voucherAnalytics.uses}`}
            tint="#FFF0F6"
          />
          <AnalyticsCard
            icon="trending-up-outline"
            label={t("voucher.sales")}
            value={formatMoney(voucherAnalytics.revenue)}
            tint="#EEF8F2"
          />
          <AnalyticsCard
            icon="pricetag-outline"
            label={t("voucher.discountCost")}
            value={formatMoney(voucherAnalytics.discount)}
            tint="#FFF6E3"
          />
        </View>

        <View style={styles.formCard}>
          <View style={styles.formHeader}>
            <View>
              <Text style={styles.formTitle}>
                {editingVoucher ? t("voucher.edit") : t("voucher.add")}
              </Text>
              <Text style={styles.formSubtitle}>
                {t("voucher.defaultValidity")}
              </Text>
            </View>
            {editingVoucher ? (
              <Pressable accessibilityRole="button" style={styles.clearButton} onPress={resetForm}>
                <Text style={styles.clearButtonText}>New</Text>
              </Pressable>
            ) : null}
          </View>

          <InputGroup
            label={t("voucher.name")}
            value={form.name}
            onChangeText={(value) => updateForm("name", value)}
            placeholder={t("voucher.namePlaceholder")}
          />

          {/* Owner vouchers are always code-based. There is no auto/threshold
              apply type, so the voucher code is always required. */}
          <InputGroup
            label={t("voucher.code")}
            value={form.code}
            onChangeText={(value) => updateForm("code", value.replace(/\s/g, "").toUpperCase())}
            placeholder={t("voucher.codePlaceholder")}
            autoCapitalize="characters"
          />

          <SegmentedControl
            label={t("voucher.discountType")}
            value={form.type}
            options={[
              { label: t("voucher.flat"), value: "flat" },
              { label: t("voucher.percent"), value: "percentage" },
            ]}
            onChange={(value) => updateForm("type", value as VoucherForm["type"])}
          />

          <View style={styles.twoColumn}>
            <InputGroup
              label={form.type === "percentage" ? t("voucher.discountPercent") : t("voucher.discountTaka")}
              value={form.discountValue}
              onChangeText={(value) => updateForm("discountValue", value.replace(/[^\d.]/g, ""))}
              placeholder={form.type === "percentage" ? "10" : "50"}
              keyboardType="numeric"
            />
            <InputGroup
              label={t("voucher.minOrder")}
              value={form.minimumOrderAmount}
              onChangeText={(value) => updateForm("minimumOrderAmount", value.replace(/[^\d.]/g, ""))}
              placeholder="0"
              keyboardType="numeric"
            />
          </View>

          <SegmentedControl
            label={t("voucher.funding")}
            value={form.platformSharePercent === "50" ? "50" : "0"}
            options={[
              { label: t("voucher.fundingFull"), value: "0" },
              { label: t("voucher.fundingShared"), value: "50" },
            ]}
            onChange={(value) => updateForm("platformSharePercent", value)}
          />

          <View style={styles.twoColumn}>
            <InputGroup
              label={t("voucher.maxUses")}
              value={form.maxTotalUses}
              onChangeText={(value) => updateForm("maxTotalUses", value.replace(/\D/g, ""))}
              placeholder={t("voucher.optional")}
              keyboardType="number-pad"
            />
            <SegmentedControl
              label={t("voucher.status")}
              value={form.status}
              options={[
                { label: t("voucher.active"), value: "Active" },
                { label: t("voucher.draft"), value: "Draft" },
              ]}
              onChange={(value) => updateForm("status", value as VoucherForm["status"])}
            />
          </View>

          <View style={styles.repeatCard}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: form.allowRepeatUsage }}
              style={styles.repeatToggle}
              onPress={() =>
                updateForm("allowRepeatUsage", !form.allowRepeatUsage)
              }
            >
              <Ionicons
                name={form.allowRepeatUsage ? "checkbox" : "square-outline"}
                size={23}
                color={form.allowRepeatUsage ? palette.primary : palette.mutedForeground}
              />
              <View style={styles.repeatCopy}>
                <Text style={styles.repeatTitle}>{t("voucher.allowRepeat")}</Text>
                {/* The Bangla title already states this in full, so the caption would
                    only repeat it — it is intentionally empty in bn. */}
                {t("voucher.repeatCaption") ? (
                  <Text style={styles.repeatText}>
                    {t("voucher.repeatCaption")}
                  </Text>
                ) : null}
              </View>
            </Pressable>

            {form.allowRepeatUsage ? (
              <InputGroup
                label={t("voucher.maxUsesPerCustomer")}
                value={form.maxUsesPerUser}
                onChangeText={(value) => updateForm("maxUsesPerUser", value.replace(/\D/g, ""))}
                placeholder="2"
                keyboardType="number-pad"
              />
            ) : null}
          </View>

          <View style={styles.twoColumn}>
            <DateTimeField
              label={t("voucher.starts")}
              value={form.startsAt}
              onPress={() => setDatePickerTarget("startsAt")}
            />
            <DateTimeField
              label="Ends"
              value={form.endsAt}
              onPress={() => setDatePickerTarget("endsAt")}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={isSaving}
            style={[styles.primaryButton, isSaving ? styles.disabled : null]}
            onPress={submitVoucher}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.primaryText}>
                  {editingVoucher ? t("voucher.saveChanges") : t("voucher.create")}
                </Text>
                <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
              </>
            )}
          </Pressable>
        </View>

        <DateTimePickerModal
          visible={datePickerTarget !== null}
          title={datePickerTarget === "startsAt" ? t("voucher.startDateTime") : t("voucher.endDateTime")}
          value={datePickerTarget ? form[datePickerTarget] : new Date().toISOString()}
          onClose={() => setDatePickerTarget(null)}
          onConfirm={(value) => {
            if (datePickerTarget) updateForm(datePickerTarget, value);
            setDatePickerTarget(null);
          }}
        />
      </ScrollView>
      {deleteConfirmationSheet}
    </Screen>
  );
}

function InputGroup({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "numeric" | "number-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={styles.input}
      />
    </View>
  );
}

function VoucherListCard({
  voucher,
  onPress,
  onDelete,
}: {
  voucher: OwnerVoucher;
  onPress: () => void;
  onDelete: () => void;
}) {
  const { t } = useOwnerTranslation();

  function handleDeletePress(event: GestureResponderEvent) {
    event.stopPropagation();
    onDelete();
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.voucherCard,
        styles.voucherCardCompact,
        pressed ? styles.voucherCardPressed : null,
      ]}
    >
      <View style={styles.voucherTop}>
        <View style={styles.voucherCopy}>
          <Text numberOfLines={1} style={styles.voucherName}>
            {voucher.name}
          </Text>
          <Text style={styles.voucherMeta}>
            {voucher.mode === "coupon" ? voucher.code || t("voucher.noCode") : t("voucher.autoApplied")} -{" "}
            {formatDiscount(voucher, t)}
          </Text>
        </View>
        <View style={styles.voucherActions}>
          <VoucherStatusBadge status={voucher.status} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${voucher.name}`}
            hitSlop={8}
            style={({ pressed }) => [
              styles.voucherDeleteIconButton,
              pressed ? styles.voucherDeleteIconButtonPressed : null,
            ]}
            onPress={handleDeletePress}
          >
            <Ionicons name="trash-outline" size={16} color={palette.danger} />
          </Pressable>
        </View>
      </View>
      <View style={styles.compactVoucherFooter}>
        <Text style={styles.voucherDate}>
          {formatDate(voucher.startsAt)} - {formatDate(voucher.endsAt)}
        </Text>
        <View style={styles.compactMetricPill}>
          <Ionicons name="repeat-outline" size={13} color={palette.primary} />
          <Text style={styles.compactMetricText}>
            {localizeDigits(String(voucher.analytics?.totalUses ?? 0))} {t("voucher.uses")}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function VoucherStatusBadge({ status }: { status: OwnerVoucher["status"] }) {
  const { t } = useOwnerTranslation();
  const config =
    status === "Active"
      ? { label: t("voucher.active"), bg: "#DCFCE7", fg: "#15803D" }
      : status === "PendingApproval"
        ? { label: t("voucher.pendingReview"), bg: "#FEF3C7", fg: "#B45309" }
        : status === "Rejected"
          ? { label: t("voucher.rejected"), bg: "#FEE2E2", fg: "#B91C1C" }
          : { label: t("voucher.draft"), bg: "#F1F5F9", fg: "#475569" };
  return (
    <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
      <Text style={[styles.statusBadgeText, { color: config.fg }]}>
        {config.label}
      </Text>
    </View>
  );
}

function DeleteVoucherConfirmationSheet({
  voucher,
  visible,
  isDeleting,
  onClose,
  onConfirm,
}: {
  voucher: OwnerVoucher | null;
  visible: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useOwnerTranslation();
  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title="Delete voucher?"
      subtitle={t("voucher.deleteSubtitle")}
      leadingIcon="trash-outline"
      snapPoints={[0.48]}
      initialSnapPoint={0.48}
      scroll={false}
      closeOnBackdropPress={!isDeleting}
      enablePanDownToClose={!isDeleting}
      contentContainerStyle={styles.deleteSheetContent}
    >
      <View style={styles.deleteHero}>
        <View style={styles.deleteHeroIcon}>
          <Ionicons name="alert-circle-outline" size={24} color={palette.danger} />
        </View>
        <View style={styles.deleteHeroCopy}>
          <Text style={styles.deleteHeroTitle} numberOfLines={2}>
            {voucher?.name ?? "Selected voucher"}
          </Text>
          <Text style={styles.deleteHeroText}>
            {voucher ? `${formatDiscount(voucher, t)} - ${voucher.mode === "coupon" ? voucher.code || t("voucher.noCode") : t("voucher.autoApplied")}` : t("voucher.deleteFallback")}
          </Text>
        </View>
      </View>

      <View style={styles.deleteWarningCard}>
        <Ionicons name="information-circle-outline" size={18} color={palette.danger} />
        <Text style={styles.deleteWarningText}>
          Existing order records stay safe, but customers will not be able to use this voucher again.
        </Text>
      </View>

      <View style={styles.deleteActionRow}>
        <Pressable
          accessibilityRole="button"
          disabled={isDeleting}
          style={[styles.deleteCancelButton, isDeleting ? styles.disabled : null]}
          onPress={onClose}
        >
          <Text style={styles.deleteCancelText}>Keep voucher</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={isDeleting}
          style={[styles.deleteConfirmButton, isDeleting ? styles.disabled : null]}
          onPress={onConfirm}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.deleteConfirmText}>Delete</Text>
              <Ionicons name="trash-outline" size={17} color="#FFFFFF" />
            </>
          )}
        </Pressable>
      </View>
    </AppBottomSheet>
  );
}

function VoucherDetailsView({
  voucher,
  onEdit,
  onDelete,
}: {
  voucher: OwnerVoucher;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useOwnerTranslation();

  return (
    <View style={styles.detailsStack}>
      <View style={styles.detailsHeroCard}>
        <View style={styles.detailsHeroTop}>
          <View style={styles.detailsIcon}>
            <Ionicons name="ticket-outline" size={24} color="#FFFFFF" />
          </View>
          <VoucherStatusBadge status={voucher.status} />
        </View>
        <Text numberOfLines={2} style={styles.detailsTitle}>{voucher.name}</Text>
        <Text style={styles.detailsDiscount}>{formatDiscount(voucher, t)}</Text>
        <Text style={styles.detailsMeta}>
          {voucher.mode === "coupon" ? `${t("voucher.codePrefix")} ${voucher.code || "--"}` : t("voucher.autoApplied")} -{" "}
          {formatDateTime(voucher.startsAt, t)} to {formatDateTime(voucher.endsAt, t)}
        </Text>
      </View>

      {voucher.status === "Rejected" ? (
        <View style={styles.rejectCard}>
          <View style={styles.rejectHeader}>
            <Ionicons name="close-circle" size={18} color="#B91C1C" />
            <Text style={styles.rejectTitle}>{t("voucher.rejectedTitle")}</Text>
          </View>
          <Text style={styles.rejectReason}>
            {voucher.reviewNote?.trim() || t("voucher.rejectedNoReason")}
          </Text>
        </View>
      ) : voucher.status === "PendingApproval" ? (
        <View style={styles.pendingCard}>
          <Ionicons name="time-outline" size={18} color="#B45309" />
          <Text style={styles.pendingText}>{t("voucher.pendingInfo")}</Text>
        </View>
      ) : null}

      <View style={styles.analyticsGrid}>
        <AnalyticsCard
          icon="repeat-outline"
          label={t("voucher.uses")}
          value={`${voucher.analytics?.totalUses ?? 0}`}
          tint="#FFF0F6"
        />
        <AnalyticsCard
          icon="trending-up-outline"
          label="Sales"
          value={formatMoney(voucher.analytics?.revenueGenerated)}
          tint="#EEF8F2"
        />
        <AnalyticsCard
          icon="pricetag-outline"
          label="Cost"
          value={formatMoney(voucher.analytics?.totalDiscountGiven)}
          tint="#FFF6E3"
        />
      </View>

      <View style={styles.detailRowsCard}>
        <VoucherDetailLine
          label={t("voucher.applyType")}
          value={
            voucher.mode === "coupon"
              ? t("voucher.codeRequired")
              : t("voucher.autoApplied")
          }
        />
        <VoucherDetailLine label="Minimum order" value={formatMoney(voucher.minimumOrderAmount)} />
        <VoucherDetailLine label="Max total uses" value={voucher.maxTotalUses ? `${voucher.maxTotalUses}` : "Unlimited"} />
        <VoucherDetailLine
          label={t("voucher.repeatUser")}
          value={
            voucher.allowRepeatUsage
              ? `${localizeDigits(String(voucher.maxUsesPerUser ?? 1))} ${t("voucher.usesPerCustomer")}`
              : t("voucher.oncePerCustomer")
          }
        />
      </View>

      <View style={styles.detailsActionRow}>
        <Pressable accessibilityRole="button" style={styles.detailSecondaryButton} onPress={onDelete}>
          <Ionicons name="trash-outline" size={17} color={palette.danger} />
          <Text style={styles.detailSecondaryText}>Delete</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.detailPrimaryButton} onPress={onEdit}>
          <Text style={styles.detailPrimaryText}>Edit voucher</Text>
          <Ionicons name="create-outline" size={17} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

function VoucherDetailLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailRowLabel}>{label}</Text>
      <Text style={styles.detailRowValue}>{value}</Text>
    </View>
  );
}

function SegmentedControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.segmented}>
        {options.map((option) => {
          const isActive = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              style={[styles.segmentButton, isActive ? styles.segmentButtonActive : null]}
              onPress={() => onChange(option.value)}
            >
              <Text style={[styles.segmentText, isActive ? styles.segmentTextActive : null]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function AnalyticsCard({
  icon,
  label,
  value,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <View style={[styles.analyticsCard, { backgroundColor: tint }]}>
      <Ionicons name={icon} size={17} color={palette.foreground} />
      <Text numberOfLines={1} style={styles.analyticsValue}>
        {value}
      </Text>
      <Text style={styles.analyticsLabel}>{label}</Text>
    </View>
  );
}

function DateTimeField({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  const { t } = useOwnerTranslation();

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <Pressable accessibilityRole="button" style={styles.dateField} onPress={onPress}>
        <Ionicons name="calendar-outline" size={17} color={palette.primary} />
        <Text numberOfLines={1} style={styles.dateFieldText}>
          {formatDateTime(value, t)}
        </Text>
      </Pressable>
    </View>
  );
}

function DateTimePickerModal({
  visible,
  title,
  value,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  value: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
}) {
  const { t } = useOwnerTranslation();
  const initialDate = new Date(value);
  const safeInitialDate = Number.isNaN(initialDate.getTime()) ? new Date() : initialDate;
  const [draftDate, setDraftDate] = useState(safeInitialDate);
  const [viewDate, setViewDate] = useState(
    new Date(safeInitialDate.getFullYear(), safeInitialDate.getMonth(), 1),
  );
  const calendarDays = useMemo(() => getCalendarDays(viewDate), [viewDate]);

  useEffect(() => {
    if (!visible) return;
    const nextDate = new Date(value);
    const safeNextDate = Number.isNaN(nextDate.getTime()) ? new Date() : nextDate;
    setDraftDate(safeNextDate);
    setViewDate(new Date(safeNextDate.getFullYear(), safeNextDate.getMonth(), 1));
  }, [value, visible]);

  function moveMonth(direction: -1 | 1) {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  }

  function selectDay(day: Date) {
    const next = new Date(draftDate);
    next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    setDraftDate(next);
    setViewDate(new Date(day.getFullYear(), day.getMonth(), 1));
  }

  function setHour(hour: number) {
    const next = new Date(draftDate);
    next.setHours(hour);
    setDraftDate(next);
  }

  function setMinute(minute: number) {
    const next = new Date(draftDate);
    next.setMinutes(minute, 0, 0);
    setDraftDate(next);
  }

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={formatDateTime(draftDate.toISOString(), t)}
      leadingIcon="calendar-outline"
      snapPoints={[0.9]}
      initialSnapPoint={0.9}
      contentContainerStyle={styles.pickerSheetContent}
    >

          <View style={styles.monthHeader}>
            <Pressable accessibilityRole="button" style={styles.monthButton} onPress={() => moveMonth(-1)}>
              <Ionicons name="chevron-back" size={18} color={palette.foreground} />
            </Pressable>
            <Text style={styles.monthTitle}>{monthTitle(viewDate)}</Text>
            <Pressable accessibilityRole="button" style={styles.monthButton} onPress={() => moveMonth(1)}>
              <Ionicons name="chevron-forward" size={18} color={palette.foreground} />
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((weekday, index) => (
              <Text key={`${weekday}-${index}`} style={styles.weekdayText}>
                {weekday}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {calendarDays.map((day) => {
              const isCurrentMonth = day.getMonth() === viewDate.getMonth();
              const isSelected = isSameDate(day, draftDate);
              return (
                <Pressable
                  key={day.toISOString()}
                  accessibilityRole="button"
                  style={[
                    styles.dayButton,
                    !isCurrentMonth ? styles.dayButtonMuted : null,
                    isSelected ? styles.dayButtonSelected : null,
                  ]}
                  onPress={() => selectDay(day)}
                >
                  <Text
                    style={[
                      styles.dayText,
                      !isCurrentMonth ? styles.dayTextMuted : null,
                      isSelected ? styles.dayTextSelected : null,
                    ]}
                  >
                    {day.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.timeSection}>
            <Text style={styles.timeLabel}>Hour</Text>
            <View style={styles.timeChipRow}>
              {QUICK_HOURS.map((hour) => (
                <TimeChip
                  key={hour}
                  label={String(hour).padStart(2, "0")}
                  active={draftDate.getHours() === hour}
                  onPress={() => setHour(hour)}
                />
              ))}
            </View>
            <Text style={styles.timeLabel}>Minute</Text>
            <View style={styles.timeChipRow}>
              {QUICK_MINUTES.map((minute) => (
                <TimeChip
                  key={minute}
                  label={String(minute).padStart(2, "0")}
                  active={draftDate.getMinutes() === minute}
                  onPress={() => setMinute(minute)}
                />
              ))}
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            style={styles.pickerConfirmButton}
            onPress={() => onConfirm(draftDate.toISOString())}
          >
            <Text style={styles.pickerConfirmText}>Use this date</Text>
            <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
          </Pressable>
    </AppBottomSheet>
  );
}

function TimeChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={[styles.timeChip, active ? styles.timeChipActive : null]}
      onPress={onPress}
    >
      <Text style={[styles.timeChipText, active ? styles.timeChipTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    paddingBottom: 44,
    gap: 16,
  },
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
  headerSpacer: {
    width: 40,
  },
  headerCreateButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: palette.foreground,
    alignItems: "center",
    justifyContent: "center",
  },
  createVoucherButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: palette.foreground,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  createVoucherText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  heroCard: {
    borderRadius: 24,
    backgroundColor: palette.foreground,
    padding: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroCopy: {
    flex: 1,
    gap: 3,
  },
  heroTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  heroText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: "#F7D9CF",
  },
  heroStats: {
    minWidth: 58,
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  heroStatsValue: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
    color: palette.primary,
  },
  heroStatsLabel: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
    color: palette.mutedForeground,
  },
  analyticsGrid: {
    flexDirection: "row",
    gap: 10,
  },
  analyticsCard: {
    flex: 1,
    minHeight: 92,
    borderRadius: 20,
    padding: 12,
    justifyContent: "center",
    gap: 4,
  },
  analyticsValue: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: palette.foreground,
  },
  analyticsLabel: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  formCard: {
    borderRadius: 24,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 15,
    gap: 14,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  formTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
    color: palette.foreground,
  },
  formSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  clearButton: {
    minHeight: 34,
    borderRadius: 13,
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  clearButtonText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    color: palette.primary,
  },
  inputGroup: {
    flex: 1,
    gap: 7,
  },
  label: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "900",
    color: palette.foreground,
  },
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: 13,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: palette.foreground,
  },
  dateField: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  dateFieldText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  twoColumn: {
    flexDirection: "row",
    gap: 10,
  },
  segmented: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    flexDirection: "row",
    padding: 4,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentButtonActive: {
    backgroundColor: palette.foreground,
  },
  segmentText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "900",
    color: palette.mutedForeground,
  },
  segmentTextActive: {
    color: "#FFFFFF",
  },
  repeatCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    padding: 12,
    gap: 12,
  },
  repeatToggle: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  repeatCopy: {
    flex: 1,
  },
  repeatTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  repeatText: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: palette.foreground,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
    color: palette.foreground,
  },
  sectionCount: {
    minWidth: 32,
    textAlign: "center",
    borderRadius: 12,
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    color: palette.primary,
  },
  feedbackCard: {
    minHeight: 120,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.surface,
  },
  feedbackText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  voucherList: {
    gap: 10,
  },
  voucherCard: {
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    gap: 12,
  },
  voucherCardCompact: {
    borderRadius: 16,
    gap: 10,
  },
  voucherCardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  voucherTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  voucherCopy: {
    flex: 1,
  },
  voucherActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  voucherDeleteIconButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: palette.dangerSoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  voucherDeleteIconButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.96 }],
  },
  voucherName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: palette.foreground,
  },
  voucherMeta: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  voucherStatsRow: {
    flexDirection: "row",
    gap: 8,
  },
  voucherStat: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: palette.surfaceMuted,
    padding: 9,
    gap: 2,
  },
  voucherStatValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  voucherStatLabel: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  statusBadge: {
    borderRadius: 12,
    backgroundColor: palette.warningSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusBadgeActive: {
    backgroundColor: palette.successSoft,
  },
  statusBadgeText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
    color: palette.warning,
  },
  statusBadgeTextActive: {
    color: palette.success,
  },
  voucherFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  voucherDate: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  compactVoucherFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  compactMetricPill: {
    minHeight: 26,
    borderRadius: 10,
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  compactMetricText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
    color: palette.primary,
  },
  detailsStack: {
    gap: 14,
  },
  detailsHeroCard: {
    borderRadius: 22,
    backgroundColor: palette.foreground,
    padding: 18,
    gap: 9,
  },
  rejectCard: {
    borderRadius: 16,
    backgroundColor: "#FEF2F2",
    borderWidth: 1.5,
    borderColor: "#FCA5A5",
    padding: 14,
    gap: 6,
  },
  rejectHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  rejectTitle: { fontSize: 14, fontWeight: "800", color: "#B91C1C" },
  rejectReason: { fontSize: 14, lineHeight: 20, color: "#7F1D1D" },
  pendingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 16,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FCD34D",
    padding: 14,
  },
  pendingText: { flex: 1, fontSize: 13, lineHeight: 18, color: "#92400E", fontWeight: "600" },
  detailsHeroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  detailsIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  detailsTitle: {
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  detailsDiscount: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: "#F7D9CF",
  },
  detailsMeta: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: "#F7D9CF",
  },
  detailRowsCard: {
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 12,
    gap: 4,
  },
  detailRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  detailRowLabel: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  detailRowValue: {
    flex: 1,
    textAlign: "right",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "900",
    color: palette.foreground,
  },
  detailsActionRow: {
    flexDirection: "row",
    gap: 9,
  },
  detailSecondaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 15,
    backgroundColor: palette.dangerSoft,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  detailSecondaryText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.danger,
  },
  detailPrimaryButton: {
    flex: 1.4,
    minHeight: 50,
    borderRadius: 15,
    backgroundColor: palette.foreground,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  detailPrimaryText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 13,
    backgroundColor: palette.dangerSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteSheetContent: {
    gap: 14,
    paddingBottom: 24,
  },
  deleteHero: {
    minHeight: 88,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  deleteHeroIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: palette.dangerSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteHeroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  deleteHeroTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
    color: palette.foreground,
  },
  deleteHeroText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  deleteWarningCard: {
    borderRadius: 18,
    backgroundColor: palette.dangerSoft,
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  deleteWarningText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.danger,
  },
  deleteActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  deleteCancelButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteCancelText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  deleteConfirmButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: palette.danger,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  deleteConfirmText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  emptyCard: {
    minHeight: 160,
    borderRadius: 22,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    gap: 7,
  },
  emptyTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
    color: palette.foreground,
  },
  emptyText: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  disabled: {
    opacity: 0.65,
  },
  pickerSheetContent: {
    gap: 14,
    paddingBottom: 28,
  },
  pickerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(31,36,48,0.38)",
  },
  pickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  pickerCard: {
    maxHeight: "90%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: palette.background,
    padding: 18,
    gap: 14,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  pickerTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
    color: palette.foreground,
  },
  pickerSubtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  pickerCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  monthHeader: {
    minHeight: 44,
    borderRadius: 16,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  monthButton: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: palette.foreground,
  },
  weekdayRow: {
    flexDirection: "row",
  },
  weekdayText: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
    color: palette.mutedForeground,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  dayButton: {
    width: "13.6%",
    aspectRatio: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
  dayButtonMuted: {
    opacity: 0.42,
  },
  dayButtonSelected: {
    backgroundColor: palette.foreground,
  },
  dayText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  dayTextMuted: {
    color: palette.mutedForeground,
  },
  dayTextSelected: {
    color: "#FFFFFF",
  },
  timeSection: {
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 12,
    gap: 9,
  },
  timeLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
    color: palette.mutedForeground,
    textTransform: "uppercase",
  },
  timeChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  timeChip: {
    minWidth: 46,
    minHeight: 36,
    borderRadius: 13,
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  timeChipActive: {
    backgroundColor: palette.primary,
  },
  timeChipText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "900",
    color: palette.foreground,
  },
  timeChipTextActive: {
    color: "#FFFFFF",
  },
  pickerConfirmButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: palette.foreground,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  pickerConfirmText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: "#FFFFFF",
  },
});
