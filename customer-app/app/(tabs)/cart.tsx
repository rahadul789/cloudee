import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ButtonParticleBurst } from "@/src/components/button-particle-burst";
import { styles } from "@/src/components/cart/cart-screen.styles";
import { EmptyStateCard } from "@/src/components/empty-state-card";
import { OfflineNoticeCard } from "@/src/components/offline-notice-card";
import { RemoteImage } from "@/src/components/remote-image";
import { Screen } from "@/src/components/screen";
import {
  useCustomerCartQuoteQuery,
  useCustomerRestaurantDetailsQuery,
} from "@/src/hooks/use-customer-api";
import { useIsOnline } from "@/src/hooks/use-network-status";
import { useRetainedTabContent } from "@/src/hooks/use-retained-tab-content";
import { applyCurrentLocation } from "@/src/lib/current-location";
import { trackCustomerEvent } from "@/src/lib/analytics";
import { formatCurrency } from "@/src/lib/currency";
import { formatShortOrderIdLabel } from "@/src/lib/order-id";
import {
  buildStartingPrice,
  hasCustomizations,
} from "@/src/lib/restaurant-menu";
import {
  getRestaurantOutOfDeliveryAreaCopy,
  isRestaurantOutOfDeliveryAreaError,
} from "@/src/lib/serviceability";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import {
  buildCartItemKey,
  getCartItemCount,
  getCartSubtotal,
  useCartStore,
} from "@/src/store/cart-store";
import { useLocationStore } from "@/src/store/location-store";
import { palette } from "@/src/theme/palette";
import type {
  CustomerRestaurantMenuItem,
  CustomerVoucherOffer,
} from "@/src/types/restaurant";

function formatSelectedOptions(
  options: { groupName: string; optionLabel: string }[],
) {
  if (options.length === 0) {
    return null;
  }

  const groupedOptions = new Map<string, Map<string, number>>();

  options.forEach((option) => {
    const groupName = option.groupName?.trim() || "Option";
    const optionLabel = option.optionLabel?.trim() || "Selected";
    const optionCounts =
      groupedOptions.get(groupName) ?? new Map<string, number>();
    optionCounts.set(optionLabel, (optionCounts.get(optionLabel) ?? 0) + 1);
    groupedOptions.set(groupName, optionCounts);
  });

  return Array.from(groupedOptions.entries())
    .map(([groupName, optionCounts]) => {
      const summary = Array.from(optionCounts.entries())
        .map(([optionLabel, count]) =>
          count > 1 ? `${optionLabel} x${count}` : optionLabel,
        )
        .join(", ");

      return `${groupName}: ${summary}`;
    })
    .join(" • ");
}

function estimateAutoDiscount(
  offer: CustomerVoucherOffer | null,
  subtotal: number,
  deliveryFee: number,
) {
  if (!offer || offer.mode !== "auto") {
    return 0;
  }

  const minimumOrderAmount = offer.minimumOrderAmount ?? 0;
  if (minimumOrderAmount > 0 && subtotal < minimumOrderAmount) {
    return 0;
  }

  if (offer.type === "free_delivery") {
    return Math.max(0, deliveryFee);
  }

  if (offer.type === "percentage" && typeof offer.discountValue === "number") {
    const rawDiscount = subtotal * (offer.discountValue / 100);
    const cappedDiscount =
      typeof offer.maximumDiscountAmount === "number" &&
      offer.maximumDiscountAmount > 0
        ? Math.min(rawDiscount, offer.maximumDiscountAmount)
        : rawDiscount;
    return Math.max(0, Math.min(subtotal, cappedDiscount));
  }

  if (typeof offer.discountValue === "number") {
    return Math.max(0, Math.min(subtotal, offer.discountValue));
  }

  return 0;
}

function CartQuantityPlusButton({ onPress }: { onPress: () => void }) {
  const [burstKey, setBurstKey] = useState(0);
  const handlePress = useCallback(() => {
    onPress();
    setBurstKey((current) => current + 1);
  }, [onPress]);
  const handleBurstComplete = useCallback((finishedKey: number) => {
    setBurstKey((current) => (current === finishedKey ? 0 : current));
  }, []);

  return (
    <Pressable
      onPressIn={handlePress}
      style={({ pressed }) => [
        styles.quantityButton,
        styles.quantityButtonPrimary,
        pressed ? styles.quantityButtonPressed : null,
      ]}
    >
      <Ionicons name="add" size={15} color="#fff" />
      {burstKey > 0 ? (
        <ButtonParticleBurst
          triggerKey={burstKey}
          onComplete={handleBurstComplete}
        />
      ) : null}
    </Pressable>
  );
}

