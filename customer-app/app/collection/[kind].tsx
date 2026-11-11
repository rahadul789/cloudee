import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { BelaPullToRefresh } from "@/src/components/bela-pull-to-refresh";
import { EmptyStateCard } from "@/src/components/empty-state-card";
import { ErrorRetryCard } from "@/src/components/error-retry-card";
import { ShimmerBlock } from "@/src/components/loading-skeleton";
import { getRestaurantCustomBadge } from "@/src/components/restaurant-hero-card";
import { RestaurantFeedRow } from "@/src/components/restaurant-feed-row";
import { Screen } from "@/src/components/screen";
import { AppHeader } from "@/src/components/ui";
import {
  useCustomerDiscoveryHomeQuery,
  useCustomerFavoriteRestaurantIdsQuery,
  useCustomerToggleFavoriteRestaurantMutation,
  useRestaurantDiscoveryInfiniteQuery,
} from "@/src/hooks/use-customer-api";
import { buildRestaurantOfferMap } from "@/src/lib/restaurant-offer-labels";
import { useLocationStore } from "@/src/store/location-store";
import type { DiscoverableRestaurant } from "@/src/types/restaurant";

// "See all" for a Home section. Each kind maps onto the existing paged discovery API.
const KINDS = {
  featured: {
    title: "Featured restaurants",
    subtitle: "Hand-picked places near you",
    query: { filter: "featured" as const },
    source: "featured",
  },
  offers: {
    title: "Offers near you",
    subtitle: "Restaurants with a deal right now",
    query: { filter: "offers" as const },
    source: "offers",
  },
  popular: {
    title: "Popular near you",
    subtitle: "Top-rated places in your area",
    query: { sortBy: "topRated" as const },
    source: "popular",
  },
} as const;
export type CollectionKind = keyof typeof KINDS;

function cuisineLine(restaurant: DiscoverableRestaurant) {
  return restaurant.cuisineTypes?.slice(0, 2).join(", ") ?? "";
}

function ListSkeleton() {
  return (
    <View style={styles.skeletonList}>
      {[0, 1, 2].map((index) => (
        <View key={index} style={styles.skeletonRow}>
          <ShimmerBlock style={styles.skeletonImage} />
          <ShimmerBlock style={styles.skeletonLine} />
          <ShimmerBlock style={styles.skeletonLineShort} />
        </View>
      ))}
    </View>
  );
}

export default function RestaurantCollectionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string; title?: string; subtitle?: string }>();
  const kind: CollectionKind =
    params.kind && params.kind in KINDS ? (params.kind as CollectionKind) : "featured";
  const config = KINDS[kind];
  // Home passes its (admin-editable) section title so both screens read the same.
  const title = params.title?.trim() || config.title;
  const subtitle = params.subtitle?.trim() || config.subtitle;

  const selectedLocation = useLocationStore((state) => state.selectedLocation);
  const listQuery = useRestaurantDiscoveryInfiniteQuery({
    latitude: selectedLocation?.latitude,
    longitude: selectedLocation?.longitude,
    pageSize: 12,
    ...config.query,
  });
  // Same params as Home → served from cache; only used for the offer labels.
  const homeQuery = useCustomerDiscoveryHomeQuery({
    latitude: selectedLocation?.latitude,
    longitude: selectedLocation?.longitude,
  });
  const offerLabels = useMemo(
    () => buildRestaurantOfferMap(homeQuery.data?.activeOffers ?? []),
    [homeQuery.data?.activeOffers],
  );
  const favoriteIdsQuery = useCustomerFavoriteRestaurantIdsQuery();
  const favoriteIds = useMemo(() => new Set(favoriteIdsQuery.data ?? []), [favoriteIdsQuery.data]);
  const toggleFavorite = useCustomerToggleFavoriteRestaurantMutation();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const restaurants = useMemo(() => {
    const seen = new Set<string>();
    return (listQuery.data?.pages ?? [])
      .flatMap((page) => page.items ?? [])
      .filter((restaurant) => {
        if (seen.has(restaurant._id)) return false;
        seen.add(restaurant._id);
        return true;
      });
  }, [listQuery.data?.pages]);
  const total = listQuery.data?.pages?.[0]?.total;

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await listQuery.refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [listQuery]);

  const loadMore = useCallback(() => {
    if (listQuery.hasNextPage && !listQuery.isFetchingNextPage) {
      void listQuery.fetchNextPage();
    }
  }, [listQuery]);

  return (
    <Screen>
      <AppHeader
        title={title}
        subtitle={
          typeof total === "number" && total > 0
            ? `${total} restaurant${total === 1 ? "" : "s"} · ${subtitle}`
            : subtitle
        }
      />
      <BelaPullToRefresh refreshing={isRefreshing} onRefresh={handleRefresh}>
        <FlashList
          data={restaurants}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          ListFooterComponent={
            listQuery.isFetchingNextPage ? (
              <ActivityIndicator style={styles.footer} />
            ) : null
          }
          ListEmptyComponent={
            listQuery.isLoading ? (
              <ListSkeleton />
            ) : listQuery.isError ? (
              <ErrorRetryCard
                title="Couldn't load restaurants"
                description="Check your connection and try again."
                onRetry={() => void listQuery.refetch()}
                retrying={listQuery.isFetching}
              />
            ) : (
              <EmptyStateCard
                title="Nothing here right now"
                description="Check back a little later — new places and deals show up often."
                actionLabel="Back to home"
                onPress={() => router.back()}
                icon="storefront-outline"
                mascot={false}
              />
            )
          }
          renderItem={({ item }) => (
            <RestaurantFeedRow
              name={item.name}
              subtitle={cuisineLine(item)}
              imageUrl={item.coverImage?.url || item.logo?.url || null}
              isOpen={item.isOpen !== false}
              availability={item.availability}
              offerLabel={offerLabels.get(item._id) ?? null}
              distanceKm={item.distanceKm}
              avgRating={item.avgRating}
              reviewCount={item.reviewCount}
              preparationTimeMinutes={item.preparationTimeMinutes}
              deliveryFee={item.deliveryFee}
              customBadge={getRestaurantCustomBadge(item)}
              isFavorite={favoriteIds.has(item._id)}
              favoriteDisabled={toggleFavorite.isPending && toggleFavorite.variables === item._id}
              onToggleFavorite={() => {
                toggleFavorite.mutateAsync(item._id).catch(() => undefined);
              }}
              onPress={() =>
                router.push({
                  pathname: "/restaurants/[restaurantId]",
                  params: { restaurantId: item._id, source: config.source },
                })
              }
            />
          )}
        />
      </BelaPullToRefresh>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48 },
  separator: { height: 20 },
  footer: { paddingVertical: 20 },
  skeletonList: { gap: 20 },
  skeletonRow: { gap: 9 },
  skeletonImage: { width: "100%", aspectRatio: 2.3, borderRadius: 16 },
  skeletonLine: { width: "62%", height: 15, borderRadius: 7 },
  skeletonLineShort: { width: "82%", height: 12, borderRadius: 6 },
});
