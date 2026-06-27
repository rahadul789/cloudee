import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";

import { AppBottomSheet } from "@/src/components/app-bottom-sheet";
import { EmptyStateCard } from "@/src/components/empty-state-card";
import { dedupeById } from "@/src/lib/dedupe";
import { RestaurantListSkeleton } from "@/src/components/loading-skeleton";
import { styles } from "@/src/components/browse/browse-screen.styles";
import { OfflineNoticeCard } from "@/src/components/offline-notice-card";
import { RemoteImage } from "@/src/components/remote-image";
import { RestaurantHeroCard } from "@/src/components/restaurant-hero-card";
import { Screen } from "@/src/components/screen";
import {
  useCustomerDiscoveryHomeQuery,
  useCustomerFavoriteRestaurantIdsQuery,
  useRestaurantDiscoveryInfiniteQuery,
  useCustomerToggleFavoriteRestaurantMutation,
} from "@/src/hooks/use-customer-api";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { useBrowseHistoryStore } from "@/src/store/browse-history-store";
import { useIsOnline } from "@/src/hooks/use-network-status";
import { openLocationPermissionSettings } from "@/src/lib/location-permissions";
import { useLocationStore } from "@/src/store/location-store";
import { palette } from "@/src/theme/palette";
import type { CustomerVoucherOffer, DiscoverableRestaurant } from "@/src/types/restaurant";

type BrowseFilter = "all" | "open" | "offers" | "featured";
type BrowseSort = "nearest" | "fastest" | "topRated";
type BrowseRating = 0 | 4 | 4.5;
type BrowseLowestPrice = 0 | 200 | 400 | 700;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function restaurantSubtitle(restaurant: DiscoverableRestaurant) {
  return [restaurant.cuisineTypes?.slice(0, 2).join(" • "), restaurant.address?.city]
    .filter(Boolean)
    .join(" • ");
}

function restaurantCardSubtitle(restaurant: DiscoverableRestaurant) {
  return restaurant.cuisineTypes?.slice(0, 2).join(" • ") ?? "";
}

function isFeaturedRestaurant(restaurant: DiscoverableRestaurant) {
  return (
    restaurant.discovery?.isFeatured === true ||
    typeof restaurant.discovery?.featuredSortOrder === "number"
  );
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
    const restaurantIds = [
      ...(offer.restaurantIds ?? []),
      offer.restaurantId ?? "",
    ].filter(Boolean);

    for (const restaurantId of restaurantIds) {
      if (!next.has(restaurantId)) {
        next.set(restaurantId, getOfferLabel(offer));
      }
    }
  }

  return next;
}

function formatVisitedTime(value?: string) {
  if (!value) return "Visited recently";

  const visitedAt = new Date(value).getTime();
  if (Number.isNaN(visitedAt)) return "Visited recently";

  const diffMinutes = Math.max(
    0,
    Math.round((Date.now() - visitedAt) / (1000 * 60))
  );

  if (diffMinutes < 1) return "Visited just now";
  if (diffMinutes < 60) return `Visited ${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Visited ${diffHours}h ago`;

  const diffDays = Math.round(diffHours / 24);
  return `Visited ${diffDays}d ago`;
}

