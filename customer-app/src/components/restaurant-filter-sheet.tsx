import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppBottomSheet } from "@/src/components/app-bottom-sheet";
import { PressableScale } from "@/src/components/pressable-scale";
import { useRestaurantDiscoveryTotalQuery } from "@/src/hooks/use-customer-api";
import { palette } from "@/src/theme/palette";

export type RestaurantFilterMode = "all" | "open" | "offers" | "featured";
export type RestaurantSortBy = "nearest" | "fastest" | "topRated";
export type RestaurantMinRating = 0 | 4 | 4.5;
export type RestaurantMaxPrice = 0 | 200 | 400 | 700;

export type RestaurantFilterValues = {
  filter: RestaurantFilterMode;
  sortBy: RestaurantSortBy;
  minimumRating: RestaurantMinRating;
  maximumLowestPrice: RestaurantMaxPrice;
};

export const DEFAULT_RESTAURANT_FILTER_VALUES: RestaurantFilterValues = {
  filter: "all",
  sortBy: "nearest",
  minimumRating: 0,
  maximumLowestPrice: 0,
};

export function countActiveRestaurantFilters(value: RestaurantFilterValues) {
  let count = 0;
  if (value.filter !== "all") count += 1;
  if (value.sortBy !== "nearest") count += 1;
  if (value.minimumRating !== 0) count += 1;
  if (value.maximumLowestPrice !== 0) count += 1;
  return count;
}

const SHOW_OPTIONS: {
  key: RestaurantFilterMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "all", label: "All", icon: "apps-outline" },
  { key: "open", label: "Open now", icon: "checkmark-circle-outline" },
  { key: "offers", label: "Offers", icon: "pricetag-outline" },
  { key: "featured", label: "Featured", icon: "sparkles-outline" },
];

const SORT_OPTIONS: {
  key: RestaurantSortBy;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "nearest", label: "Nearest", icon: "navigate-outline" },
  { key: "fastest", label: "Fastest", icon: "flash-outline" },
  { key: "topRated", label: "Top rated", icon: "star-outline" },
];

const RATING_OPTIONS: { key: RestaurantMinRating; label: string }[] = [
  { key: 0, label: "Any" },
  { key: 4, label: "4.0+" },
  { key: 4.5, label: "4.5+" },
];

const PRICE_OPTIONS: { key: RestaurantMaxPrice; label: string }[] = [
  { key: 0, label: "Any" },
  { key: 200, label: "Up to Tk 200" },
  { key: 400, label: "Up to Tk 400" },
  { key: 700, label: "Up to Tk 700" },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  value: RestaurantFilterValues;
  onApply: (next: RestaurantFilterValues) => void;
  latitude?: number;
  longitude?: number;
  /** Search term to scope the live match count to (search screen passes the active query). */
  search?: string;
  /** Include the "Offers" / "Featured" discovery modes in the Show row (browse: true). */
  showDiscoveryModes?: boolean;
};

