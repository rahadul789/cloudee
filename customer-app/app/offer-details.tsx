import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";


import { EmptyStateCard } from "@/src/components/empty-state-card";
import { ErrorRetryCard } from "@/src/components/error-retry-card";
import { ShimmerBlock } from "@/src/components/loading-skeleton";
import { RemoteImage } from "@/src/components/remote-image";
import { Screen } from "@/src/components/screen";
import {
  type CustomerNotification,
  useCustomerNotificationQuery,
} from "@/src/hooks/use-customer-api";
import {
  formatOfferExpiry,
  getOfferAmountLabel,
} from "@/src/lib/customer-offer-copy";
import { formatDateTimeAmPm } from "@/src/lib/date-time";
import { palette } from "@/src/theme/palette";
import { AppHeader } from "@/src/components/ui";

function getParamString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getParamNumber(value: string | string[] | undefined) {
  const parsed = Number(getParamString(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getVoucherUsageStatus(value: string) {
  return value === "available" ||
    value === "used" ||
    value === "expired" ||
    value === "info"
    ? value
    : undefined;
}

function isOfferExpired(notification?: CustomerNotification | null) {
  if (!notification) return false;
  if (notification.voucherUsageStatus === "expired") return true;
  if (!notification.voucherExpiresAt) return false;
  const date = new Date(notification.voucherExpiresAt);
  return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now();
}

function isOfferUsed(notification?: CustomerNotification | null) {
  return notification?.voucherUsageStatus === "used";
}

function formatMoney(value?: number | null) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return `Tk ${Math.round(amount).toLocaleString()}`;
}

function getConditions(offer: CustomerNotification) {
  const rows: string[] = [];
  if (offer.voucherCode) {
    rows.push(`Use code ${offer.voucherCode} at checkout.`);
  } else if (offer.voucherId) {
    rows.push("This offer is auto applied when it is eligible.");
  }

  const minimumOrder = formatMoney(offer.voucherMinOrder);
  if (minimumOrder) rows.push(`Minimum order ${minimumOrder}.`);
  if (offer.personalOffer) rows.push("Only available for your Foodbela account.");
  if (offer.voucherExpiresAt) {
    rows.push(`Valid until ${formatDateTimeAmPm(offer.voucherExpiresAt)}.`);
  }
  if (isOfferUsed(offer) && offer.voucherAppliedAt) {
    rows.push(`Used on ${formatDateTimeAmPm(offer.voucherAppliedAt)}.`);
  }
  if (isOfferExpired(offer)) rows.push("This offer has expired.");
  return rows;
}

function isVoucherOffer(offer?: CustomerNotification | null) {
  return Boolean(offer?.personalOffer || offer?.voucherCode || offer?.voucherId);
}

function getOfferDetailsTitle(offer: CustomerNotification) {
  return isVoucherOffer(offer) ? getOfferAmountLabel(offer) : offer.title;
}

function getOfferDetailsDescription(offer: CustomerNotification) {
  if (!isVoucherOffer(offer)) return offer.description;
  // The admin's own name/description for the offer, when it says more than the amount.
  const name = (offer.voucherLabel || offer.title || "").trim();
  if (offer.description?.trim()) return offer.description.trim();
  const amount = name && name !== getOfferAmountLabel(offer) ? name : getOfferAmountLabel(offer);
  // Only mention expiry when we actually know it — showing "No expiry" for an offer
  // whose expiry simply wasn't passed through (e.g. referral rewards) is misleading.
  const expiry = offer.voucherExpiresAt
    ? formatOfferExpiry(offer.voucherExpiresAt)
    : "";
  return expiry ? `${amount}. ${expiry}.` : `${amount}.`;
}

function DetailsSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <ShimmerBlock style={styles.skeletonHero} />
      <View style={styles.skeletonBody}>
        <ShimmerBlock style={styles.skeletonTitle} />
        <ShimmerBlock style={styles.skeletonLine} />
        <ShimmerBlock style={styles.skeletonLineShort} />
        <ShimmerBlock style={styles.skeletonCode} />
        <ShimmerBlock style={styles.skeletonCondition} />
        <ShimmerBlock style={styles.skeletonConditionShort} />
      </View>
    </View>
  );
}