export default function CartScreen() {
  const router = useRouter();
  const isCartFocused = useIsFocused();
  const shouldRenderCartContent = useRetainedTabContent(isCartFocused, 0);
  // Read cart contents directly (not gated on focus) so the screen keeps showing the
  // real items during a navigation transition. Previously these were swapped to empty
  // values the moment focus was lost, which made the cart flash its empty state while
  // pushing to restaurant details ("Add more") or to checkout. The network savings the
  // gating provided are preserved by disabling the quote/details queries while blurred.
  const restaurant = useCartStore((state) => state.restaurant);
  const items = useCartStore((state) => state.items);
  const reorderContext = useCartStore((state) =>
    isCartFocused ? state.reorderContext : null,
  );
  const setReorderContext = useCartStore((state) => state.setReorderContext);
  const addItem = useCartStore((state) => state.addItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const syncPricing = useCartStore((state) => state.syncPricing);
  const selectedLocation = useLocationStore((state) => state.selectedLocation);
  const customer = useCustomerAuthStore((state) => state.customer);
  const isOnline = useIsOnline();
  const offerUnlockAnim = useRef(new Animated.Value(1)).current;
  const [isUsingCurrentLocation, setIsUsingCurrentLocation] = useState(false);
  const [isWaitingForLocationQuote, setIsWaitingForLocationQuote] =
    useState(false);

  const quoteQuery = useCustomerCartQuoteQuery({
    restaurantId: isCartFocused ? restaurant?.restaurantId : undefined,
    items: items.map((item) => ({
      itemId: item.itemId,
      quantity: item.quantity,
      selectedVariantOptions: item.selectedVariantOptions,
      selectedAddOnOptions: item.selectedAddOnOptions,
    })),
    latitude: selectedLocation?.latitude,
    longitude: selectedLocation?.longitude,
  });

  const itemCount = getCartItemCount(items);
  const localSubtotal = getCartSubtotal(items);
  const pricing = quoteQuery.data?.pricing;
  const shouldUseQuotedPricing =
    Boolean(quoteQuery.data) && !quoteQuery.isPlaceholderData;
  const quotedItemsByKey = useMemo(
    () =>
      new Map(
        (quoteQuery.data?.items ?? []).map((item) => [
          buildCartItemKey({
            itemId: item.itemId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            selectedVariantOptions: item.selectedVariantOptions,
            selectedAddOnOptions: item.selectedAddOnOptions,
          }),
          item,
        ]),
      ),
    [quoteQuery.data?.items],
  );
  const priceChangedCount = useMemo(() => {
    if (!shouldUseQuotedPricing) {
      return 0;
    }

    return items.reduce((count, item) => {
      const quotedItem = quotedItemsByKey.get(item.key);
      return quotedItem && quotedItem.unitPrice !== item.unitPrice
        ? count + 1
        : count;
    }, 0);
  }, [items, quotedItemsByKey, shouldUseQuotedPricing]);
  const hasQuoteIssues = quoteQuery.isError;
  const quoteErrorMessage =
    quoteQuery.error instanceof Error
      ? quoteQuery.error.message
      : "We could not verify your cart with the latest restaurant pricing.";
  const isServiceabilityBlocked =
    hasQuoteIssues && isRestaurantOutOfDeliveryAreaError(quoteErrorMessage);
  const isCheckingDeliveryArea =
    isUsingCurrentLocation || isWaitingForLocationQuote;
  const shouldShowQuoteIssue = hasQuoteIssues && !isCheckingDeliveryArea;
  const checkoutDisabled =
    isCheckingDeliveryArea ||
    (hasQuoteIssues && !isServiceabilityBlocked) ||
    quoteQuery.isLoading ||
    !isOnline;
  const restaurantDetailsQuery = useCustomerRestaurantDetailsQuery({
    restaurantId: isCartFocused ? restaurant?.restaurantId : undefined,
    latitude: selectedLocation?.latitude,
    longitude: selectedLocation?.longitude,
  });
  const canShowRecommendedItems =
    restaurantDetailsQuery.data?.restaurant?.isOpen !== false;
  const cartRecommendationConfig =
    restaurantDetailsQuery.data?.cartRecommendations;
  const cartItemIds = useMemo(
    () => new Set(items.map((item) => item.itemId)),
    [items],
  );
  const recommendedItems = useMemo(() => {
    if (
      !canShowRecommendedItems ||
      cartRecommendationConfig?.isActive === false
    ) {
      return [];
    }

    const source = cartRecommendationConfig?.source ?? "both";
    const maxItems = Math.max(
      1,
      Math.min(20, cartRecommendationConfig?.maxItems ?? 8),
    );
    const menuItems = restaurantDetailsQuery.data?.menuItems ?? [];
    const availableItems = menuItems.filter(
      (item) =>
        item.availability !== "unavailable" && !cartItemIds.has(item._id),
    );
    const itemsById = new Map(menuItems.map((item) => [item._id, item]));
    const recommendations: CustomerRestaurantMenuItem[] = [];
    const seenIds = new Set<string>();

    const pushCandidate = (item?: CustomerRestaurantMenuItem) => {
      if (
        !item ||
        item.availability === "unavailable" ||
        cartItemIds.has(item._id) ||
        seenIds.has(item._id)
      ) {
        return;
      }
      seenIds.add(item._id);
      recommendations.push(item);
    };

    if (source === "manual" || source === "both") {
      items.forEach((cartItem) => {
        const menuItem = itemsById.get(cartItem.itemId);
        (menuItem?.recommendedItemIds ?? []).forEach((recommendedItemId) => {
          pushCandidate(itemsById.get(String(recommendedItemId)));
        });
      });
    }

    if (source === "auto" || source === "both") {
      availableItems
        .filter((item) => !seenIds.has(item._id))
        .sort((left, right) => {
          const popularityDelta =
            Number(Boolean(right.isPopular)) - Number(Boolean(left.isPopular));
          if (popularityDelta !== 0) return popularityDelta;
          return buildStartingPrice(left) - buildStartingPrice(right);
        })
        .forEach(pushCandidate);
    }

    return recommendations.slice(0, maxItems);
  }, [
    canShowRecommendedItems,
    cartRecommendationConfig?.isActive,
    cartRecommendationConfig?.maxItems,
    cartRecommendationConfig?.source,
    cartItemIds,
    items,
    restaurantDetailsQuery.data?.menuItems,
  ]);
  const autoAppliedOffer = useMemo(
    () =>
      restaurantDetailsQuery.data?.activeOffers.find(
        (offer) =>
          offer.mode === "auto" && typeof offer.minimumOrderAmount === "number",
      ) ?? null,
    [restaurantDetailsQuery.data?.activeOffers],
  );
  const appliedAutoVoucher = useMemo(
    () =>
      quoteQuery.data?.appliedVouchers.find(
        (voucher) =>
          voucher.mode === "auto" && (voucher.discountAmount ?? 0) > 0,
      ) ?? null,
    [quoteQuery.data?.appliedVouchers],
  );
  const displayPricing = useMemo(() => {
    if (shouldUseQuotedPricing && pricing) {
      return pricing;
    }

    const deliveryFee = pricing?.deliveryFee ?? 0;
    const discountAmount = estimateAutoDiscount(
      autoAppliedOffer,
      localSubtotal,
      deliveryFee,
    );

    return {
      subtotal: localSubtotal,
      deliveryFee,
      discountAmount,
      total: Math.max(0, localSubtotal + deliveryFee - discountAmount),
    };
  }, [autoAppliedOffer, localSubtotal, pricing, shouldUseQuotedPricing]);
  const displayDiscountLabel =
    displayPricing.discountAmount > 0
      ? (appliedAutoVoucher?.name ?? autoAppliedOffer?.name ?? "Discount")
      : "";
  const offerProgress = useMemo(() => {
    if (!autoAppliedOffer || !autoAppliedOffer.minimumOrderAmount) {
      return null;
    }

    const target = Math.max(autoAppliedOffer.minimumOrderAmount, 1);
    const subtotal = displayPricing.subtotal;
    const remaining = Math.max(0, target - subtotal);
    const ratio = Math.max(0, Math.min(1, subtotal / target));
    const unlocked = remaining <= 0;

    return { target, subtotal, remaining, ratio, unlocked };
  }, [autoAppliedOffer, displayPricing.subtotal]);

  useEffect(() => {
    if (!shouldUseQuotedPricing || !quoteQuery.data?.items?.length) {
      return;
    }

    syncPricing(
      quoteQuery.data.items.map((item) => ({
        key: buildCartItemKey({
          itemId: item.itemId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          selectedVariantOptions: item.selectedVariantOptions,
          selectedAddOnOptions: item.selectedAddOnOptions,
        }),
        unitPrice: item.unitPrice,
      })),
    );
  }, [quoteQuery.data?.items, shouldUseQuotedPricing, syncPricing]);

  useEffect(() => {
    if (!offerProgress?.unlocked) {
      offerUnlockAnim.setValue(1);
      return;
    }

    Animated.sequence([
      Animated.timing(offerUnlockAnim, {
        toValue: 1.03,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(offerUnlockAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [offerProgress?.unlocked, offerUnlockAnim]);

  useEffect(() => {
    if (!isWaitingForLocationQuote) {
      return;
    }

    if (!quoteQuery.isLoading && !quoteQuery.isFetching) {
      setIsWaitingForLocationQuote(false);
    }
  }, [isWaitingForLocationQuote, quoteQuery.isFetching, quoteQuery.isLoading]);

  async function handleCheckout() {
    if (
      !restaurant ||
      items.length === 0 ||
      isCheckingDeliveryArea ||
      quoteQuery.isLoading ||
      !isOnline
    )
      return;

    if (isServiceabilityBlocked) {
      router.push("/location-picker");
      return;
    }

    if (hasQuoteIssues) return;

    if (!selectedLocation) {
      router.push("/location-picker");
      return;
    }

    if (!customer) {
      router.push({
        pathname: "/sign-in",
        params: { redirectTo: "/checkout" },
      });
      return;
    }

    router.push("/checkout");
  }

  async function handleUseCurrentLocation() {
    if (isUsingCurrentLocation || isWaitingForLocationQuote) {
      return;
    }

    setIsUsingCurrentLocation(true);
    try {
      await applyCurrentLocation();
      setIsWaitingForLocationQuote(true);
    } catch {
      setIsWaitingForLocationQuote(false);
      router.push("/location-picker");
    } finally {
      setIsUsingCurrentLocation(false);
    }
  }

  const openRestaurantForItem = useCallback(
    (item?: CustomerRestaurantMenuItem) => {
      if (!restaurant?.restaurantId) return;

      router.push({
        pathname: "/restaurants/[restaurantId]",
        params: {
          restaurantId: restaurant.restaurantId,
          ...(item?._id ? { itemId: item._id } : {}),
        },
      });
    },
    [restaurant?.restaurantId, router],
  );

  const handleRecommendedItemPress = useCallback(
    (item: CustomerRestaurantMenuItem) => {
      if (!restaurant || item.availability === "unavailable") {
        return;
      }

      if (hasCustomizations(item)) {
        openRestaurantForItem(item);
        return;
      }

      addItem({
        restaurant,
        item: {
          itemId: item._id,
          name: item.name,
          imageUrl: item.images?.[0]?.url ?? null,
          quantity: 1,
          unitPrice: item.basePrice,
          selectedVariantOptions: [],
          selectedAddOnOptions: [],
        },
      });

      void trackCustomerEvent({
        eventType: "cart_add",
        path: "/(tabs)/cart",
        screenName: "cart",
        entityType: "menu_item",
        entityId: item._id,
        metadata: {
          source: "cart_recommendation",
          restaurantId: restaurant.restaurantId,
          itemName: item.name,
          categoryId: item.categoryId,
          quantity: 1,
          unitPrice: item.basePrice,
        },
      });
    },
    [addItem, openRestaurantForItem, restaurant],
  );

  if (!shouldRenderCartContent) {
    return (
      <Screen>
        <View style={styles.offscreenPlaceholder} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.container}>
        {items.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyStateCard
              title="Your cart is empty"
              description="Add something you would like to order, and it will appear here for checkout."
              actionLabel="Browse restaurants"
              onPress={() => router.push("/(tabs)/browse")}
            />
          </View>
        ) : (
          <>
            <ScrollView
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.header}>
                <Text style={styles.kicker}>Cart</Text>
                <Text style={styles.title}>Your cart</Text>
                {/* <Text style={styles.subtitle}>
                  Review your items, pricing, and checkout details before
                  placing the order.
                </Text> */}
                {!isOnline ? (
                  <OfflineNoticeCard description="Your cart is saved on this device. Reconnect to verify availability and continue to checkout." />
                ) : null}
                <View style={styles.headerStatRow}>
                  <View
                    style={[styles.infoPill, { backgroundColor: "#FFE9F1" }]}
                  >
                    <View style={styles.infoPillTopRow}>
                      <Ionicons
                        name="bag-handle-outline"
                        size={13}
                        color={palette.foreground}
                      />
                      <Text style={styles.infoPillLabel}>Items</Text>
                    </View>
                    <Text style={styles.infoPillValue}>{itemCount}</Text>
                  </View>
                  <View
                    style={[styles.infoPill, { backgroundColor: "#FFEAF3" }]}
                  >
                    <View style={styles.infoPillTopRow}>
                      <Ionicons
                        name="pricetag-outline"
                        size={13}
                        color={palette.foreground}
                      />
                      <Text style={styles.infoPillLabel}>Discount</Text>
                    </View>
                    <Text style={styles.infoPillValue}>
                      {(pricing?.discountAmount ?? 0) > 0
                        ? `-${formatCurrency(pricing?.discountAmount ?? 0)}`
                        : "No deal yet"}
                    </Text>
                  </View>
                  <View
                    style={[styles.infoPill, { backgroundColor: "#EAF2FF" }]}
                  >
                    <View style={styles.infoPillTopRow}>
                      <Ionicons
                        name="navigate-outline"
                        size={13}
                        color={palette.foreground}
                      />
                      <Text style={styles.infoPillLabel}>Location</Text>
                    </View>
                    <Text style={styles.infoPillValue}>
                      {selectedLocation ? "Ready" : "Missing"}
                    </Text>
                  </View>
                </View>
              </View>

              {isCheckingDeliveryArea ? (
                <View style={styles.validationCard}>
                  <View
                    style={[
                      styles.validationIconWrap,
                      styles.validationIconWrapInfo,
                    ]}
                  >
                    <ActivityIndicator size="small" color={palette.secondary} />
                  </View>
                  <View style={styles.validationCopy}>
                    <Text style={styles.validationTitle}>
                      Checking delivery area
                    </Text>
                    <Text style={styles.validationSubtitle}>
                      We are verifying this restaurant against your selected
                      location.
                    </Text>
                  </View>
                </View>
              ) : null}

              {shouldShowQuoteIssue ? (
                <View style={styles.validationCard}>
                  <View style={styles.validationIconWrap}>
                    <Ionicons
                      name="alert-circle"
                      size={18}
                      color={palette.warningText}
                    />
                  </View>
                  <View style={styles.validationCopy}>
                    <Text style={styles.validationTitle}>
                      {isServiceabilityBlocked
                        ? "Outside delivery area"
                        : "Cart needs attention"}
                    </Text>
                    <Text style={styles.validationSubtitle}>
                      {isServiceabilityBlocked
                        ? getRestaurantOutOfDeliveryAreaCopy(
                            restaurant?.restaurantName,
                          )
                        : quoteErrorMessage.includes("not available")
                          ? "One or more items are no longer available. Remove them or refresh your cart before checkout."
                          : quoteErrorMessage}
                    </Text>
                    {isServiceabilityBlocked ? (
                      <View style={styles.validationActions}>
                        <Pressable
                          style={({ pressed }) => [
                            styles.validationAction,
                            styles.validationActionPrimary,
                            pressed ? styles.buttonPressed : null,
                          ]}
                          onPress={() => router.push("/location-picker")}
                        >
                          <Ionicons
                            name="location-outline"
                            size={14}
                            color={palette.surface}
                          />
                          <Text style={styles.validationActionPrimaryText}>
                            Change location
                          </Text>
                        </Pressable>
                        <Pressable
                          disabled={
                            isUsingCurrentLocation || isWaitingForLocationQuote
                          }
                          style={({ pressed }) => [
                            styles.validationAction,
                            isUsingCurrentLocation || isWaitingForLocationQuote
                              ? styles.validationActionDisabled
                              : null,
                            pressed ? styles.buttonPressed : null,
                          ]}
                          onPress={() => {
                            void handleUseCurrentLocation();
                          }}
                        >
                          {isUsingCurrentLocation ||
                          isWaitingForLocationQuote ? (
                            <ActivityIndicator
                              size="small"
                              color={palette.foreground}
                            />
                          ) : (
                            <Ionicons
                              name="navigate-circle-outline"
                              size={14}
                              color={palette.foreground}
                            />
                          )}
                          <Text style={styles.validationActionText}>
                            {isUsingCurrentLocation
                              ? "Locating..."
                              : isWaitingForLocationQuote
                                ? "Checking..."
                                : "My location"}
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {!hasQuoteIssues && priceChangedCount > 0 ? (
                <View style={styles.validationCard}>
                  <View
                    style={[
                      styles.validationIconWrap,
                      styles.validationIconWrapInfo,
                    ]}
                  >
                    <Ionicons
                      name="refresh"
                      size={18}
                      color={palette.secondary}
                    />
                  </View>
                  <View style={styles.validationCopy}>
                    <Text style={styles.validationTitle}>Prices updated</Text>
                    <Text style={styles.validationSubtitle}>
                      {priceChangedCount} item
                      {priceChangedCount === 1 ? "" : "s"} now reflect the
                      latest restaurant pricing.
                    </Text>
                  </View>
                </View>
              ) : null}

              {reorderContext ? (
                <View style={styles.reorderBadgeCard}>
                  <View style={styles.reorderBadgeIconWrap}>
                    <Ionicons
                      name="refresh-outline"
                      size={16}
                      color={palette.secondary}
                    />
                  </View>
                  <View style={styles.reorderBadgeCopy}>
                    <Text style={styles.reorderBadgeTitle}>
                      Reordered from{" "}
                      {formatShortOrderIdLabel(reorderContext.orderNumber)}
                    </Text>
                    <Text style={styles.reorderBadgeSubtitle}>
                      We refreshed these items using the restaurant&apos;s
                      latest prices and currently available options.
                    </Text>
                  </View>
                  <Pressable
                    style={styles.reorderBadgeClose}
                    onPress={() => setReorderContext(null)}
                  >
                    <Ionicons
                      name="close"
                      size={15}
                      color={palette.mutedForeground}
                    />
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.restaurantCard}>
                <View style={styles.restaurantCardHeader}>
                  <View style={styles.restaurantCardCopy}>
                    <Text style={styles.restaurantName}>
                      {restaurant?.restaurantName ?? "Restaurant"}
                    </Text>
                    <Text style={styles.restaurantMeta}>
                      {itemCount} item{itemCount === 1 ? "" : "s"} in this cart
                    </Text>
                  </View>
                  <Pressable onPress={clearCart} style={styles.clearButton}>
                    <Text style={styles.clearButtonText}>Clear</Text>
                  </Pressable>
                </View>

                <View style={styles.itemList}>
                  {items.map((item) => (
                    <View key={item.key} style={styles.itemRow}>
                      {(() => {
                        const quotedItem = quotedItemsByKey.get(item.key);
                        const fullUnitPrice = shouldUseQuotedPricing
                          ? (quotedItem?.unitPrice ?? item.unitPrice)
                          : item.unitPrice;
                        const markdownPerUnit = shouldUseQuotedPricing
                          ? (quotedItem?.markdownPerUnit ?? 0)
                          : 0;
                        const hasMarkdown = markdownPerUnit > 0;
                        const displayUnitPrice =
                          shouldUseQuotedPricing &&
                          typeof quotedItem?.effectiveUnitPrice === "number"
                            ? quotedItem.effectiveUnitPrice
                            : fullUnitPrice;
                        const displayLineTotal =
                          shouldUseQuotedPricing &&
                          typeof quotedItem?.effectiveLineTotal === "number"
                            ? quotedItem.effectiveLineTotal
                            : shouldUseQuotedPricing &&
                                typeof quotedItem?.lineTotal === "number"
                              ? quotedItem.lineTotal
                              : displayUnitPrice * item.quantity;
                        const fullLineTotal = fullUnitPrice * item.quantity;
                        const isPriceChanged =
                          shouldUseQuotedPricing &&
                          typeof quotedItem?.unitPrice === "number" &&
                          quotedItem.unitPrice !== item.unitPrice;
                        const variantSummary = formatSelectedOptions(
                          item.selectedVariantOptions,
                        );
                        const addOnSummary = formatSelectedOptions(
                          item.selectedAddOnOptions,
                        );

                        return (
                          <>
                            <RemoteImage
                              uri={item.imageUrl}
                              style={styles.itemImage}
                              fallbackIcon="fast-food-outline"
                              fallbackIconSize={20}
                              fallbackTint={palette.primary}
                              accessibilityLabel={`${item.name} cart item photo`}
                            />

                            <View style={styles.itemMain}>
                              <View style={styles.itemHeaderRow}>
                                <View style={styles.itemTitleBlock}>
                                  <Text style={styles.itemName} numberOfLines={2}>
                                    {item.name}
                                  </Text>
                                </View>

                                <View style={styles.quantityControl}>
                                  <Pressable
                                    onPressIn={() =>
                                      updateQuantity(item.key, item.quantity - 1)
                                    }
                                    style={({ pressed }) => [
                                      styles.quantityButton,
                                      pressed
                                        ? [
                                            styles.quantityButtonPressed,
                                            styles.quantityButtonSecondaryPressed,
                                          ]
                                        : null,
                                    ]}
                                  >
                                    <Ionicons
                                      name={
                                        item.quantity === 1
                                          ? "trash-outline"
                                          : "remove"
                                      }
                                      size={15}
                                      color={palette.foreground}
                                    />
                                  </Pressable>
                                  <Text style={styles.quantityText}>
                                    {item.quantity}
                                  </Text>
                                  <CartQuantityPlusButton
                                    onPress={() =>
                                      updateQuantity(item.key, item.quantity + 1)
                                    }
                                  />
                                </View>
                              </View>

                              {variantSummary || addOnSummary ? (
                                <View style={styles.itemMetaBlock}>
                                  {variantSummary ? (
                                    <Text style={styles.itemMeta} numberOfLines={2}>
                                      {variantSummary}
                                    </Text>
                                  ) : null}
                                  {addOnSummary ? (
                                    <Text style={styles.itemMeta} numberOfLines={2}>
                                      {addOnSummary}
                                    </Text>
                                  ) : null}
                                </View>
                              ) : null}

                              <View style={styles.itemFooterRow}>
                                <View style={styles.itemPriceBlock}>
                                  <View style={styles.itemPriceRow}>
                                    {hasMarkdown ? (
                                      <Text style={styles.itemPriceStrike}>
                                        {formatCurrency(fullLineTotal)}
                                      </Text>
                                    ) : null}
                                    <Text
                                      style={styles.itemLineTotal}
                                      numberOfLines={1}
                                    >
                                      {formatCurrency(displayLineTotal)}
                                    </Text>
                                    {hasMarkdown ? (
                                      <View style={styles.itemOfferPill}>
                                        <Text style={styles.itemOfferPillText}>
                                          Offer
                                        </Text>
                                      </View>
                                    ) : null}
                                    {isPriceChanged ? (
                                      <Text style={styles.itemPriceChanged}>
                                        Updated
                                      </Text>
                                    ) : null}
                                  </View>
                                  {item.quantity > 1 ? (
                                    <Text
                                      style={styles.itemUnitCaption}
                                      numberOfLines={1}
                                    >
                                      {formatCurrency(displayUnitPrice)} each
                                    </Text>
                                  ) : null}
                                </View>

                                <Pressable
                                  onPress={() => removeItem(item.key)}
                                  hitSlop={8}
                                >
                                  <Text style={styles.removeText}>Remove</Text>
                                </Pressable>
                              </View>
                            </View>
                          </>
                        );
                      })()}
                    </View>
                  ))}
                </View>

                {restaurant?.restaurantId ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.addMoreButton,
                      pressed ? styles.addMoreButtonPressed : null,
                    ]}
                    onPress={() => openRestaurantForItem()}
                    accessibilityRole="button"
                  >
                    <Ionicons
                      name="add"
                      size={15}
                      color={palette.secondary}
                    />
                    <Text style={styles.addMoreButtonText}>Add more</Text>
                  </Pressable>
                ) : null}
              </View>

              {recommendedItems.length > 0 ? (
                <View style={styles.recommendationSection}>
                  <View style={styles.recommendationHeader}>
                    <View style={styles.recommendationTitleWrap}>
                      <Text style={styles.recommendationTitle}>
                        {cartRecommendationConfig?.title ||
                          "Recommended add-ons"}
                      </Text>
                      <Text style={styles.recommendationSubtitle}>
                        {cartRecommendationConfig?.subtitle ||
                          "Small extras that go well with this cart."}
                      </Text>
                    </View>
                    <View style={styles.recommendationHint}>
                      <Text style={styles.recommendationHintText}>Swipe</Text>
                      <Ionicons
                        name="chevron-forward"
                        size={12}
                        color={palette.secondary}
                      />
                    </View>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.recommendationRow}
                  >
                    {recommendedItems.map((item) => {
                      const customizable = hasCustomizations(item);
                      return (
                        <Pressable
                          key={item._id}
                          style={({ pressed }) => [
                            styles.recommendationCard,
                            pressed ? styles.recommendationCardPressed : null,
                          ]}
                          onPress={() => handleRecommendedItemPress(item)}
                        >
                          <RemoteImage
                            uri={item.images?.[0]?.url}
                            style={styles.recommendationImage}
                            fallbackIcon="fast-food-outline"
                            fallbackIconSize={18}
                            fallbackTint={palette.primary}
                            accessibilityLabel={`${item.name} recommended food photo`}
                          >
                            {item.isPopular ? (
                              <View style={styles.recommendationPopularIcon}>
                                <Ionicons
                                  name="flame"
                                  size={12}
                                  color="#FFFFFF"
                                />
                              </View>
                            ) : null}
                            <View style={styles.recommendationAction}>
                              <Ionicons
                                name={customizable ? "options-outline" : "add"}
                                size={14}
                                color="#fff"
                              />
                            </View>
                          </RemoteImage>
                          <View style={styles.recommendationCopy}>
                            <Text
                              style={styles.recommendationName}
                              numberOfLines={2}
                            >
                              {item.name}
                            </Text>
                            <Text
                              style={styles.recommendationPrice}
                              numberOfLines={1}
                            >
                              {customizable
                                ? `From ${formatCurrency(buildStartingPrice(item))}`
                                : formatCurrency(item.basePrice)}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                    <View style={styles.recommendationEndSpacer} />
                  </ScrollView>
                </View>
              ) : null}

              <View style={styles.summaryCard}>
                {autoAppliedOffer && offerProgress ? (
                  <Animated.View
                    style={[
                      styles.offerProgressCard,
                      offerProgress.unlocked
                        ? styles.offerProgressCardUnlocked
                        : null,
                      { transform: [{ scale: offerUnlockAnim }] },
                    ]}
                  >
                    <View style={styles.offerProgressHeader}>
                      <View style={styles.offerProgressBadge}>
                        <Ionicons
                          name={
                            offerProgress.unlocked
                              ? "checkmark-circle"
                              : "sparkles-outline"
                          }
                          size={15}
                          color={
                            offerProgress.unlocked
                              ? palette.successText
                              : palette.secondary
                          }
                        />
                        <Text
                          style={[
                            styles.offerProgressBadgeText,
                            offerProgress.unlocked
                              ? styles.offerProgressBadgeTextUnlocked
                              : null,
                          ]}
                        >
                          {offerProgress.unlocked
                            ? "Offer unlocked"
                            : autoAppliedOffer.name}
                        </Text>
                      </View>
                      <Text style={styles.offerProgressValue}>
                        {formatCurrency(offerProgress.subtotal)} /{" "}
                        {formatCurrency(offerProgress.target)}
                      </Text>
                    </View>
                    <Text style={styles.offerProgressSubtitle}>
                      {offerProgress.unlocked
                        ? appliedAutoVoucher
                          ? `${appliedAutoVoucher.name} is applied to this cart.`
                          : "This discount will apply automatically at checkout."
                        : `${formatCurrency(offerProgress.remaining)} more to unlock it.`}
                    </Text>
                    <View style={styles.offerTrack}>
                      <View
                        style={[
                          styles.offerFill,
                          offerProgress.unlocked
                            ? styles.offerFillUnlocked
                            : null,
                          { width: `${offerProgress.ratio * 100}%` },
                        ]}
                      />
                    </View>
                  </Animated.View>
                ) : null}
                <Text style={styles.summaryTitle}>Order summary</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Items subtotal</Text>
                  <Text style={styles.summaryValue}>
                    {formatCurrency(displayPricing.subtotal)}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Delivery fee</Text>
                  <Text style={styles.summaryValue}>
                    {formatCurrency(displayPricing.deliveryFee)}
                  </Text>
                </View>
                {displayPricing.discountAmount > 0 ? (
                  <View style={styles.summaryRow}>
                    <Text
                      style={[styles.summaryLabel, styles.summaryHighlight]}
                    >
                      {displayDiscountLabel
                        ? `Discount (${displayDiscountLabel})`
                        : "Discount"}
                    </Text>
                    <Text
                      style={[styles.summaryValue, styles.summaryHighlight]}
                    >
                      -{formatCurrency(displayPricing.discountAmount)}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.divider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryStrong}>Estimated total</Text>
                  <Text style={styles.summaryStrong}>
                    {formatCurrency(displayPricing.total)}
                  </Text>
                </View>
              </View>
            </ScrollView>

            <View style={styles.checkoutWrap}>
              <View style={styles.checkoutCard}>
                <View style={styles.checkoutCopy}>
                  <Text style={styles.checkoutLabel}>
                    {isServiceabilityBlocked
                      ? "Location needs update"
                      : !customer
                        ? "Sign in first"
                        : "Ready for checkout"}
                  </Text>
                  <Text style={styles.checkoutAmount}>
                    {formatCurrency(displayPricing.total)}
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.checkoutButtonLift,
                    checkoutDisabled ? styles.checkoutButtonLiftDisabled : null,
                    pressed && !checkoutDisabled ? styles.buttonPressed : null,
                  ]}
                  onPress={handleCheckout}
                  disabled={checkoutDisabled}
                >
                  <View
                    style={[
                      styles.checkoutButton,
                      checkoutDisabled ? styles.checkoutButtonDisabled : null,
                    ]}
                  >
                    <View style={styles.checkoutButtonSheen} />
                    {quoteQuery.isLoading || isCheckingDeliveryArea ? (
                      <ActivityIndicator
                        size="small"
                        color={palette.secondary}
                        style={styles.checkoutButtonSpinner}
                      />
                    ) : null}
                    <Text style={styles.checkoutButtonText}>
                      {!customer
                        ? isServiceabilityBlocked
                          ? "Change location"
                          : "Sign in to checkout"
                        : !isOnline
                          ? "Reconnect to continue"
                          : isCheckingDeliveryArea
                            ? "Checking..."
                            : isServiceabilityBlocked
                              ? "Change location"
                              : hasQuoteIssues
                                ? "Fix cart to continue"
                                : quoteQuery.isLoading
                                  ? "price syncing..."
                                  : "Continue to checkout"}
                    </Text>
                  </View>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