export function RestaurantFilterSheet({
  visible,
  onClose,
  value,
  onApply,
  latitude,
  longitude,
  search,
  showDiscoveryModes = true,
}: Props) {
  // Draft = the in-sheet working copy; the applied `value` only changes on Apply.
  // Re-sync to the applied values each time the sheet opens so a dismissed-without-apply
  // edit never leaks into the next open.
  const [draft, setDraft] = useState<RestaurantFilterValues>(value);
  useEffect(() => {
    if (visible) setDraft(value);
    // Intentionally keyed on `visible` only — we snapshot `value` at open time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Live count for the CURRENT draft (not the loaded list), so the number reflects
  // every toggle instantly and shows the true total rather than the paged-in count.
  const matchingQuery = useRestaurantDiscoveryTotalQuery(
    {
      latitude,
      longitude,
      search,
      filter: draft.filter,
      sortBy: draft.sortBy,
      minimumRating: draft.minimumRating,
      maximumLowestPrice: draft.maximumLowestPrice,
    },
    visible,
  );

  const matchingCount = matchingQuery.data;
  const activeCount = countActiveRestaurantFilters(draft);
  const showOptions = showDiscoveryModes
    ? SHOW_OPTIONS
    : SHOW_OPTIONS.filter((option) => option.key === "all" || option.key === "open");

  const countLabel =
    matchingQuery.isLoading || matchingCount === undefined
      ? "Show restaurants"
      : matchingCount === 0
        ? "No matches"
        : `Show ${matchingCount} restaurant${matchingCount === 1 ? "" : "s"}`;

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title="Filters"
      subtitle={activeCount ? `${activeCount} active` : "Choose what you want to see"}
      leadingIcon="options-outline"
      snapPoints={[0.72, 0.92]}
      initialSnapPoint={0.72}
      footer={
        <View style={styles.footer}>
          <PressableScale
            scaleTo={0.96}
            style={[styles.resetButton, !activeCount ? styles.resetDisabled : null]}
            disabled={!activeCount}
            onPress={() => setDraft(DEFAULT_RESTAURANT_FILTER_VALUES)}
            accessibilityRole="button"
          >
            <Text style={styles.resetText}>Reset</Text>
          </PressableScale>
          <PressableScale
            scaleTo={0.97}
            containerStyle={styles.applySlot}
            style={styles.applyButton}
            onPress={() => {
              onApply(draft);
              onClose();
            }}
            accessibilityRole="button"
          >
            <Text style={styles.applyText} numberOfLines={1}>
              {countLabel}
            </Text>
          </PressableScale>
        </View>
      }
    >
      <FilterSection title="Show">
        <View style={styles.chipRow}>
          {showOptions.map((option) => (
            <FilterChip
              key={option.key}
              label={option.label}
              icon={option.icon}
              active={draft.filter === option.key}
              onPress={() => setDraft((prev) => ({ ...prev, filter: option.key }))}
            />
          ))}
        </View>
      </FilterSection>

      <FilterSection title="Sort by">
        <View style={styles.radioList}>
          {SORT_OPTIONS.map((option, index) => {
            const active = draft.sortBy === option.key;
            return (
              <PressableScale
                key={option.key}
                scaleTo={0.98}
                onPress={() => setDraft((prev) => ({ ...prev, sortBy: option.key }))}
                style={[styles.radioRow, index > 0 ? styles.radioDivider : null]}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
              >
                <View style={[styles.radioIcon, active ? styles.radioIconActive : null]}>
                  <Ionicons
                    name={option.icon}
                    size={15}
                    color={active ? palette.onPrimary : palette.mutedForeground}
                  />
                </View>
                <Text style={[styles.radioLabel, active ? styles.radioLabelActive : null]}>
                  {option.label}
                </Text>
                <View style={[styles.radioDot, active ? styles.radioDotActive : null]}>
                  {active ? <View style={styles.radioDotInner} /> : null}
                </View>
              </PressableScale>
            );
          })}
        </View>
      </FilterSection>

      <FilterSection title="Rating">
        <View style={styles.chipRow}>
          {RATING_OPTIONS.map((option) => (
            <FilterChip
              key={option.label}
              label={option.label}
              icon={option.key ? "star" : undefined}
              active={draft.minimumRating === option.key}
              onPress={() => setDraft((prev) => ({ ...prev, minimumRating: option.key }))}
            />
          ))}
        </View>
      </FilterSection>

      <FilterSection title="Starting price">
        <View style={styles.chipRow}>
          {PRICE_OPTIONS.map((option) => (
            <FilterChip
              key={option.label}
              label={option.label}
              active={draft.maximumLowestPrice === option.key}
              onPress={() => setDraft((prev) => ({ ...prev, maximumLowestPrice: option.key }))}
            />
          ))}
        </View>
      </FilterSection>
    </AppBottomSheet>
  );
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// Pill chip: soft grey when idle, amber fill + dark text/check when selected (theme rule:
// never white on amber).
function FilterChip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      scaleTo={0.95}
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : null]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {active ? (
        <Ionicons name="checkmark" size={14} color={palette.onPrimary} />
      ) : icon ? (
        <Ionicons name={icon} size={13} color={palette.secondary} />
      ) : null}
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8E8E8",
  },
  sectionTitle: { fontSize: 15, lineHeight: 20, fontWeight: "700", color: palette.foreground },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.surfaceMuted,
  },
  chipActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  chipText: { fontSize: 13, lineHeight: 17, fontWeight: "500", color: palette.foreground },
  chipTextActive: { fontWeight: "700", color: palette.onPrimary },
  radioList: { marginTop: -4 },
  radioRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  radioDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#ECECEC" },
  radioIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
  },
  radioIconActive: { backgroundColor: palette.primary },
  radioLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "500",
    color: palette.foreground,
  },
  radioLabelActive: { fontWeight: "700" },
  radioDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#C9CCD1",
    alignItems: "center",
    justifyContent: "center",
  },
  radioDotActive: { borderColor: palette.secondary },
  radioDotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.secondary },
  footer: { flexDirection: "row", alignItems: "center", gap: 10 },
  resetButton: {
    minHeight: 50,
    paddingHorizontal: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
  },
  resetDisabled: { opacity: 0.5 },
  resetText: { fontSize: 14.5, lineHeight: 19, fontWeight: "700", color: palette.foreground },
  applySlot: { flex: 1 },
  applyButton: {
    minHeight: 50,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    backgroundColor: palette.primary,
  },
  applyText: { fontSize: 15, lineHeight: 20, fontWeight: "700", color: palette.onPrimary },
});
