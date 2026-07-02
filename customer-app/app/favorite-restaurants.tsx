import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";

import { EmptyStateCard } from "@/src/components/empty-state-card";
import { ShimmerBlock } from "@/src/components/loading-skeleton";
import { RestaurantHeroCard } from "@/src/components/restaurant-hero-card";
import { Screen } from "@/src/components/screen";
import {
  useCustomerFavoriteRestaurantIdsQuery,
  useCustomerFavoriteRestaurantsQuery,
  useCustomerToggleFavoriteRestaurantMutation,
} from "@/src/hooks/use-customer-api";
import { getCustomerAuthErrorMessage } from "@/src/lib/auth-error-message";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { useLocationStore } from "@/src/store/location-store";
import { palette } from "@/src/theme/palette";
import type { DiscoverableRestaurant } from "@/src/types/restaurant";

function restaurantSubtitle(restaurant: DiscoverableRestaurant) {
  const parts = [
    restaurant.cuisineTypes?.slice(0, 2).join(" • "),
    restaurant.tags?.find(Boolean),
  ].filter(Boolean);

  return parts.join(" • ");
}

function FavoriteRestaurantCardSkeleton() {
  return (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonImageWrap}>
        <ShimmerBlock style={styles.skeletonImage} />
        <View style={styles.skeletonTopRow}>
          <ShimmerBlock style={styles.skeletonStatusPill} />
          <ShimmerBlock style={styles.skeletonHeart} />
        </View>
      </View>
      <View style={styles.skeletonContent}>
        <View style={styles.skeletonTitleRow}>
          <View style={styles.skeletonCopy}>
            <ShimmerBlock style={styles.skeletonTitle} />
            <ShimmerBlock style={styles.skeletonSubtitle} />
          </View>
          <View style={styles.skeletonPriceStack}>
            <ShimmerBlock style={styles.skeletonPriceLabel} />
            <ShimmerBlock style={styles.skeletonPriceValue} />
          </View>
        </View>
        <View style={styles.skeletonMetricsRow}>
          <ShimmerBlock style={styles.skeletonMetric} />
          <ShimmerBlock style={styles.skeletonMetric} />
          <ShimmerBlock style={styles.skeletonMetricSmall} />
        </View>
      </View>
    </View>
  );
}

function FavoriteRestaurantListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.skeletonList}>
      {Array.from({ length: count }, (_, index) => (
        <FavoriteRestaurantCardSkeleton key={index} />
      ))}
    </View>
  );
}

