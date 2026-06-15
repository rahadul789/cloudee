import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { OwnerStatusBadge } from "@/src/components/owner-status-badge";
import { OwnerHeaderActions } from "@/src/components/owner-header-actions";
import { Screen } from "@/src/components/screen";
import { StatusPill } from "@/src/components/status-pill";
import {
  type OwnerMenuItem,
  type OwnerMenuSort,
  useOwnerMenuItemsQuery,
  useUpdateOwnerMenuItemMutation,
} from "@/src/hooks/use-owner-api";
import { formatCurrency } from "@/src/lib/format";
import { palette } from "@/src/theme/palette";

type AvailabilityFilter = "all" | "active" | "inactive";

const availabilityFilters: { label: string; value: AvailabilityFilter }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

const sortFilters: { label: string; value: OwnerMenuSort }[] = [
  { label: "A-Z", value: "nameAsc" },
  { label: "Min price", value: "priceLow" },
  { label: "Max price", value: "priceHigh" },
];

export default function MenuScreen() {
  const queryClient = useQueryClient();
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
          item.availability !== "unavailable" &&
          item._id !== recommendationItem?._id,
      ),
    [allMenuItems, recommendationItem?._id],
  );
  const items = (menuQuery.data?.items ?? []).filter((item) => {
    const isAvailable = item.availability !== "unavailable";
    if (availabilityFilter === "active") return isAvailable;
    if (availabilityFilter === "inactive") return !isAvailable;
    return true;
  });

  async function toggleAvailability(item: OwnerMenuItem) {
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
        "Menu update failed",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setPendingItemId("");
    }
  }

  function openRecommendationEditor(item: OwnerMenuItem) {
    setRecommendationItem(item);
    setSelectedRecommendationIds(item.recommendedItemIds ?? []);
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
        recommendedItemIds: selectedRecommendationIds,
      });
      setRecommendationItem(null);
      setSelectedRecommendationIds([]);
    } catch (error) {
      Alert.alert(
        "Recommendations not saved",
        error instanceof Error ? error.message : "Please try again.",
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
              {item.isPopular ? <StatusPill label="Popular" tone="warning" /> : null}
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
              label={isAvailable ? "Available" : "Unavailable"}
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
                Recs {item.recommendedItemIds?.length ?? 0}
              </Text>
            </Pressable>
          </View>
          <View style={styles.switchWrap}>
            {isUpdatingThisItem ? (
              <ActivityIndicator size="small" color={palette.primary} />
            ) : null}
            <View style={isUpdatingThisItem ? styles.switchDisabled : null}>
              <Switch
                value={isAvailable}
                disabled={isUpdatingThisItem}
                onValueChange={() => toggleAvailability(item)}
                trackColor={{ false: palette.dangerSoft, true: palette.successSoft }}
                thumbColor={isAvailable ? palette.success : palette.danger}
              />
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Menu</Text>
          <OwnerStatusBadge />
        </View>
        <OwnerHeaderActions />
      </View>

      <View style={styles.searchShell}>
        <Ionicons name="search-outline" size={18} color={palette.mutedForeground} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search items"
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
            label={filter.label}
            active={availabilityFilter === filter.value}
            onPress={() => setAvailabilityFilter(filter.value)}
          />
        ))}
        <View style={styles.filterDivider} />
        {sortFilters.map((filter) => (
          <FilterChip
            key={filter.value}
            label={filter.label}
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
              <Text style={styles.feedbackText}>Loading menu</Text>
            </View>
          ) : (
            <View style={styles.feedbackCard}>
              <Ionicons name="fast-food-outline" size={28} color={palette.mutedForeground} />
              <Text style={styles.feedbackTitle}>No items found</Text>
              <Text style={styles.feedbackText}>
                Try another filter or search term.
              </Text>
            </View>
          )
        }
      />

      <Modal
        visible={Boolean(recommendationItem)}
        transparent
        animationType="slide"
        onRequestClose={closeRecommendationEditor}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeRecommendationEditor}
          />
          <View style={styles.recommendSheet}>
            <View style={styles.recommendSheetHeader}>
              <View style={styles.recommendSheetTitleWrap}>
                <Text style={styles.recommendSheetTitle}>
                  Cart recommendations
                </Text>
                <Text style={styles.recommendSheetSubtitle} numberOfLines={2}>
                  Show selected items when customers add{" "}
                  {recommendationItem?.name ?? "this item"} to cart.
                </Text>
              </View>
              <Pressable
                style={styles.recommendSheetClose}
                onPress={closeRecommendationEditor}
              >
                <Ionicons
                  name="close"
                  size={18}
                  color={palette.mutedForeground}
                />
              </Pressable>
            </View>

            <ScrollView
              style={styles.recommendOptionScroller}
              contentContainerStyle={styles.recommendOptionList}
              showsVerticalScrollIndicator={false}
            >
              {recommendationOptions.length > 0 ? (
                recommendationOptions.map((option) => {
                  const selected = selectedRecommendationIds.includes(
                    option._id,
                  );
                  const imageUrl = option.images?.find((image) => image.url)?.url;
                  return (
                    <Pressable
                      key={option._id}
                      style={[
                        styles.recommendOption,
                        selected ? styles.recommendOptionSelected : null,
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
                    No active items yet
                  </Text>
                  <Text style={styles.recommendEmptyText}>
                    Add or activate another item first.
                  </Text>
                </View>
              )}
            </ScrollView>

            <Pressable
              disabled={isSavingRecommendations}
              style={[
                styles.recommendSaveButton,
                isSavingRecommendations ? styles.recommendSaveButtonDisabled : null,
              ]}
              onPress={saveRecommendations}
            >
              {isSavingRecommendations ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="checkmark" size={18} color="#FFFFFF" />
              )}
              <Text style={styles.recommendSaveButtonText}>
                Save recommendations
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function FilterChip({
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
      style={[styles.filterChip, active ? styles.filterChipActive : null]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.filterChipText,
          active ? styles.filterChipTextActive : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
    marginBottom: 4,
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
  filterScroller: {
    flexGrow: 0,
    height: 44,
    marginBottom: 8,
  },
  filterRow: {
    paddingHorizontal: 18,
    paddingTop: 2,
    paddingBottom: 6,
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
    height: 32,
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
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
    minWidth: 76,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  switchDisabled: {
    opacity: 0.5,
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
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(31,36,48,0.34)",
  },
  recommendSheet: {
    maxHeight: "78%",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    backgroundColor: palette.surface,
    gap: 14,
  },
  recommendSheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  recommendSheetTitleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  recommendSheetTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
    color: palette.foreground,
  },
  recommendSheetSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  recommendSheetClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
  },
  recommendOptionScroller: {
    flexGrow: 0,
  },
  recommendOptionList: {
    gap: 9,
    paddingBottom: 2,
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
  recommendSaveButtonText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
    color: "#FFFFFF",
  },
});
