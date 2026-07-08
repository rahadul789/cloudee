import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type TextStyle,
} from "react-native";

import { ButtonParticleBurst } from "@/src/components/button-particle-burst";
import { RemoteImage } from "@/src/components/remote-image";
import { formatCurrency } from "@/src/lib/currency";
import {
  computeOfferProgress,
  type OfferTier,
} from "@/src/lib/offer-progress";
import { buildStartingPrice, hasCustomizations } from "@/src/lib/restaurant-menu";
import { useCartStore } from "@/src/store/cart-store";
import { palette } from "@/src/theme/palette";
import type {
  CustomerRestaurantMenuItem,
  CustomerVoucherOffer,
} from "@/src/types/restaurant";

import { styles } from "./restaurant-details.styles";

// Rough taka value of an offer for ranking tiers (delivery fee isn't known here, so a
// free-delivery offer falls back to its configured value as a proxy).
function estimateOfferDiscount(offer: CustomerVoucherOffer, subtotal: number) {
  const value = offer.discountValue ?? 0;
  if (offer.type === "percentage") {
    const raw = (subtotal * value) / 100;
    const cap = offer.maximumDiscountAmount ?? 0;
    return cap > 0 ? Math.min(raw, cap) : raw;
  }
  return value;
}

function stopPress(event: { stopPropagation?: () => void }) {
  event.stopPropagation?.();
}

/**
 * Renders an item's price with platform-funded markdown when present: the full price struck
 * through, the discounted price, and a savings badge. For variant items where only pricier
 * options qualify it shows a "on select sizes" badge instead of a misleading struck price.
 */
