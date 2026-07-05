import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useRiderReviewsQuery, type RiderReview } from "@/src/hooks/use-rider-api";
import { palette } from "@/src/theme/palette";

const REVIEWS_PAGE_STEP = 20;

function formatReviewDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Stars({ rating, size = 15 }: { rating: number; size?: number }) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Ionicons
          key={value}
          name={value <= rating ? "star" : "star-outline"}
          size={size}
          color={value <= rating ? palette.warning : palette.border}
        />
      ))}
    </View>
  );
}

export default function RiderReviewsScreen() {
  const router = useRouter();
  const [pageSize, setPageSize] = useState(REVIEWS_PAGE_STEP);
  const reviewsQuery = useRiderReviewsQuery(true, pageSize);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const items = reviewsQuery.data?.items ?? [];
  const total = reviewsQuery.data?.total ?? items.length;
  const averageRating = reviewsQuery.data?.averageRating ?? 0;
  const canLoadMore = Boolean(
    total && items.length < total && !reviewsQuery.isFetching,
  );

  const rounded = useMemo(() => Math.round(averageRating), [averageRating]);

  async function refresh() {
    setIsRefreshing(true);
    try {
      await reviewsQuery.refetch();
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable
            style={styles.backButton}
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace("/(app)/profile" as never)
            }
          >
            <Ionicons name="chevron-back" size={20} color={palette.foreground} />
          </Pressable>
          <View style={styles.topCopy}>
            <Text style={styles.eyebrow}>Your ratings</Text>
            <Text style={styles.title}>Reviews</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor={palette.primary}
            />
          }
        >
          <View style={styles.summaryCard}>
            <View style={styles.summaryBlock}>
              <Text style={styles.summaryValue}>
                {averageRating ? averageRating.toFixed(1) : "--"}
              </Text>
              <Stars rating={rounded} />
              <Text style={styles.summaryLabel}>Average rating</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryBlock}>
              <Text style={styles.summaryValue}>{total}</Text>
              <Text style={styles.summaryLabel}>Total reviews</Text>
            </View>
          </View>

          {reviewsQuery.isLoading ? (
            <View style={styles.feedback}>
              <ActivityIndicator color={palette.primary} />
              <Text style={styles.feedbackText}>Loading reviews</Text>
            </View>
          ) : items.length === 0 ? (
            <View style={styles.feedback}>
              <Ionicons name="star-outline" size={28} color={palette.mutedForeground} />
              <Text style={styles.emptyText}>No reviews yet</Text>
              <Text style={styles.feedbackText}>
                Ratings customers leave for your deliveries will show up here.
              </Text>
            </View>
          ) : (
            <>
              {items.map((review: RiderReview) => (
                <View key={review._id} style={styles.reviewCard}>
                  <View style={styles.reviewTop}>
                    <Stars rating={Number(review.riderRating) || 0} />
                    <Text style={styles.reviewDate}>
                      {formatReviewDate(review.createdAt)}
                    </Text>
                  </View>
                  {review.riderComment ? (
                    <Text style={styles.reviewComment}>{review.riderComment}</Text>
                  ) : null}
                  {review.orderId ? (
                    <Text style={styles.reviewOrder}>
                      Order #{String(review.orderId).slice(-6).toUpperCase()}
                    </Text>
                  ) : null}
                </View>
              ))}
              {canLoadMore ? (
                <Pressable
                  style={styles.loadMoreButton}
                  onPress={() => setPageSize((current) => current + REVIEWS_PAGE_STEP)}
                >
                  <Text style={styles.loadMoreText}>Show more reviews</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 10,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  topCopy: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 21,
    fontWeight: "900",
    color: palette.foreground,
  },
  content: {
    padding: 18,
    gap: 12,
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingVertical: 16,
  },
  summaryBlock: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  summaryDivider: {
    width: 1,
    height: 48,
    backgroundColor: palette.border,
  },
  summaryValue: {
    fontSize: 26,
    fontWeight: "900",
    color: palette.foreground,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  starsRow: {
    flexDirection: "row",
    gap: 2,
  },
  feedback: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.mutedForeground,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "800",
    color: palette.foreground,
  },
  reviewCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 14,
    gap: 8,
  },
  reviewTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reviewDate: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  reviewComment: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    color: palette.foreground,
  },
  reviewOrder: {
    fontSize: 12,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  loadMoreButton: {
    minHeight: 44,
    borderRadius: 15,
    paddingHorizontal: 15,
    marginTop: 4,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadMoreText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
});