export default function FavoriteRestaurantsScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const customer = useCustomerAuthStore((state) => state.customer);
  const selectedLocation = useLocationStore((state) => state.selectedLocation);
  const favoriteRestaurantsQuery = useCustomerFavoriteRestaurantsQuery({
    latitude: selectedLocation?.latitude,
    longitude: selectedLocation?.longitude,
    radiusKm: 25,
  });
  const favoriteRestaurantIdsQuery = useCustomerFavoriteRestaurantIdsQuery();
  const toggleFavoriteMutation = useCustomerToggleFavoriteRestaurantMutation();
  const [pendingFavoriteIds, setPendingFavoriteIds] = useState<string[]>([]);

  const favoriteRestaurantIdsSet = useMemo(
    () => new Set(favoriteRestaurantIdsQuery.data ?? []),
    [favoriteRestaurantIdsQuery.data],
  );

  const restaurants = useMemo(
    () =>
      (favoriteRestaurantsQuery.data ?? []).filter((restaurant) =>
        favoriteRestaurantIdsSet.has(restaurant._id),
      ),
    [favoriteRestaurantIdsSet, favoriteRestaurantsQuery.data],
  );

  const isInitialLoading =
    favoriteRestaurantsQuery.isLoading && !restaurants.length;
  const isRefreshing =
    favoriteRestaurantsQuery.isRefetching &&
    !favoriteRestaurantsQuery.isFetching;
  const emptyStateMinHeight = Math.max(360, height - 440);

  const handleToggleFavorite = useCallback(
    async (restaurantId: string) => {
      if (!customer || pendingFavoriteIds.includes(restaurantId)) {
        return;
      }

      setPendingFavoriteIds((current) => [...current, restaurantId]);
      try {
        await toggleFavoriteMutation.mutateAsync(restaurantId);
      } catch (error) {
        const message = getCustomerAuthErrorMessage(
          error,
          "Could not update favorites right now.",
        );
        if (__DEV__) console.warn(message);
      } finally {
        setPendingFavoriteIds((current) =>
          current.filter((id) => id !== restaurantId),
        );
      }
    },
    [customer, pendingFavoriteIds, toggleFavoriteMutation],
  );

  const openBrowse = useCallback(() => {
    router.push("/(tabs)/browse");
  }, [router]);

  const renderRestaurant = useCallback(
    ({ item }: { item: DiscoverableRestaurant }) => (
      <RestaurantHeroCard
        compact
        name={item.name}
        subtitle={restaurantSubtitle(item)}
        imageUrl={item.coverImage?.url ?? item.logo?.url ?? null}
        isOpen={item.isOpen ?? true}
        offerLabel={undefined}
        distanceKm={item.distanceKm}
        avgRating={item.avgRating}
        reviewCount={item.reviewCount}
        preparationTimeMinutes={item.preparationTimeMinutes}
        lowestMenuPrice={item.lowestMenuPrice}
        isFavorite={favoriteRestaurantIdsSet.has(item._id)}
        favoriteDisabled={pendingFavoriteIds.includes(item._id)}
        onToggleFavorite={() => {
          void handleToggleFavorite(item._id);
        }}
        onPress={() => router.push(`/restaurants/${item._id}` as never)}
      />
    ),
    [
      favoriteRestaurantIdsSet,
      handleToggleFavorite,
      pendingFavoriteIds,
      router,
    ],
  );

  return (
    <Screen>
      <FlashList
        data={restaurants}
        keyExtractor={(item) => item._id}
        renderItem={renderRestaurant}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <Ionicons
                name="chevron-back"
                size={20}
                color={palette.foreground}
              />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.kicker}>Favorites</Text>
              <Text style={styles.title}>Saved restaurants</Text>
              {/* <Text style={styles.subtitle}>
                Revisit the places you liked most and keep them one tap away.
              </Text> */}
            </View>
          </View>
        }
        ListEmptyComponent={
          isInitialLoading ? (
            <View style={styles.loadingWrap}>
              <FavoriteRestaurantListSkeleton count={3} />
            </View>
          ) : (
            <View
              style={[styles.feedbackWrap, { minHeight: emptyStateMinHeight }]}
            >
              <EmptyStateCard
                title="No favorites yet"
                description="Tap the heart on any restaurant card and it will appear here for quick access."
                actionLabel="Browse restaurants"
                onPress={openBrowse}
              />
            </View>
          )
        }
        onRefresh={() => {
          void Promise.all([
            favoriteRestaurantsQuery.refetch(),
            favoriteRestaurantIdsQuery.refetch(),
          ]);
        }}
        refreshing={isRefreshing}
        drawDistance={700}
        removeClippedSubviews
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 36,
    flexGrow: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 18,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
    gap: 4,
    paddingTop: 2,
  },
  kicker: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: palette.secondary,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    color: palette.foreground,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: palette.mutedForeground,
  },
  separator: {
    height: 14,
  },
  feedbackWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  loadingWrap: {
    width: "100%",
    paddingTop: 2,
    paddingBottom: 28,
  },
  skeletonList: {
    width: "100%",
    gap: 14,
  },
  skeletonCard: {
    overflow: "hidden",
    width: "100%",
    borderRadius: 14,
    backgroundColor: palette.surface,
  },
  skeletonImageWrap: {
    position: "relative",
    height: 132,
    backgroundColor: palette.surfaceMuted,
  },
  skeletonImage: {
    width: "100%",
    height: "100%",
    borderRadius: 0,
  },
  skeletonTopRow: {
    position: "absolute",
    top: 9,
    left: 9,
    right: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  skeletonStatusPill: {
    width: 92,
    height: 30,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.86)",
  },
  skeletonHeart: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  skeletonContent: {
    paddingHorizontal: 13,
    paddingTop: 10,
    paddingBottom: 11,
    gap: 10,
  },
  skeletonTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  skeletonCopy: {
    flex: 1,
    gap: 7,
  },
  skeletonTitle: {
    width: "76%",
    height: 18,
    borderRadius: 9,
  },
  skeletonSubtitle: {
    width: "62%",
    height: 12,
    borderRadius: 6,
  },
  skeletonPriceStack: {
    width: 86,
    alignItems: "flex-end",
    gap: 6,
  },
  skeletonPriceLabel: {
    width: 56,
    height: 10,
    borderRadius: 5,
  },
  skeletonPriceValue: {
    width: 76,
    height: 15,
    borderRadius: 8,
  },
  skeletonMetricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  skeletonMetric: {
    width: 72,
    height: 16,
    borderRadius: 8,
  },
  skeletonMetricSmall: {
    width: 52,
    height: 16,
    borderRadius: 8,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
});
