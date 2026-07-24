import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { AppBottomSheet } from "@/src/components/app-bottom-sheet";
import { OwnerStatusBadge } from "@/src/components/owner-status-badge";
import { EnforcementNotice } from "@/src/components/enforcement-notice";
import { OwnerHeaderActions } from "@/src/components/owner-header-actions";
import { Screen } from "@/src/components/screen";
import { StatusPill } from "@/src/components/status-pill";
import {
  type OwnerMenuItem,
  type OwnerMenuSort,
  useOwnerMenuItemsQuery,
  useUpdateOwnerMenuItemMutation,
} from "@/src/hooks/use-owner-api";
import {
  useOwnerTranslation,
  type TranslationKey,
} from "@/src/i18n/translations";
import { formatCurrency, localizeDigits } from "@/src/lib/format";
import { palette } from "@/src/theme/palette";

type AvailabilityFilter = "all" | "active" | "inactive";
type ChipIcon = keyof typeof Ionicons.glyphMap;

const availabilityFilters: {
  labelKey: TranslationKey;
  value: AvailabilityFilter;
  icon: ChipIcon;
}[] = [
  { labelKey: "menu.filters.all", value: "all", icon: "apps" },
  { labelKey: "menu.filters.active", value: "active", icon: "checkmark-circle" },
  { labelKey: "menu.filters.inactive", value: "inactive", icon: "eye-off" },
];

const sortFilters: {
  labelKey: TranslationKey;
  value: OwnerMenuSort;
  icon: ChipIcon;
}[] = [
  { labelKey: "menu.sort.nameAsc", value: "nameAsc", icon: "text" },
  { labelKey: "menu.sort.priceLow", value: "priceLow", icon: "arrow-down" },
  { labelKey: "menu.sort.priceHigh", value: "priceHigh", icon: "arrow-up" },
];

