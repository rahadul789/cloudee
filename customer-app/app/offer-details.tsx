import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";

import { EmptyStateCard } from "@/src/components/empty-state-card";
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
  getOfferCodeLabel,
} from "@/src/lib/customer-offer-copy";
import { formatDateTimeAmPm } from "@/src/lib/date-time";
import { palette } from "@/src/theme/palette";

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
  return isVoucherOffer(offer) ? getOfferCodeLabel(offer) : offer.title;
}

function getOfferDetailsDescription(offer: CustomerNotification) {
  if (!isVoucherOffer(offer)) return offer.description;
  const amount = getOfferAmountLabel(offer);
  const expiry = formatOfferExpiry(offer.voucherExpiresAt);
  return `${amount}. ${expiry}.`;
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
    voucherUsageStatus?: string;
    voucherAppliedAt?: string;
    personalOffer?: string;
  }>();
  const notificationId = getParamString(params.notificationId);
  const offerQuery = useCustomerNotificationQuery(notificationId, Boolean(notificationId));
  const offer = offerQuery.data;
  const routeVoucherId = getParamString(params.voucherId);
  const routeVoucherCode = getParamString(params.voucherCode);
  const routeVoucherLabel = getParamString(params.voucherLabel);
  const routeVoucherExpiresAt = getParamString(params.voucherExpiresAt);
  const routeVoucherMinOrder = getParamNumber(params.voucherMinOrder);
  const routeVoucherUsageStatus = getVoucherUsageStatus(
    getParamString(params.voucherUsageStatus),
  );
  const routeVoucherAppliedAt = getParamString(params.voucherAppliedAt);
  const hasRouteVoucher =
    Boolean(routeVoucherId || routeVoucherCode || routeVoucherLabel) ||
    params.personalOffer === "1";
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
          voucherUsageStatus:
            routeVoucherUsageStatus ?? offer.voucherUsageStatus,
          voucherAppliedAt: routeVoucherAppliedAt || offer.voucherAppliedAt,
          personalOffer: true,
        }
      : offer;
  const expired = isOfferExpired(displayOffer);
  const used = isOfferUsed(displayOffer);
  const disabled = Boolean(displayOffer?.isOfferDisabled || expired || used);
  const statusLabel = expired ? "Expired" : used ? "Used" : "Available";

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={palette.foreground} />
        </Pressable>
        <View style={styles.topCopy}>
          <Text style={styles.eyebrow}>My offer</Text>
          <Text style={styles.title}>Offer details</Text>
        </View>
      </View>

      {offerQuery.isLoading ? (
        <DetailsSkeleton />
      ) : offerQuery.isError || !displayOffer ? (
        <View style={styles.feedbackWrap}>
          <EmptyStateCard
            title="Offer unavailable"
            description="This offer could not be loaded right now."
            actionLabel="Back"
            onPress={() => router.back()}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {displayOffer.imageUrl ? (
            <RemoteImage
              uri={displayOffer.imageUrl}
              style={[styles.heroImage, disabled ? styles.heroImageDisabled : null]}
              fallbackIcon="gift-outline"
              accessibilityLabel={`${displayOffer.title} image`}
            />
          ) : (
            <View style={[styles.heroFallback, disabled ? styles.heroImageDisabled : null]}>
              <Ionicons name="gift-outline" size={34} color={palette.secondary} />
            </View>
          )}

          <View style={styles.detailsCard}>
            <View style={styles.titleRow}>
              <Text style={styles.offerTitle}>
                {getOfferDetailsTitle(displayOffer)}
              </Text>
              <View
                style={[
                  styles.statusBadge,
                  disabled ? styles.statusBadgeDisabled : null,
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    disabled ? styles.statusTextDisabled : null,
                  ]}
                >
                  {statusLabel}
                </Text>
              </View>
            </View>

            {getOfferDetailsDescription(displayOffer) ? (
              <Text style={styles.description}>
                {getOfferDetailsDescription(displayOffer)}
              </Text>
            ) : null}

            {displayOffer.voucherCode || displayOffer.voucherId ? (
              <View style={styles.codeBox}>
                <Text style={styles.codeLabel}>Code</Text>
                <Text style={styles.codeValue}>
                  {displayOffer.voucherCode || "Auto applied"}
                </Text>
              </View>
            ) : null}

            <View style={styles.conditions}>
              <Text style={styles.conditionsTitle}>Conditions</Text>
              {getConditions(displayOffer).map((condition) => (
                <View key={condition} style={styles.conditionRow}>
                  <Ionicons
                    name={disabled ? "remove-circle-outline" : "checkmark-circle-outline"}
                    size={16}
                    color={disabled ? palette.mutedForeground : palette.secondary}
                  />
                  <Text style={styles.conditionText}>{condition}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
  topCopy: { flex: 1 },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: palette.secondary,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
    color: palette.foreground,
  },
  feedbackWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingBottom: 72,
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 28,
    gap: 14,
  },
  heroImage: {
    width: "100%",
    height: 170,
    borderRadius: 24,
    backgroundColor: palette.surfaceMuted,
  },
  heroImageDisabled: {
    opacity: 0.55,
  },
  heroFallback: {
    width: "100%",
    height: 170,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF0F6",
  },
  detailsCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    padding: 16,
    gap: 14,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  offerTitle: {
    flex: 1,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "900",
    color: palette.foreground,
  },
  statusBadge: {
    borderRadius: 999,
    backgroundColor: "#FFF0F6",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusBadgeDisabled: {
    backgroundColor: "#EAEDF1",
  },
  statusText: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "900",
    color: palette.secondary,
  },
  statusTextDisabled: {
    color: palette.mutedForeground,
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  codeBox: {
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(228, 17, 111, 0.36)",
    backgroundColor: "#FFF7FA",
    padding: 14,
    gap: 6,
  },
  codeLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    color: palette.secondary,
    textTransform: "uppercase",
  },
  codeValue: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "900",
    color: palette.secondary,
    letterSpacing: 0,
  },
  conditions: {
    gap: 9,
  },
  conditionsTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: palette.foreground,
  },
  conditionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  conditionText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  skeletonWrap: {
    paddingHorizontal: 18,
    gap: 14,
  },
  skeletonHero: {
    height: 170,
    borderRadius: 24,
  },
  skeletonBody: {
    borderRadius: 24,
    backgroundColor: palette.surface,
    padding: 16,
    gap: 12,
  },
  skeletonTitle: {
    width: "70%",
    height: 22,
    borderRadius: 11,
  },
  skeletonLine: {
    width: "94%",
    height: 13,
    borderRadius: 7,
  },
  skeletonLineShort: {
    width: "70%",
    height: 13,
    borderRadius: 7,
  },
  skeletonCode: {
    width: "100%",
    height: 70,
    borderRadius: 18,
  },
  skeletonCondition: {
    width: "88%",
    height: 13,
    borderRadius: 7,
  },
  skeletonConditionShort: {
    width: "58%",
    height: 13,
    borderRadius: 7,
  },
});
