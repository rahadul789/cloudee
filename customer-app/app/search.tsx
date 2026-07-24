import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyStateCard } from "@/src/components/empty-state-card";
import { ErrorRetryCard } from "@/src/components/error-retry-card";
import { dedupeById } from "@/src/lib/dedupe";
import { RestaurantListSkeleton } from "@/src/components/loading-skeleton";
import { OfflineNoticeCard } from "@/src/components/offline-notice-card";
import { RestaurantHeroCard } from "@/src/components/restaurant-hero-card";
import {
  RestaurantFilterSheet,
  DEFAULT_RESTAURANT_FILTER_VALUES,
  countActiveRestaurantFilters,
  type RestaurantFilterValues,
} from "@/src/components/restaurant-filter-sheet";
import { Screen } from "@/src/components/screen";
import {
  useCustomerDiscoveryHomeQuery,
  useCustomerFavoriteRestaurantIdsQuery,
  useCustomerToggleFavoriteRestaurantMutation,
  useRestaurantDiscoveryInfiniteQuery,
} from "@/src/hooks/use-customer-api";
import { useIsOnline } from "@/src/hooks/use-network-status";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { useBrowseHistoryStore } from "@/src/store/browse-history-store";
import { useLocationStore } from "@/src/store/location-store";
import { palette } from "@/src/theme/palette";
import { normalizeFoodCategorySuggestions } from "@/src/lib/food-categories";
import type { CustomerVoucherOffer, DiscoverableRestaurant } from "@/src/types/restaurant";

function getOfferLabel(offer: CustomerVoucherOffer) {
  if (offer.type === "free_delivery") {
    return offer.code ? `${offer.code} - Free delivery` : "Free delivery";
  }
  if (offer.type === "percentage" && typeof offer.discountValue === "number") {
    return offer.code ? `${offer.code} - ${offer.discountValue}% off` : `${offer.discountValue}% off`;
  }
  if (typeof offer.discountValue === "number") {
    return offer.code ? `${offer.code} - Tk ${offer.discountValue} off` : `Tk ${offer.discountValue} off`;
  }
  return offer.code ? `${offer.code} - Offer available` : "Offer available";
}

function buildRestaurantOfferMap(offers: CustomerVoucherOffer[]) {
  const next = new Map<string, string>();
  for (const offer of offers) {
    const restaurantIds = [...(offer.restaurantIds ?? []), offer.restaurantId ?? ""].filter(Boolean);
    restaurantIds.forEach((restaurantId) => {
      if (!next.has(restaurantId)) next.set(restaurantId, getOfferLabel(offer));
    });
  }
  return next;
}

function restaurantSubtitle(restaurant: DiscoverableRestaurant) {
  return restaurant.cuisineTypes?.slice(0, 2).join(" • ") ?? "";
}