export default function OfferDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    notificationId?: string;
    voucherId?: string;
    voucherCode?: string;
    voucherLabel?: string;
    voucherExpiresAt?: string;
    voucherMinOrder?: string;
    voucherDiscountType?: string;
    voucherDiscountValue?: string;
    voucherMaxDiscount?: string;
    voucherUsageStatus?: string;
    voucherAppliedAt?: string;
    personalOffer?: string;
    title?: string;
    description?: string;
    imageUrl?: string;
    contentType?: string;
    createdAt?: string;
  }>();
  const notificationId = getParamString(params.notificationId);
  const offerQuery = useCustomerNotificationQuery(notificationId, Boolean(notificationId));
  const fetchedOffer =
    offerQuery.data && (!notificationId || offerQuery.data.id === notificationId)
      ? offerQuery.data
      : null;
  const routeVoucherId = getParamString(params.voucherId);
  const routeVoucherCode = getParamString(params.voucherCode);
  const routeVoucherLabel = getParamString(params.voucherLabel);
  const routeVoucherExpiresAt = getParamString(params.voucherExpiresAt);
  const routeVoucherMinOrder = getParamNumber(params.voucherMinOrder);
  const routeDiscountType = getParamString(params.voucherDiscountType) as CustomerNotification["voucherDiscountType"];
  const routeDiscountValue = getParamNumber(params.voucherDiscountValue);
  const routeMaxDiscount = getParamNumber(params.voucherMaxDiscount);
  const routeVoucherUsageStatus = getVoucherUsageStatus(
    getParamString(params.voucherUsageStatus),
  );
  const routeVoucherAppliedAt = getParamString(params.voucherAppliedAt);
  const routeTitle = getParamString(params.title);
  const routeDescription = getParamString(params.description);
  const routeImageUrl = getParamString(params.imageUrl);
  const routeContentType = getParamString(params.contentType);
  const routeCreatedAt = getParamString(params.createdAt);
  const hasRouteVoucher =
    Boolean(routeVoucherId || routeVoucherCode || routeVoucherLabel) ||
    params.personalOffer === "1";
  const routeOffer: CustomerNotification | null =
    notificationId || hasRouteVoucher || routeTitle || routeDescription || routeImageUrl
      ? {
          id: notificationId,
          type: hasRouteVoucher ? "voucher" : "promotion",
          title: routeTitle || routeVoucherLabel || "Personal voucher",
          description: routeDescription,
          path: "",
          contentType: routeContentType || "text",
          imageUrl: routeImageUrl,
          voucherId: routeVoucherId,
          voucherCode: routeVoucherCode,
          voucherLabel: routeVoucherLabel,
          voucherExpiresAt: routeVoucherExpiresAt || null,
          voucherMinOrder: routeVoucherMinOrder,
          voucherDiscountType: (routeDiscountType || "") as CustomerNotification["voucherDiscountType"],
          voucherDiscountValue: routeDiscountValue ?? null,
          voucherMaxDiscount: routeMaxDiscount ?? null,
          voucherUsageStatus:
            routeVoucherUsageStatus ??
            (routeVoucherId || routeVoucherCode ? "available" : "info"),
          voucherAppliedAt: routeVoucherAppliedAt || null,
          personalOffer: params.personalOffer === "1" || hasRouteVoucher,
          isRead: true,
          readAt: null,
          createdAt: routeCreatedAt || new Date().toISOString(),
        }
      : null;
  const offer = fetchedOffer ?? routeOffer;
  const displayOffer =
    offer && hasRouteVoucher
      ? {
          ...offer,
          type: isVoucherOffer(offer) ? offer.type : "voucher",
          title: isVoucherOffer(offer)
            ? offer.title
            : routeVoucherLabel || "Personal voucher",
          description: isVoucherOffer(offer) ? offer.description : "",
          voucherId: routeVoucherId || offer.voucherId,
          voucherCode: routeVoucherCode || offer.voucherCode,
          voucherLabel: routeVoucherLabel || offer.voucherLabel,
          voucherExpiresAt: routeVoucherExpiresAt || offer.voucherExpiresAt,
          voucherMinOrder: routeVoucherMinOrder ?? offer.voucherMinOrder,
          voucherDiscountType: (offer.voucherDiscountType || routeDiscountType || "") as CustomerNotification["voucherDiscountType"],
          voucherDiscountValue: offer.voucherDiscountValue ?? routeDiscountValue ?? null,
          voucherMaxDiscount: offer.voucherMaxDiscount ?? routeMaxDiscount ?? null,
          voucherUsageStatus:
            routeVoucherUsageStatus ?? offer.voucherUsageStatus,
          voucherAppliedAt: routeVoucherAppliedAt || offer.voucherAppliedAt,
          imageUrl: routeImageUrl || offer.imageUrl,
          personalOffer: true,
        }
      : offer;
  const expired = isOfferExpired(displayOffer);
  const used = isOfferUsed(displayOffer);
  const disabled = Boolean(displayOffer?.isOfferDisabled || expired || used);
  const statusLabel = expired ? "Expired" : used ? "Used" : "Available";

  return (
    <Screen>
      <AppHeader inline style={{ paddingHorizontal: 16 }} eyebrow="My offers" title="Offer details" />

      {offerQuery.isLoading && !displayOffer ? (
        <DetailsSkeleton />
      ) : offerQuery.isError && !displayOffer && Boolean(notificationId) ? (
        <View style={styles.feedbackWrap}>
          <ErrorRetryCard
            title="Couldn't load this offer"
            description="We couldn't load this offer right now. Check your connection and try again."
            onRetry={() => {
              void offerQuery.refetch();
            }}
            retrying={offerQuery.isFetching}
          />
        </View>
      ) : !displayOffer ? (
        <View style={styles.feedbackWrap}>
          <EmptyStateCard
            title="Offer unavailable"
            description="This offer could not be loaded right now."
            actionLabel="Back"
            onPress={() => router.back()}
          />
        </View>
      ) : (
        <>
        <ScrollView
          contentContainerStyle={[styles.content, !disabled ? styles.contentWithCta : null]}
          showsVerticalScrollIndicator={false}
        >
          {displayOffer.imageUrl ? (
            <RemoteImage
              uri={displayOffer.imageUrl}
              style={[styles.heroImage, disabled ? styles.heroImageDisabled : null]}
              fallbackIcon="gift-outline"
              recyclingKey={`${displayOffer.id}:${displayOffer.imageUrl}`}
              accessibilityLabel={`${displayOffer.title} image`}
            />
          ) : null}

          {/* The voucher itself: amber ticket with the amount on top and the code below the tear line. */}
          <View style={[styles.ticket, disabled ? styles.ticketDisabled : null]}>
            <View style={styles.ticketTop}>
              <View style={styles.ticketBadgeRow}>
                <View style={[styles.ticketIcon, disabled ? styles.ticketIconDisabled : null]}>
                  <Ionicons
                    name={disabled ? "lock-closed" : "pricetag"}
                    size={16}
                    color={disabled ? palette.mutedForeground : palette.onPrimary}
                  />
                </View>
                <View style={[styles.statusBadge, disabled ? styles.statusBadgeDisabled : null]}>
                  <Text style={[styles.statusText, disabled ? styles.statusTextDisabled : null]}>
                    {statusLabel}
                  </Text>
                </View>
              </View>
              <Text style={[styles.offerTitle, disabled ? styles.textDisabled : null]}>
                {getOfferDetailsTitle(displayOffer)}
              </Text>
              {displayOffer.voucherExpiresAt ? (
                <Text style={[styles.ticketSub, disabled ? styles.textDisabled : null]}>
                  {expired ? "Expired" : "Valid till"}{" "}
                  {new Date(displayOffer.voucherExpiresAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </Text>
              ) : null}
            </View>

            <View style={styles.tearLine}>
              <View style={[styles.tearNotch, styles.tearNotchLeft]} />
              <View style={styles.tearDashes}>
                {Array.from({ length: 14 }, (_, index) => (
                  <View key={index} style={[styles.tearDash, disabled ? styles.tearDashDisabled : null]} />
                ))}
              </View>
              <View style={[styles.tearNotch, styles.tearNotchRight]} />
            </View>

            <View style={styles.ticketBottom}>
              <Text style={[styles.codeLabel, disabled ? styles.textDisabled : null]}>
                {displayOffer.voucherCode ? "Voucher code" : "How it works"}
              </Text>
              <Text style={[styles.codeValue, disabled ? styles.codeValueDisabled : null]} selectable>
                {displayOffer.voucherCode || "Applied automatically at checkout"}
              </Text>
            </View>
          </View>

          {getOfferDetailsDescription(displayOffer) ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>About this offer</Text>
              <Text style={styles.description}>{getOfferDetailsDescription(displayOffer)}</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Conditions</Text>
            {getConditions(displayOffer).map((condition) => (
              <View key={condition} style={styles.conditionRow}>
                <View style={[styles.conditionIcon, disabled ? styles.conditionIconDisabled : null]}>
                  <Ionicons
                    name={disabled ? "remove" : "checkmark"}
                    size={12}
                    color={disabled ? palette.mutedForeground : palette.onPrimary}
                  />
                </View>
                <Text style={styles.conditionText}>{condition}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        {!disabled ? (
          <View style={styles.ctaBar}>
            <Pressable
              style={({ pressed }) => [styles.ctaButton, pressed ? styles.pressed : null]}
              onPress={() => router.push("/(tabs)")}
              accessibilityRole="button"
            >
              <Ionicons name="restaurant-outline" size={18} color={palette.onPrimary} />
              <Text style={styles.ctaText}>Order now · apply at checkout</Text>
            </Pressable>
          </View>
        ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  feedbackWrap: { flex: 1, justifyContent: "center", paddingHorizontal: 20, paddingBottom: 72 },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 28, gap: 14 },
  contentWithCta: { paddingBottom: 110 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  heroImage: { width: "100%", aspectRatio: 16 / 9, borderRadius: 22, backgroundColor: palette.surfaceMuted },
  heroImageDisabled: { opacity: 0.55 },

  ticket: { borderRadius: 24, backgroundColor: palette.primary, overflow: "hidden" },
  ticketDisabled: { backgroundColor: "#ECEDEF" },
  ticketTop: { padding: 18, gap: 8 },
  ticketBadgeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  ticketIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  ticketIconDisabled: { backgroundColor: "#FFFFFF" },
  statusBadge: { borderRadius: 999, backgroundColor: palette.foreground, paddingHorizontal: 10, paddingVertical: 5 },
  statusBadgeDisabled: { backgroundColor: "#FFFFFF" },
  statusText: { fontSize: 11.5, lineHeight: 14, fontWeight: "700", color: "#FFFFFF" },
  statusTextDisabled: { color: palette.mutedForeground },
  offerTitle: { fontSize: 28, lineHeight: 34, fontWeight: "800", color: palette.onPrimary },
  ticketSub: { fontSize: 13, lineHeight: 18, fontWeight: "500", color: "rgba(17,17,17,0.7)" },
  textDisabled: { color: palette.mutedForeground },
  tearLine: { flexDirection: "row", alignItems: "center", height: 18 },
  tearNotch: { width: 18, height: 18, borderRadius: 9, backgroundColor: palette.background },
  tearNotchLeft: { marginLeft: -9 },
  tearNotchRight: { marginRight: -9 },
  tearDashes: { flex: 1, flexDirection: "row", justifyContent: "space-evenly", paddingHorizontal: 6 },
  tearDash: { width: 8, height: 2, borderRadius: 1, backgroundColor: "rgba(17,17,17,0.25)" },
  tearDashDisabled: { backgroundColor: "#D5D7DB" },
  ticketBottom: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 18, gap: 4 },
  codeLabel: { fontSize: 12, lineHeight: 16, fontWeight: "500", color: "rgba(17,17,17,0.7)" },
  codeValue: { fontSize: 22, lineHeight: 28, fontWeight: "800", letterSpacing: 1.2, color: palette.onPrimary },
  codeValueDisabled: { color: palette.mutedForeground, textDecorationLine: "line-through" },

  card: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E4E7",
    backgroundColor: palette.surface,
    padding: 16,
    gap: 10,
  },
  cardTitle: { fontSize: 15.5, lineHeight: 21, fontWeight: "700", color: palette.foreground },
  description: { fontSize: 14, lineHeight: 21, color: palette.mutedForeground },
  conditionRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  conditionIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginTop: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  conditionIconDisabled: { backgroundColor: "#ECEDEF" },
  conditionText: { flex: 1, fontSize: 13.5, lineHeight: 20, color: palette.foreground },

  ctaBar: { position: "absolute", left: 16, right: 16, bottom: 24 },
  ctaButton: {
    height: 56,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.primary,
    shadowColor: "#000000",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  ctaText: { fontSize: 15.5, fontWeight: "700", color: palette.onPrimary },

  skeletonWrap: { paddingHorizontal: 16, gap: 14 },
  skeletonHero: { height: 190, borderRadius: 24 },
  skeletonBody: { borderRadius: 20, backgroundColor: palette.surface, padding: 16, gap: 12 },
  skeletonTitle: { width: "70%", height: 22, borderRadius: 11 },
  skeletonLine: { width: "94%", height: 13, borderRadius: 7 },
  skeletonLineShort: { width: "70%", height: 13, borderRadius: 7 },
  skeletonCode: { width: "100%", height: 70, borderRadius: 18 },
  skeletonCondition: { width: "88%", height: 13, borderRadius: 7 },
  skeletonConditionShort: { width: "58%", height: 13, borderRadius: 7 },
});
