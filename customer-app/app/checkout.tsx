import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { styles } from "@/src/components/checkout/checkout.styles";
import {
  buildDeliveryWhyText,
  hasDeliveryDistanceSurcharge,
} from "@/src/lib/delivery-breakdown";
import {
  canOptIntoPlatformFee,
  platformFeeLabel,
} from "@/src/lib/platform-fee";
import {
  canOptIntoUrgentDelivery,
  urgentDeliveryLabel,
} from "@/src/lib/urgent-delivery";
import { NeonStickerCard } from "@/src/components/neon-sticker-card";
import { OfflineNoticeCard } from "@/src/components/offline-notice-card";
import { PressableScale } from "@/src/components/pressable-scale";
import {
  useBkashInitiateMutation,
  type CartQuoteResponse,
  useCustomerApplyReferralCodeMutation,
  useCustomerCartQuoteQuery,
  useCustomerPaymentSettingsQuery,
  useCustomerPlaceOrderMutation,
  useCustomerReferralSummaryQuery,
} from "@/src/hooks/use-customer-api";
import { trackCustomerEvent } from "@/src/lib/analytics";
import { apiProtectedPost } from "@/src/lib/api";
import { saveBkashPaymentDraft } from "@/src/lib/bkash-payment-draft";
import { formatCurrency } from "@/src/lib/currency";
import { applyCurrentLocation } from "@/src/lib/current-location";
import { getStableCustomerInstallId } from "@/src/lib/customer-install-id";
import {
  formatCustomerAddressLine,
  formatDeliveryAddress,
} from "@/src/lib/location-address";
import { formatShortOrderIdLabel } from "@/src/lib/order-id";
import {
  getRestaurantOutOfDeliveryAreaCopy,
  isRestaurantOutOfDeliveryAreaError,
} from "@/src/lib/serviceability";
import { useIsOnline } from "@/src/hooks/use-network-status";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import {
  buildCartItemKey,
  getCartSubtotal,
  useCartStore,
} from "@/src/store/cart-store";
import { useLocationStore } from "@/src/store/location-store";
import { usePaymentPreferencesStore } from "@/src/store/payment-preferences-store";
import { palette } from "@/src/theme/palette";

type PaymentMethod = "Cash" | "Bkash";
const bkashLogo = require("../assets/images/bkash.png");

function sanitizeCheckoutCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);
}

const paymentOptions: {
  id: PaymentMethod;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  imageSource?: number;
  accentColor: string;
}[] = [
  {
    id: "Cash",
    title: "Cash on delivery",
    subtitle: "Pay when the rider reaches your door.",
    icon: "cash-outline",
    accentColor: "#FFEAF3",
  },
  {
    id: "Bkash",
    title: "bKash",
    subtitle: "Continue to the official hosted payment page.",
    icon: "phone-portrait-outline",
    imageSource: bkashLogo,
    accentColor: "#FFE4EF",
  },
];

function createClientOrderId() {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `co_${Date.now()}_${randomPart}`;
}

