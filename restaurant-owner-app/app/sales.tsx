import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AppBottomSheet } from "@/src/components/app-bottom-sheet";
import {
  SalesBarChart,
  type SalesBarChartMode,
} from "@/src/components/sales-bar-chart";
import { Screen } from "@/src/components/screen";
import {
  useOwnerSalesReportQuery,
  type OwnerSalesPreset,
} from "@/src/hooks/use-owner-api";
import {
  useOwnerTranslation,
  type TranslationKey,
} from "@/src/i18n/translations";
import { formatCurrency, localizeDigits } from "@/src/lib/format";
import { palette } from "@/src/theme/palette";

type CustomRange = {
  from: string;
  to: string;
};

const PRESETS: { value: OwnerSalesPreset; labelKey: TranslationKey }[] = [
  { value: "today", labelKey: "sales.preset.today" },
  { value: "yesterday", labelKey: "sales.preset.yesterday" },
  { value: "last7Days", labelKey: "sales.preset.last7Days" },
  { value: "last30Days", labelKey: "sales.preset.last30Days" },
  { value: "custom", labelKey: "sales.preset.custom" },
];

const BN_MONTHS = [
  "জানু",
  "ফেব",
  "মার্চ",
  "এপ্রি",
  "মে",
  "জুন",
  "জুল",
  "আগ",
  "সেপ্ট",
  "অক্ট",
  "নভে",
  "ডিসে",
];
const EN_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const BN_WEEKDAYS = ["র", "সো", "ম", "বু", "বৃ", "শু", "শ"];
const EN_WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function dateKeyFromDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function createDefaultCustomRange(): CustomRange {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - 6);
  return {
    from: dateKeyFromDate(from),
    to: dateKeyFromDate(to),
  };
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

function formatDateLabel(value: string, language: "bn" | "en") {
  const date = parseDateKey(value);
  if (!date) return value;
  const months = language === "bn" ? BN_MONTHS : EN_MONTHS;
  const label = `${date.getDate()} ${months[date.getMonth()]}`;
  return language === "bn" ? localizeDigits(label, language) : label;
}

function formatMonthTitle(date: Date, language: "bn" | "en") {
  const months = language === "bn" ? BN_MONTHS : EN_MONTHS;
  const label = `${months[date.getMonth()]} ${date.getFullYear()}`;
  return language === "bn" ? localizeDigits(label, language) : label;
}

function normalizeRange(range: CustomRange): CustomRange {
  return range.from <= range.to
    ? range
    : {
        from: range.to,
        to: range.from,
      };
}

function calculateChange(current: number, previous: number) {
  if (previous > 0) {
    return ((current - previous) / previous) * 100;
  }

  if (current > 0) {
    return null;
  }

  return 0;
}

function formatChangeText(
  current: number,
  previous: number,
  t: (key: TranslationKey) => string,
) {
  const change = calculateChange(current, previous);

  if (change === null) {
    return {
      text: t("sales.newCompared"),
      tone: "success" as const,
      icon: "trending-up-outline" as const,
    };
  }

  const rounded = Math.round(Math.abs(change));
  if (rounded === 0) {
    return {
      text: t("sales.noChange"),
      tone: "neutral" as const,
      icon: "remove-outline" as const,
    };
  }

  return {
    text: `${change > 0 ? "▲" : "▼"} ${localizeDigits(`${rounded}%`)}`,
    tone: change > 0 ? ("success" as const) : ("danger" as const),
    icon: change > 0 ? ("trending-up-outline" as const) : ("trending-down-outline" as const),
  };
}

