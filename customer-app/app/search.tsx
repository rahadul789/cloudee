import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  InteractionManager,
  Pressable,
  ScrollView,
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
import { PressableScale } from "@/src/components/pressable-scale";
import { getRestaurantCustomBadge } from "@/src/components/restaurant-hero-card";
import { RestaurantFeedRow } from "@/src/components/restaurant-feed-row";
import {
  AppHeader,
  Chip,
  HeaderIconButton,
  SearchField,
  SectionHeading,
} from "@/src/components/ui";
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
import { RemoteImage } from "@/src/components/remote-image";
import { normalizeFoodCategorySuggestions } from "@/src/lib/food-categories";
import type { CustomerVoucherOffer, DiscoverableRestaurant } from "@/src/types/restaurant";

function formatVisitedTime(value?: string) {
  if (!value) return "Visited recently";
  const visitedAt = new Date(value).getTime();
  if (Number.isNaN(visitedAt)) return "Visited recently";
  const diffMinutes = Math.max(
    0,
    Math.round((Date.now() - visitedAt) / (1000 * 60)),
  );
  if (diffMinutes < 1) return "Visited just now";
  if (diffMinutes < 60) return `Visited ${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Visited ${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `Visited ${diffDays}d ago`;
}

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
  const removeRecentSearch = useBrowseHistoryStore(
    (state) => state.removeRecentSearch,
  );
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

  // Skeleton-first open, same as the restaurant details screen: hold the (possibly heavy,
  // possibly cached) results list behind a skeleton until BOTH the navigation transition
  // has settled AND a minimum skeleton window elapsed. Without this, pressing a category a
  // 2nd time returns cached results that mount DURING the slide-in and stutter. Runs once.
  const [contentReady, setContentReady] = useState(false);
  useEffect(() => {
    let interactionsDone = false;
    let minElapsed = false;
    const reveal = () => {
      if (interactionsDone && minElapsed) setContentReady(true);
    };
    const handle = InteractionManager.runAfterInteractions(() => {
      interactionsDone = true;
      reveal();
    });
    const minTimer = setTimeout(() => {
      minElapsed = true;
      reveal();
    }, 380);
    const safety = setTimeout(() => setContentReady(true), 1200);
    return () => {
      handle.cancel();
      clearTimeout(minTimer);
      clearTimeout(safety);
    };
  }, []);
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
      params: { restaurantId: restaurant._id, source: "search" },
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
      <View style={styles.container}>
        <AppHeader
          center={
            <SearchField
              inputRef={inputRef}
              value={query}
              onChangeText={(text) => setQuery(text.replace(/^\s+/, ""))}
              onSubmit={() => {
                const next = query.trim();
                if (next) addRecentSearch(next);
                setDebouncedQuery(next);
              }}
            />
          }
          right={
            searchQuery ? (
              <HeaderIconButton
                icon="options-outline"
                accessibilityLabel={
                  activeFilterCount ? `Filters, ${activeFilterCount} active` : "Filters"
                }
                active={activeFilterCount > 0}
                badge={activeFilterCount}
                onPress={() => setIsFilterOpen(true)}
              />
            ) : null
          }
        />

        {!isOnline ? (
          <View style={styles.offlineWrap}>
            <OfflineNoticeCard description="Search may show cached results until your internet connection returns." />
          </View>
        ) : null}

        <View style={styles.listWrap}>
          <FlashList
            ref={listRef}
            data={contentReady ? restaurants : []}
            keyExtractor={(item) => item._id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: Math.max(insets.bottom, 16) + 24 },
            ]}
            drawDistance={560}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            onEndReachedThreshold={0.35}
            onEndReached={() => {
              if (discoveryQuery.hasNextPage && !discoveryQuery.isFetchingNextPage) {
                void discoveryQuery.fetchNextPage();
              }
            }}
            ListHeaderComponent={
              searchQuery ? (
                <SectionHeading
                  style={styles.resultHeading}
                  title={`Results for “${searchQuery}”`}
                  count={total}
                  subtitle={
                    activeFilterCount
                      ? `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} applied`
                      : "Restaurants and dishes that deliver to you"
                  }
                  actionLabel={activeFilterCount ? "Edit" : undefined}
                  onAction={() => setIsFilterOpen(true)}
                />
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
                <View style={styles.discover}>
                  {recentSearches.length > 0 ? (
                    <View style={styles.block}>
                      <SectionHeading icon="time-outline" title="Recent searches" />
                      <View style={styles.chipWrap}>
                        {recentSearches.map((recentQuery) => (
                          <Chip
                            key={recentQuery}
                            label={recentQuery}
                            icon="search"
                            onPress={() => runSuggestedSearch(recentQuery)}
                            onRemove={() => removeRecentSearch(recentQuery)}
                          />
                        ))}
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.block}>
                    <SectionHeading
                      icon="grid-outline"
                      title="Popular categories"
                      count={contentReady && homeCategoryItems.length ? homeCategoryItems.length : undefined}
                    />
                    <View style={styles.categoryGrid}>
                      {contentReady && homeCategoryItems.length > 0
                        ? homeCategoryItems.map((item, index) => (
                            <PressableScale
                              key={item.id || `${item.label}-${index}`}
                              containerStyle={styles.categorySlot}
                              style={styles.categoryTile}
                              accessibilityRole="button"
                              accessibilityLabel={`${item.label} category`}
                              onPress={() => runSuggestedSearch(item.searchQuery || item.label)}
                            >
                              <View style={styles.categoryImageWrap}>
                                <RemoteImage
                                  uri={item.imageUrl}
                                  style={styles.categoryImage}
                                  fallbackIcon={(item.icon || "restaurant-outline") as keyof typeof Ionicons.glyphMap}
                                  fallbackIconSize={22}
                                  fallbackTint={palette.secondary}
                                  fallbackBackground={item.color || "#FFF6E8"}
                                  targetWidth={140}
                                  accessibilityLabel={`${item.label} category`}
                                />
                              </View>
                              <Text style={styles.categoryName} numberOfLines={1}>
                                {item.label}
                              </Text>
                            </PressableScale>
                          ))
                        : !contentReady || homeDiscoveryQuery.isLoading
                          ? Array.from({ length: 8 }).map((_, placeholder) => (
                              <View key={placeholder} style={styles.categorySlot}>
                                <View style={styles.categoryTile}>
                                  <View style={styles.categorySkeletonImage} />
                                  <View style={styles.categorySkeletonName} />
                                </View>
                              </View>
                            ))
                          : null}
                    </View>
                  </View>

                  {recentViewedRestaurants.length > 0 ? (
                    <View style={styles.block}>
                      <SectionHeading icon="eye-outline" title="Recently viewed" />
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.recentRow}
                      >
                        {recentViewedRestaurants.map((restaurant) => {
                          const isFav = favoriteRestaurantIdsSet.has(restaurant.id);
                          return (
                            <PressableScale
                              key={restaurant.id}
                              scaleTo={0.98}
                              style={styles.recentCard}
                              onPress={() =>
                                router.push({
                                  pathname: "/restaurants/[restaurantId]",
                                  params: { restaurantId: restaurant.id, source: "recent" },
                                })
                              }
                            >
                              <View style={styles.recentImageWrap}>
                                <RemoteImage
                                  uri={restaurant.imageUrl}
                                  style={styles.recentImage}
                                  fallbackIcon="restaurant-outline"
                                  fallbackIconSize={20}
                                  fallbackTint={palette.secondary}
                                  targetWidth={360}
                                  accessibilityLabel={`${restaurant.name} restaurant photo`}
                                />
                                <Pressable
                                  style={styles.recentHeart}
                                  onPress={() => handleToggleFavorite(restaurant.id)}
                                  disabled={favoritePendingRestaurantId === restaurant.id}
                                  hitSlop={8}
                                  accessibilityRole="button"
                                  accessibilityLabel={
                                    isFav
                                      ? `Remove ${restaurant.name} from favourites`
                                      : `Add ${restaurant.name} to favourites`
                                  }
                                >
                                  <Ionicons
                                    name={isFav ? "heart" : "heart-outline"}
                                    size={15}
                                    color={isFav ? "#E5484D" : palette.foreground}
                                  />
                                </Pressable>
                              </View>
                              <View style={styles.recentBody}>
                                <Text numberOfLines={1} style={styles.recentTitle}>
                                  {restaurant.name}
                                </Text>
                                <Text numberOfLines={1} style={styles.recentMeta}>
                                  {[restaurant.subtitle, formatVisitedTime(restaurant.visitedAt)]
                                    .filter(Boolean)
                                    .join("  ·  ")}
                                </Text>
                              </View>
                            </PressableScale>
                          );
                        })}
                      </ScrollView>
                    </View>
                  ) : null}
                </View>
              ) : searchQuery.length < 2 ? (
                <EmptyStateCard
                  title="Type at least 2 letters"
                  description="A slightly longer search helps us match menu items and restaurant names more accurately."
                />
              ) : discoveryQuery.isLoading || !contentReady ? (
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
              <RestaurantFeedRow
                name={item.name}
                subtitle={restaurantSubtitle(item)}
                imageUrl={item.coverImage?.url || item.logo?.url || null}
                isOpen={item.isOpen !== false}
                availability={item.availability}
                offerLabel={offerLabelByRestaurantId.get(item._id)}
                distanceKm={item.distanceKm}
                avgRating={item.avgRating}
                reviewCount={item.reviewCount}
                deliveryFee={item.deliveryFee}
                preparationTimeMinutes={item.preparationTimeMinutes}
                isFavorite={favoriteRestaurantIdsSet.has(item._id)}
                favoriteDisabled={favoritePendingRestaurantId === item._id}
                onToggleFavorite={() => handleToggleFavorite(item._id)}
                customBadge={getRestaurantCustomBadge(item)}
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
    backgroundColor: palette.surface,
  },
  offlineWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  listWrap: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  separator: {
    height: 20,
  },
  resultHeading: {
    marginBottom: 14,
  },
  footerLoader: {
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  footerText: {
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "500",
    color: palette.mutedForeground,
  },
  discover: {
    gap: 26,
  },
  block: {
    gap: 12,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
    rowGap: 14,
  },
  categorySlot: {
    width: "25%",
    paddingHorizontal: 4,
  },
  categoryTile: {
    alignItems: "center",
    gap: 7,
  },
  categoryImageWrap: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: palette.surfaceMuted,
  },
  categoryImage: {
    width: "100%",
    height: "100%",
  },
  categoryName: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "500",
    color: palette.foreground,
    textAlign: "center",
  },
  categorySkeletonImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 18,
    backgroundColor: palette.surfaceMuted,
  },
  categorySkeletonName: {
    width: "70%",
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.surfaceMuted,
  },
  recentRow: {
    gap: 12,
    paddingRight: 8,
    paddingBottom: 6,
  },
  recentCard: {
    width: 196,
    borderRadius: 16,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E4E6",
  },
  recentImageWrap: {
    height: 104,
    overflow: "hidden",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: palette.surfaceMuted,
  },
  recentImage: {
    width: "100%",
    height: "100%",
  },
  recentHeart: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  recentBody: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 2,
  },
  recentTitle: {
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: "700",
    color: palette.foreground,
  },
  recentMeta: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    color: palette.mutedForeground,
  },
});