function MenuItemPrice({
  item,
  priceStyle,
  customizablePrefix = "Starts from ",
}: {
  item: CustomerRestaurantMenuItem;
  priceStyle: StyleProp<TextStyle>;
  customizablePrefix?: string;
}) {
  const customizable = hasCustomizations(item);
  const prefix = customizable ? customizablePrefix : "";
  const markdown = item.markdown;
  const fallbackPrice = customizable ? buildStartingPrice(item) : item.basePrice;

  if (markdown?.hasMarkdown) {
    return (
      <View style={styles.markdownPriceRow}>
        <Text style={styles.markdownOriginalPrice}>
          {prefix}
          {formatCurrency(markdown.originalPrice)}
        </Text>
        <Text style={priceStyle}>{formatCurrency(markdown.effectivePrice)}</Text>
        <View style={styles.markdownBadge}>
          <Ionicons name="pricetag" size={9} color={palette.successText} />
          <Text style={styles.markdownBadgeText}>{markdown.discountLabel}</Text>
        </View>
      </View>
    );
  }

  if (markdown?.partialVariants) {
    return (
      <View style={styles.markdownPriceRow}>
        <Text style={priceStyle}>
          {prefix}
          {formatCurrency(fallbackPrice)}
        </Text>
        <View style={styles.markdownBadge}>
          <Ionicons name="pricetag" size={9} color={palette.successText} />
          <Text style={styles.markdownBadgeText}>
            {markdown.discountLabel} on select sizes
          </Text>
        </View>
      </View>
    );
  }

  return (
    <Text style={priceStyle}>
      {prefix}
      {formatCurrency(fallbackPrice)}
    </Text>
  );
}
export function CategoryRail({
  categories,
  activeCategoryId,
  onPressCategory,
}: {
  categories: { id: string; label: string }[];
  activeCategoryId: string;
  onPressCategory: (categoryId: string) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const chipLayoutsRef = useRef<Record<string, { x: number; width: number }>>({});
  const railWidthRef = useRef(0);

  // Keep the chip for the section currently on screen visible: as the menu is
  // scrolled and the active category changes, slide the rail so that chip is
  // centred instead of drifting off the edge.
  useEffect(() => {
    const layout = chipLayoutsRef.current[activeCategoryId];
    if (!layout || !scrollRef.current) return;
    const target = layout.x - railWidthRef.current / 2 + layout.width / 2;
    scrollRef.current.scrollTo({ x: Math.max(0, target), animated: true });
  }, [activeCategoryId]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.categoryRow}
      onLayout={(event) => {
        railWidthRef.current = event.nativeEvent.layout.width;
      }}
    >
      {categories.map((tab) => {
        const isActive = tab.id === activeCategoryId;
        return (
          <Pressable
            key={tab.id}
            onLayout={(event) => {
              chipLayoutsRef.current[tab.id] = {
                x: event.nativeEvent.layout.x,
                width: event.nativeEvent.layout.width,
              };
            }}
            onPress={() => onPressCategory(tab.id)}
            style={[styles.categoryChip, isActive ? styles.categoryChipActive : null]}
          >
            <View
              style={[
                styles.categoryChipIndicator,
                isActive ? styles.categoryChipIndicatorActive : null,
              ]}
            />
            <Text
              style={[styles.categoryChipText, isActive ? styles.categoryChipTextActive : null]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function MenuSearchBar({
  inputRef,
  value,
  onChangeText,
  onFocus,
  onBlur,
  showSoftInputOnFocus,
  flush = false,
}: {
  inputRef?: { current: TextInput | null };
  value: string;
  onChangeText: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  showSoftInputOnFocus?: boolean;
  flush?: boolean;
}) {
  return (
    <View style={[styles.menuSearchWrap, flush ? styles.menuSearchWrapFlush : null]}>
      <Ionicons name="search-outline" size={16} color={palette.mutedForeground} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        showSoftInputOnFocus={showSoftInputOnFocus}
        autoCorrect={false}
        autoCapitalize="none"
        autoComplete="off"
        returnKeyType="search"
        selectionColor={palette.secondary}
        placeholder="Search menu items"
        placeholderTextColor={palette.placeholder}
        style={styles.menuSearchInput}
      />
      {value ? (
        <Pressable style={styles.menuSearchClear} onPress={() => onChangeText("")}>
          <Ionicons name="close" size={14} color={palette.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}

export const SearchResultsOverlay = memo(function SearchResultsOverlay({
  topInset,
  restaurantId,
  isRestaurantOpen,
  inputRef,
  value,
  onChangeText,
  onBack,
  searchResults,
  categoryNameById,
  onPressCard,
  onPressIncrease,
  onPressDecrease,
  cartQuantities,
}: {
  topInset: number;
  restaurantId: string;
  isRestaurantOpen: boolean;
  inputRef: { current: TextInput | null };
  value: string;
  onChangeText: (value: string) => void;
  onBack: () => void;
  searchResults: CustomerRestaurantMenuItem[];
  categoryNameById: Record<string, string>;
  onPressCard: (item: CustomerRestaurantMenuItem) => void;
  onPressIncrease: (item: CustomerRestaurantMenuItem) => boolean;
  onPressDecrease: (item: CustomerRestaurantMenuItem) => void;
  cartQuantities: Record<string, number>;
}) {
  return (
    <View style={[styles.searchOverlayWrap, { top: topInset }]}>
      <View style={styles.searchOverlaySurface}>
        <View style={styles.searchOverlayHeader}>
          <View style={styles.searchHeaderRow}>
            <Pressable style={styles.searchBackButton} onPress={onBack}>
              <Ionicons name="chevron-back" size={18} color={palette.foreground} />
            </Pressable>
            <View style={styles.searchHeaderField}>
              <MenuSearchBar
                inputRef={inputRef}
                value={value}
                onChangeText={onChangeText}
                flush
              />
            </View>
          </View>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={() => Keyboard.dismiss()}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.searchResultsContent,
            searchResults.length ? null : styles.searchResultsContentEmpty,
          ]}
        >
          {searchResults.length ? (
            searchResults.map((item) => (
              <SearchResultCard
                key={item._id}
                item={item}
                categoryName={categoryNameById[item.categoryId]}
                quantity={cartQuantities[item._id] ?? 0}
                isRestaurantOpen={isRestaurantOpen}
                onPressCard={onPressCard}
                onPressIncrease={onPressIncrease}
                onPressDecrease={onPressDecrease}
              />
            ))
          ) : (
            <View style={styles.searchEmptyCard}>
              <View style={styles.searchEmptyIconWrap}>
                <Ionicons name="search-outline" size={20} color={palette.secondary} />
              </View>
              <Text style={styles.searchEmptyTitle}>No matching items yet</Text>
              <Text style={styles.searchEmptySubtitle}>
                Try another menu name, flavour, or addon.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
});

const SearchResultCard = memo(function SearchResultCard({
  item,
  categoryName,
  quantity,
  isRestaurantOpen,
  onPressCard,
  onPressIncrease,
  onPressDecrease,
}: {
  item: CustomerRestaurantMenuItem;
  categoryName?: string;
  quantity: number;
  isRestaurantOpen: boolean;
  onPressCard: (item: CustomerRestaurantMenuItem) => void;
  onPressIncrease: (item: CustomerRestaurantMenuItem) => boolean;
  onPressDecrease: (item: CustomerRestaurantMenuItem) => void;
}) {
  const imageUrl = item.images?.[0]?.url ?? null;
  const isUnavailable = item.availability === "unavailable" || !isRestaurantOpen;

  return (
    <Pressable
      onPress={() => onPressCard(item)}
      style={[styles.searchResultCard, isUnavailable ? styles.searchResultCardMuted : null]}
    >
      <View style={styles.searchResultMedia}>
        <RemoteImage
          uri={imageUrl}
          style={styles.searchResultImage}
          fallbackIcon="restaurant-outline"
          fallbackIconSize={18}
          fallbackTint={palette.mutedForeground}
          targetWidth={120}
          accessibilityLabel={`${item.name} food photo`}
        />
      </View>
      <View style={styles.searchResultCopy}>
        <View style={styles.searchResultTitleRow}>
          <Text style={styles.searchResultTitle} numberOfLines={1}>
            {item.name}
          </Text>
          {item.isPopular ? (
            <View style={styles.searchPopularBadge}>
              <Ionicons name="flame" size={11} color={palette.secondary} />
              <Text style={styles.searchPopularBadgeText}>Popular</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.searchResultMeta} numberOfLines={1}>
          {categoryName ?? "Menu item"}
        </Text>
          <MenuItemPrice item={item} priceStyle={styles.searchResultPrice} />
        </View>
        <InlineMenuQuantityControl
          quantity={quantity}
          isDisabled={isUnavailable}
          burstsOnAdd={!hasCustomizations(item)}
          onPressIncrease={(event) => {
            stopPress(event);
            if (isUnavailable) return;
            return onPressIncrease(item);
          }}
          onPressDecrease={(event) => {
            stopPress(event);
            onPressDecrease(item);
          }}
        />
      </Pressable>
    );
  }
);

const InlineMenuQuantityControl = memo(function InlineMenuQuantityControl({
  quantity,
  isDisabled,
  onPressIncrease,
  onPressDecrease,
  burstsOnAdd = true,
}: {
  quantity: number;
  isDisabled: boolean;
  onPressIncrease: (event: GestureResponderEvent) => boolean | void;
  onPressDecrease: (event: GestureResponderEvent) => void;
  burstsOnAdd?: boolean;
}) {
  const [burstKey, setBurstKey] = useState(0);
  const [displayQuantity, setDisplayQuantity] = useState(quantity);

  useEffect(() => {
    setDisplayQuantity(quantity);
  }, [quantity]);

  const handleIncreasePress = useCallback(
    (event: GestureResponderEvent) => {
      const didAdd = onPressIncrease(event);
      if (burstsOnAdd && didAdd) {
        setDisplayQuantity((current) => current + 1);
        setBurstKey((current) => current + 1);
      }
    },
    [burstsOnAdd, onPressIncrease],
  );
  const handleDecreasePress = useCallback(
    (event: GestureResponderEvent) => {
      onPressDecrease(event);
      setDisplayQuantity((current) => Math.max(0, current - 1));
    },
    [onPressDecrease],
  );
  const handleBurstComplete = useCallback((finishedKey: number) => {
    setBurstKey((current) => (current === finishedKey ? 0 : current));
  }, []);

  return (
    <View style={styles.quantityActionSlot}>
      {displayQuantity > 0 ? (
        <View style={styles.quantityControl}>
        <Pressable
          style={({ pressed }) => [
            styles.iconButton,
            isDisabled ? styles.iconButtonDisabled : null,
            pressed
              ? [styles.quickButtonPressed, styles.quickButtonSecondaryPressed]
              : null,
          ]}
          onPressIn={handleDecreasePress}
        >
          <Ionicons
            name={displayQuantity === 1 ? "trash-outline" : "remove"}
            size={15}
            color={isDisabled ? palette.mutedForeground : palette.foreground}
          />
        </Pressable>
        <Text style={styles.quantityText}>{displayQuantity}</Text>
        <Pressable
          style={({ pressed }) => [
            styles.iconButton,
            styles.iconButtonPrimary,
            isDisabled ? styles.iconButtonDisabled : null,
            pressed ? styles.quickButtonPressed : null,
          ]}
          onPressIn={handleIncreasePress}
        >
          <Ionicons
            name="add"
            size={15}
            color={isDisabled ? palette.mutedForeground : palette.surface}
          />
        </Pressable>
        </View>
      ) : (
        <Pressable
          disabled={isDisabled}
          style={({ pressed }) => [
            styles.singleAddButton,
            isDisabled ? styles.singleAddButtonDisabled : null,
            pressed ? styles.quickButtonPressed : null,
          ]}
          onPressIn={handleIncreasePress}
        >
          <Ionicons
            name="add"
            size={16}
            color={isDisabled ? palette.mutedForeground : palette.surface}
          />
        </Pressable>
      )}
      {burstKey > 0 ? (
        <View pointerEvents="none" style={styles.quantityBurstAnchor}>
          <ButtonParticleBurst
            triggerKey={burstKey}
            onComplete={handleBurstComplete}
          />
        </View>
      ) : null}
    </View>
  );
});

export const ConnectedRestaurantCartFooter = memo(function ConnectedRestaurantCartFooter({
  restaurantId,
  restaurantName,
  autoOffers,
  firstOrderOffer,
  bottomInset,
}: {
  restaurantId: string;
  restaurantName: string;
  autoOffers: CustomerVoucherOffer[];
  firstOrderOffer?: { amount: number; minimumOrderAmount: number } | null;
  bottomInset: number;
}) {
  const router = useRouter();
  const offerUnlockAnim = useRef(new Animated.Value(1)).current;
  const itemCount = useCartStore(
    useCallback((state) => {
      if (state.restaurant?.restaurantId !== restaurantId) {
        return 0;
      }
      return state.items.reduce((total, item) => total + item.quantity, 0);
    }, [restaurantId])
  );
  const subtotal = useCartStore(
    useCallback((state) => {
      if (state.restaurant?.restaurantId !== restaurantId) {
        return 0;
      }
      return state.items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
    }, [restaurantId])
  );
  const hasCart = itemCount > 0;

  const offerProgress = useMemo(() => {
    if (!hasCart) return null;

    const labelFor = (offer: CustomerVoucherOffer) =>
      offer.type === "free_delivery"
        ? "free delivery"
        : offer.type === "percentage"
          ? `${offer.discountValue ?? 0}% off`
          : `${formatCurrency(offer.discountValue ?? 0)} off`;

    // Every offer the cart could unlock — tiered auto vouchers AND (for eligible new
    // customers) the first-order welcome discount — compete as candidates. Only one ever
    // applies, so the bar shows the best active deal + the nearest bigger one to chase.
    const tiers: OfferTier[] = autoOffers
      .filter((offer) => (offer.minimumOrderAmount ?? 0) > 0)
      .map((offer) => ({
        minimumOrderAmount: offer.minimumOrderAmount ?? 0,
        discount: estimateOfferDiscount(offer, subtotal),
        label: labelFor(offer),
      }));

    if (
      firstOrderOffer &&
      firstOrderOffer.amount > 0 &&
      firstOrderOffer.minimumOrderAmount > 0
    ) {
      tiers.push({
        minimumOrderAmount: firstOrderOffer.minimumOrderAmount,
        discount: firstOrderOffer.amount,
        label: `${formatCurrency(firstOrderOffer.amount)} off`,
        context: "on your first order",
      });
    }

    return computeOfferProgress(tiers, subtotal);
  }, [autoOffers, firstOrderOffer, hasCart, subtotal]);

  const offerActive = Boolean(offerProgress?.hasCurrent);
  useEffect(() => {
    if (!offerActive) {
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
  }, [offerActive, offerUnlockAnim]);

  if (!hasCart) {
    return null;
  }

  return (
    <View style={[styles.cartBarWrap, { paddingBottom: bottomInset }]}>
      {offerProgress ? (
        <Animated.View
          style={[
            styles.offerProgressCard,
            offerProgress.hasCurrent ? styles.offerProgressCardUnlocked : null,
            { transform: [{ scale: offerUnlockAnim }] },
          ]}
        >
          <View style={styles.offerProgressHeader}>
            <View style={styles.offerProgressBadge}>
              <Ionicons
                name={offerProgress.hasCurrent ? "checkmark-circle" : "sparkles-outline"}
                size={15}
                color={offerProgress.hasCurrent ? palette.successText : palette.secondary}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.offerProgressBadgeText,
                  offerProgress.hasCurrent ? styles.offerProgressBadgeTextUnlocked : null,
                ]}
              >
                {offerProgress.hasCurrent
                  ? `${offerProgress.currentLabel} applied`
                  : `Unlock ${offerProgress.nextLabel}`}
              </Text>
            </View>
            <Text style={styles.offerProgressValue} numberOfLines={1}>
              {formatCurrency(subtotal)} / {formatCurrency(offerProgress.target)}
            </Text>
          </View>
          <Text style={styles.offerProgressSubtitle}>
            {offerProgress.unlocked
              ? `${offerProgress.currentLabel} applied${offerProgress.currentContext ? ` ${offerProgress.currentContext}` : " at checkout"}.`
              : `Add ${formatCurrency(offerProgress.remaining)} more for ${offerProgress.nextLabel}${offerProgress.nextContext ? ` ${offerProgress.nextContext}` : ""}.`}
          </Text>
          <View style={styles.offerTrack}>
            <Animated.View
              style={[
                styles.offerFill,
                offerProgress.hasCurrent ? styles.offerFillUnlocked : null,
                { width: `${offerProgress.ratio * 100}%` },
              ]}
            />
          </View>
        </Animated.View>
      ) : null}

      <Pressable
        style={({ pressed }) => [
          styles.cartBarLift,
          pressed ? styles.submitButtonPressed : null,
        ]}
        onPress={() => router.push("/(tabs)/cart")}
      >
        <View style={styles.cartBar}>
          <View style={styles.cartBarGlow} />
          <View style={styles.cartBarSheen} />
          <View style={styles.cartBarCopy}>
            <Text style={styles.cartBarTitle}>{itemCount} items in cart</Text>
            <Text style={styles.cartBarSubtitle}>
            {restaurantName} • {formatCurrency(subtotal)}
            </Text>
          </View>
          <View style={styles.cartBarAction}>
            <Text style={styles.cartBarActionText}>View cart</Text>
            <Ionicons name="arrow-forward" size={16} color={palette.surface} />
          </View>
        </View>
      </Pressable>
    </View>
  );
});

export function InfoSheetRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoSheetRow}>
      <View style={styles.infoSheetRowIcon}>
        <Ionicons name={icon} size={16} color={palette.primary} />
      </View>
      <View style={styles.infoSheetRowCopy}>
        <Text style={styles.infoSheetRowLabel}>{label}</Text>
        <Text style={styles.infoSheetRowValue}>{value}</Text>
      </View>
    </View>
  );
}

export function InfoMiniCard({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoMiniCard}>
      <View style={styles.infoMiniCardIcon}>
        <Ionicons name={icon} size={15} color={palette.secondary} />
      </View>
      <Text style={styles.infoMiniCardLabel}>{label}</Text>
      <Text style={styles.infoMiniCardValue}>{value}</Text>
    </View>
  );
}

export function FactChip({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const tone =
    label === "Rating"
      ? {
          card: "#FFF8E8",
          iconWrap: "#FFF1C4",
          icon: "#D49700",
        }
      : label === "Prep time"
        ? {
            card: "#F7F1FF",
            iconWrap: "#EBDDFF",
            icon: "#7C4DCC",
          }
        : label === "From"
          ? {
              card: "#FFF0F6",
              iconWrap: "#FFD9E8",
              icon: palette.secondary,
            }
          : {
              card: "#EEF8FF",
              iconWrap: "#D7EEFF",
              icon: palette.sky,
            };

  const content = (
    <>
      <View style={[styles.factChipIconWrap, { backgroundColor: tone.iconWrap }]}>
        <Ionicons name={icon} size={14} color={tone.icon} />
      </View>
      <View style={styles.factChipCopy}>
        <Text style={styles.factChipLabel}>{label}</Text>
        <Text style={styles.factChipValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {onPress ? (
        <Ionicons name="chevron-forward" size={14} color={palette.mutedForeground} />
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.factChip,
          { backgroundColor: tone.card },
          pressed ? styles.factChipPressed : null,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.factChip, { backgroundColor: tone.card }]}>
      {content}
    </View>
  );
}

export const ConnectedPopularItemCard = memo(function ConnectedPopularItemCard({
  item,
  quantity,
  isRestaurantOpen,
  onPressIncrease,
  onPressDecrease,
  onPressCard,
}: {
  item: CustomerRestaurantMenuItem;
  quantity: number;
  isRestaurantOpen: boolean;
  onPressIncrease: (item: CustomerRestaurantMenuItem) => boolean;
  onPressDecrease: (item: CustomerRestaurantMenuItem) => void;
  onPressCard: (item: CustomerRestaurantMenuItem) => void;
}) {
  const isDisabled = !isRestaurantOpen || item.availability === "unavailable";
  const [burstKey, setBurstKey] = useState(0);
  const [displayQuantity, setDisplayQuantity] = useState(quantity);

  useEffect(() => {
    setDisplayQuantity(quantity);
  }, [quantity]);

  const handleIncreasePress = useCallback(
    (event: GestureResponderEvent) => {
      stopPress(event);
      if (isDisabled) return;
      const didAdd = onPressIncrease(item);
      if (didAdd) {
        setDisplayQuantity((current) => current + 1);
        setBurstKey((current) => current + 1);
      }
    },
    [isDisabled, item, onPressIncrease],
  );
  const handleDecreasePress = useCallback(
    (event: GestureResponderEvent) => {
      stopPress(event);
      onPressDecrease(item);
      setDisplayQuantity((current) => Math.max(0, current - 1));
    },
    [item, onPressDecrease],
  );
  const handleBurstComplete = useCallback((finishedKey: number) => {
    setBurstKey((current) => (current === finishedKey ? 0 : current));
  }, []);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.popularCard,
        isDisabled ? styles.popularCardMuted : null,
        pressed ? styles.cardPressed : null,
      ]}
      onPress={() => {
        if (!isDisabled) onPressCard(item);
      }}
    >
      <RemoteImage
        uri={item.images?.[0]?.url}
        style={styles.popularImage}
        fallbackIcon="fast-food-outline"
        targetWidth={200}
        accessibilityLabel={`${item.name} popular food photo`}
      />
      <View style={styles.popularMetaBadge}>
        <Ionicons name="flame" size={12} color={palette.primary} />
        <Text style={styles.popularMetaBadgeText}>Popular</Text>
      </View>
      <Text numberOfLines={1} style={styles.popularTitle}>
        {item.name}
      </Text>
      <Text numberOfLines={2} style={styles.popularDescription}>
        {item.description}
      </Text>
      <View style={styles.popularFooter}>
        <View style={styles.popularPriceBlock}>
          <MenuItemPrice
            item={item}
            priceStyle={styles.popularPrice}
            customizablePrefix="From "
          />
        </View>
        <View style={styles.quantityActionSlot}>
          {displayQuantity > 0 ? (
            <View style={styles.popularQuantityControl}>
            <Pressable
              style={({ pressed }) => [
                styles.popularIconButton,
                pressed
                  ? [
                      styles.quickButtonPressed,
                      styles.quickButtonSecondaryPressed,
                    ]
                  : null,
              ]}
              onPressIn={handleDecreasePress}
            >
              <Ionicons
                name={displayQuantity === 1 ? "trash-outline" : "remove"}
                size={15}
                color={palette.foreground}
              />
            </Pressable>
            <Text style={styles.popularQuantityText}>{displayQuantity}</Text>
            <Pressable
              style={({ pressed }) => [
                styles.popularIconButton,
                styles.popularIconButtonPrimary,
                pressed ? styles.quickButtonPressed : null,
              ]}
              onPressIn={handleIncreasePress}
            >
              <Ionicons name="add" size={15} color={palette.surface} />
            </Pressable>
            </View>
          ) : (
            <Pressable
              disabled={isDisabled}
              style={({ pressed }) => [
                styles.popularAddButton,
                isDisabled ? styles.iconButtonDisabled : null,
                pressed ? styles.quickButtonPressed : null,
              ]}
              onPressIn={handleIncreasePress}
            >
              <Ionicons name="add" size={15} color={isDisabled ? palette.mutedForeground : palette.surface} />
            </Pressable>
          )}
          {burstKey > 0 ? (
            <View pointerEvents="none" style={styles.quantityBurstAnchor}>
              <ButtonParticleBurst
                triggerKey={burstKey}
                onComplete={handleBurstComplete}
              />
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});

export const MenuCard = memo(function MenuCard({
  item,
  quantity,
  isRestaurantOpen,
  onPressIncrease,
  onPressDecrease,
  onPressCard,
}: {
  item: CustomerRestaurantMenuItem;
  quantity: number;
  isRestaurantOpen: boolean;
  onPressIncrease: (item: CustomerRestaurantMenuItem) => boolean;
  onPressDecrease: (item: CustomerRestaurantMenuItem) => void;
  onPressCard: (item: CustomerRestaurantMenuItem) => void;
}) {
  const isDisabled = !isRestaurantOpen || item.availability === "unavailable";
  const customizable = hasCustomizations(item);
  const shouldAllowCardPress = !isDisabled;

  return (
    <Pressable
      disabled={!shouldAllowCardPress}
      onPress={() => onPressCard(item)}
      style={({ pressed }) => [
        styles.menuCard,
        isDisabled ? styles.menuCardMuted : null,
        pressed ? styles.cardPressed : null,
      ]}
    >
      <View style={styles.menuCardCopy}>
        <View style={styles.menuMetaRow}>
          {item.isPopular ? (
            <View style={[styles.metaBadge, styles.metaBadgePopular]}>
              <Ionicons name="flame" size={12} color={palette.primary} />
              <Text style={[styles.metaBadgeText, styles.metaBadgeTextPopular]}>Popular</Text>
            </View>
          ) : null}
          {customizable ? (
            <View style={styles.metaBadge}>
              <Text style={styles.metaBadgeText}>Customizable</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.titleBlock}>
          <Text numberOfLines={1} style={styles.menuItemTitle}>
            {item.name}
          </Text>
          <Text numberOfLines={2} style={styles.menuDescription}>
            {item.description}
          </Text>
        </View>

        <View style={styles.menuPriceRow}>
          <MenuItemPrice item={item} priceStyle={styles.menuPrice} />
        </View>
      </View>

      <View style={styles.mediaColumn}>
        <RemoteImage
          uri={item.images?.[0]?.url}
          style={styles.menuImage}
          fallbackIcon="fast-food-outline"
          targetWidth={96}
          accessibilityLabel={`${item.name} food photo`}
        />

          <InlineMenuQuantityControl
            quantity={quantity}
            isDisabled={isDisabled}
            burstsOnAdd={!customizable}
            onPressIncrease={(event) => {
              stopPress(event);
              return onPressIncrease(item);
            }}
            onPressDecrease={(event) => {
              stopPress(event);
              onPressDecrease(item);
            }}
          />
        </View>
      </Pressable>
    );
});

