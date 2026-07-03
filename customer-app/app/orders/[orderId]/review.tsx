import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { RemoteImage } from "@/src/components/remote-image";
import { RiderRatingCard } from "@/src/components/orders/rider-rating-card";
import { Screen } from "@/src/components/screen";
import {
  useCustomerOrderDetailsQuery,
  useCustomerRestaurantDetailsQuery,
  useCustomerReviewMutation,
  useCustomerRiderReviewEnabledQuery,
} from "@/src/hooks/use-customer-api";
import { getRatingLabel } from "@/src/lib/rating-labels";
import { palette } from "@/src/theme/palette";

const QUICK_CHIPS = [
  "Great food",
  "On time",
  "Well packaged",
  "Good value",
  "Hot & fresh",
  "Will order again",
];

export default function OrderReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string }>();
  const orderId =
    typeof params.orderId === "string" ? params.orderId : undefined;

  const [rating, setRating] = useState(0);
  const [riderRating, setRiderRating] = useState(0);
  const [riderComment, setRiderComment] = useState("");
  const [comment, setComment] = useState("");
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const riderReviewEnabled =
    useCustomerRiderReviewEnabledQuery().data !== false;

  const orderQuery = useCustomerOrderDetailsQuery(orderId);
  const order = orderQuery.data;
  const restaurantQuery = useCustomerRestaurantDetailsQuery({
    restaurantId: order?.restaurantId ?? undefined,
  });
  const restaurant = restaurantQuery.data?.restaurant;
  const reviewMutation = useCustomerReviewMutation(orderId);

  const existingReview = order?.customerReview ?? null;
  const isDelivered = order?.status === "Delivered";
  const alreadyReviewed = Boolean(existingReview);
  const hasRider = Boolean(order?.riderSnapshot?.name);

  const restaurantName = restaurant?.name || "Restaurant";
  const restaurantImage =
    restaurant?.logo?.url || restaurant?.coverImage?.url || null;

  // Single native-driver pop when the rating changes — cheap, no loops.
  const starPop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (rating === 0) return;
    starPop.setValue(0.85);
    Animated.spring(starPop, {
      toValue: 1,
      friction: 5,
      tension: 140,
      useNativeDriver: true,
    }).start();
  }, [rating, starPop]);

  const composedComment = useMemo(() => {
    const chipText = selectedChips.join(", ");
    const typed = comment.trim();
    if (chipText && typed) return `${chipText}. ${typed}`;
    return chipText || typed;
  }, [comment, selectedChips]);

  const canSubmit =
    Boolean(orderId) &&
    isDelivered &&
    !alreadyReviewed &&
    rating > 0 &&
    !reviewMutation.isPending;

  const toggleChip = (chip: string) => {
    setSelectedChips((current) =>
      current.includes(chip)
        ? current.filter((value) => value !== chip)
        : [...current, chip],
    );
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      await reviewMutation.mutateAsync({
        rating,
        comment: composedComment || undefined,
        riderRating: riderRating > 0 ? riderRating : undefined,
        riderComment:
          riderRating > 0 && riderComment.trim()
            ? riderComment.trim()
            : undefined,
      });
      router.back();
    } catch {
      // The mutation surfaces its own error banner.
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerButton}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color={palette.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Rate your order</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {orderQuery.isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : !order ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="alert-circle-outline"
              size={32}
              color={palette.mutedForeground}
            />
            <Text style={styles.emptyText}>
              We couldn&apos;t find this order.
            </Text>
          </View>
        ) : (
          <>
            <Pressable
              style={({ pressed }) => [
                styles.restaurantCard,
                pressed ? styles.restaurantCardPressed : null,
              ]}
              onPress={() =>
                router.push({
                  pathname: "/orders/[orderId]/tracking",
                  params: { orderId: orderId ?? "" },
                })
              }
              accessibilityRole="button"
              accessibilityLabel="View order details"
            >
              <RemoteImage
                uri={restaurantImage}
                style={styles.restaurantImage}
                fallbackIcon="restaurant-outline"
                accessibilityLabel={restaurantName}
              />
              <View style={styles.restaurantCopy}>
                <Text style={styles.restaurantName} numberOfLines={1}>
                  {restaurantName}
                </Text>
                <View style={styles.orderNumberRow}>
                  <Text style={styles.orderNumber}>
                    Order #{order.orderNumber}
                  </Text>
                  {/* <Text style={styles.viewDetailsText}>View details</Text> */}
                </View>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={palette.placeholder}
              />
            </Pressable>

            {alreadyReviewed ? (
              <View style={styles.thankYouCard}>
                <View style={styles.thankYouBadge}>
                  <Ionicons name="checkmark" size={24} color="#fff" />
                </View>
                <Text style={styles.thankYouTitle}>
                  Thanks for your rating!
                </Text>
                <View style={styles.starRowStatic}>
                  {Array.from({ length: 5 }, (_, index) => (
                    <Ionicons
                      key={`done-star-${index}`}
                      name={
                        index < (existingReview?.rating ?? 0)
                          ? "star"
                          : "star-outline"
                      }
                      size={22}
                      color={palette.amber}
                    />
                  ))}
                </View>
                {existingReview?.comment ? (
                  <Text style={styles.thankYouComment}>
                    &ldquo;{existingReview.comment}&rdquo;
                  </Text>
                ) : null}
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => router.back()}
                >
                  <Text style={styles.secondaryButtonText}>Done</Text>
                </Pressable>
              </View>
            ) : !isDelivered ? (
              <View style={styles.emptyState}>
                <Ionicons
                  name="time-outline"
                  size={32}
                  color={palette.mutedForeground}
                />
                <Text style={styles.emptyText}>
                  You can rate this order once it&apos;s delivered.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.ratingCard}>
                  <Text style={styles.prompt}>How was your order?</Text>
                  <Animated.View
                    style={[
                      styles.starRow,
                      { transform: [{ scale: starPop }] },
                    ]}
                  >
                    {Array.from({ length: 5 }, (_, index) => {
                      const value = index + 1;
                      const active = value <= rating;
                      return (
                        <Pressable
                          key={`star-${value}`}
                          onPress={() => setRating(value)}
                          hitSlop={6}
                          style={({ pressed }) => [
                            styles.starButton,
                            pressed ? styles.starButtonPressed : null,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`${value} star`}
                        >
                          <Ionicons
                            name={active ? "star" : "star-outline"}
                            size={42}
                            color={active ? palette.amber : palette.border}
                          />
                        </Pressable>
                      );
                    })}
                  </Animated.View>
                  <Text
                    style={[
                      styles.ratingLabel,
                      rating > 0 ? styles.ratingLabelActive : null,
                    ]}
                  >
                    {getRatingLabel(rating)}
                  </Text>
                  <View style={styles.chipWrap}>
                    {QUICK_CHIPS.map((chip) => {
                      const active = selectedChips.includes(chip);
                      return (
                        <Pressable
                          key={chip}
                          onPress={() => toggleChip(chip)}
                          style={[
                            styles.chip,
                            active ? styles.chipActive : null,
                          ]}
                        >
                          {active ? (
                            <Ionicons
                              name="checkmark"
                              size={13}
                              color={palette.secondary}
                            />
                          ) : null}
                          <Text
                            style={[
                              styles.chipText,
                              active ? styles.chipTextActive : null,
                            ]}
                          >
                            {chip}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <TextInput
                  style={styles.commentInput}
                  value={comment}
                  onChangeText={setComment}
                  placeholder="Add a comment about the food and your order (optional)"
                  placeholderTextColor={palette.placeholder}
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                  textAlignVertical="top"
                />

                {hasRider && riderReviewEnabled ? (
                  <RiderRatingCard
                    value={riderRating}
                    onChange={setRiderRating}
                    comment={riderComment}
                    onCommentChange={setRiderComment}
                    riderName={order.riderSnapshot?.name}
                  />
                ) : null}

                <Pressable
                  style={({ pressed }) => [
                    styles.submitButton,
                    !canSubmit ? styles.submitButtonDisabled : null,
                    pressed && canSubmit ? styles.submitButtonPressed : null,
                  ]}
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                >
                  {reviewMutation.isPending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitButtonText}>Submit rating</Text>
                  )}
                </Pressable>
              </>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: palette.foreground,
  },
  content: {
    padding: 20,
    paddingBottom: 48,
    gap: 16,
  },
  loadingState: {
    paddingVertical: 80,
    alignItems: "center",
  },
  emptyState: {
    paddingVertical: 60,
    alignItems: "center",
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    color: palette.mutedForeground,
    textAlign: "center",
  },
  restaurantCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  restaurantCardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  orderNumberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  viewDetailsText: {
    fontSize: 12,
    fontWeight: "800",
    color: palette.secondary,
  },
  restaurantImage: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: palette.surfaceMuted,
  },
  restaurantCopy: {
    flex: 1,
    gap: 4,
  },
  restaurantName: {
    fontSize: 16,
    fontWeight: "800",
    color: palette.foreground,
  },
  orderNumber: {
    fontSize: 13,
    color: palette.mutedForeground,
  },
  ratingCard: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 22,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  prompt: {
    fontSize: 18,
    fontWeight: "800",
    color: palette.foreground,
    textAlign: "center",
  },
  starRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  starButton: {
    padding: 4,
  },
  starButtonPressed: {
    transform: [{ scale: 0.86 }],
  },
  ratingLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  ratingLabelActive: {
    fontSize: 15,
    fontWeight: "800",
    color: palette.amber,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: palette.foreground,
    marginTop: 2,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginTop: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  chipActive: {
    backgroundColor: "#FFF0F6",
    borderColor: palette.secondary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  chipTextActive: {
    color: palette.secondary,
  },
  commentInput: {
    minHeight: 110,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 14,
    fontSize: 14,
    color: palette.foreground,
  },
  submitButton: {
    marginTop: 6,
    height: 54,
    borderRadius: 18,
    backgroundColor: palette.secondary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: palette.secondary,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  submitButtonDisabled: {
    opacity: 0.45,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonPressed: {
    transform: [{ scale: 0.985 }],
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
  },
  thankYouCard: {
    alignItems: "center",
    gap: 12,
    padding: 24,
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  thankYouBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: palette.successText,
    alignItems: "center",
    justifyContent: "center",
  },
  thankYouTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: palette.foreground,
  },
  starRowStatic: {
    flexDirection: "row",
    gap: 4,
  },
  thankYouComment: {
    fontSize: 14,
    color: palette.mutedForeground,
    textAlign: "center",
    fontStyle: "italic",
  },
  secondaryButton: {
    marginTop: 6,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: palette.surfaceMuted,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: palette.foreground,
  },
});
