import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
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

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title="Filters"
      subtitle="Choose what you want to see"
      leadingIcon="options-outline"
      snapPoints={[0.7, 0.92]}
      initialSnapPoint={0.7}
      footer={
        <View style={styles.filterFooter}>
          <PressableScale
            scaleTo={0.96}
            containerStyle={styles.filterFooterButtonSlot}
            style={styles.filterResetButton}
            onPress={() => setDraft(DEFAULT_RESTAURANT_FILTER_VALUES)}
          >
            <Ionicons name="refresh-outline" size={15} color={palette.foreground} />
            <Text style={styles.filterResetText}>Reset</Text>
          </PressableScale>
          <PressableScale
            scaleTo={0.96}
            containerStyle={styles.filterFooterButtonSlot}
            style={styles.filterApplyButton}
            onPress={() => {
              onApply(draft);
              onClose();
            }}
          >
            <Text style={styles.filterApplyText}>Apply filters</Text>
            <Ionicons name="checkmark" size={16} color={palette.surface} />
          </PressableScale>
        </View>
      }
    >
      <View style={styles.filterPill}>
        <Ionicons name="sparkles" size={12} color={palette.primary} />
        <Text style={styles.filterPillText}>Filter restaurants</Text>
      </View>

      <View style={styles.filterInsightRow}>
        <View style={styles.filterInsightCard}>
          <Text style={styles.filterInsightValue}>
            {matchingQuery.isLoading || matchingCount === undefined ? "…" : matchingCount}
          </Text>
          <Text style={styles.filterInsightLabel}>Matching restaurants</Text>
        </View>
        <View style={styles.filterInsightCard}>
          <Text style={styles.filterInsightValue}>{activeCount}</Text>
          <Text style={styles.filterInsightLabel}>Active filters</Text>
        </View>
      </View>

      <View style={styles.filterSection}>
        <View style={styles.filterSectionHeader}>
          <View style={styles.filterSectionIconWrap}>
            <Ionicons name="grid-outline" size={14} color="#A14A74" />
          </View>
          <Text style={styles.filterSectionLabel}>Show</Text>
        </View>
        <View style={styles.filterOptionsRow}>
          {showOptions.map((option) => {
            const isActive = draft.filter === option.key;
            return (
              <PressableScale
                scaleTo={0.95}
                key={option.key}
                style={[
                  styles.filterChip,
                  isActive ? styles.filterChipActive : null,
                ]}
                onPress={() => setDraft((prev) => ({ ...prev, filter: option.key }))}
              >
                <Ionicons
                  name={option.icon}
                  size={13}
                  color={isActive ? palette.surface : palette.secondary}
                />
                <Text
                  style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}
                >
                  {option.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </View>

      <View style={styles.filterSection}>
        <View style={styles.filterSectionHeader}>
          <View style={styles.filterSectionIconWrap}>
            <Ionicons name="swap-vertical-outline" size={14} color="#A14A74" />
          </View>
          <Text style={styles.filterSectionLabel}>Sort by</Text>
        </View>
        <View style={styles.filterOptionsRow}>
          {SORT_OPTIONS.map((option) => {
            const isActive = draft.sortBy === option.key;
            return (
              <PressableScale
                scaleTo={0.95}
                key={option.key}
                style={[
                  styles.filterChip,
                  isActive ? styles.filterChipActive : null,
                ]}
                onPress={() => setDraft((prev) => ({ ...prev, sortBy: option.key }))}
              >
                <Ionicons
                  name={option.icon}
                  size={13}
                  color={isActive ? palette.surface : palette.secondary}
                />
                <Text
                  style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}
                >
                  {option.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </View>

      <View style={styles.filterSection}>
        <View style={styles.filterSectionHeader}>
          <View style={styles.filterSectionIconWrap}>
            <Ionicons name="star-outline" size={14} color="#A14A74" />
          </View>
          <Text style={styles.filterSectionLabel}>Ratings</Text>
        </View>
        <View style={styles.filterOptionsRow}>
          {RATING_OPTIONS.map((option) => {
            const isActive = draft.minimumRating === option.key;
            return (
              <PressableScale
                scaleTo={0.95}
                key={option.label}
                style={[
                  styles.filterChip,
                  isActive ? styles.filterChipActive : null,
                ]}
                onPress={() => setDraft((prev) => ({ ...prev, minimumRating: option.key }))}
              >
                <Ionicons
                  name={isActive ? "star" : "star-outline"}
                  size={13}
                  color={isActive ? palette.surface : palette.secondary}
                />
                <Text
                  style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}
                >
                  {option.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </View>

      <View style={styles.filterSection}>
        <View style={styles.filterSectionHeader}>
          <View style={styles.filterSectionIconWrap}>
            <Ionicons name="cash-outline" size={14} color="#A14A74" />
          </View>
          <Text style={styles.filterSectionLabel}>Starting price</Text>
        </View>
        <View style={styles.filterOptionsRow}>
          {PRICE_OPTIONS.map((option) => {
            const isActive = draft.maximumLowestPrice === option.key;
            return (
              <PressableScale
                scaleTo={0.95}
                key={option.label}
                style={[
                  styles.filterChip,
                  isActive ? styles.filterChipActive : null,
                ]}
                onPress={() =>
                  setDraft((prev) => ({ ...prev, maximumLowestPrice: option.key }))
                }
              >
                <Ionicons
                  name={isActive ? "cash" : "cash-outline"}
                  size={13}
                  color={isActive ? palette.surface : palette.secondary}
                />
                <Text
                  style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}
                >
                  {option.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  pressablePressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },
  chipPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  filterPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#FFF1F6",
    marginBottom: 12,
  },
  filterPillText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: "#D85A8A",
  },
  filterInsightRow: {
    flexDirection: "row",
    gap: 10,
  },
  filterInsightCard: {
    flex: 1,
    minHeight: 70,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#FFF7FB",
    borderWidth: 1,
    borderColor: "#F1E2EA",
    justifyContent: "center",
    gap: 2,
  },
  filterInsightValue: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
    color: palette.foreground,
  },
  filterInsightLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  filterSection: {
    gap: 12,
    padding: 15,
    borderRadius: 24,
    backgroundColor: "#FFFBFD",
    borderWidth: 1,
    borderColor: "#F4E7EE",
  },
  filterSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  filterSectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF1F6",
  },
  filterSectionLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  filterOptionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#F0E6EE",
  },
  filterChipActive: {
    backgroundColor: palette.foreground,
    borderColor: palette.foreground,
  },
  filterChipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: palette.foreground,
  },
  filterChipTextActive: {
    color: palette.surface,
  },
  filterFooter: {
    flexDirection: "row",
    gap: 10,
  },
  // flex:1 lives on the PressableScale wrapper so the two footer buttons still split the
  // row evenly; the inner Pressable keeps the button visual.
  filterFooterButtonSlot: {
    flex: 1,
  },
  filterResetButton: {
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: "#FFF5EF",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  filterResetText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  filterApplyButton: {
    minHeight: 46,
    borderRadius: 20,
    backgroundColor: palette.secondary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  filterApplyText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.surface,
  },
});