export default function SalesScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { language, t } = useOwnerTranslation();
  const [preset, setPreset] = useState<OwnerSalesPreset>("today");
  const [chartMode, setChartMode] = useState<SalesBarChartMode>("sales");
  const [customRange, setCustomRange] = useState<CustomRange>(() =>
    createDefaultCustomRange(),
  );
  const [draftRange, setDraftRange] = useState<CustomRange>(() =>
    createDefaultCustomRange(),
  );
  const [rangeSheetVisible, setRangeSheetVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryParams = useMemo(
    () =>
      preset === "custom"
        ? { preset, ...customRange }
        : { preset },
    [customRange, preset],
  );
  const salesQuery = useOwnerSalesReportQuery(isFocused, queryParams);
  const summary = salesQuery.data;
  const metrics = summary?.metrics;
  const change = formatChangeText(
    metrics?.totalRevenue ?? 0,
    metrics?.previousTotalRevenue ?? 0,
    t,
  );
  const trendPoints = useMemo(
    () =>
      (summary?.salesTrend ?? []).map((point) => ({
        date: point.date,
        label: formatDateLabel(point.date, language),
        sales: point.deliveredValue ?? point.revenue ?? 0,
        orders: point.orders ?? 0,
      })),
    [language, summary?.salesTrend],
  );
  const topItems = summary?.topItems ?? [];
  const rangeLabel =
    preset === "custom"
      ? `${formatDateLabel(customRange.from, language)} - ${formatDateLabel(customRange.to, language)}`
      : t(PRESETS.find((option) => option.value === preset)?.labelKey ?? "sales.preset.today");

  async function refreshSales() {
    setIsRefreshing(true);
    try {
      await salesQuery.refetch();
    } finally {
      setIsRefreshing(false);
    }
  }

  function handlePresetPress(nextPreset: OwnerSalesPreset) {
    if (nextPreset === "custom") {
      setDraftRange(customRange);
      setRangeSheetVisible(true);
      return;
    }

    setPreset(nextPreset);
  }

  function applyCustomRange() {
    const nextRange = normalizeRange(draftRange);
    setCustomRange(nextRange);
    setPreset("custom");
    setRangeSheetVisible(false);
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshSales}
            tintColor={palette.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={21} color={palette.foreground} />
          </Pressable>
          <Text style={styles.title}>{t("sales.title")}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.presetRow}
        >
          {PRESETS.map((option) => {
            const isActive = preset === option.value;
            return (
              <Pressable
                accessibilityRole="button"
                key={option.value}
                style={({ pressed }) => [
                  styles.presetChip,
                  isActive ? styles.presetChipActive : null,
                  pressed ? styles.pressed : null,
                ]}
                onPress={() => handlePresetPress(option.value)}
              >
                <Text
                  style={[
                    styles.presetText,
                    isActive ? styles.presetTextActive : null,
                  ]}
                >
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryIcon}>
              <Ionicons name="stats-chart" size={22} color="#FFFFFF" />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryLabel}>{t("sales.totalSales")}</Text>
              <Text numberOfLines={1} style={styles.summaryRange}>
                {rangeLabel}
              </Text>
            </View>
            <View
              style={[
                styles.changePill,
                change.tone === "success"
                  ? styles.changePillSuccess
                  : change.tone === "danger"
                    ? styles.changePillDanger
                    : null,
              ]}
            >
              <Ionicons
                name={change.icon}
                size={13}
                color={
                  change.tone === "success"
                    ? palette.success
                    : change.tone === "danger"
                      ? palette.danger
                      : palette.mutedForeground
                }
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.changeText,
                  change.tone === "success"
                    ? styles.changeTextSuccess
                    : change.tone === "danger"
                      ? styles.changeTextDanger
                      : null,
                ]}
              >
                {change.text}
              </Text>
            </View>
          </View>

          {salesQuery.isLoading ? (
            <View style={styles.loadingInline}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.loadingInlineText}>{t("sales.loading")}</Text>
            </View>
          ) : (
            <>
              <Text numberOfLines={1} style={styles.totalSales}>
                {formatCurrency(metrics?.totalRevenue ?? 0)}
              </Text>
              <View style={styles.summaryMetrics}>
                <MetricPill
                  label={t("sales.orders")}
                  value={localizeDigits(String(metrics?.totalOrders ?? 0))}
                />
                <MetricPill
                  label={t("sales.averageOrder")}
                  value={formatCurrency(metrics?.averageOrderValue ?? 0)}
                />
              </View>
            </>
          )}
        </View>

        <View style={styles.chartCard}>
          <View style={styles.sectionTop}>
            <View>
              <Text style={styles.sectionTitle}>{t("sales.chartTitle")}</Text>
              <Text style={styles.sectionSubtitle}>{rangeLabel}</Text>
            </View>
            <View style={styles.segmented}>
              <SegmentButton
                active={chartMode === "sales"}
                label={t("sales.chartSales")}
                onPress={() => setChartMode("sales")}
              />
              <SegmentButton
                active={chartMode === "orders"}
                label={t("sales.chartOrders")}
                onPress={() => setChartMode("orders")}
              />
            </View>
          </View>

          {salesQuery.isLoading ? (
            <View style={styles.feedbackCard}>
              <ActivityIndicator size="small" color={palette.primary} />
              <Text style={styles.feedbackText}>{t("sales.loading")}</Text>
            </View>
          ) : (
            <SalesBarChart
              points={trendPoints}
              mode={chartMode}
              formatSales={formatCurrency}
              formatOrders={(value) => localizeDigits(String(value))}
              salesLabel={t("sales.chartSales")}
              ordersLabel={t("sales.chartOrders")}
              emptyLabel={t("sales.noTrend")}
            />
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionTop}>
            <Text style={styles.sectionTitle}>{t("sales.topItems")}</Text>
            <Text style={styles.sectionCount}>{localizeDigits(String(topItems.length))}</Text>
          </View>

          {salesQuery.isLoading ? (
            <View style={styles.feedbackCard}>
              <ActivityIndicator size="small" color={palette.primary} />
              <Text style={styles.feedbackText}>{t("sales.loading")}</Text>
            </View>
          ) : topItems.length ? (
            <View style={styles.topItemsList}>
              {topItems.map((item, index) => (
                <View key={`${item.id}-${item.name}`} style={styles.topItemRow}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>{localizeDigits(String(index + 1))}</Text>
                  </View>
                  <View style={styles.topItemCopy}>
                    <Text numberOfLines={1} style={styles.topItemName}>
                      {item.name}
                    </Text>
                    <Text style={styles.topItemMeta}>
                      {localizeDigits(String(item.quantity))} {t("sales.itemsSold")}
                    </Text>
                  </View>
                  <Text numberOfLines={1} style={styles.topItemRevenue}>
                    {formatCurrency(item.revenue)}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="restaurant-outline" size={26} color={palette.primary} />
              <Text style={styles.emptyTitle}>{t("sales.noTopItems")}</Text>
            </View>
          )}
        </View>

        <View style={styles.breakdownCard}>
          <BreakdownItem
            icon="close-circle-outline"
            label={t("sales.cancelled")}
            value={localizeDigits(String(metrics?.cancelledOrders ?? 0))}
            amount={formatCurrency(metrics?.cancelledOrderValue ?? 0)}
            tone="danger"
          />
          <View style={styles.breakdownDivider} />
          <BreakdownItem
            icon="ban-outline"
            label={t("sales.rejected")}
            value={localizeDigits(String(metrics?.rejectedOrders ?? 0))}
            amount={formatCurrency(metrics?.rejectedOrderValue ?? 0)}
            tone="warning"
          />
        </View>
      </ScrollView>

      <DateRangePickerSheet
        visible={rangeSheetVisible}
        range={draftRange}
        language={language}
        onChange={setDraftRange}
        onClose={() => setRangeSheetVisible(false)}
        onApply={applyCustomRange}
        t={t}
      />
    </Screen>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricPill}>
      <Text numberOfLines={1} style={styles.metricValue}>
        {value}
      </Text>
      <Text numberOfLines={1} style={styles.metricLabel}>
        {label}
      </Text>
    </View>
  );
}

function SegmentButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={[styles.segmentButton, active ? styles.segmentButtonActive : null]}
      onPress={onPress}
    >
      <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function BreakdownItem({
  icon,
  label,
  value,
  amount,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  amount: string;
  tone: "danger" | "warning";
}) {
  const color = tone === "danger" ? palette.danger : palette.warning;
  const backgroundColor = tone === "danger" ? palette.dangerSoft : palette.warningSoft;

  return (
    <View style={styles.breakdownItem}>
      <View style={[styles.breakdownIcon, { backgroundColor }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={styles.breakdownCopy}>
        <Text style={styles.breakdownLabel}>{label}</Text>
        <Text style={styles.breakdownValue}>
          {value} · {amount}
        </Text>
      </View>
    </View>
  );
}

function DateRangePickerSheet({
  visible,
  range,
  language,
  onChange,
  onClose,
  onApply,
  t,
}: {
  visible: boolean;
  range: CustomRange;
  language: "bn" | "en";
  onChange: (range: CustomRange) => void;
  onClose: () => void;
  onApply: () => void;
  t: (key: TranslationKey) => string;
}) {
  const [activeField, setActiveField] = useState<keyof CustomRange>("from");
  const [viewDate, setViewDate] = useState(() => {
    const parsed = parseDateKey(range.from) ?? new Date();
    return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
  });
  const calendarDays = useMemo(() => getCalendarDays(viewDate), [viewDate]);
  const normalizedRange = normalizeRange(range);
  const weekdays = language === "bn" ? BN_WEEKDAYS : EN_WEEKDAYS;

  useEffect(() => {
    if (!visible) return;
    const parsed = parseDateKey(range.from) ?? new Date();
    setViewDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    setActiveField("from");
    // Reset only when the sheet opens; date taps should not move focus back to start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function moveMonth(direction: -1 | 1) {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  }

  function selectDay(day: Date) {
    const nextKey = dateKeyFromDate(day);
    onChange({
      ...range,
      [activeField]: nextKey,
    });
    if (activeField === "from") {
      setActiveField("to");
    }
  }

  return (
    <AppBottomSheet
      visible={visible}
      title={t("sales.customRange")}
      subtitle={t("sales.pickRange")}
      leadingIcon="calendar-outline"
      snapPoints={[0.82, 0.94]}
      onClose={onClose}
      contentContainerStyle={styles.rangeSheetContent}
    >
      <View style={styles.rangeEndpointRow}>
        <RangeEndpointButton
          active={activeField === "from"}
          label={t("sales.startDate")}
          value={formatDateLabel(range.from, language)}
          onPress={() => setActiveField("from")}
        />
        <RangeEndpointButton
          active={activeField === "to"}
          label={t("sales.endDate")}
          value={formatDateLabel(range.to, language)}
          onPress={() => setActiveField("to")}
        />
      </View>

      <View style={styles.monthHeader}>
        <Pressable
          accessibilityRole="button"
          style={styles.monthButton}
          onPress={() => moveMonth(-1)}
        >
          <Ionicons name="chevron-back" size={18} color={palette.foreground} />
        </Pressable>
        <Text style={styles.monthTitle}>{formatMonthTitle(viewDate, language)}</Text>
        <Pressable
          accessibilityRole="button"
          style={styles.monthButton}
          onPress={() => moveMonth(1)}
        >
          <Ionicons name="chevron-forward" size={18} color={palette.foreground} />
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {weekdays.map((weekday, index) => (
          <Text key={`${weekday}-${index}`} style={styles.weekdayText}>
            {weekday}
          </Text>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {calendarDays.map((day) => {
          const dayKey = dateKeyFromDate(day);
          const isMuted = day.getMonth() !== viewDate.getMonth();
          const isStart = dayKey === normalizedRange.from;
          const isEnd = dayKey === normalizedRange.to;
          const isInside = dayKey > normalizedRange.from && dayKey < normalizedRange.to;
          const isSelected = isStart || isEnd;

          return (
            <Pressable
              accessibilityRole="button"
              key={dayKey}
              style={[
                styles.dayButton,
                isInside ? styles.dayButtonInside : null,
                isSelected ? styles.dayButtonSelected : null,
                isMuted ? styles.dayButtonMuted : null,
              ]}
              onPress={() => selectDay(day)}
            >
              <Text
                style={[
                  styles.dayText,
                  isSelected ? styles.dayTextSelected : null,
                  isMuted && !isSelected ? styles.dayTextMuted : null,
                ]}
              >
                {localizeDigits(String(day.getDate()), language)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        style={styles.applyRangeButton}
        onPress={onApply}
      >
        <Text style={styles.applyRangeText}>{t("sales.applyRange")}</Text>
        <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
      </Pressable>
    </AppBottomSheet>
  );
}

function RangeEndpointButton({
  active,
  label,
  value,
  onPress,
}: {
  active: boolean;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={[styles.rangeEndpoint, active ? styles.rangeEndpointActive : null]}
      onPress={onPress}
    >
      <Text style={styles.rangeEndpointLabel}>{label}</Text>
      <Text style={[styles.rangeEndpointValue, active ? styles.rangeEndpointValueActive : null]}>
        {value}
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
  presetRow: {
    gap: 8,
    paddingRight: 12,
  },
  presetChip: {
    minHeight: 40,
    borderRadius: 14,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  presetChipActive: {
    backgroundColor: palette.foreground,
    borderColor: palette.foreground,
  },
  presetText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "900",
    color: palette.foreground,
  },
  presetTextActive: {
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
  summaryCard: {
    borderRadius: 24,
    backgroundColor: palette.foreground,
    padding: 18,
    gap: 14,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  summaryIcon: {
    width: 46,
    height: 46,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  summaryLabel: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "900",
    color: "#F7D9CF",
  },
  summaryRange: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  changePill: {
    maxWidth: 126,
    minHeight: 34,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  changePillSuccess: {
    backgroundColor: "#E8FFF4",
  },
  changePillDanger: {
    backgroundColor: "#FFF1F2",
  },
  changeText: {
    flexShrink: 1,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  changeTextSuccess: {
    color: palette.success,
  },
  changeTextDanger: {
    color: palette.danger,
  },
  totalSales: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  summaryMetrics: {
    flexDirection: "row",
    gap: 10,
  },
  metricPill: {
    flex: 1,
    minHeight: 58,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    justifyContent: "center",
    gap: 2,
  },
  metricValue: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  metricLabel: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "800",
    color: "#F7D9CF",
  },
  loadingInline: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  loadingInlineText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  chartCard: {
    borderRadius: 24,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    gap: 14,
  },
  section: {
    gap: 12,
  },
  sectionTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
    color: palette.foreground,
  },
  sectionSubtitle: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    color: palette.mutedForeground,
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
  segmented: {
    minHeight: 38,
    borderRadius: 14,
    backgroundColor: palette.surfaceMuted,
    flexDirection: "row",
    padding: 3,
    gap: 3,
  },
  segmentButton: {
    minWidth: 62,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  segmentButtonActive: {
    backgroundColor: palette.foreground,
  },
  segmentText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "900",
    color: palette.mutedForeground,
  },
  segmentTextActive: {
    color: "#FFFFFF",
  },
  feedbackCard: {
    minHeight: 170,
    borderRadius: 18,
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  feedbackText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  topItemsList: {
    gap: 10,
  },
  topItemRow: {
    minHeight: 70,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  rankBadge: {
    width: 34,
    height: 34,
    borderRadius: 13,
    backgroundColor: palette.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.primary,
  },
  topItemCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  topItemName: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: palette.foreground,
  },
  topItemMeta: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  topItemRevenue: {
    maxWidth: 112,
    textAlign: "right",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  emptyCard: {
    minHeight: 130,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    gap: 7,
  },
  emptyTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: palette.foreground,
  },
  breakdownCard: {
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 13,
    gap: 10,
  },
  breakdownItem: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  breakdownIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  breakdownCopy: {
    flex: 1,
    gap: 2,
  },
  breakdownLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  breakdownValue: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: palette.border,
  },
  rangeSheetContent: {
    gap: 13,
    paddingBottom: 26,
  },
  rangeEndpointRow: {
    flexDirection: "row",
    gap: 10,
  },
  rangeEndpoint: {
    flex: 1,
    minHeight: 64,
    borderRadius: 17,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 11,
    justifyContent: "center",
    gap: 3,
  },
  rangeEndpointActive: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  rangeEndpointLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
    color: palette.mutedForeground,
  },
  rangeEndpointValue: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: palette.foreground,
  },
  rangeEndpointValueActive: {
    color: palette.primary,
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
  dayButtonInside: {
    backgroundColor: palette.primarySoft,
  },
  dayButtonMuted: {
    opacity: 0.42,
  },
  dayButtonSelected: {
    backgroundColor: palette.foreground,
    opacity: 1,
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
  applyRangeButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: palette.foreground,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  applyRangeText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    color: "#FFFFFF",
  },
});