export default function CheckoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    ref?: string;
    referralCode?: string;
  }>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [voucherCodeInput, setVoucherCodeInput] = useState("");
  const [appliedVoucherCode, setAppliedVoucherCode] = useState("");
  const [appliedReferralCode, setAppliedReferralCode] = useState("");
  const [appliedReferralName, setAppliedReferralName] = useState("");
  const [restaurantOrderNote, setRestaurantOrderNote] = useState("");
  const [voucherFeedback, setVoucherFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const [isApplyingVoucher, setIsApplyingVoucher] = useState(false);
  const [isUsingCurrentLocation, setIsUsingCurrentLocation] = useState(false);
  const [isWaitingForLocationQuote, setIsWaitingForLocationQuote] =
    useState(false);
  const [paymentError, setPaymentError] = useState("");
  const hasCompletedCheckoutRef = useRef(false);
  const checkoutTrackedKeyRef = useRef("");
  const clientOrderIdRef = useRef(createClientOrderId());
  const hasInitializedPaymentMethodRef = useRef(false);
  const [bkashPayment, setBkashPayment] = useState<{
    sessionId: string;
    paymentID: string;
    amount: number;
    walletNumber: string;
    expiresAt: string;
    transactionId?: string;
    confirmedAt?: string;
  } | null>(null);

  const restaurant = useCartStore((state) => state.restaurant);
  const items = useCartStore((state) => state.items);
  const reorderContext = useCartStore((state) => state.reorderContext);
  const clearCart = useCartStore((state) => state.clearCart);
  const setReorderContext = useCartStore((state) => state.setReorderContext);
  const syncPricing = useCartStore((state) => state.syncPricing);
  // Optional platform-fee opt-in, shared with the cart via the store so the choice carries
  // over. Re-quotes so pricing.total stays authoritative.
  const platformFeeOptedIn = useCartStore((state) => state.platformFeeOptedIn);
  const setPlatformFeeOptedIn = useCartStore(
    (state) => state.setPlatformFeeOptedIn,
  );
  const urgentDeliveryOptedIn = useCartStore(
    (state) => state.urgentDeliveryOptedIn,
  );
  const setUrgentDeliveryOptedIn = useCartStore(
    (state) => state.setUrgentDeliveryOptedIn,
  );
  const selectedLocation = useLocationStore((state) => state.selectedLocation);
  const selectedDeliveryAddress = useMemo(
    () => formatDeliveryAddress(selectedLocation),
    [selectedLocation],
  );
  const selectedDeliveryAddressLine = useMemo(
    () =>
      formatCustomerAddressLine(selectedLocation?.address, "Selected location"),
    [selectedLocation?.address],
  );
  const selectedDeliveryAddressDetails =
    selectedLocation?.addressDetails?.trim() || undefined;
  const selectedDeliveryAddressPrimaryText =
    selectedDeliveryAddressDetails ||
    selectedLocation?.label ||
    selectedDeliveryAddress ||
    "Choose delivery point";
  const shouldShowMapAddressUnderManual =
    Boolean(selectedDeliveryAddressDetails) &&
    Boolean(selectedDeliveryAddressLine) &&
    selectedDeliveryAddressLine.trim().toLowerCase() !==
      selectedDeliveryAddressDetails?.trim().toLowerCase();
  const customer = useCustomerAuthStore((state) => state.customer);
  const preferredPaymentMethod = usePaymentPreferencesStore(
    (state) => state.preferredPaymentMethod,
  );
  const setPreferredPaymentMethod = usePaymentPreferencesStore(
    (state) => state.setPreferredPaymentMethod,
  );
  const isOnline = useIsOnline();
  const bkashWalletNumber = customer?.phone?.trim() ?? "";
  const placeOrderMutation = useCustomerPlaceOrderMutation();
  const applyReferralMutation = useCustomerApplyReferralCodeMutation();
  const bkashInitiateMutation = useBkashInitiateMutation();
  const paymentSettingsQuery = useCustomerPaymentSettingsQuery();
  const [installId, setInstallId] = useState<string | undefined>(undefined);
  useEffect(() => {
    let active = true;
    getStableCustomerInstallId()
      .then((id) => {
        if (active) setInstallId(id);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const referralSummaryQuery = useCustomerReferralSummaryQuery(
    Boolean(customer),
    installId,
  );
  const referralSummary = referralSummaryQuery.data;
  const canApplyReferralCode = Boolean(referralSummary?.canApplyReferralCode);
  // Would a referral actually grant a welcome voucher on THIS device? False once the
  // device has already used a welcome perk (referral or first-order) — hide the "new to
  // Foodbela" nudge so we never invite a referral that can't add a discount here.
  const deviceWelcomeEligible =
    referralSummary?.deviceWelcomeEligible !== false;
  // A referral is only genuinely usable here when the account can still apply one AND this
  // physical device hasn't already consumed a welcome perk. `canApplyReferralCode` alone is
  // account-scoped (a fresh phone on a used device reads as eligible), so on a device that has
  // already delivered/welcomed the backend rejects the code (REFERRAL_DEVICE_ALREADY_REWARDED).
  // Gate the referral wording AND the apply-attempt on both, so we never invite a referral that
  // can't work here — the box just behaves as a plain voucher field. (The hint already did this.)
  const referralUsableHere = canApplyReferralCode && deviceWelcomeEligible;
  const shouldAttemptReferralCode =
    referralUsableHere || referralSummaryQuery.isLoading;
  const codeInputTitle = referralUsableHere
    ? "Voucher or referral code"
    : "Voucher";
  const codeInputPlaceholder = referralUsableHere
    ? "Enter voucher or referral code"
    : "Enter voucher code";
  const codeInputHint = referralUsableHere
    ? "New to Foodbela? You can also use a referral code here."
    : "";
  const incomingReferralCode = useMemo(
    () => sanitizeCheckoutCode(String(params.ref ?? params.referralCode ?? "")),
    [params.ref, params.referralCode],
  );
  const paymentSettings = paymentSettingsQuery.data ?? {
    cashOnDeliveryEnabled: true,
    bkashEnabled: false,
    bkashLabel: "bKash",
    bkashSubtitle: "Continue to the official hosted payment page.",
    bkashRefundEtaMinutes: 60,
  };
  const visiblePaymentOptions = useMemo(
    () =>
      paymentOptions
        .filter((option) =>
          option.id === "Cash"
            ? paymentSettings.cashOnDeliveryEnabled ||
              !paymentSettings.bkashEnabled
            : paymentSettings.bkashEnabled,
        )
        .map((option) =>
          option.id === "Bkash"
            ? {
                ...option,
                title: paymentSettings.bkashLabel,
                subtitle: paymentSettings.bkashSubtitle,
              }
            : option,
        ),
    [
      paymentSettings.cashOnDeliveryEnabled,
      paymentSettings.bkashEnabled,
      paymentSettings.bkashLabel,
      paymentSettings.bkashSubtitle,
    ],
  );

  useEffect(() => {
    if (
      paymentSettingsQuery.isLoading ||
      hasInitializedPaymentMethodRef.current
    ) {
      return;
    }

    const preferredIsAvailable = visiblePaymentOptions.some(
      (option) => option.id === preferredPaymentMethod,
    );
    const nextPaymentMethod = preferredIsAvailable
      ? preferredPaymentMethod
      : (visiblePaymentOptions[0]?.id ?? "Cash");

    setPaymentMethod(nextPaymentMethod);
    hasInitializedPaymentMethodRef.current = true;
  }, [
    paymentSettingsQuery.isLoading,
    preferredPaymentMethod,
    visiblePaymentOptions,
  ]);

  const quoteQuery = useCustomerCartQuoteQuery({
    restaurantId: restaurant?.restaurantId,
    items: items.map((item) => ({
      itemId: item.itemId,
      quantity: item.quantity,
      selectedVariantOptions: item.selectedVariantOptions,
      selectedAddOnOptions: item.selectedAddOnOptions,
    })),
    voucherCode: appliedVoucherCode || undefined,
    latitude: selectedLocation?.latitude,
    longitude: selectedLocation?.longitude,
    requiresLocation: true,
    platformFeeOptedIn,
    urgentDeliveryOptedIn,
  });

  useEffect(() => {
    if (
      !incomingReferralCode ||
      voucherCodeInput ||
      appliedVoucherCode ||
      appliedReferralCode
    ) {
      return;
    }

    setVoucherCodeInput(incomingReferralCode);
    setVoucherFeedback({
      type: "success",
      message: "Referral code added. Tap Apply before placing your order.",
    });
  }, [
    appliedReferralCode,
    appliedVoucherCode,
    incomingReferralCode,
    voucherCodeInput,
  ]);

  const localSubtotal = getCartSubtotal(items);
  const pricing = quoteQuery.data?.pricing;
  // "Why this delivery fee" split from the live quote, shown the same way as the cart.
  const deliveryBreakdown = quoteQuery.data?.deliveryBreakdown;
  const deliveryWhyText = useMemo(
    () => buildDeliveryWhyText(deliveryBreakdown),
    [deliveryBreakdown],
  );
  // Admin-set platform fee. Charged amount (flat/percentage or opted-in optional) lands in
  // pricing.platformFee; the opt-in control shows only for the optional mode.
  const platformFeeInfo = quoteQuery.data?.platformFeeInfo;
  const showPlatformFeeOptIn = canOptIntoPlatformFee(platformFeeInfo);
  // If the fee stops being opt-in-able (mode/zone changed mid-session), drop the opt-in so
  // we never keep charging a fee the customer can no longer see a toggle for.
  useEffect(() => {
    if (!showPlatformFeeOptIn && platformFeeOptedIn) {
      setPlatformFeeOptedIn(false);
    }
  }, [showPlatformFeeOptIn, platformFeeOptedIn, setPlatformFeeOptedIn]);
  // Urgent delivery opt-in (same pattern as the optional platform fee).
  const urgentDeliveryInfo = quoteQuery.data?.urgentDeliveryInfo;
  const showUrgentDeliveryOptIn = canOptIntoUrgentDelivery(urgentDeliveryInfo);
  useEffect(() => {
    if (!showUrgentDeliveryOptIn && urgentDeliveryOptedIn) {
      setUrgentDeliveryOptedIn(false);
    }
  }, [showUrgentDeliveryOptIn, urgentDeliveryOptedIn, setUrgentDeliveryOptedIn]);
  const restaurantNoteSetting = quoteQuery.data?.restaurant.orderNote;
  const shouldShowRestaurantNote = restaurantNoteSetting?.enabled === true;
  const restaurantNoteLabel =
    restaurantNoteSetting?.label?.trim() || "Order note";
  const restaurantNotePlaceholder =
    restaurantNoteSetting?.placeholder?.trim() ||
    "Cake name, message, or any restaurant instruction";
  const sanitizedRestaurantOrderNote = restaurantOrderNote.trim().slice(0, 240);
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
  const priceChangedCount = useMemo(
    () =>
      items.reduce((count, item) => {
        const quotedItem = quotedItemsByKey.get(item.key);
        return quotedItem && quotedItem.unitPrice !== item.unitPrice
          ? count + 1
          : count;
      }, 0),
    [items, quotedItemsByKey],
  );
  const hasQuoteIssues = quoteQuery.isError;
  const quoteErrorMessage =
    quoteQuery.error instanceof Error
      ? quoteQuery.error.message
      : "We could not verify this cart with the latest restaurant pricing.";
  const isServiceabilityBlocked =
    hasQuoteIssues && isRestaurantOutOfDeliveryAreaError(quoteErrorMessage);
  const isCheckingDeliveryArea =
    isUsingCurrentLocation || isWaitingForLocationQuote;
  const shouldShowQuoteIssue = hasQuoteIssues && !isCheckingDeliveryArea;
  const shouldUsePrimaryActionForLocation =
    !selectedLocation || isServiceabilityBlocked;
  const isPrimaryActionDisabled =
    isCheckingDeliveryArea ||
    (!shouldUsePrimaryActionForLocation &&
      (placeOrderMutation.isPending ||
        bkashInitiateMutation.isPending ||
        quoteQuery.isLoading ||
        (hasQuoteIssues && !isServiceabilityBlocked) ||
        !isOnline ||
        paymentSettingsQuery.isLoading));
  const isApplyingCode = isApplyingVoucher || applyReferralMutation.isPending;

  const itemPayload = useMemo(
    () =>
      items.map((item) => ({
        itemId: item.itemId,
        quantity: item.quantity,
        selectedVariantOptions: item.selectedVariantOptions,
        selectedAddOnOptions: item.selectedAddOnOptions,
      })),
    [items],
  );

  const itemSummary = useMemo(
    () =>
      items.map((item) => ({
        key: item.key,
        name: item.name,
        quantity: item.quantity,
        total:
          quotedItemsByKey.get(item.key)?.lineTotal ??
          item.unitPrice * item.quantity,
        unitPrice: quotedItemsByKey.get(item.key)?.unitPrice ?? item.unitPrice,
        isPriceChanged:
          typeof quotedItemsByKey.get(item.key)?.unitPrice === "number" &&
          quotedItemsByKey.get(item.key)?.unitPrice !== item.unitPrice,
      })),
    [items, quotedItemsByKey],
  );

  useEffect(() => {
    if (!isFocused || !restaurant || !customer || items.length === 0) {
      return;
    }

    const trackingKey = `${restaurant.restaurantId}|${items
      .map((item) => `${item.itemId}:${item.quantity}`)
      .join("|")}`;
    if (checkoutTrackedKeyRef.current === trackingKey) {
      return;
    }
    checkoutTrackedKeyRef.current = trackingKey;

    void trackCustomerEvent({
      eventType: "checkout_start",
      path: "/checkout",
      screenName: "checkout",
      entityType: "restaurant",
      entityId: restaurant.restaurantId,
      metadata: {
        restaurantId: restaurant.restaurantId,
        restaurantName: restaurant.restaurantName,
        itemCount: items.length,
        subtotal: pricing?.subtotal ?? localSubtotal,
        total: pricing?.total ?? localSubtotal,
        deliveryFee: pricing?.deliveryFee ?? 0,
        discountAmount: pricing?.discountAmount ?? 0,
        voucherApplied: Boolean(appliedVoucherCode),
        items: itemSummary.map((item) => ({
          itemId: item.key,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        })),
      },
    });
  }, [
    appliedVoucherCode,
    customer,
    isFocused,
    itemSummary,
    items,
    localSubtotal,
    pricing?.deliveryFee,
    pricing?.discountAmount,
    pricing?.subtotal,
    pricing?.total,
    restaurant,
  ]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    if (hasCompletedCheckoutRef.current) {
      return;
    }

    if (!restaurant || items.length === 0) {
      router.replace("/(tabs)/cart");
      return;
    }

    if (!customer) {
      const redirectTo = incomingReferralCode
        ? `/checkout?ref=${encodeURIComponent(incomingReferralCode)}`
        : "/checkout";
      router.replace({
        pathname: "/sign-in",
        params: { redirectTo },
      });
    }
  }, [
    customer,
    incomingReferralCode,
    isFocused,
    items.length,
    restaurant,
    router,
  ]);

  useEffect(() => {
    if (paymentMethod === "Bkash" && !paymentSettings.bkashEnabled) {
      setPaymentMethod("Cash");
      setPaymentError("");
      setBkashPayment(null);
    }
  }, [paymentMethod, paymentSettings.bkashEnabled]);

  useEffect(() => {
    setBkashPayment((current) => {
      if (!current) return null;
      if (current.amount !== (pricing?.total ?? localSubtotal)) return null;
      if (current.walletNumber !== bkashWalletNumber) return null;
      return current;
    });
    setPaymentError("");
  }, [
    appliedReferralCode,
    appliedVoucherCode,
    bkashWalletNumber,
    localSubtotal,
    pricing?.total,
  ]);

  useEffect(() => {
    if (!isWaitingForLocationQuote) return;
    if (!quoteQuery.isLoading && !quoteQuery.isFetching) {
      setIsWaitingForLocationQuote(false);
    }
  }, [isWaitingForLocationQuote, quoteQuery.isFetching, quoteQuery.isLoading]);

  useEffect(() => {
    if (!quoteQuery.data?.items?.length) {
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
  }, [quoteQuery.data?.items, syncPricing]);

  if (!restaurant || items.length === 0 || !customer) {
    return null;
  }

  async function handleApplyVoucher() {
    if (isApplyingVoucher || applyReferralMutation.isPending) return;
    if (!restaurant) return;

    const activeRestaurant = restaurant;
    const code = sanitizeCheckoutCode(voucherCodeInput);
    setPaymentError("");
    setBkashPayment(null);

    if (!code) {
      setAppliedVoucherCode("");
      setVoucherFeedback(null);
      return;
    }

    setIsApplyingVoucher(true);
    setVoucherFeedback(null);

    try {
      const response = await apiProtectedPost<CartQuoteResponse>(
        "/customer/cart/quote",
        {
          restaurantId: activeRestaurant.restaurantId,
          items: itemPayload,
          voucherCode: code,
          latitude: selectedLocation?.latitude,
          longitude: selectedLocation?.longitude,
        },
      );
      const appliedCoupon = response.data.appliedVouchers.find(
        (voucher) =>
          voucher.mode === "coupon" && voucher.code?.toUpperCase() === code,
      );

      if (!appliedCoupon) {
        throw new Error("This voucher could not be applied to this cart.");
      }

      setAppliedVoucherCode(code);
      setVoucherCodeInput(code);
      setVoucherFeedback({
        type: "success",
        message:
          (appliedCoupon.discountAmount ?? 0) > 0
            ? `Voucher applied. You saved ${formatCurrency(appliedCoupon.discountAmount ?? 0)}.`
            : "Voucher applied successfully.",
      });

      void trackCustomerEvent({
        eventType: "voucher_applied",
        path: "/checkout",
        screenName: "checkout",
        entityType: "voucher",
        entityId: code,
        metadata: {
          code,
          restaurantId: activeRestaurant.restaurantId,
          itemCount: items.length,
          subtotal: pricing?.subtotal ?? localSubtotal,
        },
      });
      return;
    } catch (voucherError) {
      setAppliedVoucherCode("");
      if (!shouldAttemptReferralCode) {
        setVoucherFeedback({
          type: "error",
          message:
            voucherError instanceof Error
              ? voucherError.message
              : "This voucher could not be applied.",
        });
        return;
      }

      try {
        const referral = await applyReferralMutation.mutateAsync({
          referralCode: code,
          installId: installId ?? (await getStableCustomerInstallId()),
        });
        setAppliedReferralCode(referral.referralCode);
        setAppliedReferralName(referral.referrerName);
        // Clear the field so the customer can still enter a coupon on top of the referral —
        // the referral itself stays applied as a permanent, earned badge below.
        setVoucherCodeInput("");
        // The referral welcome voucher is auto-applied by pricing, so re-quote now to
        // reflect the discount in the order summary immediately (it previously only showed
        // after a manual pull-to-refresh, because the quote didn't depend on referral
        // state). "Applied/saved" is then derived from what actually got granted — never a
        // green "applied" when no voucher was added.
        await quoteQuery.refetch();
        setVoucherFeedback(
          referral.welcomeVoucherGranted
            ? {
                type: "success",
                message: referral.welcomeVoucherAmount
                  ? `Referral applied! Tk ${referral.welcomeVoucherAmount} welcome reward added to your offers.`
                  : referral.message,
              }
            : { type: "info", message: referral.message },
        );
      } catch (referralError) {
        setVoucherFeedback({
          type: "error",
          message:
            referralError instanceof Error
              ? referralError.message
              : voucherError instanceof Error
                ? voucherError.message
                : "This code could not be applied.",
        });
      }
    } finally {
      setIsApplyingVoucher(false);
    }
  }

  function handleRemoveVoucher() {
    setVoucherCodeInput("");
    setAppliedVoucherCode("");
    setAppliedReferralCode("");
    setAppliedReferralName("");
    setVoucherFeedback(null);
    setBkashPayment(null);
    setPaymentError("");
  }

  async function handleUseCurrentLocation() {
    if (isUsingCurrentLocation || isWaitingForLocationQuote) return;
    setIsUsingCurrentLocation(true);
    setPaymentError("");
    try {
      await applyCurrentLocation();
      setIsWaitingForLocationQuote(true);
      setPaymentError("");
    } catch {
      setIsWaitingForLocationQuote(false);
      router.push("/location-picker");
    } finally {
      setIsUsingCurrentLocation(false);
    }
  }

  async function handlePayWithBkash() {
    if (!restaurant) return;
    if (!paymentSettings.bkashEnabled) {
      setPaymentMethod("Cash");
      setPaymentError("bKash payment is not available right now.");
      return;
    }

    if (!isOnline) {
      setPaymentError("Reconnect to continue with bKash payment.");
      return;
    }

    if (hasQuoteIssues || quoteQuery.isLoading) {
      setPaymentError(
        isServiceabilityBlocked
          ? getRestaurantOutOfDeliveryAreaCopy(restaurant.restaurantName)
          : "Please wait while we verify your cart with the latest restaurant pricing.",
      );
      return;
    }

    if (!/^01\d{9}$/.test(bkashWalletNumber)) {
      setPaymentError(
        "We need a valid account phone number before starting bKash.",
      );
      return;
    }

    if (
      !selectedLocation ||
      typeof selectedLocation.latitude !== "number" ||
      typeof selectedLocation.longitude !== "number"
    ) {
      setPaymentError(
        "Select a pinned delivery location before starting bKash.",
      );
      return;
    }

    setPaymentError("");
    setPreferredPaymentMethod("Bkash");

    try {
      void trackCustomerEvent({
        eventType: "payment_initiated",
        path: "/checkout",
        screenName: "checkout",
        entityType: "restaurant",
        entityId: restaurant.restaurantId,
        metadata: {
          provider: "Bkash",
          paymentMethod: "Bkash",
          restaurantId: restaurant.restaurantId,
          amount: pricing?.total ?? localSubtotal,
          voucherApplied: Boolean(appliedVoucherCode),
        },
      });
      const response = await bkashInitiateMutation.mutateAsync({
        restaurantId: restaurant.restaurantId,
        clientOrderId: clientOrderIdRef.current,
        items: itemPayload,
        voucherCode: appliedVoucherCode || undefined,
        note: sanitizedRestaurantOrderNote || undefined,
        walletNumber: bkashWalletNumber,
        platformFeeOptedIn,
        urgentDeliveryOptedIn,
        deliveryAddress: {
          label: selectedLocation.label,
          addressLine: selectedDeliveryAddressLine,
          addressDetails: selectedDeliveryAddressDetails,
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
        },
      });
      await saveBkashPaymentDraft({
        sessionId: response.sessionId,
        paymentUrl: response.bkashURL,
        paymentID: response.paymentID,
        clientOrderId: clientOrderIdRef.current,
        restaurantId: restaurant.restaurantId,
        voucherCode: appliedVoucherCode || undefined,
        note: sanitizedRestaurantOrderNote || undefined,
        walletNumber: response.walletNumber,
        amount: response.amount,
        expiresAt: response.expiresAt,
        items: itemPayload,
        deliveryAddress: {
          label: selectedLocation.label,
          addressLine: selectedDeliveryAddressLine,
          addressDetails: selectedDeliveryAddressDetails,
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
        },
      });

      router.push({
        pathname: "/bkash-payment",
        params: {
          sessionId: response.sessionId,
        },
      });
    } catch (error) {
      void trackCustomerEvent({
        eventType: "payment_failed",
        path: "/checkout",
        screenName: "checkout",
        entityType: "restaurant",
        entityId: restaurant.restaurantId,
        metadata: {
          provider: "Bkash",
          stage: "initiate",
          restaurantId: restaurant.restaurantId,
          message:
            error instanceof Error
              ? error.message.slice(0, 120)
              : "Could not start bKash payment.",
        },
      });
      setPaymentError(
        error instanceof Error
          ? error.message
          : "Could not start bKash payment.",
      );
    }
  }

  async function handlePlaceOrder() {
    if (!restaurant || !customer || !selectedLocation || items.length === 0) {
      return;
    }
    if (!isOnline) {
      setPaymentError("Reconnect to place this order.");
      return;
    }

    if (hasQuoteIssues || quoteQuery.isLoading) {
      setPaymentError(
        isServiceabilityBlocked
          ? getRestaurantOutOfDeliveryAreaCopy(restaurant.restaurantName)
          : "Fix your cart pricing before placing the order.",
      );
      return;
    }

    if (paymentMethod === "Bkash" && !bkashPayment?.sessionId) {
      setPaymentError("Complete the bKash payment before placing the order.");
      void trackCustomerEvent({
        eventType: "payment_failed",
        path: "/checkout",
        screenName: "checkout",
        entityType: "restaurant",
        entityId: restaurant.restaurantId,
        metadata: {
          provider: "Bkash",
          stage: "order_submit_without_confirmed_payment",
          restaurantId: restaurant.restaurantId,
        },
      });
      return;
    }

    if (
      typeof selectedLocation.latitude !== "number" ||
      typeof selectedLocation.longitude !== "number"
    ) {
      setPaymentError(
        "Select a pinned delivery location before placing the order.",
      );
      return;
    }

    try {
      setPreferredPaymentMethod(paymentMethod);
      if (paymentMethod === "Cash") {
        void trackCustomerEvent({
          eventType: "payment_initiated",
          path: "/checkout",
          screenName: "checkout",
          entityType: "restaurant",
          entityId: restaurant.restaurantId,
          metadata: {
            provider: "Cash",
            paymentMethod: "Cash",
            restaurantId: restaurant.restaurantId,
            amount: pricing?.total ?? localSubtotal,
            voucherApplied: Boolean(appliedVoucherCode),
          },
        });
      }

      const response = await placeOrderMutation.mutateAsync({
        restaurantId: restaurant.restaurantId,
        clientOrderId: clientOrderIdRef.current,
        paymentMethod,
        voucherCode: appliedVoucherCode || undefined,
        note: sanitizedRestaurantOrderNote || undefined,
        platformFeeOptedIn,
        urgentDeliveryOptedIn,
        paymentReference:
          paymentMethod === "Bkash"
            ? {
                provider: "Bkash",
                bkashSessionId: bkashPayment?.sessionId,
                walletNumber: bkashPayment?.walletNumber,
              }
            : undefined,
        items: itemPayload,
        deliveryAddress: {
          label: selectedLocation.label,
          addressLine: selectedDeliveryAddressLine,
          addressDetails: selectedDeliveryAddressDetails,
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
        },
      });

      void trackCustomerEvent({
        eventType: "order_created",
        path: "/checkout",
        screenName: "checkout",
        entityType: "order",
        entityId: response.order._id,
        metadata: {
          itemCount: items.length,
          paymentMethod,
          restaurantId: restaurant.restaurantId,
          total: pricing?.total ?? localSubtotal,
          voucherApplied: Boolean(appliedVoucherCode),
        },
      });
      hasCompletedCheckoutRef.current = true;
      clearCart();
      router.replace({
        pathname: "/orders/[orderId]",
        params: {
          orderId: response.order._id,
          justPlaced: "1",
        },
      });
    } catch (error) {
      void trackCustomerEvent({
        eventType: "payment_failed",
        path: "/checkout",
        screenName: "checkout",
        entityType: "restaurant",
        entityId: restaurant.restaurantId,
        metadata: {
          provider: paymentMethod,
          stage: "order_submit",
          restaurantId: restaurant.restaurantId,
          message:
            error instanceof Error
              ? error.message.slice(0, 120)
              : "Could not place order.",
        },
      });
      // handled in mutation state
    }
  }

  function handlePrimaryAction() {
    if (isCheckingDeliveryArea) {
      return;
    }

    if (shouldUsePrimaryActionForLocation) {
      router.push("/location-picker");
      return;
    }

    if (paymentMethod === "Bkash") {
      void handlePayWithBkash();
      return;
    }

    void handlePlaceOrder();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 154 + Math.max(insets.bottom, 0) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons
              name="chevron-back"
              size={20}
              color={palette.foreground}
            />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Checkout</Text>
            <Text style={styles.subtitle}>
              Choose address and payment to place your order.
            </Text>
          </View>
        </View>

        {!isOnline ? (
          <View style={styles.offlineWrap}>
            <OfflineNoticeCard description="Your cart is safe, but you need an internet connection to verify prices and place this order." />
          </View>
        ) : null}

        {isCheckingDeliveryArea ? (
          <View style={[styles.networkCard, styles.networkCardInfo]}>
            <ActivityIndicator size="small" color={palette.secondary} />
            <View style={styles.networkCopy}>
              <Text style={styles.networkTitle}>Checking delivery area</Text>
              <Text style={styles.networkSubtitle}>
                We are verifying this restaurant against your selected location.
              </Text>
            </View>
          </View>
        ) : null}

        {shouldShowQuoteIssue ? (
          <View style={[styles.networkCard, styles.networkCardWarning]}>
            <Ionicons
              name="alert-circle-outline"
              size={18}
              color={palette.primary}
            />
            <View style={styles.networkCopy}>
              <Text style={styles.networkTitle}>
                {isServiceabilityBlocked
                  ? "Outside delivery area"
                  : "Cart needs attention"}
              </Text>
              <Text style={styles.networkSubtitle}>
                {isServiceabilityBlocked
                  ? getRestaurantOutOfDeliveryAreaCopy(
                      restaurant.restaurantName,
                    )
                  : quoteErrorMessage.includes("not available")
                    ? "One or more items are no longer available. Update your cart before placing this order."
                    : quoteErrorMessage}
              </Text>
              {isServiceabilityBlocked ? (
                <View style={styles.networkActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.networkAction,
                      styles.networkActionPrimary,
                      pressed ? styles.checkoutButtonPressed : null,
                    ]}
                    onPress={() => router.push("/location-picker")}
                  >
                    <Ionicons
                      name="location-outline"
                      size={14}
                      color={palette.surface}
                    />
                    <Text style={styles.networkActionPrimaryText}>
                      Change location
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={
                      isUsingCurrentLocation || isWaitingForLocationQuote
                    }
                    style={({ pressed }) => [
                      styles.networkAction,
                      isUsingCurrentLocation || isWaitingForLocationQuote
                        ? styles.networkActionDisabled
                        : null,
                      pressed ? styles.checkoutButtonPressed : null,
                    ]}
                    onPress={() => {
                      void handleUseCurrentLocation();
                    }}
                  >
                    {isUsingCurrentLocation || isWaitingForLocationQuote ? (
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
                    <Text style={styles.networkActionText}>
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
          <View style={[styles.networkCard, styles.networkCardInfo]}>
            <Ionicons
              name="refresh-outline"
              size={18}
              color={palette.secondary}
            />
            <View style={styles.networkCopy}>
              <Text style={styles.networkTitle}>Latest prices applied</Text>
              <Text style={styles.networkSubtitle}>
                {priceChangedCount} item{priceChangedCount === 1 ? "" : "s"}{" "}
                updated before checkout so your total stays accurate.
              </Text>
            </View>
          </View>
        ) : null}

        {reorderContext ? (
          <View style={styles.reorderContextCard}>
            <View style={styles.reorderContextIconWrap}>
              <Ionicons
                name="refresh-outline"
                size={16}
                color={palette.secondary}
              />
            </View>
            <View style={styles.reorderContextCopy}>
              <Text style={styles.reorderContextTitle}>
                Reordering {formatShortOrderIdLabel(reorderContext.orderNumber)}
              </Text>
              <Text style={styles.reorderContextSubtitle}>
                These items were refreshed with the latest menu prices before
                checkout.
              </Text>
            </View>
            <Pressable
              style={styles.reorderContextDismiss}
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

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Deliver to</Text>
          </View>
          <Pressable
            style={styles.addressCard}
            onPress={() => router.push("/location-picker")}
          >
            <View style={styles.addressIconWrap}>
              <Ionicons
                name="location-outline"
                size={17}
                color={palette.secondary}
              />
            </View>
            <View style={styles.addressCopy}>
              <View style={styles.addressTitleRow}>
                <Text numberOfLines={2} style={styles.addressTitle}>
                  {selectedDeliveryAddressPrimaryText}
                </Text>
                <View style={styles.changePill}>
                  <Text style={styles.changePillText}>Change</Text>
                </View>
              </View>
              {selectedDeliveryAddressDetails &&
              shouldShowMapAddressUnderManual ? (
                <Text numberOfLines={2} style={styles.addressLine}>
                  {selectedDeliveryAddressLine}
                </Text>
              ) : !selectedDeliveryAddressDetails ? (
                <Text style={styles.addressLine}>
                  {selectedDeliveryAddress ||
                    "Choose a delivery point before placing the order."}
                </Text>
              ) : null}
            </View>
          </Pressable>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{codeInputTitle}</Text>
          </View>
          <View style={styles.surfaceCard}>
            {codeInputHint ? (
              <Text style={styles.voucherHintText}>{codeInputHint}</Text>
            ) : null}
            <View style={styles.voucherRow}>
              <TextInput
                value={voucherCodeInput}
                onChangeText={(value) => {
                  const nextCode = sanitizeCheckoutCode(value);
                  setVoucherCodeInput(nextCode);
                  setVoucherFeedback(null);
                  if (appliedVoucherCode && nextCode !== appliedVoucherCode) {
                    setAppliedVoucherCode("");
                  }
                  // The referral is permanent once applied (linked + welcome reward earned),
                  // so editing the code field to enter a coupon never un-applies it.
                }}
                placeholder={codeInputPlaceholder}
                placeholderTextColor={palette.mutedForeground}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!appliedVoucherCode}
                style={styles.voucherInput}
              />
              {appliedVoucherCode ? null : (
                <PressableScale
                  scaleTo={0.95}
                  style={[
                    styles.voucherButton,
                    isApplyingCode ? styles.voucherButtonDisabled : null,
                  ]}
                  onPress={handleApplyVoucher}
                  disabled={isApplyingCode}
                >
                  {isApplyingCode ? (
                    <ActivityIndicator size="small" color={palette.surface} />
                  ) : (
                    <Text style={styles.voucherButtonText}>Apply</Text>
                  )}
                </PressableScale>
              )}
            </View>
            {voucherFeedback ? (
              <View style={styles.voucherFeedbackWrap}>
                <Text
                  style={[
                    styles.voucherFeedbackText,
                    voucherFeedback.type === "error"
                      ? styles.voucherFeedbackTextError
                      : voucherFeedback.type === "info"
                        ? styles.voucherFeedbackTextInfo
                        : styles.voucherFeedbackTextSuccess,
                  ]}
                >
                  {voucherFeedback.message}
                </Text>
                {appliedVoucherCode ? (
                  <Pressable
                    onPress={handleRemoveVoucher}
                    style={styles.voucherRemoveButton}
                    hitSlop={8}
                  >
                    <Text style={styles.voucherRemoveText}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {appliedVoucherCode ? (
              <View style={styles.voucherAppliedRow}>
                {/* <Text style={styles.voucherAppliedText}>
                  Applied voucher: {appliedVoucherCode}
                </Text>
                <Pressable onPress={handleRemoveVoucher}>
                  <Text style={styles.voucherRemoveText}>Remove</Text>
                </Pressable> */}
              </View>
            ) : null}
            {appliedReferralCode ? (
              <View style={styles.voucherAppliedRow}>
                <Text style={styles.voucherAppliedText}>
                  Referral
                  {appliedReferralName ? ` from ${appliedReferralName}` : ""}{" "}
                  applied ✓ · welcome reward saved to your offers
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Payment</Text>
            {visiblePaymentOptions.length > 1 ? (
              <Text style={styles.sectionHint}>Choose one</Text>
            ) : null}
          </View>
          <View style={styles.paymentList}>
            {visiblePaymentOptions.map((option) => {
              const isActive = paymentMethod === option.id;
              return (
                <Pressable
                  key={option.id}
                  style={[
                    styles.paymentCard,
                    isActive ? styles.paymentCardActive : null,
                  ]}
                  onPress={() => {
                    setPaymentMethod(option.id);
                    setPreferredPaymentMethod(option.id);
                    setPaymentError("");
                  }}
                >
                  <View
                    style={[
                      styles.paymentIconWrap,
                      { backgroundColor: option.accentColor },
                    ]}
                  >
                    {option.imageSource ? (
                      <Image
                        source={option.imageSource}
                        resizeMode="contain"
                        style={{ width: 28, height: 28 }}
                      />
                    ) : (
                      <Ionicons
                        name={option.icon}
                        size={18}
                        color={palette.foreground}
                      />
                    )}
                  </View>
                  <View style={styles.paymentCopy}>
                    <Text style={styles.paymentTitle}>{option.title}</Text>
                    <Text style={styles.paymentSubtitle}>
                      {option.subtitle}
                    </Text>
                  </View>
                  <Ionicons
                    name={
                      isActive ? "radio-button-on" : "radio-button-off-outline"
                    }
                    size={18}
                    color={
                      isActive ? palette.secondary : palette.mutedForeground
                    }
                  />
                </Pressable>
              );
            })}
          </View>

          {paymentError ? (
            <Text style={styles.errorText}>{paymentError}</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Order summary</Text>
          </View>
          {shouldShowRestaurantNote ? (
            <View style={styles.restaurantNoteCard}>
              <View style={styles.restaurantNoteHeader}>
                <View style={styles.restaurantNoteIcon}>
                  <Ionicons
                    name="create-outline"
                    size={16}
                    color={palette.secondary}
                  />
                </View>
                <View style={styles.restaurantNoteCopy}>
                  <Text style={styles.restaurantNoteTitle}>
                    {restaurantNoteLabel}{" "}
                    <Text style={styles.restaurantNoteOptional}>
                      (optional)
                    </Text>
                  </Text>
                  <Text style={styles.restaurantNoteHint}>
                    The restaurant will see this with your order.
                  </Text>
                </View>
              </View>
              <TextInput
                value={restaurantOrderNote}
                onChangeText={(value) =>
                  setRestaurantOrderNote(value.slice(0, 240))
                }
                placeholder={restaurantNotePlaceholder}
                placeholderTextColor={palette.mutedForeground}
                multiline
                textAlignVertical="top"
                style={styles.restaurantNoteInput}
              />
            </View>
          ) : null}
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <View>
                <Text style={styles.summaryTitle}>
                  {restaurant.restaurantName}
                </Text>
                <Text style={styles.summaryMeta}>
                  {items.length} item{items.length === 1 ? "" : "s"} ready for
                  delivery
                </Text>
              </View>
              <Pressable
                style={styles.changeButton}
                onPress={() => router.push("/(tabs)/cart")}
              >
                <Text style={styles.changeButtonText}>Edit cart</Text>
              </Pressable>
            </View>

            <View style={styles.summaryItemList}>
              {itemSummary.map((item) => (
                <View key={item.key} style={styles.summaryItemRow}>
                  <View style={styles.summaryItemCopy}>
                    <Text style={styles.summaryItemName} numberOfLines={1}>
                      {item.quantity}x {item.name}
                    </Text>
                    <View style={styles.summaryItemMetaRow}>
                      <Text style={styles.summaryItemMeta}>
                        {formatCurrency(item.unitPrice)} each
                      </Text>
                      {item.isPriceChanged ? (
                        <Text style={styles.itemUpdatedBadge}>Updated</Text>
                      ) : null}
                    </View>
                  </View>
                  <Text style={styles.summaryItemPrice}>
                    {formatCurrency(item.total)}
                  </Text>
                </View>
              ))}
            </View>

            {(() => {
              const firstOrder = quoteQuery.data?.firstOrderDiscount;
              if (!firstOrder) return null;

              // Discount already unlocked → celebratory neon "reward unlocked" sticker.
              if (firstOrder.applied) {
                return (
                  <NeonStickerCard
                    accent="green"
                    icon="gift"
                    eyebrow="REWARD UNLOCKED"
                    title={firstOrder.title}
                    body={firstOrder.subtitle}
                    style={styles.firstOrderNeonSpacing}
                  />
                );
              }

              // Not yet at the threshold → guide the customer with a progress bar.
              const remaining = firstOrder.remaining ?? 0;
              if (remaining <= 0 || firstOrder.minimumOrderAmount <= 0) {
                return null;
              }
              const currentSubtotal = pricing?.subtotal ?? localSubtotal;
              const ratio = Math.max(
                0,
                Math.min(1, currentSubtotal / firstOrder.minimumOrderAmount),
              );
              const canOpenRestaurant = Boolean(restaurant?.restaurantId);
              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.firstOrderBanner,
                    pressed &&
                      canOpenRestaurant &&
                      styles.firstOrderBannerPressed,
                  ]}
                  disabled={!canOpenRestaurant}
                  onPress={() =>
                    router.push({
                      pathname: "/restaurants/[restaurantId]",
                      params: {
                        restaurantId: restaurant!.restaurantId,
                        source: "checkout",
                      },
                    })
                  }
                >
                  <View style={styles.firstOrderBannerRow}>
                    <View style={styles.firstOrderBannerCopy}>
                      <Text style={styles.firstOrderBannerTitle}>
                        🎁 Add {formatCurrency(remaining)} more for{" "}
                        {formatCurrency(firstOrder.amount)} off
                      </Text>
                      <Text style={styles.firstOrderBannerSubtitle}>
                        On your first order over{" "}
                        {formatCurrency(firstOrder.minimumOrderAmount)}. Tap to
                        add more items.
                      </Text>
                    </View>
                    {canOpenRestaurant ? (
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={palette.secondary}
                      />
                    ) : null}
                  </View>
                  <View style={styles.firstOrderProgressTrack}>
                    <View
                      style={[
                        styles.firstOrderProgressFill,
                        { width: `${ratio * 100}%` },
                      ]}
                    />
                  </View>
                </Pressable>
              );
            })()}

            <View style={styles.summaryTotals}>
              <CheckoutSummaryRow
                label="Subtotal"
                value={formatCurrency(pricing?.subtotal ?? localSubtotal)}
              />
              {(pricing?.menuMarkdownAmount ?? 0) > 0 ? (
                <CheckoutSummaryRow
                  label="Item savings"
                  value={`- ${formatCurrency(pricing?.menuMarkdownAmount ?? 0)}`}
                  highlight
                />
              ) : null}
              <View style={styles.summaryDeliveryGroup}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryRowLabel}>Delivery fee</Text>
                  {hasDeliveryDistanceSurcharge(deliveryBreakdown) ? (
                    <View style={styles.summaryDeliveryValueStack}>
                      <Text style={styles.summaryRowValue}>
                        {formatCurrency(deliveryBreakdown.baseFee)}
                      </Text>
                      <Text style={styles.summaryDeliveryExtra}>
                        +{formatCurrency(deliveryBreakdown.extraDistanceFee)}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.summaryRowValue}>
                      {formatCurrency(pricing?.deliveryFee ?? 0)}
                    </Text>
                  )}
                </View>
                {deliveryWhyText ? (
                  <Text style={styles.summaryDeliveryNote}>
                    {deliveryWhyText}
                  </Text>
                ) : null}
              </View>
              {(pricing?.rainSurcharge ?? 0) > 0 ? (
                <CheckoutSummaryRow
                  label="Rain surcharge"
                  value={formatCurrency(pricing?.rainSurcharge ?? 0)}
                />
              ) : null}
              {/* Mandatory fee (flat/percentage) shows as its own line. The optional mode
                  is NOT shown here — its opt-in toggle below already shows the amount and
                  the total reflects it, so a duplicate line would be redundant. */}
              {(pricing?.platformFee ?? 0) > 0 && !platformFeeInfo?.optional ? (
                <View style={styles.summaryDeliveryGroup}>
                  <CheckoutSummaryRow
                    label={platformFeeLabel(platformFeeInfo)}
                    value={formatCurrency(pricing?.platformFee ?? 0)}
                  />
                  {platformFeeInfo?.note ? (
                    <Text style={styles.summaryDeliveryNote}>
                      {platformFeeInfo.note}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {showPlatformFeeOptIn ? (
                <Pressable
                  onPress={() => setPlatformFeeOptedIn(!platformFeeOptedIn)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: platformFeeOptedIn }}
                  style={styles.platformFeeOptInRow}
                >
                  <View style={styles.platformFeeOptInCopy}>
                    <Text style={styles.platformFeeOptInLabel}>
                      {platformFeeLabel(platformFeeInfo)}
                    </Text>
                    {platformFeeInfo.note ? (
                      <Text style={styles.platformFeeOptInNote}>
                        {platformFeeInfo.note}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.platformFeeOptInAmount}>
                    +{formatCurrency(platformFeeInfo.amount)}
                  </Text>
                  <View
                    style={[
                      styles.platformFeeCheck,
                      platformFeeOptedIn ? styles.platformFeeCheckOn : null,
                    ]}
                  >
                    {platformFeeOptedIn ? (
                      <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                    ) : null}
                  </View>
                </Pressable>
              ) : null}
              {showUrgentDeliveryOptIn ? (
                <Pressable
                  onPress={() =>
                    setUrgentDeliveryOptedIn(!urgentDeliveryOptedIn)
                  }
                  accessibilityRole="switch"
                  accessibilityState={{ checked: urgentDeliveryOptedIn }}
                  style={styles.platformFeeOptInRow}
                >
                  <View style={styles.platformFeeOptInCopy}>
                    <Text style={styles.platformFeeOptInLabel}>
                      ⚡ {urgentDeliveryLabel(urgentDeliveryInfo)}
                    </Text>
                    {urgentDeliveryInfo.note ? (
                      <Text style={styles.platformFeeOptInNote}>
                        {urgentDeliveryInfo.note}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.platformFeeOptInAmount}>
                    +{formatCurrency(urgentDeliveryInfo.amount)}
                  </Text>
                  <View
                    style={[
                      styles.platformFeeCheck,
                      urgentDeliveryOptedIn ? styles.platformFeeCheckOn : null,
                    ]}
                  >
                    {urgentDeliveryOptedIn ? (
                      <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                    ) : null}
                  </View>
                </Pressable>
              ) : null}
              <CheckoutSummaryRow
                label="Discount"
                value={`- ${formatCurrency(pricing?.discountAmount ?? 0)}`}
                highlight={(pricing?.discountAmount ?? 0) > 0}
              />
              {(pricing?.firstOrderDiscountAmount ?? 0) > 0 ? (
                <CheckoutSummaryRow
                  label="First order discount"
                  value={`- ${formatCurrency(pricing?.firstOrderDiscountAmount ?? 0)}`}
                  highlight
                />
              ) : null}
              <View style={styles.divider} />
              <CheckoutSummaryRow
                label="Total"
                value={formatCurrency(pricing?.total ?? localSubtotal)}
                strong
              />
            </View>

            {quoteQuery.isLoading ? (
              <Text style={styles.summaryHint}>
                Checking the latest restaurant pricing...
              </Text>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footerWrap,
          {
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <View style={styles.footerCard}>
          <View style={styles.footerCopy}>
            <Text style={styles.footerLabel}>
              {paymentMethod === "Bkash" ? "bKash total" : "Payable now"}
            </Text>
            <Text style={styles.footerAmount}>
              {formatCurrency(pricing?.total ?? localSubtotal)}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.placeOrderButtonLift,
              isPrimaryActionDisabled && styles.placeOrderButtonLiftDisabled,
              pressed && !isPrimaryActionDisabled
                ? styles.checkoutButtonPressed
                : null,
            ]}
            disabled={isPrimaryActionDisabled}
            onPress={handlePrimaryAction}
          >
            <View
              style={[
                styles.placeOrderButton,
                isPrimaryActionDisabled && styles.placeOrderButtonDisabled,
              ]}
            >
              <View style={styles.placeOrderButtonSheen} />
              {placeOrderMutation.isPending ||
              bkashInitiateMutation.isPending ||
              isCheckingDeliveryArea ? (
                <ActivityIndicator size="small" color={palette.secondary} />
              ) : (
                <Text style={styles.placeOrderButtonText}>
                  {isCheckingDeliveryArea
                    ? "Checking..."
                    : shouldUsePrimaryActionForLocation
                      ? "Change location"
                      : hasQuoteIssues
                        ? "Fix cart"
                        : !isOnline
                          ? "Reconnect"
                          : paymentSettingsQuery.isLoading
                            ? "Loading..."
                            : quoteQuery.isLoading
                              ? "Checking..."
                              : paymentMethod === "Bkash"
                                ? "Pay with bKash"
                                : "Place order"}
                </Text>
              )}
            </View>
          </Pressable>
        </View>
        {placeOrderMutation.isError ? (
          <Text style={styles.footerError}>
            {placeOrderMutation.error instanceof Error
              ? placeOrderMutation.error.message
              : "Could not place the order right now."}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function CheckoutSummaryRow({
  label,
  value,
  highlight = false,
  strong = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  strong?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text
        style={[
          styles.summaryRowLabel,
          highlight ? styles.summaryRowHighlight : null,
          strong ? styles.summaryRowStrong : null,
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.summaryRowValue,
          highlight ? styles.summaryRowHighlight : null,
          strong ? styles.summaryRowStrong : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}
