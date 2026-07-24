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
import { AppBottomSheet } from "@/src/components/app-bottom-sheet";
import {
  type OwnerReview,
  useOwnerReviewHideRequestMutation,
  useOwnerReviewReplyMutation,
  useOwnerReviewsQuery,
} from "@/src/hooks/use-owner-api";
import { useOwnerTranslation } from "@/src/i18n/translations";
import { localizeDigits } from "@/src/lib/format";
import { palette } from "@/src/theme/palette";

// Date + time, so the owner can tell apart several reviews left on the same day.
function formatReviewDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const formatted = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return localizeDigits(formatted);
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
type ReviewHideReasonCategory =
  | "fake_spam"
  | "abusive_language"
  | "wrong_restaurant_or_order"
  | "unfair_misleading"
  | "other";

const reviewHideReasonOptions: ReviewHideReasonCategory[] = [
  "fake_spam",
  "abusive_language",
  "wrong_restaurant_or_order",
  "unfair_misleading",
  "other",
];

function getHideRequestStatus(review: OwnerReview) {
  return review.ownerHideRequest?.status ?? "none";
}

function isReviewHidden(review: OwnerReview) {
  return review.isHidden === true || review.moderationStatus === "hidden";
}

function canRequestReviewHide(review: OwnerReview) {
  const status = getHideRequestStatus(review);
  return !isReviewHidden(review) && status !== "pending";
}

