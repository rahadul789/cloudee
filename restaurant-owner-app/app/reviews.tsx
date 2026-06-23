import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Screen } from "@/src/components/screen";
import {
  type OwnerReview,
  useOwnerReviewReplyMutation,
  useOwnerReviewsQuery,
} from "@/src/hooks/use-owner-api";
import { useOwnerTranslation } from "@/src/i18n/translations";
import { palette } from "@/src/theme/palette";

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

const REVIEWS_PAGE_STEP = 20;

export default function ReviewsScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { t } = useOwnerTranslation();
  const [reviewsPageSize, setReviewsPageSize] = useState(REVIEWS_PAGE_STEP);
  const reviewsQuery = useOwnerReviewsQuery(isFocused, reviewsPageSize);
  const replyMutation = useOwnerReviewReplyMutation();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [replyingId, setReplyingId] = useState("");
  const [replyText, setReplyText] = useState("");

  const items = reviewsQuery.data?.items ?? [];
  const total = reviewsQuery.data?.total ?? items.length;
  const canLoadMoreReviews = Boolean(
    total && items.length < total && !reviewsQuery.isFetching,
  );
  const averageRating = useMemo(() => {
    if (!items.length) return 0;
    const sum = items.reduce((acc, review) => acc + (Number(review.rating) || 0), 0);
    return Math.round((sum / items.length) * 10) / 10;
  }, [items]);

  async function refresh() {
    setIsRefreshing(true);
    try {
      await reviewsQuery.refetch();
    } finally {
      setIsRefreshing(false);
    }
  }

  async function submitReply(review: OwnerReview) {
    const message = replyText.trim();
    if (!message) return;
    try {
      await replyMutation.mutateAsync({
        reviewId: review._id ?? review.id ?? "",
        message,
      });
      setReplyingId("");
      setReplyText("");
      Alert.alert(t("reviews.replySaved"));
    } catch (error) {
      Alert.alert(
        t("reviews.replyFailed"),
        error instanceof Error ? error.message : t("reviews.replyFailed"),
      );
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/(tabs)/today" as never)
          }
        >
          <Ionicons name="chevron-back" size={20} color={palette.foreground} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{t("reviews.title")}</Text>
          <Text style={styles.headerSubtitle}>{t("reviews.subtitle")}</Text>
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
            <Stars rating={Math.round(averageRating)} />
            <Text style={styles.summaryLabel}>{t("reviews.averageRating")}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryBlock}>
            <Text style={styles.summaryValue}>{total}</Text>
            <Text style={styles.summaryLabel}>{t("reviews.totalReviews")}</Text>
          </View>
        </View>

        {reviewsQuery.isLoading ? (
          <View style={styles.feedback}>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.feedbackText}>{t("reviews.loading")}</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.feedback}>
            <Ionicons name="star-outline" size={28} color={palette.mutedForeground} />
            <Text style={styles.emptyText}>{t("reviews.empty")}</Text>
          </View>
        ) : (
          <>
            {items.map((review) => {
            const reviewId = review._id ?? review.id ?? "";
            const hasReply = Boolean(review.ownerReply?.message?.trim());
            const isReplying = replyingId === reviewId;
            return (
              <View key={reviewId} style={styles.reviewCard}>
                <View style={styles.reviewTop}>
                  <Stars rating={Number(review.rating) || 0} />
                  <Text style={styles.reviewDate}>{formatReviewDate(review.createdAt)}</Text>
                </View>
                {review.comment ? (
                  <Text style={styles.reviewComment}>{review.comment}</Text>
                ) : null}
                {review.orderId ? (
                  <Text style={styles.reviewOrder}>
                    {t("reviews.order")} #{String(review.orderId).slice(-6).toUpperCase()}
                  </Text>
                ) : null}

                {hasReply ? (
                  <View style={styles.replyBox}>
                    <Text style={styles.replyLabel}>{t("reviews.yourReply")}</Text>
                    <Text style={styles.replyText}>{review.ownerReply?.message}</Text>
                  </View>
                ) : isReplying ? (
                  <View style={styles.replyForm}>
                    <TextInput
                      style={styles.replyInput}
                      value={replyText}
                      onChangeText={setReplyText}
                      placeholder={t("reviews.replyPlaceholder")}
                      placeholderTextColor={palette.mutedForeground}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      autoFocus
                    />
                    <View style={styles.replyActions}>
                      <Pressable
                        style={[styles.replyButton, styles.replyCancel]}
                        onPress={() => {
                          setReplyingId("");
                          setReplyText("");
                        }}
                      >
                        <Text style={styles.replyCancelText}>{t("orders.cancel")}</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.replyButton, styles.replySubmit]}
                        onPress={() => void submitReply(review)}
                        disabled={replyMutation.isPending || !replyText.trim()}
                      >
                        {replyMutation.isPending ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.replySubmitText}>{t("reviews.reply")}</Text>
                        )}
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    style={styles.replyTrigger}
                    onPress={() => {
                      setReplyingId(reviewId);
                      setReplyText("");
                    }}
                  >
                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={15}
                      color={palette.primary}
                    />
                    <Text style={styles.replyTriggerText}>{t("reviews.reply")}</Text>
                  </Pressable>
                )}
              </View>
            );
            })}
            {canLoadMoreReviews ? (
              <Pressable
                style={styles.loadMoreButton}
                onPress={() =>
                  setReviewsPageSize((current) => current + REVIEWS_PAGE_STEP)
                }
              >
                <Text style={styles.loadMoreText}>
                  {t("reviews.showMoreReviews")}
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  header: {
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
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: "900",
    color: palette.foreground,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "600",
    color: palette.mutedForeground,
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
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.mutedForeground,
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
  replyBox: {
    marginTop: 2,
    borderRadius: 12,
    backgroundColor: palette.surfaceMuted,
    padding: 10,
    gap: 3,
  },
  replyLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: palette.primary,
    textTransform: "uppercase",
  },
  replyText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.foreground,
  },
  replyTrigger: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  replyTriggerText: {
    fontSize: 13,
    fontWeight: "800",
    color: palette.primary,
  },
  replyForm: {
    gap: 10,
  },
  replyInput: {
    minHeight: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: palette.foreground,
  },
  replyActions: {
    flexDirection: "row",
    gap: 10,
  },
  replyButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  replyCancel: {
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  replyCancelText: {
    fontSize: 14,
    fontWeight: "800",
    color: palette.foreground,
  },
  replySubmit: {
    backgroundColor: palette.primary,
  },
  replySubmitText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
