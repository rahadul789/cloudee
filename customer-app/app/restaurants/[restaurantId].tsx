import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  BackHandler,
  FlatList,
  InteractionManager,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBottomSheet } from "@/src/components/app-bottom-sheet";
import { ButtonParticleBurst } from "@/src/components/button-particle-burst";
import { EmptyStateCard } from "@/src/components/empty-state-card";
import {
  MenuCategoryChipsSkeleton,
  MenuPopularSkeleton,
  RestaurantDetailsSkeleton,
} from "@/src/components/loading-skeleton";
import { RemoteImage } from "@/src/components/remote-image";
import { styles } from "@/src/components/restaurant-details/restaurant-details.styles";
import {
  CategoryRail,
  ConnectedPopularItemCard,
  ConnectedRestaurantCartFooter,
  FactChip,
  InfoMiniCard,
  InfoSheetRow,
  MenuCard,
  MenuSearchBar,
  SearchResultsOverlay,
} from "@/src/components/restaurant-details/restaurant-menu-components";
import { Screen } from "@/src/components/screen";
import { DELIVERY_RADIUS_KM } from "@/src/config/service-area";
import { useCustomerRestaurantDetailsQuery } from "@/src/hooks/use-customer-api";
import { useSafeTimeout } from "@/src/hooks/use-safe-timeout";
import { trackCustomerEvent } from "@/src/lib/analytics";
import { applyCurrentLocation } from "@/src/lib/current-location";
import { formatCurrency } from "@/src/lib/currency";
import { formatDurationMinutes } from "@/src/lib/date-time";
import { formatCustomerAddressLine } from "@/src/lib/location-address";
import {
  buildDefaultSelections,
  buildStartingPrice,
  computeItemMarkdownAmount,
  hasCustomizations,
  isSelectionValid,
} from "@/src/lib/restaurant-menu";
import { useLocationStore } from "@/src/store/location-store";
import { useCartStore, type CartItem } from "@/src/store/cart-store";
import { palette } from "@/src/theme/palette";
import type {
  CustomerMenuAddOnGroup,
  CustomerMenuVariantGroup,
  CustomerVoucherOffer,
  CustomerRestaurantMenuItem,
} from "@/src/types/restaurant";

const AnimatedFlatList = Animated.createAnimatedComponent(
  FlatList as any,
) as unknown as typeof FlatList;
const EMPTY_RESTAURANT_CART_ITEMS: CartItem[] = [];

type PendingCartAdd = {
  item: CustomerRestaurantMenuItem;
  quantity: number;
  selectedAddOns: { groupName: string; optionLabel: string }[];
  selectedVariants: { groupName: string; optionLabel: string }[];
  unitPrice: number;
};

type CartAddResult = "added" | "blocked" | "conflict";

type Row =
  | {
      id: "popular";
      kind: "popular";
      items: CustomerRestaurantMenuItem[];
    }
  | {
      id: string;
      kind: "section";
      categoryId: string;
      title: string;
      description?: string;
    }
  | {
      id: string;
      kind: "item";
      categoryId: string;
      item: CustomerRestaurantMenuItem;
    };

function runAfterUiCommit(task: () => void) {
  requestAnimationFrame(() => {
    setTimeout(task, 0);
  });
}

function formatOfferValue(offer: CustomerVoucherOffer) {
  if (offer.type === "free_delivery") {
    return "Free delivery";
  }

  if (offer.type === "percentage" && typeof offer.discountValue === "number") {
    return `${offer.discountValue}% off`;
  }

  if (typeof offer.discountValue === "number") {
    return `${formatCurrency(offer.discountValue)} off`;
  }

  return offer.name;
}

function formatOfferLabel(offer: CustomerVoucherOffer) {
  const value = formatOfferValue(offer);
  return offer.mode === "coupon" && offer.code
    ? `${offer.code} - ${value}`
    : value;
}

function buildOfferExplanation(offer: CustomerVoucherOffer) {
  const minimumText =
    typeof offer.minimumOrderAmount === "number" && offer.minimumOrderAmount > 0
      ? ` Your food subtotal needs to be at least ${formatCurrency(offer.minimumOrderAmount)}.`
      : "";
  const maxText =
    typeof offer.maximumDiscountAmount === "number" &&
    offer.maximumDiscountAmount > 0
      ? ` The maximum discount is ${formatCurrency(offer.maximumDiscountAmount)}.`
      : "";

  if (offer.mode === "coupon") {
    return `Use code ${offer.code ?? "shown here"} at checkout. Foodbela will check the rules and apply ${formatOfferValue(offer).toLowerCase()} if your cart is eligible.${minimumText}${maxText}`;
  }

  return `This offer applies automatically at checkout when your cart is eligible. You do not need to enter a code.${minimumText}${maxText}`;
}

