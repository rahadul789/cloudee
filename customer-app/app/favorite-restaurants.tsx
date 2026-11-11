import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";

import { ErrorRetryCard } from "@/src/components/error-retry-card";
import { BelaPullToRefresh } from "@/src/components/bela-pull-to-refresh";
import { ShimmerBlock } from "@/src/components/loading-skeleton";
import { PressableScale } from "@/src/components/pressable-scale";
import { getRestaurantCustomBadge } from "@/src/components/restaurant-hero-card";
import { RestaurantFeedRow } from "@/src/components/restaurant-feed-row";
import { Screen } from "@/src/components/screen";
import { AppHeader } from "@/src/components/ui";
import {
  useCustomerFavoriteRestaurantIdsQuery,
  useCustomerFavoriteRestaurantsQuery,
  useCustomerToggleFavoriteRestaurantMutation,
} from "@/src/hooks/use-customer-api";
import { openFirst } from "@/src/lib/open-first";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { useLocationStore } from "@/src/store/location-store";
import { palette } from "@/src/theme/palette";
import type { DiscoverableRestaurant } from "@/src/types/restaurant";

function cuisineLine(restaurant: DiscoverableRestaurant) {
  return restaurant.cuisineTypes?.slice(0, 2).join(", ") ?? "";
}