export default function ReviewsScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { t } = useOwnerTranslation();
  const [reviewsPageSize, setReviewsPageSize] = useState(REVIEWS_PAGE_STEP);
  const reviewsQuery = useOwnerReviewsQuery(isFocused, reviewsPageSize);
  const replyMutation = useOwnerReviewReplyMutation();
  const hideRequestMutation = useOwnerReviewHideRequestMutation();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [replyingId, setReplyingId] = useState("");
  const [replyText, setReplyText] = useState("");
  const [hideRequestTarget, setHideRequestTarget] = useState<OwnerReview | null>(null);
  const [hideRequestReason, setHideRequestReason] =
    useState<ReviewHideReasonCategory>("unfair_misleading");
  const [hideRequestNote, setHideRequestNote] = useState("");

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

  async function submitHideRequest() {
    const reviewId = hideRequestTarget?._id ?? hideRequestTarget?.id ?? "";
    if (!reviewId) return;
    try {
      await hideRequestMutation.mutateAsync({
        reviewId,
        reasonCategory: hideRequestReason,
        note: hideRequestNote.trim(),
      });
      setHideRequestTarget(null);
      setHideRequestNote("");
      Alert.alert(t("reviews.hideRequestSent"));
    } catch (error) {
      Alert.alert(
        t("reviews.hideRequestFailed"),
        error instanceof Error ? error.message : t("reviews.hideRequestFailed"),
      );
    }
  }

  return (
    <Screen>
      <AppBottomSheet
        visible={Boolean(hideRequestTarget)}
        onClose={() => setHideRequestTarget(null)}
        title={t("reviews.hideRequestTitle")}
        subtitle={t("reviews.hideRequestSubtitle")}
        leadingIcon="eye-off-outline"
        snapPoints={[0.76, 0.92]}
      >
        <View style={styles.hideSheetContent}>
          <Text style={styles.hideSheetLabel}>{t("reviews.hideReason")}</Text>
          <View style={styles.hideReasonList}>
            {reviewHideReasonOptions.map((reason) => {
              const selected = hideRequestReason === reason;
              return (
                <Pressable
                  key={reason}
                  style={[styles.hideReasonOption, selected ? styles.hideReasonOptionActive : null]}
                  onPress={() => setHideRequestReason(reason)}
                >
                  <View style={[styles.hideReasonRadio, selected ? styles.hideReasonRadioActive : null]}>
                    {selected ? <View style={styles.hideReasonRadioDot} /> : null}
                  </View>
                  <Text style={styles.hideReasonText}>
                    {t(`reviews.hideReason.${reason}` as never)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            style={styles.hideNoteInput}
            value={hideRequestNote}
            onChangeText={(value) => setHideRequestNote(value.slice(0, 500))}
            placeholder={t("reviews.hideNotePlaceholder")}
            placeholderTextColor={palette.mutedForeground}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <View style={styles.replyActions}>
            <Pressable
              style={[styles.replyButton, styles.replyCancel]}
              onPress={() => setHideRequestTarget(null)}
              disabled={hideRequestMutation.isPending}
            >
              <Text style={styles.replyCancelText}>{t("orders.cancel")}</Text>
            </Pressable>
            <Pressable
              style={[styles.replyButton, styles.replySubmit]}
              onPress={() => void submitHideRequest()}
              disabled={hideRequestMutation.isPending}
            >
              {hideRequestMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.replySubmitText}>{t("reviews.requestHide")}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </AppBottomSheet>

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
              {averageRating ? localizeDigits(averageRating.toFixed(1)) : "--"}
            </Text>
            <Stars rating={Math.round(averageRating)} />
            <Text style={styles.summaryLabel}>{t("reviews.averageRating")}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryBlock}>
            <Text style={styles.summaryValue}>
              {localizeDigits(String(total))}
            </Text>
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
            const hidden = isReviewHidden(review);
            const hideStatus = getHideRequestStatus(review);
            return (
              <View key={reviewId} style={styles.reviewCard}>
                <View style={styles.reviewTop}>
                  <Stars rating={Number(review.rating) || 0} />
                  <Text style={styles.reviewDate}>{formatReviewDate(review.createdAt)}</Text>
                </View>
                {hidden || hideStatus === "pending" || hideStatus === "rejected" ? (
                  <View style={styles.badgeRow}>
                    {hidden ? (
                      <View style={[styles.statusBadge, styles.hiddenBadge]}>
                        <Ionicons name="eye-off-outline" size={13} color={palette.success} />
                        <Text style={[styles.statusBadgeText, styles.hiddenBadgeText]}>
                          {t("reviews.hiddenBadge")}
                        </Text>
                      </View>
                    ) : hideStatus === "pending" ? (
                      <View style={[styles.statusBadge, styles.pendingBadge]}>
                        <Ionicons name="time-outline" size={13} color={palette.warning} />
                        <Text style={[styles.statusBadgeText, styles.pendingBadgeText]}>
                          {t("reviews.pendingHideBadge")}
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.statusBadge, styles.rejectedBadge]}>
                        <Ionicons name="alert-circle-outline" size={13} color={palette.mutedForeground} />
                        <Text style={[styles.statusBadgeText, styles.rejectedBadgeText]}>
                          {t("reviews.rejectedHideBadge")}
                        </Text>
                      </View>
                    )}
                  </View>
                ) : null}
                {hidden ? (
                  <Text style={styles.visibilityNotice}>{t("reviews.hiddenNotice")}</Text>
                ) : hideStatus === "pending" ? (
                  <Text style={styles.visibilityNotice}>{t("reviews.pendingHideNotice")}</Text>
                ) : null}
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
                {canRequestReviewHide(review) ? (
                  <Pressable
                    style={styles.hideTrigger}
                    onPress={() => {
                      setHideRequestTarget(review);
                      setHideRequestReason("unfair_misleading");
                      setHideRequestNote("");
                    }}
                    disabled={hideRequestMutation.isPending}
                  >
                    <Ionicons name="eye-off-outline" size={15} color={palette.danger} />
                    <Text style={styles.hideTriggerText}>{t("reviews.requestHide")}</Text>
                  </Pressable>
                ) : null}
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
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  statusBadge: {
    minHeight: 26,
    borderRadius: 13,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statusBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
  },
  hiddenBadge: {
    backgroundColor: palette.successSoft,
  },
  hiddenBadgeText: {
    color: palette.success,
  },
  pendingBadge: {
    backgroundColor: palette.warningSoft,
  },
  pendingBadgeText: {
    color: palette.warning,
  },
  rejectedBadge: {
    backgroundColor: palette.surfaceMuted,
  },
  rejectedBadgeText: {
    color: palette.mutedForeground,
  },
  visibilityNotice: {
    borderRadius: 12,
    backgroundColor: palette.surfaceMuted,
    padding: 10,
    fontSize: 12,
    lineHeight: 17,
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
  hideTrigger: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  hideTriggerText: {
    fontSize: 13,
    fontWeight: "800",
    color: palette.danger,
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
  hideSheetContent: {
    gap: 12,
  },
  hideSheetLabel: {
    fontSize: 13,
    fontWeight: "900",
    color: palette.foreground,
  },
  hideReasonList: {
    gap: 8,
  },
  hideReasonOption: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  hideReasonOptionActive: {
    borderColor: palette.primary,
    backgroundColor: palette.primarySoft,
  },
  hideReasonRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  hideReasonRadioActive: {
    borderColor: palette.primary,
  },
  hideReasonRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.primary,
  },
  hideReasonText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  hideNoteInput: {
    minHeight: 100,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: palette.foreground,
  },
});