export default function MenuScreen() {
  const queryClient = useQueryClient();
  const { t } = useOwnerTranslation();
  const [search, setSearch] = useState("");
  const [availabilityFilter, setAvailabilityFilter] =
    useState<AvailabilityFilter>("all");
  const [sortBy, setSortBy] = useState<OwnerMenuSort>("nameAsc");
  const [pendingItemId, setPendingItemId] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [recommendationItem, setRecommendationItem] =
    useState<OwnerMenuItem | null>(null);
  const [selectedRecommendationIds, setSelectedRecommendationIds] = useState<
    string[]
  >([]);
  const [isSavingRecommendations, setIsSavingRecommendations] = useState(false);
  const menuQuery = useOwnerMenuItemsQuery(true, { search, sortBy });
  const allMenuQuery = useOwnerMenuItemsQuery(true, { sortBy: "nameAsc" });
  const updateMutation = useUpdateOwnerMenuItemMutation();
  const allMenuItems = useMemo(
    () => allMenuQuery.data?.items ?? menuQuery.data?.items ?? [],
    [allMenuQuery.data?.items, menuQuery.data?.items],
  );
  const recommendationOptions = useMemo(
    () =>
      allMenuItems.filter(
        (item) =>
          item._id !== recommendationItem?._id &&
          // Show available items plus any already-selected item (even if it is
          // currently unavailable) so saved recommendations are never hidden and
          // silently dropped when the editor reopens.
          (item.availability !== "unavailable" ||
            selectedRecommendationIds.includes(item._id)),
      ),
    [allMenuItems, recommendationItem?._id, selectedRecommendationIds],
  );
  // `?? []` would hand the memo below a fresh array every render, defeating it.
  const searchedItems = useMemo(
    () => menuQuery.data?.items ?? [],
    [menuQuery.data?.items],
  );
  const items = searchedItems.filter((item) => {
    const isAvailable = item.availability !== "unavailable";
    if (availabilityFilter === "active") return isAvailable;
    if (availabilityFilter === "inactive") return !isAvailable;
    return true;
  });
  // Counts reflect the current search, so they always match what each chip would show.
  const availabilityCounts = useMemo(() => {
    const active = searchedItems.filter(
      (item) => item.availability !== "unavailable",
    ).length;
    return {
      all: searchedItems.length,
      active,
      inactive: searchedItems.length - active,
    };
  }, [searchedItems]);

  async function toggleAvailability(item: OwnerMenuItem) {
    if (pendingItemId === item._id) return;

    const nextAvailability =
      item.availability === "unavailable" ? "available" : "unavailable";

    setPendingItemId(item._id);
    try {
      await updateMutation.mutateAsync({
        id: item._id,
        availability: nextAvailability,
      });
    } catch (error) {
      Alert.alert(
        t("menu.updateFailedTitle"),
        error instanceof Error ? error.message : t("menu.tryAgain"),
      );
    } finally {
      setPendingItemId("");
    }
  }

  function openRecommendationEditor(item: OwnerMenuItem) {
    setRecommendationItem(item);
    // Normalize to plain strings — cached/socket payloads can carry ObjectId-like
    // values, which would break selection matching against option ids.
    setSelectedRecommendationIds((item.recommendedItemIds ?? []).map(String));
  }

  function closeRecommendationEditor() {
    if (isSavingRecommendations) return;
    setRecommendationItem(null);
    setSelectedRecommendationIds([]);
  }

  function toggleRecommendationSelection(itemId: string) {
    setSelectedRecommendationIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    );
  }

  async function saveRecommendations() {
    if (!recommendationItem || isSavingRecommendations) return;

    setIsSavingRecommendations(true);
    try {
      await updateMutation.mutateAsync({
        id: recommendationItem._id,
        recommendedItemIds: selectedRecommendationIds.map(String),
      });
      const savedCount = selectedRecommendationIds.length;
      setRecommendationItem(null);
      setSelectedRecommendationIds([]);
      Alert.alert(
        t("menu.recsSavedTitle"),
        savedCount > 0
          ? `${localizeDigits(String(savedCount))} ${t("menu.recsSavedBody")}`
          : t("menu.recsClearedBody"),
      );
    } catch (error) {
      Alert.alert(
        t("menu.recsFailedTitle"),
        error instanceof Error ? error.message : t("menu.tryAgain"),
      );
    } finally {
      setIsSavingRecommendations(false);
    }
  }

  async function refreshMenu() {
    setIsRefreshing(true);
    setSearch("");
    setAvailabilityFilter("all");
    setSortBy("nameAsc");
    try {
      await queryClient.refetchQueries({
        queryKey: ["owner", "menu-items"],
        type: "active",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  function renderItem({ item }: { item: OwnerMenuItem }) {
    const isAvailable = item.availability !== "unavailable";
    const isUpdatingThisItem = pendingItemId === item._id;
    const imageUrl = item.images?.find((image) => image.url)?.url;

    return (
      <View style={styles.itemCard}>
        <View style={styles.itemRow}>
          <View style={styles.thumb}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.thumbImage} />
            ) : (
              <Ionicons name="fast-food-outline" size={22} color={palette.primary} />
            )}
          </View>
          <View style={styles.itemBody}>
            <View style={styles.itemTitleRow}>
              <Text numberOfLines={1} style={styles.itemName}>
                {item.name}
              </Text>
              {item.isPopular ? (
                <StatusPill label={t("menu.popular")} tone="warning" />
              ) : null}
            </View>
            <Text numberOfLines={2} style={styles.itemMeta}>
              {formatCurrency(item.basePrice)}
              {item.description ? ` - ${item.description}` : ""}
            </Text>
          </View>
        </View>

        <View style={styles.itemFooter}>
          <View style={styles.itemFooterLeft}>
            <StatusPill
              label={isAvailable ? t("menu.available") : t("menu.unavailable")}
              tone={isAvailable ? "success" : "danger"}
            />
            <Pressable
              style={({ pressed }) => [
                styles.recommendButton,
                pressed ? styles.recommendButtonPressed : null,
              ]}
              onPress={() => openRecommendationEditor(item)}
            >
              <Ionicons
                name="sparkles-outline"
                size={14}
                color={palette.secondary}
              />
              <Text style={styles.recommendButtonText}>
                {t("menu.recs")}{" "}
                {localizeDigits(String(item.recommendedItemIds?.length ?? 0))}
              </Text>
            </Pressable>
          </View>
          <View style={styles.switchWrap}>
            {/* Fixed-width slot so the spinner never shifts the switch sideways. */}
            <View style={styles.switchSlot}>
              {isUpdatingThisItem ? (
                <ActivityIndicator size="small" color={palette.primary} />
              ) : null}
            </View>
            {/* Solid track + white thumb (the *Soft tints were invisible against the
                card), and never disabled mid-flip — the optimistic cache write in the
                mutation already makes the flip instant, and toggleAvailability guards
                re-entry. */}
            <Switch
              value={isAvailable}
              onValueChange={() => toggleAvailability(item)}
              trackColor={{ false: "#C7CBD4", true: palette.success }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#C7CBD4"
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t("menu.title")}</Text>
          <OwnerStatusBadge />
        </View>
        <OwnerHeaderActions />
      </View>

      <View style={styles.enforcementStripWrap}>
        <EnforcementNotice variant="strip" />
      </View>

      <View style={styles.searchShell}>
        <Ionicons name="search-outline" size={18} color={palette.mutedForeground} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t("menu.searchPlaceholder")}
          placeholderTextColor="#9A8D91"
          style={styles.searchInput}
          autoCapitalize="none"
        />
        {search ? (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={palette.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.filterScroller}
        contentContainerStyle={styles.filterRow}
      >
        {availabilityFilters.map((filter) => (
          <FilterChip
            key={filter.value}
            label={t(filter.labelKey)}
            icon={filter.icon}
            count={availabilityCounts[filter.value]}
            active={availabilityFilter === filter.value}
            onPress={() => setAvailabilityFilter(filter.value)}
          />
        ))}
        <View style={styles.filterDivider} />
        {sortFilters.map((filter) => (
          <FilterChip
            key={filter.value}
            label={t(filter.labelKey)}
            icon={filter.icon}
            active={sortBy === filter.value}
            onPress={() => setSortBy(filter.value)}
          />
        ))}
      </ScrollView>

      <FlatList
        data={items}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshMenu}
            tintColor={palette.primary}
          />
        }
        ListEmptyComponent={
          menuQuery.isLoading ? (
            <View style={styles.feedbackCard}>
              <ActivityIndicator size="small" color={palette.primary} />
              <Text style={styles.feedbackText}>{t("menu.loading")}</Text>
            </View>
          ) : (
            <View style={styles.feedbackCard}>
              <Ionicons name="fast-food-outline" size={28} color={palette.mutedForeground} />
              <Text style={styles.feedbackTitle}>{t("menu.emptyTitle")}</Text>
              <Text style={styles.feedbackText}>{t("menu.emptyBody")}</Text>
            </View>
          )
        }
      />

      <AppBottomSheet
        visible={Boolean(recommendationItem)}
        onClose={closeRecommendationEditor}
        title={t("menu.recsTitle")}
        subtitle={t("menu.recsSubtitle")}
        leadingIcon="sparkles"
        snapPoints={[0.62, 0.9]}
        contentContainerStyle={styles.recommendOptionList}
        footer={
          <Pressable
            disabled={isSavingRecommendations}
            style={({ pressed }) => [
              styles.recommendSaveButton,
              isSavingRecommendations
                ? styles.recommendSaveButtonDisabled
                : null,
              pressed ? styles.recommendSaveButtonPressed : null,
            ]}
            onPress={saveRecommendations}
          >
            {isSavingRecommendations ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="checkmark" size={18} color="#FFFFFF" />
            )}
            <Text style={styles.recommendSaveButtonText}>
              {t("menu.recsSave")}
              {selectedRecommendationIds.length > 0
                ? ` (${localizeDigits(String(selectedRecommendationIds.length))})`
                : ""}
            </Text>
          </Pressable>
        }
      >
        {recommendationOptions.length > 0 ? (
          recommendationOptions.map((option) => {
            const selected = selectedRecommendationIds.includes(option._id);
            const imageUrl = option.images?.find((image) => image.url)?.url;
            return (
              <Pressable
                key={option._id}
                style={({ pressed }) => [
                  styles.recommendOption,
                  selected ? styles.recommendOptionSelected : null,
                  pressed ? styles.recommendOptionPressed : null,
                ]}
                onPress={() => toggleRecommendationSelection(option._id)}
              >
                <View style={styles.recommendOptionImage}>
                  {imageUrl ? (
                    <Image
                      source={{ uri: imageUrl }}
                      style={styles.thumbImage}
                    />
                  ) : (
                    <Ionicons
                      name="fast-food-outline"
                      size={18}
                      color={palette.primary}
                    />
                  )}
                </View>
                <View style={styles.recommendOptionCopy}>
                  <Text style={styles.recommendOptionName} numberOfLines={1}>
                    {option.name}
                  </Text>
                  <Text style={styles.recommendOptionMeta}>
                    {formatCurrency(option.basePrice)}
                  </Text>
                </View>
                <Ionicons
                  name={selected ? "checkbox" : "square-outline"}
                  size={22}
                  color={selected ? palette.secondary : palette.border}
                />
              </Pressable>
            );
          })
        ) : (
          <View style={styles.recommendEmpty}>
            <Ionicons
              name="fast-food-outline"
              size={24}
              color={palette.mutedForeground}
            />
            <Text style={styles.recommendEmptyTitle}>
              {t("menu.recsEmptyTitle")}
            </Text>
            <Text style={styles.recommendEmptyText}>
              {t("menu.recsEmptyBody")}
            </Text>
          </View>
        )}
      </AppBottomSheet>
    </Screen>
  );
}