// Friendly empty / signed-out state: a heart "illustration" + two clear next steps.
function FavoritesEmpty({
  signedIn,
  onExplore,
  onSearch,
  onSignIn,
}: {
  signedIn: boolean;
  onExplore: () => void;
  onSearch: () => void;
  onSignIn: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.art}>
        <View style={[styles.artBubble, styles.artBubbleA]}>
          <Ionicons name="heart" size={14} color="#FF8A8A" />
        </View>
        <View style={[styles.artBubble, styles.artBubbleB]}>
          <Ionicons name="star" size={12} color={palette.primary} />
        </View>
        <View style={styles.artCircle}>
          <Ionicons name="heart" size={46} color={palette.onPrimary} />
        </View>
      </View>
      <Text style={styles.emptyTitle}>
        {signedIn ? "No favourites yet" : "Save the places you love"}
      </Text>
      <Text style={styles.emptyText}>
        {signedIn
          ? "Tap the ♡ on any restaurant and it will show up here, ready for your next order."
          : "Sign in to keep your favourite restaurants in one place on every device."}
      </Text>
      <PressableScale
        scaleTo={0.97}
        style={styles.primaryCta}
        onPress={signedIn ? onExplore : onSignIn}
        accessibilityRole="button"
      >
        <Ionicons
          name={signedIn ? "restaurant-outline" : "log-in-outline"}
          size={18}
          color={palette.onPrimary}
        />
        <Text style={styles.primaryCtaText}>
          {signedIn ? "Explore restaurants" : "Sign in"}
        </Text>
      </PressableScale>
      {signedIn ? (
        <PressableScale
          scaleTo={0.97}
          style={styles.secondaryCta}
          onPress={onSearch}
          accessibilityRole="button"
        >
          <Ionicons name="search" size={16} color={palette.foreground} />
          <Text style={styles.secondaryCtaText}>Search food</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

function FavoritesSkeleton() {
  return (
    <View style={styles.skeletonList}>
      {[0, 1, 2].map((index) => (
        <View key={index} style={styles.skeletonRow}>
          <ShimmerBlock style={styles.skeletonImage} />
          <View style={styles.skeletonBody}>
            <ShimmerBlock style={styles.skeletonLine} />
            <ShimmerBlock style={styles.skeletonLineShort} />
          </View>
        </View>
      ))}
    </View>
  );
}

// Saved restaurants (opened from Account → Favorites). Was a tab until the Hype tab took its slot.
export default function FavoriteRestaurantsScreen() {
  const router = useRouter();
  const customer = useCustomerAuthStore((state) => state.customer);
  const selectedLocation = useLocationStore((state) => state.selectedLocation);
  const favoritesQuery = useCustomerFavoriteRestaurantsQuery({
    latitude: selectedLocation?.latitude,
    longitude: selectedLocation?.longitude,
    radiusKm: 25,
  });
  const favoriteIdsQuery = useCustomerFavoriteRestaurantIdsQuery();
  const toggleFavorite = useCustomerToggleFavoriteRestaurantMutation();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const favoriteIds = useMemo(
    () => new Set(favoriteIdsQuery.data ?? []),
    [favoriteIdsQuery.data],
  );
  // Unhearting removes the card right away (the ids query is optimistic).
  const restaurants = useMemo(
    () =>
      openFirst(
        (favoritesQuery.data ?? []).filter((restaurant) => favoriteIds.has(restaurant._id)),
      ),
    [favoriteIds, favoritesQuery.data],
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([favoritesQuery.refetch(), favoriteIdsQuery.refetch()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [favoriteIdsQuery, favoritesQuery]);

  const signedIn = Boolean(customer);
  const isLoading = signedIn && favoritesQuery.isLoading && restaurants.length === 0;

  return (
    <Screen>
      <AppHeader
        title="Your favourites"
        subtitle={
          signedIn && restaurants.length
            ? `${restaurants.length} saved restaurant${restaurants.length === 1 ? "" : "s"}`
            : "Restaurants you love, in one place"
        }
      />
      <BelaPullToRefresh
        refreshing={signedIn && isRefreshing}
        // Guests have nothing to refresh.
        onRefresh={signedIn ? handleRefresh : () => undefined}
      >
      <FlashList
        data={signedIn ? restaurants : []}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          isLoading ? (
            <FavoritesSkeleton />
          ) : signedIn && favoritesQuery.isError ? (
            <ErrorRetryCard
              title="Couldn't load favourites"
              description="Check your connection and try again."
              onRetry={() => void favoritesQuery.refetch()}
              retrying={favoritesQuery.isFetching}
            />
          ) : (
            <FavoritesEmpty
              signedIn={signedIn}
              onExplore={() => router.push("/(tabs)")}
              onSearch={() => router.push("/search")}
              onSignIn={() =>
                router.push({ pathname: "/sign-in", params: { redirectTo: "/favorite-restaurants" } })
              }
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
                params: { restaurantId: item._id, source: "favorites" },
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
  list: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 },
  separator: { height: 20 },
  empty: { alignItems: "center", paddingTop: 48, paddingHorizontal: 24, gap: 10 },
  art: { width: 150, height: 130, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  artCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
    borderWidth: 8,
    borderColor: "#FFF1DC",
  },
  artBubble: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6E6E6",
  },
  artBubbleA: { top: 6, right: 8 },
  artBubbleB: { bottom: 10, left: 6 },
  emptyTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    color: palette.foreground,
    textAlign: "center",
  },
  emptyText: {
    maxWidth: 300,
    fontSize: 14,
    lineHeight: 20,
    color: palette.mutedForeground,
    textAlign: "center",
  },
  primaryCta: {
    marginTop: 10,
    height: 50,
    paddingHorizontal: 24,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: palette.primary,
  },
  primaryCtaText: { fontSize: 15, lineHeight: 20, fontWeight: "700", color: palette.onPrimary },
  secondaryCta: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#E3E4E6",
    backgroundColor: palette.surface,
  },
  secondaryCtaText: { fontSize: 14, lineHeight: 18, fontWeight: "700", color: palette.foreground },
  // Mirrors the restaurant list card: wide photo + two text lines.
  skeletonList: { gap: 20 },
  skeletonRow: { gap: 9 },
  skeletonImage: { width: "100%", aspectRatio: 2.3, borderRadius: 16 },
  skeletonBody: { gap: 8, paddingHorizontal: 2 },
  skeletonLine: { width: "62%", height: 15, borderRadius: 7 },
  skeletonLineShort: { width: "82%", height: 12, borderRadius: 6 },
});
