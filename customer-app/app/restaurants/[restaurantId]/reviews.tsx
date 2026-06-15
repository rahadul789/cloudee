import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyStateCard } from "@/src/components/empty-state-card";
import { ReviewsSkeleton } from "@/src/components/loading-skeleton";
import { useCustomerRestaurantDetailsQuery } from "@/src/hooks/use-customer-api";
import { useLocationStore } from "@/src/store/location-store";
import { palette } from "@/src/theme/palette";
import type { CustomerRestaurantDetails } from "@/src/types/restaurant";

function formatReviewDate(value?: string) {
  if (!value) return "Recently";
  return new Date(value).toLocaleDateString("en-BD", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function buildReviewPreviewText(
  review: CustomerRestaurantDetails["recentReviews"][number]
) {
  const comment = review.comment?.trim();
  if (comment) {
    return comment;
  }

  return `Rated this place ${review.rating} out of 5.`;
}

function ReviewStars({ rating }: { rating: number }) {
  return (
    <View style={styles.reviewStarsRow}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Ionicons
          key={index}
          name={index < rating ? "star" : "star-outline"}
          size={13}
          color={index < rating ? "#F6B93B" : palette.mutedForeground}
        />
      ))}
    </View>
  );
}

export default function RestaurantReviewsScreen() {
  const router = useRouter();
  const { restaurantId } = useLocalSearchParams<{ restaurantId: string }>();
  const selectedLocation = useLocationStore((state) => state.selectedLocation);

  const detailsQuery = useCustomerRestaurantDetailsQuery({
    restaurantId,
    latitude: selectedLocation?.latitude,
    longitude: selectedLocation?.longitude,
  });

  const restaurant = detailsQuery.data?.restaurant;
  const recentReviews = detailsQuery.data?.recentReviews ?? [];
  const ratingCards = useMemo(() => {
    const totalReviews = restaurant?.reviewCount ?? 0;
    const avgRating =
      typeof restaurant?.avgRating === "number" && totalReviews > 0
        ? restaurant.avgRating.toFixed(1)
        : "New";

    return [
      {
        key: "average",
        icon: "star",
        label: "Average",
        value: avgRating,
        helper: totalReviews > 0 ? "out of 5" : "No rating yet",
      },
      {
        key: "count",
        icon: "people-outline",
        label: "Rated by",
        value: String(totalReviews),
        helper: totalReviews === 1 ? "customer" : "customers",
      },
    ];
  }, [restaurant?.avgRating, restaurant?.reviewCount]);

  if (detailsQuery.isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <ReviewsSkeleton />
      </SafeAreaView>
    );
  }

  if (detailsQuery.isError || !restaurant) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.centerState}>
          <EmptyStateCard
            title="Could not load reviews"
            description="Please go back and try again."
            actionLabel="Back"
            onPress={() => router.back()}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={palette.foreground} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>Reviews</Text>
            <Text style={styles.title}>{restaurant.name}</Text>
            <Text style={styles.subtitle}>
              {typeof restaurant.avgRating === "number" && (restaurant.reviewCount ?? 0) > 0
                ? `${restaurant.avgRating} average from ${restaurant.reviewCount} customer reviews`
                : "Customer feedback will appear here once reviews start coming in."}
            </Text>
          </View>
        </View>

        <View style={styles.ratingCardGrid}>
          {ratingCards.map((item, index) => {
            const isAverage = index === 0;
            return (
            <View
              key={item.key}
              style={[
                styles.ratingInfoCard,
                isAverage ? styles.ratingInfoCardAverage : styles.ratingInfoCardCount,
              ]}
            >
              <View
                style={[
                  styles.ratingInfoIconWrap,
                  isAverage ? styles.ratingInfoIconAverage : styles.ratingInfoIconCount,
                ]}
              >
                <Ionicons
                  name={item.icon as keyof typeof Ionicons.glyphMap}
                  size={17}
                  color={isAverage ? "#D49700" : palette.secondary}
                />
              </View>
              <View style={styles.ratingInfoCopy}>
                <Text style={styles.ratingInfoLabel}>{item.label}</Text>
                <Text style={styles.ratingInfoValue}>{item.value}</Text>
                <Text style={styles.ratingInfoHelper}>{item.helper}</Text>
              </View>
            </View>
          );
          })}
        </View>

        {recentReviews.length ? (
          <View style={styles.reviewList}>
            {recentReviews.map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewTopRow}>
                  <View style={styles.reviewIdentityRow}>
                    <View style={styles.reviewAvatar}>
                      <Text style={styles.reviewAvatarText}>
                        {(review.customerName ?? "F").trim().slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.reviewIdentityCopy}>
                      <Text style={styles.reviewCustomerName}>
                        {review.customerName ?? "Foodbela customer"}
                      </Text>
                      <View style={styles.reviewMetaRow}>
                        <ReviewStars rating={review.rating} />
                        <Text style={styles.reviewDate}>{formatReviewDate(review.createdAt)}</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <Text style={styles.reviewBody}>{buildReviewPreviewText(review)}</Text>

                {review.ownerReply?.message ? (
                  <View style={styles.replyCard}>
                    <Text style={styles.replyLabel}>Restaurant replied</Text>
                    <Text style={styles.replyBody}>{review.ownerReply.message}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyWrap}>
            <EmptyStateCard
              title="No reviews yet"
              description="This restaurant has not received customer reviews yet."
              actionLabel="Back to restaurant"
              onPress={() => router.back()}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    paddingBottom: 36,
    gap: 16,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 8,
    flexDirection: "row",
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    shadowColor: palette.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  kicker: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: palette.secondary,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    color: palette.foreground,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: palette.mutedForeground,
  },
  ratingCardGrid: {
    paddingHorizontal: 18,
    flexDirection: "row",
    gap: 8,
  },
  ratingInfoCard: {
    flex: 1,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: palette.shadow,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  ratingInfoCardAverage: {
    backgroundColor: "#FFE7BA",
    borderWidth: 1,
    borderColor: "#FFC76D",
  },
  ratingInfoCardCount: {
    backgroundColor: "#FFF0F6",
  },
  ratingInfoIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  ratingInfoIconAverage: {
    backgroundColor: "#FFD48A",
  },
  ratingInfoIconCount: {
    backgroundColor: "#FFD9E8",
  },
  ratingInfoCopy: {
    flex: 1,
    gap: 1,
  },
  ratingInfoLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: palette.mutedForeground,
    textTransform: "uppercase",
  },
  ratingInfoValue: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
    color: palette.foreground,
  },
  ratingInfoHelper: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  reviewList: {
    paddingHorizontal: 18,
    gap: 12,
  },
  reviewCard: {
    padding: 16,
    borderRadius: 24,
    backgroundColor: palette.surface,
    gap: 12,
    shadowColor: palette.shadow,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  reviewTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reviewIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  reviewAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFEAF3",
  },
  reviewAvatarText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.secondary,
  },
  reviewIdentityCopy: {
    flex: 1,
    gap: 3,
  },
  reviewCustomerName: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  reviewMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  reviewStarsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  reviewDate: {
    fontSize: 11,
    lineHeight: 15,
    color: palette.mutedForeground,
  },
  reviewBody: {
    fontSize: 13,
    lineHeight: 20,
    color: palette.foreground,
  },
  replyCard: {
    borderRadius: 18,
    padding: 12,
    backgroundColor: palette.surfaceMuted,
    gap: 4,
  },
  replyLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: palette.primary,
    textTransform: "uppercase",
  },
  replyBody: {
    fontSize: 12,
    lineHeight: 18,
    color: palette.foreground,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 20,
  },
  centerStateText: {
    fontSize: 14,
    lineHeight: 18,
    color: palette.foreground,
    fontWeight: "600",
  },
  emptyWrap: {
    paddingHorizontal: 18,
  },
});