function FilterChip({
  label,
  icon,
  count,
  active,
  onPress,
}: {
  label: string;
  icon: ChipIcon;
  count?: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.filterChip,
        active ? styles.filterChipActive : null,
        pressed ? styles.filterChipPressed : null,
      ]}
      onPress={onPress}
    >
      <Ionicons
        name={icon}
        size={14}
        color={active ? "#FFFFFF" : palette.mutedForeground}
      />
      <Text
        style={[
          styles.filterChipText,
          active ? styles.filterChipTextActive : null,
        ]}
      >
        {label}
      </Text>
      {typeof count === "number" && count > 0 ? (
        <View
          style={[
            styles.filterChipCount,
            active ? styles.filterChipCountActive : null,
          ]}
        >
          <Text
            style={[
              styles.filterChipCountText,
              active ? styles.filterChipCountTextActive : null,
            ]}
          >
            {localizeDigits(String(count))}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Collapses to zero height when there is no enforcement notice to show.
  enforcementStripWrap: {
    paddingHorizontal: 18,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  titleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900",
    color: palette.foreground,
  },
  searchShell: {
    marginHorizontal: 18,
    marginBottom: 12,
    height: 50,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
    color: palette.foreground,
    paddingVertical: 0,
    includeFontPadding: false,
  },
  // Tall enough for the 38px chips plus their shadow — at 44px the chips collided
  // with the search field above.
  filterScroller: {
    flexGrow: 0,
    height: 54,
    marginBottom: 8,
  },
  filterRow: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 8,
    alignItems: "center",
  },
  filterDivider: {
    width: 1,
    height: 22,
    backgroundColor: palette.border,
    marginHorizontal: 2,
  },
  filterChip: {
    height: 38,
    minHeight: 38,
    borderRadius: 999,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  filterChipPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.9,
  },
  filterChipActive: {
    backgroundColor: palette.foreground,
    borderColor: palette.foreground,
  },
  filterChipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    color: palette.foreground,
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  filterChipCount: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipCountActive: {
    backgroundColor: "rgba(255, 255, 255, 0.22)",
  },
  filterChipCountText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
    color: palette.foreground,
  },
  filterChipCountTextActive: {
    color: "#FFFFFF",
  },
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 0,
    paddingBottom: 28,
  },
  itemCard: {
    borderRadius: 20,
    backgroundColor: palette.surface,
    padding: 14,
    gap: 13,
  },
  itemRow: {
    flexDirection: "row",
    gap: 12,
  },
  thumb: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: palette.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  itemBody: {
    flex: 1,
    gap: 5,
  },
  itemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  itemName: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
    color: palette.foreground,
  },
  itemMeta: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  itemFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  itemFooterLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recommendButton: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#FFE0EC",
    backgroundColor: palette.primarySoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  recommendButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
  recommendButtonText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
    color: palette.secondary,
  },
  switchWrap: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  switchSlot: {
    width: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  feedbackCard: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 20,
  },
  feedbackTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
    color: palette.foreground,
  },
  feedbackText: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    color: palette.mutedForeground,
    fontWeight: "600",
  },
  // The bottom sheet owns the scroller now; this is just the list spacing we pass
  // into it via contentContainerStyle.
  recommendOptionList: {
    gap: 9,
  },
  recommendOption: {
    minHeight: 62,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  recommendOptionSelected: {
    borderColor: "#FFB8D0",
    backgroundColor: palette.primarySoft,
  },
  recommendOptionPressed: {
    transform: [{ scale: 0.985 }, { translateY: 1 }],
    opacity: 0.95,
  },
  recommendOptionImage: {
    width: 44,
    height: 44,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: palette.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  recommendOptionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  recommendOptionName: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  recommendOptionMeta: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  recommendEmpty: {
    minHeight: 150,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    borderStyle: "dashed",
    backgroundColor: palette.surfaceMuted,
    padding: 18,
  },
  recommendEmptyTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: palette.foreground,
  },
  recommendEmptyText: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  recommendSaveButton: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: palette.secondary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  recommendSaveButtonDisabled: {
    opacity: 0.68,
  },
  recommendSaveButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  recommendSaveButtonText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
    color: "#FFFFFF",
  },
});