export default function CustomerSearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ query?: string; focus?: string }>();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput | null>(null);
  const listRef = useRef<FlashListRef<DiscoverableRestaurant>>(null);
  const [query, setQuery] = useState(typeof params.query === "string" ? params.query : "");
  const [debouncedQuery, setDebouncedQuery] = useState(query.trim());
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterValues, setFilterValues] = useState<RestaurantFilterValues>(
    DEFAULT_RESTAURANT_FILTER_VALUES,
  );
  const selectedLocation = useLocationStore((state) => state.selectedLocation);
  const isOnline = useIsOnline();
  const isAuthenticated = useCustomerAuthStore((state) => Boolean(state.accessToken));
  const recentSearches = useBrowseHistoryStore((state) => state.recentSearches);
  const recentVisitedRestaurants = useBrowseHistoryStore(
    (state) => state.recentVisitedRestaurants,
  );
  const addRecentSearch = useBrowseHistoryStore((state) => state.addRecentSearch);
  const addRecentVisitedRestaurant = useBrowseHistoryStore((state) => state.addRecentVisitedRestaurant);

  useEffect(() => {
    if (typeof params.query === "string") {
      setQuery(params.query);
      setDebouncedQuery(params.query.trim());
    }
  }, [params.query]);

  useEffect(() => {
    if (params.focus !== "1") return;
    const timer = setTimeout(() => inputRef.current?.focus(), 260);
    return () => clearTimeout(timer);
  }, [params.focus]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, query.trim().length <= 2 ? 180 : 280);
    return () => clearTimeout(timer);
  }, [query]);

  // New/changed search term always starts from the top of the results list.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [debouncedQuery]);

  const searchQuery = debouncedQuery;
  // radiusKm omitted: backend applies the resolved zone / admin fallback radius.
  const discoveryQuery = useRestaurantDiscoveryInfiniteQuery(
    {
      latitude: selectedLocation?.latitude,
      longitude: selectedLocation?.longitude,
      search: searchQuery,
      pageSize: 12,
      filter: filterValues.filter,
      sortBy: filterValues.sortBy,
      minimumRating: filterValues.minimumRating,
      maximumLowestPrice: filterValues.maximumLowestPrice,
    },
    searchQuery.length >= 2,
  );
  const homeDiscoveryQuery = useCustomerDiscoveryHomeQuery({
    latitude: selectedLocation?.latitude,
    longitude: selectedLocation?.longitude,
  });
  const favoriteRestaurantIdsQuery = useCustomerFavoriteRestaurantIdsQuery();
  const toggleFavoriteMutation = useCustomerToggleFavoriteRestaurantMutation();

  const restaurants = useMemo(
    () =>
      // Only surface discovery results for an ACTIVE search (>= 2 chars, matching the query's
      // own `enabled`). The empty-search query key collides with the Browse tab's nearby list
      // (same location + default filters + empty search), and a disabled React Query still
      // returns that shared cache — so after visiting Browse this list wrongly replaced the
      // suggestions panel (categories / recently viewed) on an empty search. Gating on the
      // term keeps the landing on suggestions no matter what is cached, and avoids rendering
      // a heavy image list where only the lightweight suggestions belong.
      searchQuery.length >= 2
        ? dedupeById(discoveryQuery.data?.pages.flatMap((page) => page.items) ?? [])
        : [],
    [discoveryQuery.data, searchQuery],
  );
  const total = discoveryQuery.data?.pages[0]?.total ?? restaurants.length;
  const activeFilterCount = countActiveRestaurantFilters(filterValues);
  const homeCategoryItems = useMemo(
    () => {
      const cmsItems = (homeDiscoveryQuery.data?.homeCms?.homeCategories?.items ?? [])
        .filter((item) => item.isActive !== false && item.label.trim())
        .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));

      return normalizeFoodCategorySuggestions(cmsItems);
    },
    [homeDiscoveryQuery.data?.homeCms?.homeCategories?.items],
  );
  const offerLabelByRestaurantId = useMemo(
    () => buildRestaurantOfferMap(homeDiscoveryQuery.data?.activeOffers ?? []),
    [homeDiscoveryQuery.data?.activeOffers],
  );
  const favoriteRestaurantIdsSet = useMemo(
    () => new Set(favoriteRestaurantIdsQuery.data ?? []),
    [favoriteRestaurantIdsQuery.data],
  );
  const favoritePendingRestaurantId = toggleFavoriteMutation.isPending
    ? toggleFavoriteMutation.variables
    : null;
  const recentViewedRestaurants = useMemo(
    () => recentVisitedRestaurants.slice(0, 3),
    [recentVisitedRestaurants],
  );

  const openRestaurant = (restaurant: DiscoverableRestaurant) => {
    if (searchQuery) addRecentSearch(searchQuery);
    addRecentVisitedRestaurant({
      id: restaurant._id,
      name: restaurant.name,
      subtitle: restaurantSubtitle(restaurant),
      imageUrl: restaurant.coverImage?.url || restaurant.logo?.url || null,
      isOpen: restaurant.isOpen !== false,
      offerLabel: offerLabelByRestaurantId.get(restaurant._id) ?? null,
      distanceKm: restaurant.distanceKm,
      avgRating: restaurant.avgRating,
      reviewCount: restaurant.reviewCount,
      lowestMenuPrice: restaurant.lowestMenuPrice,
      preparationTimeMinutes: restaurant.preparationTimeMinutes,
    });
    router.push({
      pathname: "/restaurants/[restaurantId]",
      params: { restaurantId: restaurant._id },
    });
  };

  const handleToggleFavorite = async (restaurantId: string) => {
    if (!isAuthenticated) {
      router.push({
        pathname: "/sign-in",
        params: { redirectTo: `/search?query=${encodeURIComponent(query.trim())}` },
      });
      return;
    }
    if (favoritePendingRestaurantId === restaurantId) return;
    await toggleFavoriteMutation.mutateAsync(restaurantId).catch(() => undefined);
  };

  const runSuggestedSearch = (nextQuery: string) => {
    const normalized = nextQuery.trim();
    if (!normalized) return;
    setQuery(normalized);
    setDebouncedQuery(normalized);
    addRecentSearch(normalized);
  };

  return (
    <Screen>
      <View style={[styles.container, { paddingTop: Math.max(insets.top - 6, 2) }]}>
        <View style={styles.topBar}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={palette.foreground} />
          </Pressable>
          <View style={styles.searchField}>
            <Ionicons name="search" size={18} color={palette.secondary} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={(text) => setQuery(text.replace(/^\s+/, ""))}
              placeholder="Search food or restaurant"
              placeholderTextColor={palette.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              returnKeyType="search"
              style={styles.input}
              onSubmitEditing={() => {
                const next = query.trim();
                if (next) addRecentSearch(next);
                setDebouncedQuery(next);
              }}
            />
            {query.trim() ? (
              <Pressable style={styles.clearButton} onPress={() => setQuery("")}>
                <Ionicons name="close" size={15} color={palette.mutedForeground} />
              </Pressable>
            ) : null}
          </View>
          {searchQuery ? (
            <Pressable
              style={({ pressed }) => [
                styles.filterButton,
                pressed ? styles.filterButtonPressed : null,
              ]}
              onPress={() => setIsFilterOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={
                activeFilterCount
                  ? `Filters, ${activeFilterCount} active`
                  : "Filters"
              }
              hitSlop={8}
            >
              <Ionicons name="options-outline" size={16} color="#fff" />
              {activeFilterCount ? (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
        </View>

        {!isOnline ? (
          <OfflineNoticeCard description="Search may show cached results until your internet connection returns." />
        ) : null}

        <View style={styles.listWrap}>
        <FlashList
          ref={listRef}
          data={restaurants}
          keyExtractor={(item) => item._id}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          drawDistance={560}
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          onEndReachedThreshold={0.35}
          onEndReached={() => {
            if (discoveryQuery.hasNextPage && !discoveryQuery.isFetchingNextPage) {
              void discoveryQuery.fetchNextPage();
            }
          }}
          ListHeaderComponent={
            searchQuery ? (
              <View style={styles.resultHeader}>
                <Text style={styles.resultTitle}>{total} result{total === 1 ? "" : "s"}</Text>
                <Text style={styles.resultSubtitle} numberOfLines={1}>
                  for “{searchQuery}”
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            discoveryQuery.isFetchingNextPage ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={palette.secondary} />
                <Text style={styles.footerText}>Loading more results</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            !selectedLocation ? (
              <EmptyStateCard
                title="Choose your delivery point first"
                description="Set your location so search can show restaurants that deliver to you."
                actionLabel="Choose location"
                onPress={() => router.push("/location-picker")}
              />
            ) : !searchQuery ? (
              <View style={styles.suggestionPanel}>
                <View style={styles.suggestionHero}>
                  <View style={styles.suggestionIcon}>
                    <Ionicons name="search" size={19} color={palette.secondary} />
                  </View>
                  <View style={styles.suggestionHeroCopy}>
                    <Text style={styles.suggestionTitle}>Find food faster</Text>
                    <Text style={styles.suggestionText}>
                      Try biryani, grill chicken, shawarma, or snacks.
                    </Text>
                  </View>
                </View>

                {homeCategoryItems.length > 0 ? (
                  <View style={styles.suggestionBlock}>
                    <Text style={styles.suggestionBlockTitle}>Popular categories</Text>
                    <View style={styles.suggestionGrid}>
                      {homeCategoryItems.map((item, index) => (
                        <Pressable
                          key={item.id || `${item.label}-${index}`}
                          style={[
                            styles.categoryChip,
                            { backgroundColor: item.color || "#FFF0F6" },
                          ]}
                          onPress={() => runSuggestedSearch(item.searchQuery || item.label)}
                        >
                          <Ionicons
                            name={(item.icon || "restaurant-outline") as keyof typeof Ionicons.glyphMap}
                            size={15}
                            color={palette.foreground}
                          />
                          <Text style={styles.categoryChipText} numberOfLines={1}>
                            {item.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}

                {recentSearches.length > 0 ? (
                  <View style={styles.suggestionBlock}>
                    <Text style={styles.suggestionBlockTitle}>Recent searches</Text>
                    <View style={styles.recentRow}>
                      {recentSearches.map((recentQuery) => (
                        <Pressable
                          key={recentQuery}
                          style={styles.recentChip}
                          onPress={() => runSuggestedSearch(recentQuery)}
                        >
                          <Ionicons name="time-outline" size={13} color={palette.mutedForeground} />
                          <Text style={styles.recentChipText}>{recentQuery}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}

                {recentViewedRestaurants.length > 0 ? (
                  <View style={styles.suggestionBlock}>
                    <Text style={styles.suggestionBlockTitle}>Recently viewed</Text>
                    <View style={styles.recentViewedList}>
                      {recentViewedRestaurants.map((restaurant) => (
                        <Pressable
                          key={restaurant.id}
                          style={({ pressed }) => [
                            styles.recentViewedCard,
                            pressed ? styles.recentViewedCardPressed : null,
                          ]}
                          onPress={() =>
                            router.push({
                              pathname: "/restaurants/[restaurantId]",
                              params: { restaurantId: restaurant.id },
                            })
                          }
                        >
                          <View style={styles.recentViewedIcon}>
                            <Ionicons name="storefront-outline" size={17} color={palette.secondary} />
                          </View>
                          <View style={styles.recentViewedCopy}>
                            <Text style={styles.recentViewedTitle} numberOfLines={1}>
                              {restaurant.name}
                            </Text>
                            {restaurant.subtitle ? (
                              <Text style={styles.recentViewedSubtitle} numberOfLines={1}>
                                {restaurant.subtitle}
                              </Text>
                            ) : null}
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={palette.placeholder} />
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : searchQuery.length < 2 ? (
              <EmptyStateCard
                title="Type at least 2 letters"
                description="A slightly longer search helps us match menu items and restaurant names more accurately."
              />
            ) : discoveryQuery.isLoading ? (
              <RestaurantListSkeleton count={4} compact variant="nearby" />
            ) : discoveryQuery.isError ? (
              <ErrorRetryCard
                title="Couldn't load results"
                description="We couldn't run your search right now. Check your connection and try again."
                onRetry={() => {
                  void discoveryQuery.refetch();
                }}
                retrying={discoveryQuery.isFetching}
              />
            ) : (
              <EmptyStateCard
                title="No food or restaurant found"
                description="Try another spelling, food name, cuisine, or restaurant. Example: chicken, biryani, burger."
              />
            )
          }
          renderItem={({ item }) => (
            <RestaurantHeroCard
              name={item.name}
              subtitle={restaurantSubtitle(item)}
              imageUrl={item.coverImage?.url || item.logo?.url || null}
              isOpen={item.isOpen !== false}
              availability={item.availability}
              offerLabel={offerLabelByRestaurantId.get(item._id)}
              distanceKm={item.distanceKm}
              avgRating={item.avgRating}
              reviewCount={item.reviewCount}
              lowestMenuPrice={item.lowestMenuPrice}
              preparationTimeMinutes={item.preparationTimeMinutes}
              isFavorite={favoriteRestaurantIdsSet.has(item._id)}
              favoriteDisabled={favoritePendingRestaurantId === item._id}
              onToggleFavorite={() => handleToggleFavorite(item._id)}
              compact
              variant="nearby"
              onPress={() => openRestaurant(item)}
            />
          )}
        />
        </View>

        <RestaurantFilterSheet
          visible={isFilterOpen}
          onClose={() => setIsFilterOpen(false)}
          value={filterValues}
          onApply={setFilterValues}
          latitude={selectedLocation?.latitude}
          longitude={selectedLocation?.longitude}
          search={searchQuery}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 18,
    gap: 12,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  searchField: {
    flex: 1,
    minHeight: 48,
    borderRadius: 18,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#F0E2D8",
    backgroundColor: palette.surface,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: palette.foreground,
    paddingVertical: 10,
  },
  clearButton: {
    width: 28,
    height: 28,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F2F6",
  },
  locationPill: {
    minHeight: 36,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#FFF7FB",
    borderWidth: 1,
    borderColor: "#F5DCE8",
  },
  locationText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: palette.foreground,
  },
  listWrap: {
    flex: 1,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 40,
  },
  suggestionPanel: {
    gap: 14,
  },
  suggestionHero: {
    borderRadius: 20,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: "#F3DDEA",
    shadowColor: palette.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  suggestionIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF0F6",
  },
  suggestionHeroCopy: {
    flex: 1,
    minWidth: 0,
  },
  suggestionTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
    color: palette.foreground,
  },
  suggestionText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  suggestionBlock: {
    gap: 10,
  },
  suggestionBlockTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  suggestionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryChip: {
    width: "31.6%",
    minHeight: 76,
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(31,36,48,0.06)",
  },
  categoryChipText: {
    width: "100%",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: palette.foreground,
    textAlign: "center",
  },
  recentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  recentChip: {
    minHeight: 38,
    borderRadius: 15,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  recentChipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: palette.foreground,
  },
  recentViewedList: {
    gap: 10,
  },
  recentViewedCard: {
    minHeight: 66,
    borderRadius: 20,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: "#F0E0EA",
  },
  recentViewedCardPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.96,
  },
  recentViewedIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF0F6",
  },
  recentViewedCopy: {
    flex: 1,
    minWidth: 0,
  },
  recentViewedTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  recentViewedSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  resultHeader: {
    marginBottom: 14,
    gap: 2,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.secondary,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    flexShrink: 0,
  },
  filterButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },
  filterBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.foreground,
    borderWidth: 1,
    borderColor: palette.surface,
  },
  filterBadgeText: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "800",
    color: palette.surface,
  },
  resultTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
    color: palette.foreground,
  },
  resultSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  footerLoader: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  footerText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
});