export default function RestaurantDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const { restaurantId, itemId } = useLocalSearchParams<{
    restaurantId: string;
    itemId?: string;
  }>();
  const routedItemId = typeof itemId === "string" ? itemId : undefined;
  const selectedLocation = useLocationStore((state) => state.selectedLocation);
  const isLocationHydrated = useLocationStore((state) => state.isHydrated);
  const activeCartItems = useCartStore(
    useCallback(
      (state) => {
        if (!restaurantId || state.restaurant?.restaurantId !== restaurantId) {
          return EMPTY_RESTAURANT_CART_ITEMS;
        }
        return state.items;
      },
      [restaurantId],
    ),
  );
  const addItem = useCartStore((state) => state.addItem);
  const replaceCart = useCartStore((state) => state.replaceCart);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const conflictingRestaurantName = useCartStore(
    (state) => state.restaurant?.restaurantName ?? "another restaurant",
  );

  const detailsQuery = useCustomerRestaurantDetailsQuery({
    restaurantId,
    latitude: selectedLocation?.latitude,
    longitude: selectedLocation?.longitude,
  });

  const [selectedItem, setSelectedItem] =
    useState<CustomerRestaurantMenuItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string[]>
  >({});
  const [selectedAddOns, setSelectedAddOns] = useState<
    Record<string, string[]>
  >({});
  const [activeCategoryId, setActiveCategoryId] = useState("");
  const [menuSearch, setMenuSearch] = useState("");
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [showStickyControls, setShowStickyControls] = useState(false);
  const [isInfoSheetVisible, setInfoSheetVisible] = useState(false);
  const [selectedOffer, setSelectedOffer] =
    useState<CustomerVoucherOffer | null>(null);
  const [cartConflictItem, setCartConflictItem] =
    useState<PendingCartAdd | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [customQuantityBurstKey, setCustomQuantityBurstKey] = useState(0);
  const handleCustomQuantityBurstComplete = useCallback(
    (finishedKey: number) => {
      setCustomQuantityBurstKey((current) =>
        current === finishedKey ? 0 : current,
      );
    },
    [],
  );

  const listRef = useRef<FlatList<Row>>(null);
  const stickySearchInputRef = useRef<TextInput | null>(null);
  const controlsYRef = useRef(0);
  const controlsHeightRef = useRef(106);
  const scrollOffsetYRef = useRef(0);
  const showStickyControlsRef = useRef(false);
  const activeCategoryRef = useRef("");
  const ignoreAutoSyncUntilRef = useRef(0);
  const lastTrackedMenuSearchRef = useRef("");
  const handledRouteItemIdRef = useRef<string | null>(null);
  const scheduleTimeout = useSafeTimeout();

  const categories = useMemo(
    () => detailsQuery.data?.categories ?? [],
    [detailsQuery.data?.categories],
  );
  const allMenuItems = useMemo(
    () => detailsQuery.data?.menuItems ?? [],
    [detailsQuery.data?.menuItems],
  );
  const restaurant = detailsQuery.data?.restaurant;
  const detailsData = detailsQuery.data;
  const deliveryRadiusKm = restaurant?.deliveryRadiusKm ?? DELIVERY_RADIUS_KM;
  const isResolvingServiceability = Boolean(
    selectedLocation &&
    detailsQuery.isFetching &&
    !detailsQuery.isError &&
    (detailsQuery.isPlaceholderData || detailsQuery.dataUpdatedAt === 0),
  );
  const serviceabilityNotice = useMemo(() => {
    if (!restaurant) {
      return null;
    }

    if (!isLocationHydrated || isResolvingServiceability) {
      return null;
    }

    if (!selectedLocation) {
      return {
        title: "Choose your delivery point",
        body: "Select your location first so Foodbela can show restaurants that can deliver to you.",
      };
    }

    const isOutsideDeliveryArea =
      restaurant.isServiceableForSelectedLocation === false ||
      (typeof restaurant.distanceKm === "number" &&
        Number.isFinite(restaurant.distanceKm) &&
        restaurant.distanceKm > deliveryRadiusKm);

    if (!isOutsideDeliveryArea) {
      return null;
    }

    return {
      title: "Outside delivery area",
      body: `${restaurant.name} does not deliver to your selected location. Change your delivery point or browse restaurants nearby.`,
    };
  }, [
    deliveryRadiusKm,
    isLocationHydrated,
    isResolvingServiceability,
    restaurant,
    selectedLocation,
  ]);
  const canAddFromRestaurant = !serviceabilityNotice;
  const recentReviews = useMemo(
    () => detailsData?.recentReviews ?? [],
    [detailsData?.recentReviews],
  );
  const isMenuLoading =
    Boolean(restaurant) &&
    detailsQuery.isFetching &&
    categories.length === 0 &&
    allMenuItems.length === 0;
  const deferredMenuSearch = useDeferredValue(menuSearch);
  const normalizedMenuSearch = deferredMenuSearch.trim().toLowerCase();
  const searchableMenuItems = useMemo(
    () =>
      allMenuItems.map((item) => ({
        item,
        searchText: [
          item.name,
          item.description,
          ...(item.variants?.map((group) => group.name) ?? []),
          ...(item.variants?.flatMap((group) =>
            group.options.map((option) => option.label),
          ) ?? []),
          ...(item.addOnGroups?.map((group) => group.name) ?? []),
          ...(item.addOnGroups?.flatMap((group) =>
            group.options.map((option) => option.label),
          ) ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      })),
    [allMenuItems],
  );
  const menuItemsByCategory = useMemo(
    () =>
      allMenuItems.reduce<Record<string, CustomerRestaurantMenuItem[]>>(
        (acc, item) => {
          if (!acc[item.categoryId]) {
            acc[item.categoryId] = [];
          }
          acc[item.categoryId].push(item);
          return acc;
        },
        {},
      ),
    [allMenuItems],
  );
  const categoryNameById = useMemo(
    () =>
      categories.reduce<Record<string, string>>((acc, category) => {
        acc[category._id] = category.name;
        return acc;
      }, {}),
    [categories],
  );
  const searchResults = useMemo(() => {
    if (!normalizedMenuSearch) {
      return allMenuItems;
    }

    return searchableMenuItems
      .filter((entry) => entry.searchText.includes(normalizedMenuSearch))
      .map((entry) => entry.item);
  }, [allMenuItems, normalizedMenuSearch, searchableMenuItems]);
  const cartQuantitiesByItemId = useMemo(
    () =>
      activeCartItems.reduce<Record<string, number>>((acc, item) => {
        acc[item.itemId] = (acc[item.itemId] ?? 0) + item.quantity;
        return acc;
      }, {}),
    [activeCartItems],
  );
  const importantFacts = useMemo(
    () => [
      {
        key: "rating",
        icon: "star-outline" as const,
        label: "Rating",
        value:
          typeof restaurant?.avgRating === "number" &&
          (restaurant.reviewCount ?? 0) > 0
            ? `${restaurant.avgRating} (${restaurant.reviewCount})`
            : "No reviews yet",
      },
      {
        key: "time",
        icon: "time-outline" as const,
        label: "Prep time",
        value:
          typeof restaurant?.preparationTimeMinutes === "number"
            ? formatDurationMinutes(restaurant.preparationTimeMinutes)
            : "Kitchen updates soon",
      },
      {
        key: "price",
        icon: "pricetag-outline" as const,
        label: "From",
        value:
          typeof restaurant?.lowestMenuPrice === "number"
            ? formatCurrency(restaurant.lowestMenuPrice)
            : "Checking price",
      },
      {
        key: "distance",
        icon: "navigate-outline" as const,
        label: "Distance",
        value:
          typeof restaurant?.distanceKm === "number"
            ? `${restaurant.distanceKm.toFixed(1)} km`
            : restaurant?.isOpen === false
              ? "Currently closed"
              : "Delivery ready",
      },
    ],
    [
      restaurant?.avgRating,
      restaurant?.distanceKm,
      restaurant?.isOpen,
      restaurant?.lowestMenuPrice,
      restaurant?.preparationTimeMinutes,
      restaurant?.reviewCount,
    ],
  );

  const popularItems = useMemo(
    () => allMenuItems.filter((item) => item.isPopular),
    [allMenuItems],
  );

  const rows = useMemo<Row[]>(() => {
    const next: Row[] = [];

    if (popularItems.length) {
      next.push({ id: "popular", kind: "popular", items: popularItems });
    }

    categories.forEach((category) => {
      const categoryItems = menuItemsByCategory[category._id] ?? [];
      if (!categoryItems.length) return;

      next.push({
        id: `section-${category._id}`,
        kind: "section",
        categoryId: category._id,
        title: category.name,
        description: category.description,
      });

      categoryItems.forEach((item) => {
        next.push({
          id: `item-${item._id}`,
          kind: "item",
          categoryId: category._id,
          item,
        });
      });
    });

    return next;
  }, [categories, menuItemsByCategory, popularItems]);

  const tabItems = useMemo(
    () => [
      ...(popularItems.length ? [{ id: "popular", label: "Popular" }] : []),
      ...categories
        .filter(
          (category) => (menuItemsByCategory[category._id]?.length ?? 0) > 0,
        )
        .map((category) => ({ id: category._id, label: category.name })),
    ],
    [categories, menuItemsByCategory, popularItems.length],
  );

  useEffect(() => {
    const nextId = tabItems[0]?.id ?? "";
    if (nextId && !activeCategoryRef.current) {
      activeCategoryRef.current = nextId;
      setActiveCategoryId(nextId);
    }
  }, [tabItems]);

  useEffect(() => {
    if (!isSearchMode) {
      return;
    }

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        Keyboard.dismiss();
        setMenuSearch("");
        setIsSearchMode(false);
        return true;
      },
    );

    return () => subscription.remove();
  }, [isSearchMode]);

  const rowIndexByCategory = useMemo(
    () =>
      rows.reduce<Record<string, number>>((acc, row, index) => {
        if (row.kind === "popular") acc.popular = index;
        if (row.kind === "section") acc[row.categoryId] = index;
        return acc;
      }, {}),
    [rows],
  );

  const selectedItemTotal = useMemo(() => {
    if (!selectedItem) return 0;
    let total = selectedItem.basePrice;

    for (const group of selectedItem.variants ?? []) {
      const labels = selectedVariants[group.name] ?? [];
      for (const option of group.options ?? []) {
        if (labels.includes(option.label)) total += option.priceDelta ?? 0;
      }
    }

    for (const group of selectedItem.addOnGroups ?? []) {
      const labels = selectedAddOns[group.name] ?? [];
      for (const option of group.options ?? []) {
        if (labels.includes(option.label)) total += option.price ?? 0;
      }
    }

    return total * quantity;
  }, [quantity, selectedAddOns, selectedItem, selectedVariants]);

  // Platform markdown for the exact current selection (base + variant only, add-ons excluded).
  // Preview only — the backend cart quote recomputes the authoritative amount at checkout.
  const selectedItemMarkdown = useMemo(() => {
    if (!selectedItem?.markdown) {
      return { perUnit: 0, effectiveTotal: selectedItemTotal };
    }
    let baseVariantUnit = selectedItem.basePrice;
    for (const group of selectedItem.variants ?? []) {
      const labels = selectedVariants[group.name] ?? [];
      for (const option of group.options ?? []) {
        if (labels.includes(option.label))
          baseVariantUnit += option.priceDelta ?? 0;
      }
    }
    const perUnit = computeItemMarkdownAmount(
      baseVariantUnit,
      selectedItem.markdown,
    );
    return {
      perUnit,
      effectiveTotal: Math.max(selectedItemTotal - perUnit * quantity, 0),
    };
  }, [quantity, selectedItem, selectedItemTotal, selectedVariants]);

  const selectedItemHasCustomizations = useMemo(
    () => (selectedItem ? hasCustomizations(selectedItem) : false),
    [selectedItem],
  );

  const autoOffers = useMemo(
    () =>
      (detailsData?.activeOffers ?? []).filter(
        (offer) =>
          offer.mode === "auto" && typeof offer.minimumOrderAmount === "number",
      ),
    [detailsData?.activeOffers],
  );
  // Guards the "Add to cart" action against a rapid double-fire (the action runs on
  // press-in for reliable single-tap response inside the modal sheet).
  const addInFlightRef = useRef(false);
  const presentCustomizer = useCallback((item: CustomerRestaurantMenuItem) => {
    const defaults = buildDefaultSelections(item);
    addInFlightRef.current = false;
    setSelectedItem(item);
    setQuantity(1);
    setSelectedVariants(defaults.defaultVariants);
    setSelectedAddOns(defaults.defaultAddOns);
  }, []);

  const openCustomizer = useCallback(
    (item: CustomerRestaurantMenuItem) => {
      if (isSearchMode) {
        Keyboard.dismiss();
      }

      presentCustomizer(item);

      if (restaurant?._id) {
        runAfterUiCommit(() => {
          void trackCustomerEvent({
            eventType: "menu_item_view",
            path: `/restaurants/${restaurant._id}`,
            screenName: "restaurant-details",
            entityType: "menu_item",
            entityId: item._id,
            metadata: {
              restaurantId: restaurant._id,
              itemName: item.name,
              categoryId: item.categoryId,
              price: item.basePrice,
              isPopular: Boolean(item.isPopular),
            },
          });
        });
      }
    },
    [isSearchMode, presentCustomizer, restaurant?._id],
  );

  useEffect(() => {
    if (
      !routedItemId ||
      handledRouteItemIdRef.current === routedItemId ||
      !allMenuItems.length
    ) {
      return;
    }

    const targetItem = allMenuItems.find((item) => item._id === routedItemId);
    if (!targetItem || targetItem.availability === "unavailable") {
      return;
    }

    handledRouteItemIdRef.current = routedItemId;
    runAfterUiCommit(() => {
      openCustomizer(targetItem);
    });
  }, [allMenuItems, openCustomizer, routedItemId]);

  function closeCustomizer() {
    addInFlightRef.current = false;
    setSelectedItem(null);
    setQuantity(1);
    setSelectedVariants({});
    setSelectedAddOns({});
  }

  function toggleSelection(
    groupName: string,
    optionLabel: string,
    group: CustomerMenuVariantGroup | CustomerMenuAddOnGroup,
    type: "variant" | "addon",
  ) {
    const setState =
      type === "variant" ? setSelectedVariants : setSelectedAddOns;
    // Variants are always a "pick one" choice, so they carry an implicit minimum of 1
    // even when the backend leaves minSelect unset. Required groups must never drop
    // below their minimum, so tapping the last selected option is a no-op rather than
    // leaving the group empty.
    const effectiveMinSelect =
      type === "variant"
        ? Math.max(group.minSelect ?? 0, 1)
        : (group.minSelect ?? 0);
    setState((current) => {
      const selected = current[groupName] ?? [];
      const isSelected = selected.includes(optionLabel);
      const maxSelect = group.maxSelect ?? (type === "variant" ? 1 : 99);

      if (isSelected) {
        if (selected.length <= effectiveMinSelect) {
          return current;
        }
        return {
          ...current,
          [groupName]: selected.filter((label) => label !== optionLabel),
        };
      }

      if (maxSelect <= 1) {
        return { ...current, [groupName]: [optionLabel] };
      }

      if (selected.length >= maxSelect) return current;
      return { ...current, [groupName]: [...selected, optionLabel] };
    });
  }

  const attemptAddToCart = useCallback(
    (payload: PendingCartAdd): CartAddResult => {
      if (!restaurant) return "blocked";
      if (!canAddFromRestaurant) {
        return "blocked";
      }

      const restaurantIdentity = {
        restaurantId: restaurant._id,
        restaurantName: restaurant.name,
      };
      const currentCart = useCartStore.getState();

      if (
        currentCart.restaurant &&
        currentCart.restaurant.restaurantId !==
          restaurantIdentity.restaurantId &&
        currentCart.items.length > 0
      ) {
        setCartConflictItem(payload);
        return "conflict";
      }

      addItem({
        restaurant: restaurantIdentity,
        item: {
          itemId: payload.item._id,
          name: payload.item.name,
          imageUrl: payload.item.images?.[0]?.url ?? null,
          quantity: payload.quantity,
          unitPrice: payload.unitPrice,
          selectedVariantOptions: payload.selectedVariants,
          selectedAddOnOptions: payload.selectedAddOns,
        },
      });

      runAfterUiCommit(() => {
        void trackCustomerEvent({
          eventType: "cart_add",
          path: `/restaurants/${restaurant._id}`,
          screenName: "restaurant-details",
          entityType: "menu_item",
          entityId: payload.item._id,
          metadata: {
            restaurantId: restaurant._id,
            itemName: payload.item.name,
            categoryId: payload.item.categoryId,
            quantity: payload.quantity,
            unitPrice: payload.unitPrice,
            hasCustomizations: Boolean(
              payload.selectedAddOns.length || payload.selectedVariants.length,
            ),
          },
        });
      });
      return "added";
    },
    [addItem, canAddFromRestaurant, restaurant],
  );

  function handleConfirmReplaceCart() {
    if (!cartConflictItem || !restaurant) return;
    if (!canAddFromRestaurant) {
      setCartConflictItem(null);
      return;
    }

    replaceCart({
      restaurant: {
        restaurantId: restaurant._id,
        restaurantName: restaurant.name,
      },
      item: {
        itemId: cartConflictItem.item._id,
        name: cartConflictItem.item.name,
        imageUrl: cartConflictItem.item.images?.[0]?.url ?? null,
        quantity: cartConflictItem.quantity,
        unitPrice: cartConflictItem.unitPrice,
        selectedVariantOptions: cartConflictItem.selectedVariants,
        selectedAddOnOptions: cartConflictItem.selectedAddOns,
      },
    });

    runAfterUiCommit(() => {
      void trackCustomerEvent({
        eventType: "cart_add",
        path: `/restaurants/${restaurant._id}`,
        screenName: "restaurant-details",
        entityType: "menu_item",
        entityId: cartConflictItem.item._id,
        metadata: {
          restaurantId: restaurant._id,
          itemName: cartConflictItem.item.name,
          categoryId: cartConflictItem.item.categoryId,
          quantity: cartConflictItem.quantity,
          unitPrice: cartConflictItem.unitPrice,
          cartReplaced: true,
        },
      });
    });

    setCartConflictItem(null);
  }

  const handleIncrease = useCallback(
    (item: CustomerRestaurantMenuItem) => {
      if (
        item.availability === "unavailable" ||
        restaurant?.isOpen === false ||
        !canAddFromRestaurant
      )
        return false;

      if (hasCustomizations(item)) {
        openCustomizer(item);
        return false;
      }

      const addResult = attemptAddToCart({
        item,
        quantity: 1,
        unitPrice: item.basePrice,
        selectedAddOns: [],
        selectedVariants: [],
      });
      if (addResult === "added") {
        return true;
      }

      return false;
    },
    [
      canAddFromRestaurant,
      restaurant?.isOpen,
      openCustomizer,
      attemptAddToCart,
    ],
  );

  const handleDecrease = useCallback(
    (item: CustomerRestaurantMenuItem) => {
      const state = useCartStore.getState();
      if (state.restaurant?.restaurantId !== restaurant?._id) {
        return;
      }

      const current = state.items.find((entry) => entry.itemId === item._id);
      if (!current) return;
      updateQuantity(current.key, current.quantity - 1);
    },
    [restaurant?._id, updateQuantity],
  );

  function handleAddToCart() {
    if (!selectedItem) return false;

    const invalidVariantGroup = (selectedItem.variants ?? []).find(
      (group) =>
        !isSelectionValid((selectedVariants[group.name] ?? []).length, group),
    );
    if (invalidVariantGroup) return false;

    const invalidAddOnGroup = (selectedItem.addOnGroups ?? []).find(
      (group) =>
        !isSelectionValid((selectedAddOns[group.name] ?? []).length, group),
    );
    if (invalidAddOnGroup) return false;

    const addResult = attemptAddToCart({
      item: selectedItem,
      quantity,
      unitPrice: selectedItemTotal / quantity,
      selectedVariants: Object.entries(selectedVariants).flatMap(
        ([groupName, labels]) =>
          labels.map((optionLabel) => ({ groupName, optionLabel })),
      ),
      selectedAddOns: Object.entries(selectedAddOns).flatMap(
        ([groupName, labels]) =>
          labels.map((optionLabel) => ({ groupName, optionLabel })),
      ),
    });

    if (addResult === "blocked") {
      return false;
    }

    closeCustomizer();
    return addResult === "added";
  }

  async function handleUseCurrentLocation() {
    try {
      await applyCurrentLocation();
    } catch {
      router.push("/location-picker");
    }
  }

  function handlePressCategory(categoryId: string) {
    const index = rowIndexByCategory[categoryId];
    if (typeof index !== "number") return;

    ignoreAutoSyncUntilRef.current = Date.now() + 700;
    activeCategoryRef.current = categoryId;
    setActiveCategoryId(categoryId);
    void Haptics.selectionAsync();
    listRef.current?.scrollToIndex({
      index,
      animated: true,
      viewOffset: insets.top + controlsHeightRef.current + 2,
    });
  }

  const openSearchMode = useCallback(() => {
    setIsSearchMode(true);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });

    scheduleTimeout(() => {
      stickySearchInputRef.current?.focus();
    }, 220);
  }, [scheduleTimeout]);

  const closeSearchMode = useCallback(() => {
    Keyboard.dismiss();
    setMenuSearch("");
    setIsSearchMode(false);
  }, []);

  const handleMenuSearchChange = useCallback((value: string) => {
    setMenuSearch(value);
  }, []);

  useEffect(() => {
    const query = menuSearch.trim();
    if (!restaurant?._id || query.length < 2) return;

    const timer = setTimeout(() => {
      const trackingKey = `${restaurant._id}|${query.toLowerCase()}|${searchResults.length}`;
      if (lastTrackedMenuSearchRef.current === trackingKey) return;
      lastTrackedMenuSearchRef.current = trackingKey;

      void trackCustomerEvent({
        eventType: "search",
        path: `/restaurants/${restaurant._id}`,
        screenName: "restaurant-details",
        entityType: "restaurant",
        entityId: restaurant._id,
        metadata: {
          query: query.slice(0, 80),
          scope: "restaurant_menu",
          restaurantId: restaurant._id,
          resultCount: searchResults.length,
          hasResults: searchResults.length > 0,
        },
      });
    }, 700);

    return () => clearTimeout(timer);
  }, [menuSearch, restaurant?._id, searchResults.length]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<Row>[] }) => {
      if (Date.now() < ignoreAutoSyncUntilRef.current) return;
      const first = viewableItems.find(
        (token) => token.isViewable && token.item,
      )?.item;
      if (!first) return;

      const nextId =
        first.kind === "popular"
          ? "popular"
          : first.kind === "section" || first.kind === "item"
            ? first.categoryId
            : tabItems[0]?.id;

      if (nextId && nextId !== activeCategoryRef.current) {
        activeCategoryRef.current = nextId;
        setActiveCategoryId(nextId);
      }
    },
  );

  const [contentReady, setContentReady] = useState(false);
  useEffect(() => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      setContentReady(true);
    };
    // Mount the heavy content once the navigation transition/interactions settle, with a
    // 400ms safety net so it can never stay hidden even if interactions never quiesce.
    const interaction = InteractionManager.runAfterInteractions(finish);
    const timer = setTimeout(finish, 400);
    return () => {
      interaction.cancel();
      clearTimeout(timer);
    };
  }, []);

  // The cart pre-fetches this restaurant's details, so on arrival the data is warm and the
  // full (heavy) menu list would otherwise mount ON the navigation animation frames — the
  // janky cart→details transition. Hold the skeleton until the transition settles (or a
  // 400ms safety net), then mount the real content. The skeleton always renders in the
  // meantime, so there is never a blank screen and it can never get stuck.
  if (detailsQuery.isLoading || !contentReady) {
    return (
      <Screen>
        <RestaurantDetailsSkeleton />
      </Screen>
    );
  }

  if (!restaurant || detailsQuery.isError) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <EmptyStateCard
            title="We could not load this restaurant"
            description="Please go back and try again."
            actionLabel="Retry"
            onPress={() => detailsQuery.refetch()}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <AnimatedFlatList
        ref={listRef}
        data={rows.length ? rows : []}
        keyExtractor={(item: Row) => item.id}
        initialNumToRender={4}
        maxToRenderPerBatch={8}
        windowSize={8}
        removeClippedSubviews
        contentContainerStyle={[styles.listContent, styles.listContentWithCart]}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
        showsVerticalScrollIndicator={false}
        viewabilityConfig={{ itemVisiblePercentThreshold: 40 }}
        onViewableItemsChanged={onViewableItemsChanged.current}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: true,
            listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
              const offsetY = event.nativeEvent.contentOffset.y;
              scrollOffsetYRef.current = offsetY;
              const threshold = Math.max(
                0,
                controlsYRef.current +
                  controlsHeightRef.current -
                  insets.top -
                  12,
              );
              const shouldShowControls = offsetY >= threshold;
              if (showStickyControlsRef.current !== shouldShowControls) {
                showStickyControlsRef.current = shouldShowControls;
                setShowStickyControls(shouldShowControls);
              }
            },
          },
        )}
        onScrollToIndexFailed={(info: {
          averageItemLength: number;
          index: number;
        }) => {
          listRef.current?.scrollToOffset({
            offset: Math.max(
              0,
              info.averageItemLength * info.index -
                (insets.top + controlsHeightRef.current),
            ),
            animated: true,
          });
          scheduleTimeout(() => {
            listRef.current?.scrollToIndex({
              index: info.index,
              animated: true,
              viewOffset: insets.top + controlsHeightRef.current + 2,
            });
          }, 140);
        }}
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              <Animated.View
                style={[
                  styles.heroImageWrap,
                  {
                    transform: [
                      {
                        translateY: scrollY.interpolate({
                          inputRange: [-180, 0, 220],
                          outputRange: [-48, 0, 72],
                          extrapolate: "clamp",
                        }),
                      },
                      {
                        scale: scrollY.interpolate({
                          inputRange: [-180, 0],
                          outputRange: [1.14, 1],
                          extrapolateLeft: "extend",
                          extrapolateRight: "clamp",
                        }),
                      },
                    ],
                  },
                ]}
              >
                <RemoteImage
                  uri={restaurant.coverImage?.url}
                  style={styles.heroImage}
                  fallbackIcon="restaurant-outline"
                  fallbackIconSize={28}
                  fallbackTint={palette.primary}
                  accessibilityLabel={`${restaurant.name} cover image`}
                />
              </Animated.View>
              <View style={styles.heroShade} />
              <View style={styles.heroTopRow}>
                <Pressable
                  style={styles.heroButton}
                  onPress={() => router.back()}
                >
                  <Ionicons
                    name="chevron-back"
                    size={20}
                    color={palette.foreground}
                  />
                </Pressable>
                <View style={styles.heroActionGroup}>
                  <Pressable
                    style={styles.heroButton}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setIsFavorite((current) => !current);
                    }}
                  >
                    <Ionicons
                      name={isFavorite ? "heart" : "heart-outline"}
                      size={18}
                      color={
                        isFavorite ? palette.secondary : palette.foreground
                      }
                    />
                  </Pressable>
                  <Pressable
                    style={styles.heroButton}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setInfoSheetVisible(true);
                    }}
                  >
                    <Ionicons
                      name="information-circle-outline"
                      size={18}
                      color={palette.foreground}
                    />
                  </Pressable>
                </View>
              </View>
              <View style={styles.heroBottomRow}>
                <View
                  style={[
                    styles.statePill,
                    restaurant.isOpen === false ? styles.statePillClosed : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.statePillText,
                      restaurant.isOpen === false
                        ? styles.statePillTextClosed
                        : null,
                    ]}
                  >
                    {restaurant.isOpen === false ? "Closed now" : "Open now"}
                  </Text>
                </View>
                {detailsData?.activeOffers[0] ? (
                  <Pressable
                    style={styles.offerPillButton}
                    onPress={() =>
                      setSelectedOffer(detailsData.activeOffers[0])
                    }
                  >
                    <Ionicons
                      name="pricetag"
                      size={12}
                      color={palette.surface}
                    />
                    <Text style={styles.offerPillText} numberOfLines={1}>
                      {formatOfferLabel(detailsData.activeOffers[0])}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <Animated.View
              style={[
                styles.infoCard,
                {
                  transform: [
                    {
                      translateY: scrollY.interpolate({
                        inputRange: [-60, 0, 160],
                        outputRange: [-6, 0, 18],
                        extrapolate: "clamp",
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.infoTopRow}>
                <RemoteImage
                  uri={restaurant.logo?.url}
                  style={styles.restaurantLogo}
                  fallbackIcon="restaurant-outline"
                  fallbackIconSize={18}
                  fallbackTint={palette.primary}
                  accessibilityLabel={`${restaurant.name} logo`}
                />
                <View style={styles.infoCopy}>
                  <Text style={styles.title}>{restaurant.name}</Text>
                  {detailsData?.activeOffers.length ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.inlineOfferRow}
                    >
                      {detailsData.activeOffers.map((offer) => (
                        <Pressable
                          key={offer._id}
                          style={styles.inlineOfferChip}
                          onPress={() => setSelectedOffer(offer)}
                        >
                          <Ionicons
                            name={
                              offer.mode === "auto"
                                ? "flash-outline"
                                : "pricetag-outline"
                            }
                            size={12}
                            color={palette.secondary}
                          />
                          <Text style={styles.inlineOfferText}>
                            {formatOfferLabel(offer)}
                          </Text>
                          <Ionicons
                            name="chevron-forward"
                            size={11}
                            color={palette.secondary}
                          />
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : null}
                </View>
              </View>

              <View style={styles.infoBadgeRow}>
                {importantFacts.map((fact) => (
                  <FactChip
                    key={fact.key}
                    icon={fact.icon}
                    label={fact.label}
                    value={fact.value}
                    onPress={
                      fact.key === "rating"
                        ? () =>
                            router.push({
                              pathname: "/restaurants/[restaurantId]/reviews",
                              params: { restaurantId: restaurant._id },
                            })
                        : undefined
                    }
                  />
                ))}
              </View>
            </Animated.View>

            {serviceabilityNotice ? (
              <View style={styles.serviceabilityCard}>
                <View style={styles.serviceabilityIconWrap}>
                  <Ionicons
                    name="location-outline"
                    size={18}
                    color={palette.secondary}
                  />
                </View>
                <View style={styles.serviceabilityCopy}>
                  <Text style={styles.serviceabilityTitle}>
                    {serviceabilityNotice.title}
                  </Text>
                  <Text style={styles.serviceabilityBody}>
                    {serviceabilityNotice.body}
                  </Text>
                  <View style={styles.serviceabilityActions}>
                    <Pressable
                      style={[
                        styles.serviceabilityAction,
                        styles.serviceabilityActionPrimary,
                      ]}
                      onPress={() => router.push("/location-picker")}
                    >
                      <Text style={styles.serviceabilityActionPrimaryText}>
                        Change location
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.serviceabilityAction}
                      onPress={() => {
                        void handleUseCurrentLocation();
                      }}
                    >
                      <Text style={styles.serviceabilityActionText}>
                        My location
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : null}

            <View
              style={styles.controlsWrap}
              onLayout={(event) => {
                controlsYRef.current = event.nativeEvent.layout.y;
                controlsHeightRef.current = event.nativeEvent.layout.height;
              }}
            >
              <View style={styles.controlsStack}>
                <MenuSearchBar
                  value={menuSearch}
                  onChangeText={handleMenuSearchChange}
                  onFocus={openSearchMode}
                  showSoftInputOnFocus={false}
                />
                {isMenuLoading ? (
                  <MenuCategoryChipsSkeleton />
                ) : (
                  <CategoryRail
                    categories={tabItems}
                    activeCategoryId={activeCategoryId}
                    onPressCategory={handlePressCategory}
                  />
                )}
              </View>
            </View>
          </View>
        }
        renderItem={({ item }: { item: Row }) => {
          if (item.kind === "popular") {
            return (
              <View style={styles.sectionWrap}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleRow}>
                    <Ionicons name="flame" size={15} color={palette.primary} />
                    <Text style={styles.sectionHeaderTitle}>Popular</Text>
                  </View>
                  <Text style={styles.sectionHeaderSubtitle}>
                    Most ordered right now
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.popularRow}
                >
                  {item.items.map((popularItem: CustomerRestaurantMenuItem) => (
                    <ConnectedPopularItemCard
                      key={popularItem._id}
                      item={popularItem}
                      quantity={cartQuantitiesByItemId[popularItem._id] ?? 0}
                      isRestaurantOpen={
                        restaurant.isOpen !== false && canAddFromRestaurant
                      }
                      onPressIncrease={handleIncrease}
                      onPressDecrease={handleDecrease}
                      onPressCard={openCustomizer}
                    />
                  ))}
                </ScrollView>
              </View>
            );
          }

          if (item.kind === "section") {
            return (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderTitle}>{item.title}</Text>
                {item.description ? (
                  <Text style={styles.sectionHeaderSubtitle}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
            );
          }

          return (
            <View style={styles.menuItemWrap}>
              <MenuCard
                item={item.item}
                quantity={cartQuantitiesByItemId[item.item._id] ?? 0}
                isRestaurantOpen={
                  restaurant.isOpen !== false && canAddFromRestaurant
                }
                onPressIncrease={handleIncrease}
                onPressDecrease={handleDecrease}
                onPressCard={openCustomizer}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          isMenuLoading ? (
            <MenuPopularSkeleton />
          ) : (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <Ionicons
                  name="search-outline"
                  size={20}
                  color={palette.secondary}
                />
              </View>
              <Text style={styles.emptyTitle}>No items found</Text>
              <Text style={styles.emptySubtitle}>
                Try another search or another category.
              </Text>
            </View>
          )
        }
      />

      {isSearchMode ? (
        <SearchResultsOverlay
          topInset={insets.top}
          restaurantId={restaurant._id}
          isRestaurantOpen={restaurant.isOpen !== false && canAddFromRestaurant}
          inputRef={stickySearchInputRef}
          value={menuSearch}
          onChangeText={handleMenuSearchChange}
          onBack={closeSearchMode}
          searchResults={searchResults}
          categoryNameById={categoryNameById}
          onPressCard={openCustomizer}
          onPressIncrease={handleIncrease}
          onPressDecrease={handleDecrease}
          cartQuantities={cartQuantitiesByItemId}
        />
      ) : showStickyControls ? (
        <View style={[styles.overlayWrap, { top: insets.top }]}>
          <View style={styles.overlayBar}>
            <View style={styles.controlsStack}>
              <MenuSearchBar
                value={menuSearch}
                onChangeText={handleMenuSearchChange}
                onFocus={openSearchMode}
                showSoftInputOnFocus={false}
              />
              <CategoryRail
                categories={tabItems}
                activeCategoryId={activeCategoryId}
                onPressCategory={handlePressCategory}
              />
            </View>
          </View>
        </View>
      ) : null}

      {/*
        <View
          style={[
            styles.cartBarWrap,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          {autoAppliedOffer && offerProgress ? (
            <Animated.View
              style={[
                styles.offerProgressCard,
                offerProgress.unlocked ? styles.offerProgressCardUnlocked : null,
                { transform: [{ scale: offerUnlockAnim }] },
              ]}
            >
              <View style={styles.offerProgressHeader}>
                <View style={styles.offerProgressBadge}>
                  <Ionicons
                    name={offerProgress.unlocked ? "checkmark-circle" : "sparkles-outline"}
                    size={15}
                    color={offerProgress.unlocked ? palette.successText : palette.secondary}
                  />
                  <Text
                    style={[
                      styles.offerProgressBadgeText,
                      offerProgress.unlocked ? styles.offerProgressBadgeTextUnlocked : null,
                    ]}
                  >
                    {offerProgress.unlocked ? "Applied automatically" : autoAppliedOffer.name}
                  </Text>
                </View>
                <Text style={styles.offerProgressValue}>
                  {formatCurrency(cartSubtotal)} / {formatCurrency(offerProgress.target)}
                </Text>
              </View>

              <Text style={styles.offerProgressSubtitle}>
                {offerProgress.unlocked
                  ? "Discount will be used at checkout."
                  : `${formatCurrency(offerProgress.remaining)} more to unlock this offer.`}
              </Text>

              <View style={styles.offerTrack}>
                <Animated.View
                  style={[
                    styles.offerFill,
                    offerProgress.unlocked ? styles.offerFillUnlocked : null,
                    { width: `${offerProgress.ratio * 100}%` },
                  ]}
                />
              </View>
            </Animated.View>
          ) : null}
          <Pressable style={styles.cartBar} onPress={() => router.push("/(tabs)/cart")}>
            <View style={styles.cartBarGlow} />
            <View style={styles.cartBarCopy}>
              <Text style={styles.cartBarTitle}>{itemCount} items in cart</Text>
              <Text style={styles.cartBarSubtitle}>
                {restaurant.name} •{" "}
                {formatCurrency(
                  cartItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0),
                )}
              </Text>
            </View>
            <View style={styles.cartBarAction}>
              <Text style={styles.cartBarActionText}>View cart</Text>
              <Ionicons name="arrow-forward" size={16} color={palette.surface} />
            </View>
          </Pressable>
        </View>
      */}
      <ConnectedRestaurantCartFooter
        restaurantId={restaurant._id}
        restaurantName={restaurant.name}
        autoOffers={autoOffers}
        firstOrderOffer={
          detailsData?.firstOrderDiscount?.eligible
            ? {
                amount: detailsData.firstOrderDiscount.amount,
                minimumOrderAmount:
                  detailsData.firstOrderDiscount.minimumOrderAmount,
              }
            : null
        }
        bottomInset={Math.max(insets.bottom, 12)}
      />

      <Modal
        visible={Boolean(cartConflictItem)}
        transparent
        animationType="fade"
        onRequestClose={() => setCartConflictItem(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setCartConflictItem(null)}
        >
          <Pressable
            style={styles.modalCard}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.modalGlow} />
            {cartConflictItem ? (
              <>
                <View style={styles.modalBadge}>
                  <Ionicons
                    name="bag-handle-outline"
                    size={14}
                    color={palette.secondary}
                  />
                  <Text style={styles.modalBadgeText}>Cart switch</Text>
                </View>
                <Text style={styles.modalTitle}>Start a fresh cart?</Text>
                <Text style={styles.modalText}>
                  Replace items from{" "}
                  <Text style={styles.modalTextStrong}>
                    {conflictingRestaurantName}
                  </Text>{" "}
                  with{" "}
                  <Text style={styles.modalTextStrong}>{restaurant.name}</Text>?
                </Text>
                <View style={styles.modalPreviewRow}>
                  <RemoteImage
                    uri={cartConflictItem.item.images?.[0]?.url}
                    style={styles.modalPreviewImage}
                    fallbackIcon="fast-food-outline"
                    accessibilityLabel={`${cartConflictItem.item.name} food photo`}
                  />
                  <View style={styles.modalPreviewCopy}>
                    <Text style={styles.modalPreviewTitle} numberOfLines={2}>
                      {cartConflictItem.item.name}
                    </Text>
                    <Text style={styles.modalPreviewSubtitle}>
                      {formatCurrency(cartConflictItem.unitPrice)}
                    </Text>
                  </View>
                </View>
                <View style={styles.modalActions}>
                  <Pressable
                    style={styles.modalSecondaryButton}
                    onPress={() => setCartConflictItem(null)}
                  >
                    <Text style={styles.modalSecondaryButtonText}>
                      Keep current cart
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.modalPrimaryButton}
                    onPress={handleConfirmReplaceCart}
                  >
                    <Text style={styles.modalPrimaryButtonText}>
                      Replace and add
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <AppBottomSheet
        visible={isInfoSheetVisible}
        onClose={() => setInfoSheetVisible(false)}
        title="Restaurant info"
        subtitle="Quick facts, location, offers, and cuisine"
        leadingIcon="information-circle-outline"
        snapPoints={[0.7, 0.9]}
        initialSnapPoint={0.7}
      >
        <View style={styles.infoSheetCard}>
          <Text style={styles.infoSheetSectionTitle}>Quick facts</Text>
          <View style={styles.infoSheetMetricsGrid}>
            <InfoMiniCard
              icon="star-outline"
              label="Rating"
              value={
                typeof restaurant.avgRating === "number" &&
                (restaurant.reviewCount ?? 0) > 0
                  ? `${restaurant.avgRating} / 5`
                  : "No ratings yet"
              }
            />
            <InfoMiniCard
              icon="time-outline"
              label="Preparation"
              value={
                typeof restaurant.preparationTimeMinutes === "number"
                  ? formatDurationMinutes(restaurant.preparationTimeMinutes)
                  : "Kitchen updates soon"
              }
            />
            <InfoMiniCard
              icon="pricetag-outline"
              label="Starts from"
              value={
                typeof restaurant.lowestMenuPrice === "number"
                  ? formatCurrency(restaurant.lowestMenuPrice)
                  : "Checking price"
              }
            />
            <InfoMiniCard
              icon="navigate-outline"
              label="Distance"
              value={
                typeof restaurant.distanceKm === "number"
                  ? `${restaurant.distanceKm.toFixed(1)} km away`
                  : "Delivery area"
              }
            />
          </View>
        </View>

        <View style={styles.infoSheetCard}>
          <Text style={styles.infoSheetSectionTitle}>Delivery & location</Text>
          <InfoSheetRow
            icon="location-outline"
            label="Address"
            value={formatCustomerAddressLine(
              [restaurant.address?.address, restaurant.address?.city]
                .filter(Boolean)
                .join(", "),
              "Address unavailable",
            )}
          />
          <InfoSheetRow
            icon="bag-handle-outline"
            label="Offers live"
            value={
              detailsData?.activeOffers.length
                ? `${detailsData.activeOffers.length} offer${detailsData.activeOffers.length === 1 ? "" : "s"} available now`
                : "No active offers right now"
            }
          />
          <InfoSheetRow
            icon={
              restaurant.isOpen === false
                ? "moon-outline"
                : "checkmark-circle-outline"
            }
            label="Store status"
            value={
              restaurant.isOpen === false
                ? "Currently closed"
                : "Open and taking orders"
            }
          />
        </View>

        <View style={styles.infoSheetCard}>
          <Text style={styles.infoSheetSectionTitle}>Cuisine & tags</Text>
          <View style={styles.infoSheetChipWrap}>
            {[
              ...(restaurant.cuisineTypes ?? []),
              ...(restaurant.tags ?? []),
            ].map((entry) => (
              <View key={entry} style={styles.infoSheetChip}>
                <Text style={styles.infoSheetChipText}>{entry}</Text>
              </View>
            ))}
          </View>
        </View>

        {recentReviews.length ? (
          <View style={styles.infoSheetCard}>
            <View style={styles.infoSheetReviewHeader}>
              <Text style={styles.infoSheetSectionTitle}>Guest reviews</Text>
              <Pressable
                style={styles.infoSheetReviewLink}
                onPress={() => {
                  setInfoSheetVisible(false);
                  router.push({
                    pathname: "/restaurants/[restaurantId]/reviews",
                    params: { restaurantId: restaurant._id },
                  });
                }}
              >
                <Text style={styles.infoSheetReviewLinkText}>Open all</Text>
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={palette.secondary}
                />
              </Pressable>
            </View>
            <InfoSheetRow
              icon="chatbubbles-outline"
              label="Reviews"
              value={
                typeof restaurant.avgRating === "number" &&
                (restaurant.reviewCount ?? 0) > 0
                  ? `${restaurant.avgRating} average from ${restaurant.reviewCount} reviews`
                  : "Open the dedicated review screen for customer feedback"
              }
            />
          </View>
        ) : null}
      </AppBottomSheet>

      <AppBottomSheet
        visible={Boolean(selectedOffer)}
        onClose={() => setSelectedOffer(null)}
        title={
          selectedOffer ? formatOfferLabel(selectedOffer) : "Offer details"
        }
        subtitle={selectedOffer?.name ?? "How this offer works"}
        leadingIcon={
          selectedOffer?.mode === "auto" ? "flash-outline" : "pricetag-outline"
        }
        snapPoints={[0.7, 0.9]}
        initialSnapPoint={0.7}
      >
        {selectedOffer ? (
          <>
            <View style={styles.offerSheetHero}>
              <View style={styles.offerSheetIcon}>
                <Ionicons
                  name={
                    selectedOffer.mode === "auto" ? "flash" : "ticket-outline"
                  }
                  size={22}
                  color={palette.secondary}
                />
              </View>
              <View style={styles.offerSheetCopy}>
                <Text style={styles.offerSheetTitle}>{selectedOffer.name}</Text>
                <Text style={styles.offerSheetSubtitle}>
                  {buildOfferExplanation(selectedOffer)}
                </Text>
              </View>
            </View>

            <View style={styles.infoSheetCard}>
              <Text style={styles.infoSheetSectionTitle}>Offer rules</Text>
              <InfoSheetRow
                icon={
                  selectedOffer.mode === "auto"
                    ? "flash-outline"
                    : "keypad-outline"
                }
                label="Apply method"
                value={
                  selectedOffer.mode === "coupon" && selectedOffer.code
                    ? `Enter code ${selectedOffer.code} at checkout`
                    : "Applied automatically at checkout"
                }
              />
              <InfoSheetRow
                icon="wallet-outline"
                label="Discount"
                value={formatOfferValue(selectedOffer)}
              />
              <InfoSheetRow
                icon="basket-outline"
                label="Minimum order"
                value={
                  typeof selectedOffer.minimumOrderAmount === "number" &&
                  selectedOffer.minimumOrderAmount > 0
                    ? formatCurrency(selectedOffer.minimumOrderAmount)
                    : "No minimum order"
                }
              />
              {typeof selectedOffer.maximumDiscountAmount === "number" &&
              selectedOffer.maximumDiscountAmount > 0 ? (
                <InfoSheetRow
                  icon="shield-checkmark-outline"
                  label="Maximum discount"
                  value={formatCurrency(selectedOffer.maximumDiscountAmount)}
                />
              ) : null}
            </View>
          </>
        ) : null}
      </AppBottomSheet>

      <AppBottomSheet
        visible={Boolean(selectedItem)}
        onClose={closeCustomizer}
        title={selectedItem?.name ?? "Item details"}
        subtitle={
          selectedItemHasCustomizations ? "Customize your item" : "Ready to add"
        }
        leadingIcon={
          selectedItemHasCustomizations
            ? "options-outline"
            : "restaurant-outline"
        }
        snapPoints={[0.72, 0.9]}
        initialSnapPoint={0.72}
        scroll={false}
        contentContainerStyle={styles.customBottomSheetContent}
      >
        {selectedItem ? (
          <>
            <View style={styles.customHeroCard}>
              <RemoteImage
                uri={selectedItem.images?.[0]?.url}
                style={styles.customHeroImage}
                fallbackIcon="fast-food-outline"
                accessibilityLabel={`${selectedItem.name} food photo`}
              />
              <View style={styles.customHeroCopy}>
                <Text style={styles.customHeroTitle}>{selectedItem.name}</Text>
                {selectedItem.description ? (
                  <Text style={styles.customHeroDescription}>
                    {selectedItem.description}
                  </Text>
                ) : null}
                {selectedItem.markdown?.hasMarkdown ? (
                  <View style={styles.customHeroPriceRow}>
                    <Text style={styles.customHeroPriceStrike}>
                      {selectedItemHasCustomizations
                        ? `Starts from ${formatCurrency(selectedItem.markdown.originalPrice)}`
                        : formatCurrency(selectedItem.markdown.originalPrice)}
                    </Text>
                    <Text style={styles.customHeroPrice}>
                      {formatCurrency(selectedItem.markdown.effectivePrice)}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.customHeroPrice}>
                    {selectedItemHasCustomizations
                      ? `Starts from ${formatCurrency(buildStartingPrice(selectedItem))}`
                      : formatCurrency(selectedItem.basePrice)}
                  </Text>
                )}
              </View>
            </View>

            <ScrollView
              style={styles.customScrollArea}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.customContent}
            >
              {!selectedItemHasCustomizations ? (
                <View style={styles.simpleItemCard}>
                  <View style={styles.simpleItemBadge}>
                    <Ionicons
                      name="sparkles-outline"
                      size={14}
                      color={palette.secondary}
                    />
                    <Text style={styles.simpleItemBadgeText}>
                      Quick add item
                    </Text>
                  </View>
                  <Text style={styles.simpleItemBody}>
                    {selectedItem.description?.trim()
                      ? selectedItem.description
                      : "This item is ready to add to your cart as-is."}
                  </Text>
                </View>
              ) : null}

              {(selectedItem.variants ?? []).map((group) => {
                const selected = selectedVariants[group.name] ?? [];
                const isMissingRequired =
                  (group.minSelect ?? 0) > 0 &&
                  selected.length < Math.max(group.minSelect ?? 0, 1);

                return (
                  <View
                    key={group.name}
                    style={[
                      styles.groupCard,
                      isMissingRequired ? styles.groupCardWarning : null,
                    ]}
                  >
                    <View style={styles.groupHeader}>
                      <View style={styles.groupTitleWrap}>
                        <Text style={styles.groupTitle}>{group.name}</Text>
                        <Text style={styles.groupMeta}>Required • Pick 1</Text>
                      </View>
                    </View>
                    <View style={styles.optionsList}>
                      {group.options.map((option) => {
                        const isSelected = selected.includes(option.label);
                        return (
                          <Pressable
                            key={option.label}
                            onPress={() => {
                              void Haptics.selectionAsync();
                              toggleSelection(
                                group.name,
                                option.label,
                                group,
                                "variant",
                              );
                            }}
                            style={[
                              styles.optionCard,
                              isSelected ? styles.optionCardSelected : null,
                            ]}
                          >
                            <View
                              style={[
                                styles.optionIndicator,
                                isSelected
                                  ? styles.optionIndicatorSelected
                                  : null,
                              ]}
                            >
                              <Ionicons
                                name={
                                  isSelected
                                    ? "radio-button-on"
                                    : "radio-button-off-outline"
                                }
                                size={13}
                                color={
                                  isSelected
                                    ? palette.surface
                                    : palette.mutedForeground
                                }
                              />
                            </View>
                            <View style={styles.optionCopy}>
                              <Text style={styles.optionTitle}>
                                {option.label}
                              </Text>
                              <Text style={styles.optionSubtitle}>
                                {option.priceDelta > 0
                                  ? `+ ${formatCurrency(option.priceDelta)}`
                                  : "Included"}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              {(selectedItem.addOnGroups ?? []).map((group) => {
                const selected = selectedAddOns[group.name] ?? [];
                const isMissingRequired =
                  (group.minSelect ?? 0) > 0 &&
                  selected.length < Math.max(group.minSelect ?? 0, 1);

                return (
                  <View
                    key={group.name}
                    style={[
                      styles.groupCard,
                      isMissingRequired ? styles.groupCardWarning : null,
                    ]}
                  >
                    <View style={styles.groupHeader}>
                      <View style={styles.groupTitleWrap}>
                        <Text style={styles.groupTitle}>{group.name}</Text>
                        <Text style={styles.groupMeta}>
                          {(group.minSelect ?? 0) > 0 ? "Required" : "Optional"}{" "}
                          • Up to {group.maxSelect ?? 10}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.optionsList}>
                      {group.options.map((option) => {
                        const isSelected = selected.includes(option.label);
                        return (
                          <Pressable
                            key={option.label}
                            onPress={() => {
                              void Haptics.selectionAsync();
                              toggleSelection(
                                group.name,
                                option.label,
                                group,
                                "addon",
                              );
                            }}
                            style={[
                              styles.optionCard,
                              isSelected ? styles.optionCardSelected : null,
                            ]}
                          >
                            <View
                              style={[
                                styles.optionIndicator,
                                isSelected
                                  ? styles.optionIndicatorSelected
                                  : null,
                              ]}
                            >
                              <Ionicons
                                name={isSelected ? "checkmark" : "add"}
                                size={13}
                                color={
                                  isSelected
                                    ? palette.surface
                                    : palette.mutedForeground
                                }
                              />
                            </View>
                            <View style={styles.optionCopy}>
                              <Text style={styles.optionTitle}>
                                {option.label}
                              </Text>
                              <Text style={styles.optionSubtitle}>
                                {option.price > 0
                                  ? `+ ${formatCurrency(option.price)}`
                                  : "Included"}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <View
              style={[
                styles.customFooter,
                { paddingBottom: Math.max(insets.bottom + 14, 24) },
              ]}
            >
              <View style={styles.quantityWrap}>
                <Pressable
                  style={({ pressed }) => [
                    styles.quantityButton,
                    pressed
                      ? [
                          styles.quickButtonPressed,
                          styles.quickButtonSecondaryPressed,
                        ]
                      : null,
                  ]}
                  onPressIn={() => {
                    setQuantity((current) => Math.max(1, current - 1));
                  }}
                >
                  <Ionicons
                    name="remove"
                    size={16}
                    color={palette.foreground}
                  />
                </Pressable>
                <Text style={styles.quantityText}>{quantity}</Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.quantityButton,
                    styles.quantityButtonPrimary,
                    pressed ? styles.quickButtonPressed : null,
                  ]}
                  onPressIn={() => {
                    setQuantity((current) => current + 1);
                    setCustomQuantityBurstKey((current) => current + 1);
                  }}
                >
                  <Ionicons name="add" size={16} color={palette.surface} />
                  {customQuantityBurstKey > 0 ? (
                    <ButtonParticleBurst
                      triggerKey={customQuantityBurstKey}
                      onComplete={handleCustomQuantityBurstComplete}
                    />
                  ) : null}
                </Pressable>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.submitButton,
                  !canAddFromRestaurant ? styles.submitButtonDisabled : null,
                  pressed ? styles.submitButtonPressed : null,
                ]}
                onPressIn={() => {
                  if (!canAddFromRestaurant) {
                    router.push("/location-picker");
                    return;
                  }
                  // Fire on press-in (like the quantity steppers): React Native's
                  // Modal can swallow the first press-release after it opens, which
                  // is what made the button need a second tap. The ref guards
                  // against the same touch adding twice.
                  if (addInFlightRef.current) return;
                  addInFlightRef.current = true;
                  const didAdd = handleAddToCart();
                  if (!didAdd) {
                    addInFlightRef.current = false;
                  }
                }}
              >
                <Text style={styles.submitButtonText}>
                  {!canAddFromRestaurant ? (
                    "Change location"
                  ) : selectedItemMarkdown.perUnit > 0 ? (
                    <>
                      {`Add ${formatCurrency(selectedItemMarkdown.effectiveTotal)}  `}
                      <Text
                        style={{
                          textDecorationLine: "line-through",
                          opacity: 0.7,
                        }}
                      >
                        {formatCurrency(selectedItemTotal)}
                      </Text>
                    </>
                  ) : (
                    `Add ${formatCurrency(selectedItemTotal)}`
                  )}
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </AppBottomSheet>
    </Screen>
  );
}