export default function BrowseScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<BrowseFilter>("all");
  const [sortBy, setSortBy] = useState<BrowseSort>("nearest");
  const [minimumRating, setMinimumRating] = useState<BrowseRating>(0);
  const [maximumLowestPrice, setMaximumLowestPrice] =
    useState<BrowseLowestPrice>(0);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [draftFilter, setDraftFilter] = useState<BrowseFilter>("all");
  const [draftSortBy, setDraftSortBy] = useState<BrowseSort>("nearest");
  const [draftMinimumRating, setDraftMinimumRating] = useState<BrowseRating>(0);
  const [draftMaximumLowestPrice, setDraftMaximumLowestPrice] =
    useState<BrowseLowestPrice>(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isAuthenticated = useCustomerAuthStore((state) =>
    Boolean(state.accessToken)
  );
  const recentSearches = useBrowseHistoryStore((state) => state.recentSearches);
  const recentVisitedRestaurants = useBrowseHistoryStore(
    (state) => state.recentVisitedRestaurants
  );
  const addRecentSearch = useBrowseHistoryStore((state) => state.addRecentSearch);
  const removeRecentSearch = useBrowseHistoryStore((state) => state.removeRecentSearch);
  const addRecentVisitedRestaurant = useBrowseHistoryStore(
    (state) => state.addRecentVisitedRestaurant
  );
  const pruneRecentVisitedRestaurants = useBrowseHistoryStore(
    (state) => state.pruneRecentVisitedRestaurants
  );
  const selectedLocation = useLocationStore((state) => state.selectedLocation);
  const hasSelectedCoordinates =
    typeof selectedLocation?.latitude === "number" &&
    typeof selectedLocation?.longitude === "number";
  const isOnline = useIsOnline();
  const permissionGranted = useLocationStore((state) => state.permissionGranted);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, searchQuery.trim().length <= 2 ? 180 : 280);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // radiusKm omitted: backend applies the resolved zone / admin fallback radius.
  const nearbyRestaurantsQuery = useRestaurantDiscoveryInfiniteQuery({
    latitude: selectedLocation?.latitude,
    longitude: selectedLocation?.longitude,
    search: debouncedSearchQuery,
    filter: activeFilter,
    sortBy,
    minimumRating,
    maximumLowestPrice,
    pageSize: 12,
  });

  const homeDiscoveryQuery = useCustomerDiscoveryHomeQuery({
    latitude: selectedLocation?.latitude,
    longitude: selectedLocation?.longitude,
  });
  const favoriteRestaurantIdsQuery = useCustomerFavoriteRestaurantIdsQuery();
  const toggleFavoriteMutation = useCustomerToggleFavoriteRestaurantMutation();
  const handleBrowseRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const jobs: Promise<unknown>[] = [homeDiscoveryQuery.refetch()];
      if (hasSelectedCoordinates) {
        jobs.push(nearbyRestaurantsQuery.refetch());
      }
      if (isAuthenticated) {
        jobs.push(favoriteRestaurantIdsQuery.refetch());
      }

      await Promise.all(jobs);
    } finally {
      setIsRefreshing(false);
    }
  }, [
    favoriteRestaurantIdsQuery,
    hasSelectedCoordinates,
    homeDiscoveryQuery,
    isAuthenticated,
    nearbyRestaurantsQuery,
  ]);

  const restaurants = useMemo(
    () =>
      dedupeById(
        nearbyRestaurantsQuery.data?.pages.flatMap((page) => page.items) ?? [],
      ),
    [nearbyRestaurantsQuery.data]
  );
  const totalRestaurantCount =
    nearbyRestaurantsQuery.data?.pages[0]?.total ?? restaurants.length;

  const offerLabelByRestaurantId = useMemo(
    () => buildRestaurantOfferMap(homeDiscoveryQuery.data?.activeOffers ?? []),
    [homeDiscoveryQuery.data?.activeOffers]
  );
  const favoriteRestaurantIdsSet = useMemo(
    () => new Set(favoriteRestaurantIdsQuery.data ?? []),
    [favoriteRestaurantIdsQuery.data]
  );
  const currentRestaurantIds = useMemo(() => {
    const ids = new Set(restaurants.map((restaurant) => restaurant._id));

    for (const restaurant of homeDiscoveryQuery.data?.featuredRestaurants ?? []) {
      ids.add(restaurant._id);
    }

    for (const restaurant of homeDiscoveryQuery.data?.restaurantsWithOffers ?? []) {
      ids.add(restaurant._id);
    }

    return ids;
  }, [
    homeDiscoveryQuery.data?.featuredRestaurants,
    homeDiscoveryQuery.data?.restaurantsWithOffers,
    restaurants,
  ]);
  const visibleRecentVisitedRestaurants = useMemo(
    () =>
      recentVisitedRestaurants.filter((restaurant) =>
        currentRestaurantIds.has(restaurant.id)
      ),
    [currentRestaurantIds, recentVisitedRestaurants]
  );
  useEffect(() => {
    if (!nearbyRestaurantsQuery.isSuccess || currentRestaurantIds.size === 0) {
      return;
    }

    pruneRecentVisitedRestaurants(currentRestaurantIds);
  }, [
    currentRestaurantIds,
    nearbyRestaurantsQuery.isSuccess,
    pruneRecentVisitedRestaurants,
  ]);
  const favoritePendingRestaurantId = toggleFavoriteMutation.isPending
    ? toggleFavoriteMutation.variables
    : null;

  const filteredRestaurants = restaurants;

  const activeFilterLabel = useMemo(() => {
    switch (activeFilter) {
      case "open":
        return "Open now";
      case "offers":
        return "Offers";
      case "featured":
        return "Featured";
      default:
        return "All";
    }
  }, [activeFilter]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (activeFilter !== "all") count += 1;
    if (sortBy !== "nearest") count += 1;
    if (minimumRating !== 0) count += 1;
    if (maximumLowestPrice !== 0) count += 1;
    return count;
  }, [activeFilter, maximumLowestPrice, minimumRating, sortBy]);

  const openFilters = () => {
    setDraftFilter(activeFilter);
    setDraftSortBy(sortBy);
    setDraftMinimumRating(minimumRating);
    setDraftMaximumLowestPrice(maximumLowestPrice);
    setIsFilterOpen(true);
  };

  const openLocationPicker = () => {
    router.push("/location-picker");
  };

  const handleMissingLocationPress = () => {
    if (permissionGranted === false) {
      void openLocationPermissionSettings();
      return;
    }

    openLocationPicker();
  };

  const commitRecentSearch = () => {
    addRecentSearch(searchQuery);
  };

  const handleToggleFavorite = async (restaurantId: string) => {
    if (!isAuthenticated) {
      router.push({
        pathname: "/sign-in",
        params: { redirectTo: "/(tabs)/browse" },
      });
      return;
    }

    if (favoritePendingRestaurantId === restaurantId) {
      return;
    }

    try {
      await toggleFavoriteMutation.mutateAsync(restaurantId);
    } catch {
      return;
    }
  };

  const openRestaurant = (restaurant: DiscoverableRestaurant) => {
    if (searchQuery.trim()) {
      commitRecentSearch();
    }

    addRecentVisitedRestaurant({
      id: restaurant._id,
      name: restaurant.name,
      subtitle: restaurantCardSubtitle(restaurant),
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

  const renderRestaurant = ({ item }: { item: DiscoverableRestaurant }) => (
    <RestaurantHeroCard
      name={item.name}
      subtitle={restaurantCardSubtitle(item)}
      imageUrl={item.coverImage?.url || item.logo?.url || null}
      isOpen={item.isOpen !== false}
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
      variant={isFeaturedRestaurant(item) ? "featured" : "nearby"}
      onPress={() => openRestaurant(item)}
    />
  );

  return (
    <Screen>
      <FlashList
        data={filteredRestaurants}
        keyExtractor={(item) => item._id}
        renderItem={renderRestaurant}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleBrowseRefresh}
            tintColor={palette.primary}
            colors={[palette.primary, palette.secondary, "#FF5C93"]}
          />
        }
        onEndReachedThreshold={0.35}
        onEndReached={() => {
          if (
            nearbyRestaurantsQuery.hasNextPage &&
            !nearbyRestaurantsQuery.isFetchingNextPage
          ) {
            void nearbyRestaurantsQuery.fetchNextPage();
          }
        }}
        ListFooterComponent={
          nearbyRestaurantsQuery.isFetchingNextPage ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={palette.secondary} />
              <Text style={styles.footerLoaderText}>Loading more restaurants</Text>
            </View>
          ) : null
        }
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <View style={styles.headerCard}>
              {!isOnline ? (
                <OfflineNoticeCard description="Browse is showing the last available data. Reconnect to refresh menus, prices, and availability." />
              ) : null}
              <View style={styles.searchRow}>
                <View style={styles.searchBar}>
                  <View style={styles.searchIconWrap}>
                    <Ionicons name="search" size={17} color={palette.secondary} />
                  </View>
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search by restaurant or menu"
                    placeholderTextColor={palette.mutedForeground}
                    style={[
                      styles.searchInput,
                      !searchQuery.trim() ? styles.searchInputCentered : null,
                    ]}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    returnKeyType="search"
                    onSubmitEditing={commitRecentSearch}
                  />
                  {searchQuery.trim() ? (
                    <Pressable onPress={() => setSearchQuery("")} style={styles.clearButton}>
                      <Ionicons name="close" size={16} color={palette.mutedForeground} />
                    </Pressable>
                  ) : null}
                </View>
                <Pressable style={styles.filterButton} onPress={openFilters}>
                  <Ionicons name="options-outline" size={16} color="#fff" />
                  {activeFilterCount ? (
                    <View style={styles.filterBadge}>
                      <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                    </View>
                  ) : null}
                </Pressable>
              </View>

              <View style={styles.sortRow}>
                <Text style={styles.sortSummary}>
                  {totalRestaurantCount} result
                  {totalRestaurantCount === 1 ? "" : "s"} • {activeFilterLabel}
                </Text>
                {activeFilterCount > 0 ? (
                  <Pressable
                    style={styles.clearFiltersBadge}
                    onPress={() => {
                      setActiveFilter("all");
                      setSortBy("nearest");
                      setMinimumRating(0);
                      setMaximumLowestPrice(0);
                    }}
                  >
                    <Ionicons
                      name="close-circle"
                      size={13}
                      color={palette.foreground}
                    />
                    <Text style={styles.clearFiltersBadgeText}>Clear</Text>
                  </Pressable>
                ) : null}
              </View>
              {!searchQuery.trim() && recentSearches.length > 0 ? (
                <View style={styles.historyBlock}>
                  <Text style={styles.historyLabel}>Recent searches</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.recentSearchRow}
                  >
                    {recentSearches.map((query) => (
                      <View key={query} style={styles.recentSearchChip}>
                        <Pressable
                          style={styles.recentSearchMain}
                          onPress={() => setSearchQuery(query)}
                        >
                          <Ionicons
                            name="time-outline"
                            size={13}
                            color={palette.mutedForeground}
                          />
                          <Text
                            numberOfLines={1}
                            style={styles.recentSearchText}
                          >
                            {query}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => removeRecentSearch(query)}
                          hitSlop={8}
                          style={styles.recentSearchRemove}
                        >
                          <Ionicons
                            name="close"
                            size={12}
                            color={palette.mutedForeground}
                          />
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
              {!searchQuery.trim() && visibleRecentVisitedRestaurants.length > 0 ? (
                <View style={styles.historyBlock}>
                  <Text style={styles.historyLabel}>Recently visited</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.recentVisitedRow}
                  >
                    {visibleRecentVisitedRestaurants.map((restaurant) => (
                      <View
                        key={restaurant.id}
                        style={styles.recentVisitedCardWrap}
                      >
                        <Pressable
                          style={styles.recentVisitedCard}
                          onPress={() =>
                            router.push({
                              pathname: "/restaurants/[restaurantId]",
                              params: { restaurantId: restaurant.id },
                            })
                          }
                        >
                          <View style={styles.recentVisitedThumb}>
                            <RemoteImage
                              uri={restaurant.imageUrl}
                              style={styles.recentVisitedImage}
                              fallbackIcon="restaurant-outline"
                              fallbackIconSize={18}
                              fallbackTint={palette.secondary}
                              accessibilityLabel={`${restaurant.name} restaurant photo`}
                            />
                          </View>
                          <View style={styles.recentVisitedCopy}>
                            <Text
                              numberOfLines={1}
                              style={styles.recentVisitedTitle}
                            >
                              {restaurant.name}
                            </Text>
                            {restaurant.subtitle ? (
                              <Text
                                numberOfLines={1}
                                style={styles.recentVisitedSubtitle}
                              >
                                {restaurant.subtitle}
                              </Text>
                            ) : null}
                            <Text style={styles.recentVisitedMeta}>
                              {formatVisitedTime(restaurant.visitedAt)}
                            </Text>
                          </View>
                          <Pressable
                            style={[
                              styles.recentVisitedHeart,
                              favoriteRestaurantIdsSet.has(restaurant.id)
                                ? styles.recentVisitedHeartActive
                                : null,
                            ]}
                            onPress={() =>
                              handleToggleFavorite(restaurant.id)
                            }
                            disabled={
                              favoritePendingRestaurantId === restaurant.id
                            }
                            hitSlop={8}
                          >
                            <Ionicons
                              name={
                                favoriteRestaurantIdsSet.has(restaurant.id)
                                  ? "heart"
                                  : "heart-outline"
                              }
                              size={14}
                              color={
                                favoriteRestaurantIdsSet.has(restaurant.id)
                                  ? "#fff"
                                  : palette.foreground
                              }
                            />
                          </Pressable>
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          !selectedLocation ? (
            <EmptyStateCard
              title={
                permissionGranted === false
                  ? "Location permission is needed"
                  : "Choose your location first"
              }
              description="Pick your delivery point first so we can show restaurants that truly serve your area."
              actionLabel={
                permissionGranted === false ? "Allow location" : "Choose location"
              }
              onPress={handleMissingLocationPress}
            />
          ) : nearbyRestaurantsQuery.isLoading ? (
            <RestaurantListSkeleton count={3} compact variant="nearby" />
          ) : nearbyRestaurantsQuery.isError ? (
            isOnline ? (
              <EmptyStateCard
                title="Browse is unavailable right now"
                description="Please try again in a moment."
                actionLabel="Try again"
                onPress={() => nearbyRestaurantsQuery.refetch()}
              />
            ) : (
              <EmptyStateCard
                title="Browse is unavailable offline"
                description="Check your internet connection to load restaurants for this area again."
              />
            )
          ) : (
            <EmptyStateCard
              title={
                isOnline && searchQuery.trim()
                  ? "No matching food found"
                  : isOnline
                    ? "Foodbela isn't in this area yet"
                    : "Restaurants are unavailable offline"
              }
              description={
                isOnline && searchQuery.trim()
                  ? "Try another spelling, food name, cuisine, or restaurant. Your location is still selected."
                  : isOnline
                    ? "We don't deliver to this location yet. Try a different delivery point where Foodbela is available."
                  : "Check your internet connection to load restaurants for this area again."
              }
            />
          )
        }
      />

      <AppBottomSheet
        visible={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        title="Filters"
        subtitle="Choose what you want to see"
        leadingIcon="options-outline"
        snapPoints={[0.7, 0.92]}
        initialSnapPoint={0.7}
        footer={
          <View style={styles.filterFooter}>
            <Pressable
              style={styles.filterResetButton}
              onPress={() => {
                setDraftFilter("all");
                setDraftSortBy("nearest");
                setDraftMinimumRating(0);
                setDraftMaximumLowestPrice(0);
              }}
            >
              <Ionicons name="refresh-outline" size={15} color={palette.foreground} />
              <Text style={styles.filterResetText}>Reset</Text>
            </Pressable>
            <Pressable
              style={styles.filterApplyButton}
              onPress={() => {
                setActiveFilter(draftFilter);
                setSortBy(draftSortBy);
                setMinimumRating(draftMinimumRating);
                setMaximumLowestPrice(draftMaximumLowestPrice);
                setIsFilterOpen(false);
              }}
            >
              <Text style={styles.filterApplyText}>Apply filters</Text>
              <Ionicons name="checkmark" size={16} color={palette.surface} />
            </Pressable>
          </View>
        }
      >
        <View style={styles.filterPill}>
          <Ionicons name="sparkles" size={12} color={palette.primary} />
          <Text style={styles.filterPillText}>Browse filters</Text>
        </View>

        <View style={styles.filterInsightRow}>
          <View style={styles.filterInsightCard}>
            <Text style={styles.filterInsightValue}>{filteredRestaurants.length}</Text>
            <Text style={styles.filterInsightLabel}>Matching restaurants</Text>
          </View>
          <View style={styles.filterInsightCard}>
            <Text style={styles.filterInsightValue}>{activeFilterCount}</Text>
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
            {[
              { key: "all", label: "All", icon: "apps-outline" },
              { key: "open", label: "Open now", icon: "checkmark-circle-outline" },
              { key: "offers", label: "Offers", icon: "pricetag-outline" },
              { key: "featured", label: "Featured", icon: "sparkles-outline" },
            ].map((filter) => {
              const isActive = draftFilter === filter.key;
              return (
                <Pressable
                  key={filter.key}
                  style={[styles.filterChip, isActive ? styles.filterChipActive : null]}
                  onPress={() => setDraftFilter(filter.key as BrowseFilter)}
                >
                  <Ionicons
                    name={filter.icon as keyof typeof Ionicons.glyphMap}
                    size={13}
                    color={isActive ? palette.surface : palette.secondary}
                  />
                  <Text
                    style={[
                      styles.filterChipText,
                      isActive ? styles.filterChipTextActive : null,
                    ]}
                  >
                    {filter.label}
                  </Text>
                </Pressable>
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
            {[
              { key: "nearest", label: "Nearest", icon: "navigate-outline" },
              { key: "fastest", label: "Fastest", icon: "flash-outline" },
              { key: "topRated", label: "Top rated", icon: "star-outline" },
            ].map((option) => {
              const isActive = draftSortBy === option.key;
              return (
                <Pressable
                  key={option.key}
                  style={[styles.filterChip, isActive ? styles.filterChipActive : null]}
                  onPress={() => setDraftSortBy(option.key as BrowseSort)}
                >
                  <Ionicons
                    name={option.icon as keyof typeof Ionicons.glyphMap}
                    size={13}
                    color={isActive ? palette.surface : palette.secondary}
                  />
                  <Text
                    style={[
                      styles.filterChipText,
                      isActive ? styles.filterChipTextActive : null,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
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
            {[
              { key: 0, label: "Any" },
              { key: 4, label: "4.0+" },
              { key: 4.5, label: "4.5+" },
            ].map((option) => {
              const isActive = draftMinimumRating === option.key;
              return (
                <Pressable
                  key={option.label}
                  style={[styles.filterChip, isActive ? styles.filterChipActive : null]}
                  onPress={() => setDraftMinimumRating(option.key as BrowseRating)}
                >
                  <Ionicons
                    name={isActive ? "star" : "star-outline"}
                    size={13}
                    color={isActive ? palette.surface : palette.secondary}
                  />
                  <Text
                    style={[
                      styles.filterChipText,
                      isActive ? styles.filterChipTextActive : null,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
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
            {[
              { key: 0, label: "Any" },
              { key: 200, label: "Up to Tk 200" },
              { key: 400, label: "Up to Tk 400" },
              { key: 700, label: "Up to Tk 700" },
            ].map((option) => {
              const isActive = draftMaximumLowestPrice === option.key;
              return (
                <Pressable
                  key={option.label}
                  style={[
                    styles.filterChip,
                    isActive ? styles.filterChipActive : null,
                  ]}
                  onPress={() =>
                    setDraftMaximumLowestPrice(
                      option.key as BrowseLowestPrice
                    )
                  }
                >
                  <Ionicons
                    name={isActive ? "cash" : "cash-outline"}
                    size={13}
                    color={isActive ? palette.surface : palette.secondary}
                  />
                  <Text
                    style={[
                      styles.filterChipText,
                      isActive ? styles.filterChipTextActive : null,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </AppBottomSheet>
    </Screen>
  );
}
