import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";

import { RestaurantFilterSheet } from "@/src/components/restaurant-filter-sheet";
import {
  ClosingSoonBanner,
  ServiceClosedHero,
  ServiceClosedStickyPill,
} from "@/src/components/service-closed-banner";
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
import {
  useCloseAutoRefresh,
  useReopenAutoRefresh,
} from "@/src/lib/restaurant-availability";
import { useLocationStore } from "@/src/store/location-store";
import { palette } from "@/src/theme/palette";
import type { CustomerVoucherOffer, DiscoverableRestaurant } from "@/src/types/restaurant";

type BrowseFilter = "all" | "open" | "offers" | "featured";
type BrowseSort = "nearest" | "fastest" | "topRated";
type BrowseRating = 0 | 4 | 4.5;
type BrowseLowestPrice = 0 | 200 | 400 | 700;

function RestaurantSeparator() {
  return <View style={styles.restaurantSeparator} />;
}

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
  const [isRefreshing, setIsRefreshing] = useState(false);
  // `freezeOnBlur` (tab layout) suspends this screen while it is blurred, so we
  // no longer swap in a placeholder on blur — the frozen full tree returns
  // instantly on focus, matching Home. Focus still gates the network queries below.
  const isBrowseFocused = useIsFocused();
  const searchQueryRef = useRef(searchQuery);
  const listRef = useRef<FlashListRef<DiscoverableRestaurant>>(null);
  const isAuthenticated = useCustomerAuthStore((state) =>
    Boolean(state.accessToken)
  );
  const isAuthenticatedRef = useRef(isAuthenticated);
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

  useFocusEffect(
    useCallback(() => {
      return () => {
        setIsFilterOpen(false);
      };
    }, []),
  );

  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, searchQuery.trim().length <= 2 ? 180 : 280);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Return the list to the top when the search term changes — above all when it's
  // cleared. FlashList v2 keeps the previously-visible item anchored by default
  // (maintainVisibleContentPosition), which was dragging the full list down to the
  // searched restaurant's row; that anchoring is disabled on the list below, and we
  // scroll to the top after the new data has laid out (rAF), so a plain offset reset
  // isn't undone by a mid-update re-anchor.
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      listRef.current?.scrollToOffset({ offset: 0, animated: false }),
    );
    return () => cancelAnimationFrame(frame);
  }, [debouncedSearchQuery]);

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
  }, isBrowseFocused);

  const homeDiscoveryQuery = useCustomerDiscoveryHomeQuery({
    latitude: selectedLocation?.latitude,
    longitude: selectedLocation?.longitude,
    enabled: isBrowseFocused,
  });
  const favoriteRestaurantIdsQuery =
    useCustomerFavoriteRestaurantIdsQuery(isBrowseFocused);
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
  // Whether the location has ANY serviceable restaurant (open or closed). Backend-supplied
  // so an empty "open now" list can mean "all closed" (true) vs "not served" (false).
  const areaHasRestaurants =
    nearbyRestaurantsQuery.data?.pages[0]?.areaHasRestaurants ?? false;
  const areaWindow = homeDiscoveryQuery.data?.areaServiceWindow ?? null;
  const isAreaClosed = areaWindow?.isOpen === false;
  const isAreaOpen = areaWindow?.isOpen === true;
  // When the area's service window opens, auto-refetch the feed + nearby list so restaurants
  // flip closed→open on their own — no manual pull-to-refresh or app restart needed.
  useReopenAutoRefresh(isAreaClosed ? areaWindow?.opensAtEpochMs : null, () => {
    void homeDiscoveryQuery.refetch();
    if (hasSelectedCoordinates) void nearbyRestaurantsQuery.refetch();
  });
  // Mirror for the CLOSE boundary: flip open→closed on its own so the reopen countdown starts.
  useCloseAutoRefresh(isAreaOpen ? areaWindow?.closesAtEpochMs : null, () => {
    void homeDiscoveryQuery.refetch();
    if (hasSelectedCoordinates) void nearbyRestaurantsQuery.refetch();
  });
  const closedRevealRef = useRef(Number.POSITIVE_INFINITY);
  const closedStickyShownRef = useRef(false);
  const [closedStickyVisible, setClosedStickyVisible] = useState(false);

  // Reveal the slim closed pill once the in-flow closed hero (the first list header item)
  // has scrolled up under the top. Flip the boolean only on threshold cross, not per frame.
  const handleBrowseScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      const shouldShow = offsetY >= closedRevealRef.current;
      if (shouldShow !== closedStickyShownRef.current) {
        closedStickyShownRef.current = shouldShow;
        setClosedStickyVisible(shouldShow);
      }
    },
    [],
  );

  const offerLabelByRestaurantId = useMemo(
    () => buildRestaurantOfferMap(homeDiscoveryQuery.data?.activeOffers ?? []),
    [homeDiscoveryQuery.data?.activeOffers]
  );
  const offerLabelByRestaurantIdRef = useRef(offerLabelByRestaurantId);
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
      ).slice(0, 6),
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
  const favoritePendingRestaurantIdRef = useRef(favoritePendingRestaurantId);

  useEffect(() => {
    offerLabelByRestaurantIdRef.current = offerLabelByRestaurantId;
  }, [offerLabelByRestaurantId]);

  useEffect(() => {
    favoritePendingRestaurantIdRef.current = favoritePendingRestaurantId;
  }, [favoritePendingRestaurantId]);

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

  const openFilters = useCallback(() => {
    setIsFilterOpen(true);
  }, []);

  const openLocationPicker = useCallback(() => {
    router.push("/location-picker");
  }, [router]);

  const handleMissingLocationPress = useCallback(() => {
    if (permissionGranted === false) {
      void openLocationPermissionSettings();
      return;
    }

    openLocationPicker();
  }, [openLocationPicker, permissionGranted]);

  const commitRecentSearch = useCallback(() => {
    addRecentSearch(searchQuery.trim());
  }, [addRecentSearch, searchQuery]);

  const handleToggleFavorite = useCallback(async (restaurantId: string) => {
    if (!isAuthenticatedRef.current) {
      router.push({
        pathname: "/sign-in",
        params: { redirectTo: "/(tabs)/browse" },
      });
      return;
    }

    if (favoritePendingRestaurantIdRef.current === restaurantId) {
      return;
    }

    try {
      await toggleFavoriteMutation.mutateAsync(restaurantId);
    } catch {
      return;
    }
  }, [
    router,
    toggleFavoriteMutation,
  ]);

  const openRestaurant = useCallback((restaurant: DiscoverableRestaurant) => {
    const currentSearch = searchQueryRef.current.trim();
    if (currentSearch) {
      addRecentSearch(currentSearch);
    }

    addRecentVisitedRestaurant({
      id: restaurant._id,
      name: restaurant.name,
      subtitle: restaurantCardSubtitle(restaurant),
      imageUrl: restaurant.coverImage?.url || restaurant.logo?.url || null,
      isOpen: restaurant.isOpen !== false,
      offerLabel: offerLabelByRestaurantIdRef.current.get(restaurant._id) ?? null,
      distanceKm: restaurant.distanceKm,
      avgRating: restaurant.avgRating,
      reviewCount: restaurant.reviewCount,
      lowestMenuPrice: restaurant.lowestMenuPrice,
      preparationTimeMinutes: restaurant.preparationTimeMinutes,
    });

    router.push({
      pathname: "/restaurants/[restaurantId]",
      params: { restaurantId: restaurant._id, source: "browse" },
    });
  }, [addRecentSearch, addRecentVisitedRestaurant, router]);

  const listExtraData = useMemo(
    () => ({
      favorites: favoriteRestaurantIdsQuery.data?.join("|") ?? "",
      pending: favoritePendingRestaurantId ?? "",
      offers: offerLabelByRestaurantId.size,
    }),
    [
      favoritePendingRestaurantId,
      favoriteRestaurantIdsQuery.data,
      offerLabelByRestaurantId.size,
    ],
  );

  const renderRestaurant = useCallback(({ item }: { item: DiscoverableRestaurant }) => (
    <RestaurantHeroCard
      name={item.name}
      subtitle={restaurantCardSubtitle(item)}
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
      flat
      variant={isFeaturedRestaurant(item) ? "featured" : "nearby"}
      onPress={() => openRestaurant(item)}
    />
  ), [
    favoritePendingRestaurantId,
    favoriteRestaurantIdsSet,
    handleToggleFavorite,
    offerLabelByRestaurantId,
    openRestaurant,
  ]);

  const showAllRestaurants = useCallback(() => setActiveFilter("all"), []);

  // Empty-list copy for a SERVED location. The list can be empty for very different
  // reasons — differentiate them so a narrowing filter (Open now / Offers / Featured)
  // never wrongly reads as "Foodbela isn't in this area yet". "Open now" is upgraded with
  // the area's real reopen time when the whole area is outside its service window (the
  // live countdown itself already shows in the banner above the list).
  const emptyStateContent = useMemo<{
    title: string;
    description: string;
    actionLabel?: string;
    onPress?: () => void;
  }>(() => {
    if (!isOnline) {
      return {
        title: "Restaurants are unavailable offline",
        description:
          "Check your internet connection to load restaurants for this area again.",
      };
    }

    if (searchQuery.trim().length > 0) {
      return {
        title: "No matching food found",
        description:
          "Try another spelling, food name, cuisine, or restaurant. Your location is still selected.",
      };
    }

    if (activeFilter === "open") {
      // An empty open-now list with NO restaurants in the area at all → genuinely not
      // served. Fall through to the default "isn't in this area yet" copy below.
      if (!areaHasRestaurants) {
        return {
          title: "Foodbela isn't in this area yet",
          description:
            "We don't deliver to this location yet. Try a different delivery point where Foodbela is available.",
        };
      }
      // The area HAS restaurants but none are open right now. Never show them as closed
      // cards under an "Open now" filter — say so plainly, with the real reopen time when
      // the whole area is outside its service window.
      const areaWindow = homeDiscoveryQuery.data?.areaServiceWindow;
      const outsideServiceWindow = Boolean(areaWindow && areaWindow.isOpen === false);
      return {
        title: "All restaurants are closed right now",
        description:
          outsideServiceWindow && areaWindow?.opensAtLabel
            ? `Every restaurant near you is outside its service hours. Ordering opens at ${areaWindow.opensAtLabel}.`
            : "Every restaurant near you is offline at the moment. Check back shortly, or browse them all to plan ahead.",
        actionLabel: "Show all restaurants",
        onPress: showAllRestaurants,
      };
    }

    if (activeFilter === "offers") {
      return {
        title: "No offers right now",
        description:
          "No restaurants in your area are running offers at the moment. Browse all restaurants instead.",
        actionLabel: "Show all restaurants",
        onPress: showAllRestaurants,
      };
    }

    if (activeFilter === "featured") {
      return {
        title: "No featured restaurants yet",
        description:
          "We haven't featured any restaurants in your area yet. Browse all restaurants instead.",
        actionLabel: "Show all restaurants",
        onPress: showAllRestaurants,
      };
    }

    return {
      title: "Foodbela isn't in this area yet",
      description:
        "We don't deliver to this location yet. Try a different delivery point where Foodbela is available.",
    };
  }, [
    activeFilter,
    areaHasRestaurants,
    homeDiscoveryQuery.data?.areaServiceWindow,
    isOnline,
    searchQuery,
    showAllRestaurants,
  ]);

  return (
    <Screen>
      {/* Search + filter stay pinned above the list so they never scroll away and
          clearing the query can't yank the list to the top (search-bar reflow). */}
      <View style={styles.stickySearchBar}>
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <View style={styles.searchIconWrap}>
              <Ionicons name="search" size={17} color={palette.secondary} />
            </View>
            <TextInput
              value={searchQuery}
              onChangeText={(text) => setSearchQuery(text.replace(/^\s+/, ""))}
              placeholder="Search by restaurant or menu"
              placeholderTextColor={palette.mutedForeground}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              returnKeyType="search"
              onSubmitEditing={commitRecentSearch}
            />
            {searchQuery.trim().length > 0 ? (
              <Pressable
                onPress={() => setSearchQuery("")}
                style={({ pressed }) => [
                  styles.clearButton,
                  pressed ? styles.pressablePressed : null,
                ]}
              >
                <Ionicons name="close" size={16} color={palette.mutedForeground} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.filterButton,
              pressed ? styles.pressablePressed : null,
            ]}
            onPress={openFilters}
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
        </View>
      </View>
      <View style={styles.listWrap}>
      <FlashList
        ref={listRef}
        data={filteredRestaurants}
        keyExtractor={(item) => item._id}
        renderItem={renderRestaurant}
        extraData={listExtraData}
        showsVerticalScrollIndicator={false}
        onScroll={handleBrowseScroll}
        scrollEventThrottle={32}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={RestaurantSeparator}
        // Off by default in FlashList v2 this would re-anchor to the previously
        // visible restaurant when search is cleared, pinning the full list to that
        // row instead of the top. Disable so the scroll-to-top above wins.
        maintainVisibleContentPosition={{ disabled: true }}
        drawDistance={560}
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
            {isAreaClosed && areaWindow ? (
              <View style={{ marginHorizontal: -20, marginBottom: 14 }}>
                <ServiceClosedHero
                  area={areaWindow}
                  showTimer={false}
                  onLayout={(event) => {
                    closedRevealRef.current =
                      event.nativeEvent.layout.height * 0.6;
                  }}
                />
              </View>
            ) : null}
            {isAreaOpen && areaWindow ? (
              <ClosingSoonBanner
                closesAtEpochMs={areaWindow.closesAtEpochMs}
                active={isBrowseFocused}
              />
            ) : null}
            <View style={styles.headerCard}>
              {!isOnline ? (
                <OfflineNoticeCard description="Browse is showing the last available data. Reconnect to refresh menus, prices, and availability." />
              ) : null}
              <View style={styles.sortRow}>
                <Text style={styles.sortSummary}>
                  {totalRestaurantCount} result
                  {totalRestaurantCount === 1 ? "" : "s"} • {activeFilterLabel}
                </Text>
                {activeFilterCount > 0 ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.clearFiltersBadge,
                      pressed ? styles.chipPressed : null,
                    ]}
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
                          style={({ pressed }) => [
                            styles.recentSearchMain,
                            pressed ? styles.chipPressed : null,
                          ]}
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
                          style={({ pressed }) => [
                            styles.recentSearchRemove,
                            pressed ? styles.pressablePressed : null,
                          ]}
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
                          style={({ pressed }) => [
                            styles.recentVisitedCard,
                            pressed ? styles.cardPressed : null,
                          ]}
                          onPress={() =>
                            router.push({
                              pathname: "/restaurants/[restaurantId]",
                              params: {
                                restaurantId: restaurant.id,
                                source: "recent",
                              },
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
                            style={({ pressed }) => [
                              styles.recentVisitedHeart,
                              favoriteRestaurantIdsSet.has(restaurant.id)
                                ? styles.recentVisitedHeartActive
                                : null,
                              pressed ? styles.pressablePressed : null,
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
              title={emptyStateContent.title}
              description={emptyStateContent.description}
              actionLabel={emptyStateContent.actionLabel}
              onPress={emptyStateContent.onPress}
            />
          )
        }
      />
      <ServiceClosedStickyPill
        area={areaWindow}
        visible={closedStickyVisible}
        topOffset={8}
        showTimer={false}
      />
      </View>

      <RestaurantFilterSheet
        visible={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        value={{
          filter: activeFilter,
          sortBy,
          minimumRating,
          maximumLowestPrice,
        }}
        onApply={(next) => {
          setActiveFilter(next.filter);
          setSortBy(next.sortBy);
          setMinimumRating(next.minimumRating);
          setMaximumLowestPrice(next.maximumLowestPrice);
        }}
        latitude={selectedLocation?.latitude}
        longitude={selectedLocation?.longitude}
        search={debouncedSearchQuery}
      />
    </Screen>
  );
}
