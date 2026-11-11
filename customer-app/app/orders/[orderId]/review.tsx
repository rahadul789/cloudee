import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RemoteImage } from "@/src/components/remote-image";
import { Screen } from "@/src/components/screen";
import { AppHeader, Chip, SectionHeading } from "@/src/components/ui";
import {
  useCustomerOrderDetailsQuery,
  useCustomerRestaurantDetailsQuery,
  useCustomerReviewMutation,
  useCustomerRiderReviewEnabledQuery,
} from "@/src/hooks/use-customer-api";
import { getRatingLabel } from "@/src/lib/rating-labels";
import {
  composePresetComment,
  getFoodPresets,
  getRiderPresets,
  isPositiveRating,
  keepValidPicks,
  RATING_EMOJI,
} from "@/src/lib/review-presets";
import { palette } from "@/src/theme/palette";

// One star row (food or rider). Native-driver "pop" on change, nothing looping.
function StarRow({
  value,
  onChange,
  size,
  labelPrefix,
}: {
  value: number;
  onChange: (next: number) => void;
  size: number;
  labelPrefix: string;
}) {
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (value === 0) return;
    pop.setValue(0.88);
    Animated.spring(pop, {
      toValue: 1,
      friction: 5,
      tension: 140,
      useNativeDriver: true,
    }).start();
  }, [value, pop]);

  return (
    <Animated.View style={[styles.starRow, { transform: [{ scale: pop }] }]}>
      {Array.from({ length: 5 }, (_, index) => {
        const star = index + 1;
        const active = star <= value;
        return (
          <Pressable
            key={star}
            onPress={() => onChange(star)}
            hitSlop={6}
            style={({ pressed }) => [styles.starButton, pressed ? styles.starPressed : null]}
            accessibilityRole="button"
            accessibilityLabel={`${labelPrefix} ${star} star${star === 1 ? "" : "s"}`}
            accessibilityState={{ selected: active }}
          >
            <Ionicons
              name={active ? "star" : "star-outline"}
              size={size}
              color={active ? palette.primary : "#D9DADD"}
            />
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

// Order rating: stars + preset chips only (no free text). Reached from the "rate your
// order" notification (/rate-order) and from order details/tracking.
export default function OrderReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ orderId?: string }>();
  const orderId = typeof params.orderId === "string" ? params.orderId : undefined;

  const [rating, setRating] = useState(0);
  const [foodPicks, setFoodPicks] = useState<string[]>([]);
  const [riderRating, setRiderRating] = useState(0);
  const [riderPicks, setRiderPicks] = useState<string[]>([]);
  const riderReviewEnabled = useCustomerRiderReviewEnabledQuery().data !== false;

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
  const riderName = order?.riderSnapshot?.name?.trim() || "";
  const showRider = Boolean(riderName) && riderReviewEnabled;

  const restaurantName = restaurant?.name || "Restaurant";
  const restaurantImage = restaurant?.logo?.url || restaurant?.coverImage?.url || null;

  const foodPresets = getFoodPresets(rating);
  const riderPresets = getRiderPresets(riderRating);

  const changeRating = (next: number) => {
    setRating(next);
    setFoodPicks((current) => keepValidPicks(current, getFoodPresets(next)));
  };
  const changeRiderRating = (next: number) => {
    setRiderRating(next);
    setRiderPicks((current) => keepValidPicks(current, getRiderPresets(next)));
  };
  const toggle = (list: string[], chip: string) =>
    list.includes(chip) ? list.filter((value) => value !== chip) : [...list, chip];

  const canSubmit =
    Boolean(orderId) && isDelivered && !alreadyReviewed && rating > 0 && !reviewMutation.isPending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      await reviewMutation.mutateAsync({
        rating,
        comment: composePresetComment(foodPicks),
        riderRating: showRider && riderRating > 0 ? riderRating : undefined,
        riderComment:
          showRider && riderRating > 0 ? composePresetComment(riderPicks) : undefined,
      });
      router.back();
    } catch {
      // The mutation surfaces its own error banner.
    }
  };

  const showForm = Boolean(order) && isDelivered && !alreadyReviewed;

  return (
    <Screen>
      <View style={styles.flex}>
        <AppHeader title="Rate your order" subtitle={order ? `Order #${order.orderNumber}` : undefined} />

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: showForm ? 120 + insets.bottom : 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {orderQuery.isLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={palette.secondary} />
            </View>
          ) : !order ? (
            <View style={styles.centerState}>
              <Ionicons name="alert-circle-outline" size={32} color={palette.mutedForeground} />
              <Text style={styles.centerText}>We couldn&apos;t find this order.</Text>
            </View>
          ) : (
            <>
              <View style={styles.restaurantRow}>
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
                  <Text style={styles.restaurantMeta}>Delivered order</Text>
                </View>
              </View>

              {alreadyReviewed ? (
                <View style={styles.doneCard}>
                  <View style={styles.doneBadge}>
                    <Ionicons name="checkmark" size={26} color={palette.onPrimary} />
                  </View>
                  <Text style={styles.doneTitle}>Thanks for your rating!</Text>
                  <View style={styles.starRowStatic}>
                    {Array.from({ length: 5 }, (_, index) => (
                      <Ionicons
                        key={index}
                        name={index < (existingReview?.rating ?? 0) ? "star" : "star-outline"}
                        size={22}
                        color={palette.primary}
                      />
                    ))}
                  </View>
                  {existingReview?.comment ? (
                    <View style={styles.doneChips}>
                      {existingReview.comment.split(",").map((part) =>
                        part.trim() ? <Chip key={part} label={part.trim()} active /> : null,
                      )}
                    </View>
                  ) : null}
                  <Pressable
                    style={({ pressed }) => [styles.ghostButton, pressed ? styles.pressed : null]}
                    onPress={() => router.back()}
                  >
                    <Text style={styles.ghostButtonText}>Done</Text>
                  </Pressable>
                </View>
              ) : !isDelivered ? (
                <View style={styles.centerState}>
                  <Ionicons name="time-outline" size={32} color={palette.mutedForeground} />
                  <Text style={styles.centerText}>
                    You can rate this order once it&apos;s delivered.
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.card}>
                    <Text style={styles.emoji}>{rating > 0 ? RATING_EMOJI[rating] : "🍽️"}</Text>
                    <Text style={styles.question}>How was the food?</Text>
                    <StarRow value={rating} onChange={changeRating} size={42} labelPrefix="Food" />
                    <Text style={[styles.ratingLabel, rating > 0 ? styles.ratingLabelActive : null]}>
                      {getRatingLabel(rating)}
                    </Text>
                  </View>

                  {foodPresets.length ? (
                    <View style={styles.block}>
                      <SectionHeading
                        icon={isPositiveRating(rating) ? "thumbs-up" : "alert-circle"}
                        title={isPositiveRating(rating) ? "What did you love?" : "What went wrong?"}
                        subtitle="Pick all that apply"
                      />
                      <View style={styles.chipWrap}>
                        {foodPresets.map((chip) => (
                          <Chip
                            key={chip}
                            label={chip}
                            icon={foodPicks.includes(chip) ? "checkmark" : undefined}
                            active={foodPicks.includes(chip)}
                            onPress={() => setFoodPicks((current) => toggle(current, chip))}
                          />
                        ))}
                      </View>
                    </View>
                  ) : null}

                  {showRider ? (
                    <View style={styles.card}>
                      <View style={styles.riderHead}>
                        <View style={styles.riderAvatar}>
                          <Ionicons name="bicycle" size={20} color={palette.onPrimary} />
                        </View>
                        <View style={styles.riderCopy}>
                          <Text style={styles.riderTitle}>How was {riderName}?</Text>
                          <Text style={styles.riderSub}>Your delivery rider · optional</Text>
                        </View>
                      </View>
                      <StarRow
                        value={riderRating}
                        onChange={changeRiderRating}
                        size={32}
                        labelPrefix="Rider"
                      />
                      {riderPresets.length ? (
                        <View style={[styles.chipWrap, styles.chipWrapCenter]}>
                          {riderPresets.map((chip) => (
                            <Chip
                              key={chip}
                              label={chip}
                              icon={riderPicks.includes(chip) ? "checkmark" : undefined}
                              active={riderPicks.includes(chip)}
                              onPress={() => setRiderPicks((current) => toggle(current, chip))}
                            />
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </>
              )}
            </>
          )}
        </ScrollView>

        {showForm ? (
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable
              style={({ pressed }) => [
                styles.submit,
                !canSubmit ? styles.submitDisabled : null,
                pressed && canSubmit ? styles.pressed : null,
              ]}
              onPress={handleSubmit}
              disabled={!canSubmit}
              accessibilityRole="button"
            >
              {reviewMutation.isPending ? (
                <ActivityIndicator color={palette.onPrimary} />
              ) : (
                <Text style={[styles.submitText, !canSubmit ? styles.submitTextDisabled : null]}>
                  {rating > 0 ? "Submit rating" : "Tap a star to continue"}
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.surface },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 18 },
  centerState: { alignItems: "center", gap: 10, paddingVertical: 48 },
  centerText: {
    fontSize: 14,
    lineHeight: 20,
    color: palette.mutedForeground,
    textAlign: "center",
  },
  restaurantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: palette.surfaceMuted,
  },
  restaurantImage: { width: 48, height: 48, borderRadius: 12 },
  restaurantCopy: { flex: 1, gap: 2 },
  restaurantName: { fontSize: 15.5, lineHeight: 20, fontWeight: "700", color: palette.foreground },
  restaurantMeta: { fontSize: 12.5, lineHeight: 17, color: palette.mutedForeground },
  card: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6E6E6",
  },
  emoji: { fontSize: 40, lineHeight: 48 },
  question: { fontSize: 19, lineHeight: 25, fontWeight: "700", color: palette.foreground },
  starRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  starRowStatic: { flexDirection: "row", gap: 4 },
  starButton: { padding: 2 },
  starPressed: { transform: [{ scale: 0.9 }] },
  ratingLabel: { fontSize: 14, lineHeight: 19, fontWeight: "500", color: palette.mutedForeground },
  ratingLabelActive: { color: palette.secondary, fontWeight: "700" },
  block: { gap: 12 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chipWrapCenter: { justifyContent: "center", marginTop: 4 },
  riderHead: { flexDirection: "row", alignItems: "center", gap: 12, alignSelf: "stretch" },
  riderAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  riderCopy: { flex: 1, gap: 1 },
  riderTitle: { fontSize: 16, lineHeight: 21, fontWeight: "700", color: palette.foreground },
  riderSub: { fontSize: 12.5, lineHeight: 17, color: palette.mutedForeground },
  doneCard: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 28,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "#FFF8EC",
  },
  doneBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  doneTitle: { fontSize: 19, lineHeight: 25, fontWeight: "700", color: palette.foreground },
  doneChips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  ghostButton: {
    marginTop: 4,
    paddingHorizontal: 28,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E3E4E6",
    backgroundColor: palette.surface,
  },
  ghostButtonText: { fontSize: 14.5, lineHeight: 19, fontWeight: "700", color: palette.foreground },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: palette.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E3E4E6",
  },
  submit: {
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  submitDisabled: { backgroundColor: palette.surfaceMuted },
  submitText: { fontSize: 15.5, lineHeight: 20, fontWeight: "700", color: palette.onPrimary },
  submitTextDisabled: { color: palette.mutedForeground },
  pressed: { opacity: 0.85 },
});
