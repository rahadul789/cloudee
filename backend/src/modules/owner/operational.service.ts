import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";
import type { SortOrder } from "mongoose";

import { emitSocketEvent } from "../../config/socket";
import { enqueueBackgroundTask } from "../../common/utils/background-task";
import { slugify } from "../../common/utils/slugify";
import { AppError } from "../../common/utils/app-error";
import { enqueueAdminOrderTerminalExceptionAlert } from "../admin/order-exception-alerts";
import {
  invalidateAdminMonitoringCaches,
  runAutoDispatchForReadyOrders,
} from "../admin/orders-monitor.service";
import { OwnerModel, RestaurantModel, RiderModel } from "../auth/auth.model";
import {
  createCustomerNotification,
  sendPushToCustomer,
} from "../customer/push.service";
import * as customerReadCacheModule from "../customer/customer.service";
import { handleCustomerCustomOfferDeliveredOrder } from "../customer/custom-offer.service";
import { releaseVoucherRedemptionsForOrder } from "../customer/customer-voucher.service";
import { releaseFirstOrderDiscountForOrder } from "../customer/first-order-discount.service";
import { grantReferralRewardForDeliveredOrder } from "../customer/referral.service";
import { getPlatformContent } from "../public/content.service";
import { getOrderRouteMetrics } from "../routing/routing.service";
import { sendPushToRider } from "../rider/push.service";
import { getServiceAreaDispatchOverrides } from "../service-area/service-area.service";
import { syncOrderLedgerForFinalStatus } from "./finance.service";
import { decorateOwnerFinancials } from "./order-financials";
import {
  CategoryModel,
  MenuItemModel,
  NotificationModel,
  OrderModel,
} from "./operational.model";
import {
  buildMenuItemSnapshot,
  buildProposedMenuItemSnapshot,
  decorateMenuItemsWithApprovals,
  hasMenuPricingChange,
  hasMenuPricingPayload,
  submitMenuPriceUpdateApproval,
  submitNewMenuItemApproval,
} from "./menu-approval.service";
import { ReviewModel } from "./experience.model";
import { VoucherModel } from "../customer/customer.model";
import {
  buildOrderPreparationTiming,
  buildPreparationMetaForExtension,
  buildPreparationMetaForStart,
  clampPreparationMinutes,
} from "./preparation-timing";
import { buildDhakaPresetRange, type OwnerDateRange } from "./date-ranges";

const liveStatuses = new Set([
  "New",
  "Accepted",
  "Preparing",
  "ReadyForPickup",
  "PickedUp",
]);
const historyStatuses = new Set(["Delivered", "Rejected", "Cancelled"]);
const MAX_ORDER_HISTORY_ENTRIES = 100;
const RIDER_NEAR_CUSTOMER_DISTANCE_KM = 0.26;

const ownerOrderTransitions: Record<string, string[]> = {
  New: ["Accepted", "Rejected"],
  Accepted: ["Preparing", "Cancelled"],
  Preparing: ["ReadyForPickup", "Cancelled"],
};

const systemOrderTransitions: Record<string, string[]> = {
  ReadyForPickup: ["PickedUp", "Cancelled"],
  // PickedUp -> Cancelled is a rider-reported failed delivery (customer no response,
  // wrong item, etc). It runs through the same terminal pipeline as any other cancel,
  // so refund + restaurant ledger + voucher release stay 100% consistent.
  PickedUp: ["Delivered", "Cancelled"],
  Accepted: ["Cancelled"],
  Preparing: ["Cancelled"],
};

const orderTimestampFieldByStatus: Partial<Record<string, string>> = {
  Accepted: "acceptedAt",
  Preparing: "preparingAt",
  ReadyForPickup: "readyForPickupAt",
  PickedUp: "pickedUpAt",
  Delivered: "deliveredAt",
  Rejected: "rejectedAt",
  Cancelled: "cancelledAt",
};

function getOwnerAutoCancelSettings(content: Record<string, any>) {
  const dispatch = content?.operations?.dispatch ?? {};
  return {
    autoCancelUnacceptedOrdersEnabled:
      typeof dispatch.autoCancelUnacceptedOrdersEnabled === "boolean"
        ? dispatch.autoCancelUnacceptedOrdersEnabled
        : true,
    autoCancelAfterMinutes:
      typeof dispatch.autoCancelAfterMinutes === "number"
        ? dispatch.autoCancelAfterMinutes
        : 12,
    autoCancelNotifyBeforeMinutes:
      typeof dispatch.autoCancelNotifyBeforeMinutes === "number"
        ? dispatch.autoCancelNotifyBeforeMinutes
        : 3,
    ownerAcceptanceTimeoutMinutes:
      typeof dispatch.ownerAcceptanceTimeoutMinutes === "number"
        ? dispatch.ownerAcceptanceTimeoutMinutes
        : 5,
    prepStartGraceMinutes:
      typeof dispatch.prepStartGraceMinutes === "number"
        ? dispatch.prepStartGraceMinutes
        : 3,
    preparationMaxExtraMinutes:
      typeof dispatch.preparationMaxExtraMinutes === "number"
        ? dispatch.preparationMaxExtraMinutes
        : 20,
    prepLateGraceMinutes:
      typeof dispatch.prepLateGraceMinutes === "number"
        ? dispatch.prepLateGraceMinutes
        : 5,
  };
}

type OwnerAutomationSettings = ReturnType<typeof getOwnerAutoCancelSettings>;

function ownerAutomationScopeKey(
  serviceAreaSnapshot?: Record<string, any> | null,
) {
  const zoneId = String(serviceAreaSnapshot?.zoneId ?? "").trim();
  return zoneId || "__global__";
}

async function getOwnerAutomationSettings(
  content: Record<string, any>,
  serviceAreaSnapshot?: Record<string, any> | null,
  cache?: Map<string, Promise<OwnerAutomationSettings>>,
) {
  const key = ownerAutomationScopeKey(serviceAreaSnapshot);
  const cached = cache?.get(key);
  if (cached) return cached;

  const promise = (async () => {
    const baseSettings = getOwnerAutoCancelSettings(content);
    const overrides =
      await getServiceAreaDispatchOverrides(serviceAreaSnapshot);
    if (!overrides) return baseSettings;

    return {
      ...baseSettings,
      autoCancelUnacceptedOrdersEnabled:
        typeof overrides.autoCancelUnacceptedOrdersEnabled === "boolean"
          ? overrides.autoCancelUnacceptedOrdersEnabled
          : baseSettings.autoCancelUnacceptedOrdersEnabled,
      autoCancelAfterMinutes:
        typeof overrides.autoCancelAfterMinutes === "number"
          ? overrides.autoCancelAfterMinutes
          : baseSettings.autoCancelAfterMinutes,
      autoCancelNotifyBeforeMinutes:
        typeof overrides.autoCancelNotifyBeforeMinutes === "number"
          ? overrides.autoCancelNotifyBeforeMinutes
          : baseSettings.autoCancelNotifyBeforeMinutes,
      ownerAcceptanceTimeoutMinutes:
        typeof overrides.ownerAcceptanceTimeoutMinutes === "number"
          ? overrides.ownerAcceptanceTimeoutMinutes
          : baseSettings.ownerAcceptanceTimeoutMinutes,
      prepStartGraceMinutes:
        typeof overrides.prepStartGraceMinutes === "number"
          ? overrides.prepStartGraceMinutes
          : baseSettings.prepStartGraceMinutes,
      preparationMaxExtraMinutes:
        typeof overrides.preparationMaxExtraMinutes === "number"
          ? overrides.preparationMaxExtraMinutes
          : baseSettings.preparationMaxExtraMinutes,
      prepLateGraceMinutes:
        typeof overrides.prepLateGraceMinutes === "number"
          ? overrides.prepLateGraceMinutes
          : baseSettings.prepLateGraceMinutes,
    };
  })();

  cache?.set(key, promise);
  return promise;
}

function getOwnerAppSettings(content: Record<string, any>) {
  const ownerApp = content?.operations?.ownerApp ?? {};
  return {
    showCustomerPhoneNumbers:
      typeof ownerApp.showCustomerPhoneNumbers === "boolean"
        ? ownerApp.showCustomerPhoneNumbers
        : true,
  };
}

function getRiderEtaSettings(content: Record<string, any>) {
  const dispatch = content?.operations?.dispatch ?? {};
  const speedKmph =
    typeof dispatch.riderEtaSpeedKmph === "number" &&
    Number.isFinite(dispatch.riderEtaSpeedKmph)
      ? dispatch.riderEtaSpeedKmph
      : 24;
  const routeFactor =
    typeof dispatch.riderEtaRouteFactor === "number" &&
    Number.isFinite(dispatch.riderEtaRouteFactor)
      ? dispatch.riderEtaRouteFactor
      : 1.1;

  return {
    speedKmph: Math.min(45, Math.max(6, speedKmph)),
    routeFactor: Math.min(2, Math.max(1, routeFactor)),
  };
}

function applyOwnerOrderPrivacy<T extends Record<string, any>>(
  order: T,
  settings: ReturnType<typeof getOwnerAppSettings>,
) {
  const ownerOrder = decorateOwnerFinancials(order);

  if (settings.showCustomerPhoneNumbers) return ownerOrder;

  return {
    ...ownerOrder,
    customerSnapshot: {
      ...(ownerOrder.customerSnapshot ?? {}),
      phone: "",
    },
  };
}

function emitAdminOrderUpdated(order: Record<string, any>) {
  emitSocketEvent("admin:ops", "admin.order.updated", {
    orderId: String(order._id ?? order.id ?? ""),
    orderNumber: String(order.orderNumber ?? ""),
    status: String(order.status ?? ""),
    path: `/orders?orderId=${String(order._id ?? order.id ?? "")}`,
  });
}

function emitAdminLiveMapUpdated(payload: Record<string, unknown>) {
  invalidateAdminMonitoringCaches();
  emitSocketEvent("admin:live-map", "admin.live-map.updated", payload);
}

async function buildOwnerFacingOrderPayload(order: Record<string, any>) {
  const restaurantId = String(order.restaurantId ?? "").trim();
  const [content, restaurant] = await Promise.all([
    getPlatformContent(),
    restaurantId ? RestaurantModel.findById(restaurantId).lean() : null,
  ]);
  const contentRecord = content as Record<string, any>;
  const settings = await getOwnerAutomationSettings(
    contentRecord,
    order.serviceAreaSnapshot as Record<string, any> | undefined,
  );
  return decorateOwnerOrderAutomation(
    applyOwnerOrderPrivacy(order, getOwnerAppSettings(contentRecord)),
    settings,
    restaurant as Record<string, any> | null,
  );
}

export async function emitOrderRealtimeUpdate(
  order: Record<string, any>,
  liveMapPayload: Record<string, unknown> = {},
) {
  const restaurantId = String(order.restaurantId ?? "").trim();
  const orderId = String(order._id ?? order.id ?? "").trim();
  const ownerFacingOrder = await buildOwnerFacingOrderPayload(order);

  if (restaurantId) {
    const restaurantOwner = await OwnerModel.findOne({
      activeRestaurantId: restaurantId,
    })
      .select("_id")
      .lean();
    if (restaurantOwner?._id) {
      emitSocketEvent(
        `owner:${restaurantOwner._id.toString()}`,
        "order.updated",
        ownerFacingOrder,
      );
    }
    emitSocketEvent(
      `restaurant:${restaurantId}`,
      "order.updated",
      ownerFacingOrder,
    );
  }

  if (order.customerId) {
    emitSocketEvent(
      `customer:${order.customerId}`,
      "customer.order.updated",
      order,
    );
  }

  if (order.riderId) {
    emitSocketEvent(`rider:${order.riderId}`, "rider.order.updated", order);
  }

  emitAdminOrderUpdated(order);
  emitAdminLiveMapUpdated({
    type: "order.updated",
    orderId,
    status: String(order.status ?? ""),
    ...liveMapPayload,
  });
}

function decorateOwnerOrderAutomation(
  order: Record<string, any>,
  settings: OwnerAutomationSettings,
  restaurant?: Record<string, any> | null,
) {
  const createdAt = order.createdAt ? new Date(order.createdAt).getTime() : 0;
  const applies =
    settings.autoCancelUnacceptedOrdersEnabled &&
    order.status === "New" &&
    createdAt > 0 &&
    !Number.isNaN(createdAt);
  const autoCancelAt = applies
    ? new Date(createdAt + settings.autoCancelAfterMinutes * 60_000)
    : null;
  const preparationTiming = buildOrderPreparationTiming({
    order,
    restaurant,
    prepStartGraceMinutes: settings.prepStartGraceMinutes,
    maxExtraMinutes: settings.preparationMaxExtraMinutes,
  });

  return {
    ...order,
    autoCancel: {
      enabled: settings.autoCancelUnacceptedOrdersEnabled,
      applies,
      autoCancelAfterMinutes: settings.autoCancelAfterMinutes,
      notifyBeforeMinutes: settings.autoCancelNotifyBeforeMinutes,
      ownerAcceptanceTimeoutMinutes: settings.ownerAcceptanceTimeoutMinutes,
      autoCancelAt: autoCancelAt ? autoCancelAt.toISOString() : null,
      remainingSeconds: autoCancelAt
        ? Math.max(0, Math.ceil((autoCancelAt.getTime() - Date.now()) / 1000))
        : null,
    },
    preparationTiming,
    lateState: buildOwnerOrderLateState(order, settings, preparationTiming),
  };
}

function buildOwnerOrderLateState(
  order: Record<string, any>,
  settings: OwnerAutomationSettings,
  preparationTiming: ReturnType<typeof buildOrderPreparationTiming>,
) {
  const status = String(order.status ?? "");
  const now = Date.now();

  if (status === "New") {
    const createdAt = order.createdAt ? new Date(order.createdAt).getTime() : 0;
    const lateBySeconds =
      createdAt > 0 && !Number.isNaN(createdAt)
        ? Math.max(
            0,
            Math.ceil((now - createdAt) / 1000) -
              settings.ownerAcceptanceTimeoutMinutes * 60,
          )
        : 0;
    if (lateBySeconds > 0) {
      return {
        isLate: true,
        reason: "owner_acceptance",
        label: "Acceptance late",
        tone: "warning",
        lateBySeconds,
        thresholdMinutes: settings.ownerAcceptanceTimeoutMinutes,
      };
    }
  }

  if (status === "Accepted" && (preparationTiming.lateBySeconds ?? 0) > 0) {
    return {
      isLate: true,
      reason: "prep_start",
      label: "Prep start late",
      tone: "warning",
      lateBySeconds: preparationTiming.lateBySeconds ?? 0,
      thresholdMinutes: settings.prepStartGraceMinutes,
    };
  }

  if (status === "Preparing") {
    const lateBySeconds = preparationTiming.lateBySeconds ?? 0;
    if (lateBySeconds >= settings.prepLateGraceMinutes * 60) {
      return {
        isLate: true,
        reason: "food_prepare",
        label: "Food prep late",
        tone: lateBySeconds >= 15 * 60 ? "critical" : "warning",
        lateBySeconds,
        thresholdMinutes: settings.prepLateGraceMinutes,
      };
    }
  }

  return {
    isLate: false,
    reason: "",
    label: "",
    tone: "default",
    lateBySeconds: 0,
    thresholdMinutes: null,
  };
}

async function clearRiderActiveTrackingForFinalOrder(order: {
  _id?: unknown;
  id?: string;
  riderId?: unknown;
}) {
  const riderId = String(order.riderId ?? "").trim();
  const orderId = String(order._id ?? order.id ?? "").trim();

  if (!riderId || !orderId) {
    return;
  }

  const nextPickedUpOrder = await OrderModel.findOne({
    riderId,
    status: "PickedUp",
    _id: { $ne: orderId },
  })
    .sort({ "timestamps.PickedUp": 1, createdAt: 1 })
    .select("_id");

  const updatedRider = await RiderModel.findByIdAndUpdate(
    riderId,
    {
      $set: {
        activeTrackingOrderId: nextPickedUpOrder?.id ?? "",
      },
    },
    { new: true },
  );

  if (updatedRider) {
    emitSocketEvent(
      `rider:${updatedRider.id}`,
      "rider.profile.updated",
      updatedRider.toObject(),
    );
  }
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function calculateDirectDistanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const earthRadius = 6371;
  const deltaLat = toRadians(latitudeB - latitudeA);
  const deltaLng = toRadians(longitudeB - longitudeA);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(latitudeA)) *
      Math.cos(toRadians(latitudeB)) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function roundDistanceKm(distanceKm: number) {
  const rounded = Number(distanceKm.toFixed(2));
  return rounded < 0.1 ? 0 : rounded;
}

function estimateCycleRouteDistanceKm(
  directDistanceKm: number,
  routeFactor: number,
) {
  if (directDistanceKm <= 0.1) return 0;
  return directDistanceKm * routeFactor;
}

function clampCycleSpeedKmph(speedKmph: number, fallbackSpeedKmph = 24) {
  const safeSpeed = Number.isFinite(speedKmph) ? speedKmph : fallbackSpeedKmph;
  return Math.min(45, Math.max(6, safeSpeed));
}

function deriveCycleSpeedKmph(params: {
  previousLatitude?: number;
  previousLongitude?: number;
  previousUpdatedAt?: string | Date | null;
  latitude: number;
  longitude: number;
  reportedSpeedKmph?: number;
  fallbackSpeedKmph?: number;
}) {
  const fallbackSpeedKmph = clampCycleSpeedKmph(params.fallbackSpeedKmph ?? 24);
  if (
    typeof params.reportedSpeedKmph === "number" &&
    Number.isFinite(params.reportedSpeedKmph)
  ) {
    return Math.max(
      clampCycleSpeedKmph(params.reportedSpeedKmph, fallbackSpeedKmph),
      fallbackSpeedKmph * 0.85,
    );
  }

  if (
    typeof params.previousLatitude !== "number" ||
    typeof params.previousLongitude !== "number" ||
    !params.previousUpdatedAt
  ) {
    return fallbackSpeedKmph;
  }

  const previousUpdatedAt = new Date(params.previousUpdatedAt).getTime();
  const now = Date.now();
  const elapsedHours = (now - previousUpdatedAt) / (1000 * 60 * 60);

  if (elapsedHours <= 0 || elapsedHours > 0.35) {
    return fallbackSpeedKmph;
  }

  const movedDistanceKm = calculateDirectDistanceKm(
    params.previousLatitude,
    params.previousLongitude,
    params.latitude,
    params.longitude,
  );

  if (movedDistanceKm < 0.02) {
    return fallbackSpeedKmph;
  }

  return Math.max(
    clampCycleSpeedKmph(movedDistanceKm / elapsedHours, fallbackSpeedKmph),
    fallbackSpeedKmph * 0.85,
  );
}

function estimateCycleTracking(params: {
  riderLatitude: number;
  riderLongitude: number;
  customerLatitude: number;
  customerLongitude: number;
  previousLatitude?: number;
  previousLongitude?: number;
  previousUpdatedAt?: string | Date | null;
  reportedSpeedKmph?: number;
  etaSpeedKmph?: number;
  routeFactor?: number;
}) {
  const directDistanceKm = calculateDirectDistanceKm(
    params.riderLatitude,
    params.riderLongitude,
    params.customerLatitude,
    params.customerLongitude,
  );
  const etaSpeedKmph = clampCycleSpeedKmph(params.etaSpeedKmph ?? 24);
  const routeFactor = Math.min(2, Math.max(1, params.routeFactor ?? 1.1));
  const routeDistanceKm = estimateCycleRouteDistanceKm(
    directDistanceKm,
    routeFactor,
  );
  const speedKmph = deriveCycleSpeedKmph({
    previousLatitude: params.previousLatitude,
    previousLongitude: params.previousLongitude,
    previousUpdatedAt: params.previousUpdatedAt,
    latitude: params.riderLatitude,
    longitude: params.riderLongitude,
    reportedSpeedKmph: params.reportedSpeedKmph,
    fallbackSpeedKmph: etaSpeedKmph,
  });
  const remainingDurationMinutes =
    routeDistanceKm <= 0
      ? 0
      : Math.max(1, Math.round((routeDistanceKm / speedKmph) * 60));

  return {
    directDistanceKm: roundDistanceKm(directDistanceKm),
    routeDistanceKm: roundDistanceKm(routeDistanceKm),
    remainingDurationMinutes,
    speedKmph: Number(speedKmph.toFixed(1)),
    isNearCustomer: directDistanceKm <= 0.2,
  };
}

function getOrderActionTitle(nextStatus: string) {
  switch (nextStatus) {
    case "Accepted":
      return "Order accepted";
    case "Preparing":
      return "Order is being prepared";
    case "ReadyForPickup":
      return "Order is ready for pickup";
    case "PickedUp":
      return "Order picked up by rider";
    case "Delivered":
      return "Order delivered";
    case "Rejected":
      return "Order rejected";
    case "Cancelled":
      return "Order cancelled";
    default:
      return "Order updated";
  }
}

function getOrderActionTitleBn(nextStatus: string) {
  switch (nextStatus) {
    case "Accepted":
      return "অর্ডার অ্যাকসেপ্ট হয়েছে";
    case "Preparing":
      return "অর্ডার প্রস্তুত হচ্ছে";
    case "ReadyForPickup":
      return "অর্ডার পিকআপের জন্য রেডি";
    case "PickedUp":
      return "রাইডার অর্ডার পিকআপ করেছে";
    case "Delivered":
      return "অর্ডার ডেলিভার হয়েছে";
    case "Rejected":
      return "অর্ডার রিজেক্ট হয়েছে";
    case "Cancelled":
      return "অর্ডার ক্যানসেল হয়েছে";
    default:
      return "অর্ডার আপডেট হয়েছে";
  }
}

const ORDER_STATUS_LABEL_BN: Record<string, string> = {
  New: "নতুন",
  Accepted: "অ্যাকসেপ্টেড",
  Preparing: "প্রস্তুত হচ্ছে",
  ReadyForPickup: "রেডি",
  PickedUp: "পিকড আপ",
  Delivered: "ডেলিভার্ড",
  Cancelled: "ক্যানসেলড",
  Rejected: "রিজেক্টেড",
};

function getCustomerOrderStatusMessage(nextStatus: string) {
  switch (nextStatus) {
    case "Accepted":
      return {
        title: "✅ Order accepted",
        body: "Your order is confirmed. The kitchen will start soon.",
      };
    case "Preparing":
      return {
        title: "🍳 Food is preparing",
        body: "Your food is being prepared now.",
      };
    case "ReadyForPickup":
      return {
        title: "📦 Ready for pickup",
        body: "Your order is packed. A rider will pick it up soon.",
      };
    case "PickedUp":
      return {
        title: "🛵 On the way",
        body: "Your rider picked up the order and is heading to you.",
      };
    case "Delivered":
      return {
        title: "🎉 Delivered",
        body: "Your food has arrived. Enjoy your food!",
      };
    case "Rejected":
      return {
        title: "😕 Order not accepted",
        body: "The restaurant could not accept your order. Please try another restaurant.",
      };
    case "Cancelled":
      return {
        title: "❌ Order cancelled",
        body: "Your order was cancelled. You can order again anytime.",
      };
    default:
      return {
        title: "🔔 Order update",
        body: "There is a new update on your order.",
      };
  }
}

async function getMaxActiveOrdersPerRider() {
  const content = await getPlatformContent();
  const value = content.operations?.dispatch?.maxActiveOrdersPerRider;
  return typeof value === "number" && Number.isFinite(value) ? value : 3;
}

// Push only for the moments a customer actually cares about or can act on: order
// accepted, rider on the way, delivered, and problem states. The in-between steps
// (preparing, ready for pickup) update live on the tracking screen via socket, so we
// skip pushing them — fewer, meaningful pushes avoid notification fatigue (which would
// otherwise make users mute the app and miss the important ones).
const CUSTOMER_PUSH_WORTHY_STATUSES = new Set([
  "Accepted",
  "PickedUp",
  "Delivered",
  "Rejected",
  "Cancelled",
]);

async function safeSendCustomerOrderStatusPush(params: {
  customerId: string;
  orderId: string;
  orderNumber: string;
  nextStatus: string;
}) {
  if (!CUSTOMER_PUSH_WORTHY_STATUSES.has(params.nextStatus)) {
    return;
  }

  const customerMessage = getCustomerOrderStatusMessage(params.nextStatus);

  enqueueBackgroundTask("owner.order_status.customer_push", async () => {
    await sendPushToCustomer({
      customerId: params.customerId,
      payload: {
        title: customerMessage.title,
        body: customerMessage.body,
        data: {
          type: "order_status",
          status: params.nextStatus,
          orderId: params.orderId,
          path: `/orders/${params.orderId}/tracking`,
        },
      },
    });
  });
}

function applyOrderStatusTimestamp(
  timestamps: Record<string, unknown> | undefined,
  status: string,
  value: Date,
) {
  const nextTimestamps = {
    ...(timestamps ?? {}),
    [status]: value,
  } as Record<string, unknown>;

  const normalizedField = orderTimestampFieldByStatus[status];
  if (normalizedField) {
    nextTimestamps[normalizedField] = value;
  }

  return nextTimestamps;
}

function buildOrderHistoryDateRangeMatch(
  params: { status?: string; tab?: "live" | "history" },
  range: OwnerDateRange,
) {
  const statuses =
    params.status && historyStatuses.has(params.status)
      ? [params.status]
      : [...historyStatuses];
  const clauses = statuses.flatMap((status) => {
    const timestampField = orderTimestampFieldByStatus[status];
    return [
      { [`timestamps.${status}`]: { $gte: range.start, $lte: range.end } },
      ...(timestampField
        ? [
            {
              [`timestamps.${timestampField}`]: {
                $gte: range.start,
                $lte: range.end,
              },
            },
          ]
        : []),
    ];
  });

  return clauses.length ? { $or: clauses } : null;
}

function shouldUseHistoryDateRange(params: {
  tab?: "live" | "history";
  status?: string;
  dateBasis?: string;
}) {
  if (params.dateBasis === "history") return true;
  if (params.dateBasis === "created") return false;
  return (
    params.tab === "history" ||
    Boolean(params.status && historyStatuses.has(params.status))
  );
}

export async function getOwnerRestaurantContext(ownerId: string) {
  const owner = await OwnerModel.findById(ownerId);

  if (!owner) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "OWNER_NOT_FOUND",
      "Owner not found",
    );
  }

  if (
    !owner.activeRestaurantId ||
    owner.restaurantLifecycleStatus !== "approved"
  ) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "RESTAURANT_NOT_READY",
      "Restaurant operational data is only available after approval",
    );
  }

  return {
    owner,
    restaurantId: owner.activeRestaurantId.toString(),
  };
}

export async function createOwnerNotification(params: {
  ownerId: string;
  restaurantId: string;
  type: "order" | "payout" | "system" | "promotion" | "support" | "review";
  eventType: string;
  entityType: string;
  entityId: string;
  title: string;
  description: string;
  // Optional Bangla copy. When the owner's preferred language is Bangla and
  // these are provided, they are stored instead of the English title/description
  // so the in-app and web notification reads in Bangla.
  titleBn?: string;
  descriptionBn?: string;
  actionPath: string;
  contentType?: "text" | "image" | "image_text";
  imageUrl?: string;
  zoneId?: string;
  districtId?: string;
  serviceAreaSnapshot?: Record<string, unknown>;
}) {
  const owner = await OwnerModel.findById(params.ownerId)
    .select("preferredLanguage")
    .lean();
  const useBangla =
    owner?.preferredLanguage !== "en" &&
    Boolean(params.titleBn || params.descriptionBn);
  const title = useBangla && params.titleBn ? params.titleBn : params.title;
  const description =
    useBangla && params.descriptionBn
      ? params.descriptionBn
      : params.description;

  const notification = await NotificationModel.create({
    ownerId: params.ownerId,
    restaurantId: params.restaurantId,
    type: params.type,
    eventType: params.eventType,
    entityType: params.entityType,
    entityId: params.entityId,
    title,
    description,
    actionPath: params.actionPath,
    contentType: params.contentType ?? "text",
    imageUrl: params.imageUrl ?? "",
    zoneId: params.zoneId ?? "",
    districtId: params.districtId ?? "",
    serviceAreaSnapshot: params.serviceAreaSnapshot ?? {},
  });

  emitSocketEvent(
    `owner:${params.ownerId}`,
    "notification.created",
    notification.toObject(),
  );

  return notification;
}

export async function listCategories(ownerId: string) {
  return listCategoriesWithFilters({ ownerId });
}

export async function listCategoriesWithFilters(params: {
  ownerId: string;
  search?: string;
  status?: string;
  sortBy?: string;
  page?: number;
  pageSize?: number;
}) {
  const { restaurantId } = await getOwnerRestaurantContext(params.ownerId);
  const matchStage: Record<string, unknown> = {
    restaurantId: new mongoose.Types.ObjectId(restaurantId),
  };

  if (params.status && params.status !== "all") {
    matchStage.status = params.status === "Hidden" ? "archived" : params.status;
  }

  if (params.search) {
    matchStage.$or = [
      { name: { $regex: params.search, $options: "i" } },
      { slug: { $regex: params.search, $options: "i" } },
      { description: { $regex: params.search, $options: "i" } },
    ];
  }

  const sortStage: Record<string, 1 | -1> =
    params.sortBy === "nameAsc"
      ? { name: 1 }
      : params.sortBy === "nameDesc"
        ? { name: -1 }
        : params.sortBy === "newestUpdated"
          ? { updatedAt: -1 }
          : params.sortBy === "oldestCreated"
            ? { createdAt: 1 }
            : params.sortBy === "mostItems"
              ? { totalItems: -1, displayOrder: 1 }
              : { displayOrder: 1, createdAt: 1 };
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));

  const [items, total] = await Promise.all([
    CategoryModel.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "menuitems",
          let: { categoryId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$categoryId", "$$categoryId"] } } },
            { $count: "count" },
          ],
          as: "menuItemStats",
        },
      },
      {
        $addFields: {
          totalItems: {
            $ifNull: [{ $arrayElemAt: ["$menuItemStats.count", 0] }, 0],
          },
        },
      },
      { $sort: sortStage },
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize },
      { $project: { menuItemStats: 0 } },
    ]),
    CategoryModel.countDocuments(matchStage),
  ]);

  return { items, total };
}

// Flush the customer read caches on any INSTANT, customer-visible menu/category change
// (availability, status, name, delete). New items + price changes are approval-gated
// and flushed on approval (menu-approval.service), so those paths don't call this.
// customer.service ↔ operational.service is a circular import, so this reads the export
// off the namespace at CALL time (never destructured at import) — the cycle can't hand
// us an undefined binding that way.
function flushCustomerAvailabilityCaches() {
  customerReadCacheModule.invalidateCustomerRestaurantAvailabilityCaches();
}

export async function createCategory(params: {
  ownerId: string;
  name: string;
  description?: string;
}) {
  const { restaurantId } = await getOwnerRestaurantContext(params.ownerId);

  const category = await CategoryModel.create({
    restaurantId,
    name: params.name,
    slug: slugify(params.name),
    description: params.description ?? "",
  });

  return category;
}

export async function updateCategory(params: {
  ownerId: string;
  categoryId: string;
  name?: string;
  description?: string;
  status?: "active" | "archived";
  displayOrder?: number;
}) {
  const { restaurantId } = await getOwnerRestaurantContext(params.ownerId);
  const category = await CategoryModel.findOne({
    _id: params.categoryId,
    restaurantId,
  });

  if (!category) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "CATEGORY_NOT_FOUND",
      "Category not found",
    );
  }

  if (params.name !== undefined) {
    category.name = params.name;
    category.slug = slugify(params.name);
  }

  if (params.description !== undefined) {
    category.description = params.description;
  }

  if (params.status !== undefined) {
    category.status = params.status;
  }

  if (params.displayOrder !== undefined) {
    category.displayOrder = params.displayOrder;
  }

  await category.save();
  flushCustomerAvailabilityCaches();
  return category;
}

export async function archiveCategory(params: {
  ownerId: string;
  categoryId: string;
}) {
  return updateCategory({
    ownerId: params.ownerId,
    categoryId: params.categoryId,
    status: "archived",
  });
}

export async function deleteCategoryPermanently(params: {
  ownerId: string;
  categoryId: string;
}) {
  const { restaurantId } = await getOwnerRestaurantContext(params.ownerId);
  const category = await CategoryModel.findOne({
    _id: params.categoryId,
    restaurantId,
  });

  if (!category) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "CATEGORY_NOT_FOUND",
      "Category not found",
    );
  }

  await MenuItemModel.deleteMany({
    restaurantId,
    categoryId: params.categoryId,
  });
  await CategoryModel.deleteOne({ _id: params.categoryId, restaurantId });
  flushCustomerAvailabilityCaches();

  return { deleted: true };
}

export async function listMenuItems(ownerId: string) {
  return listMenuItemsWithFilters({ ownerId });
}

export async function listMenuItemsWithFilters(params: {
  ownerId: string;
  search?: string;
  status?: string;
  availability?: "all" | "available" | "unavailable";
  categoryId?: string;
  popularFilter?: string;
  sortBy?: string;
  page?: number;
  pageSize?: number;
}) {
  const { restaurantId } = await getOwnerRestaurantContext(params.ownerId);
  const query: Record<string, unknown> = { restaurantId, status: "active" };

  if (params.status && params.status !== "all") {
    query.status =
      params.status === "Hidden"
        ? "archived"
        : params.status === "Active"
          ? "active"
          : params.status;
  }

  if (params.availability && params.availability !== "all") {
    query.availability = params.availability;
  }

  if (params.categoryId && params.categoryId !== "all") {
    query.categoryId = params.categoryId;
  }

  if (params.popularFilter === "popular") {
    query.isPopular = true;
  } else if (params.popularFilter === "regular") {
    query.isPopular = false;
  }

  if (params.search) {
    query.$or = [
      { name: { $regex: params.search, $options: "i" } },
      { slug: { $regex: params.search, $options: "i" } },
      { description: { $regex: params.search, $options: "i" } },
    ];
  }

  const sort: Record<string, SortOrder> =
    params.sortBy === "nameAsc"
      ? { name: 1 }
      : params.sortBy === "nameDesc"
        ? { name: -1 }
        : params.sortBy === "priceHigh"
          ? { basePrice: -1, updatedAt: -1 }
          : params.sortBy === "priceLow"
            ? { basePrice: 1, updatedAt: -1 }
            : { updatedAt: -1 };
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const [items, total] = await Promise.all([
    MenuItemModel.find(query)
      .sort(sort)
      .skip((page - 1) * pageSize)
      .limit(pageSize),
    MenuItemModel.countDocuments(query),
  ]);

  return { items: await decorateMenuItemsWithApprovals(items), total };
}

export async function getOwnerSidebarSummary(ownerId: string) {
  const { restaurantId } = await getOwnerRestaurantContext(ownerId);
  const restaurantObjectId = new mongoose.Types.ObjectId(restaurantId);

  const [
    liveOrders,
    categories,
    menuItems,
    reviews,
    promotions,
    unreadNotifications,
  ] = await Promise.all([
    OrderModel.countDocuments({
      restaurantId,
      status: { $in: [...liveStatuses] },
    }),
    CategoryModel.countDocuments({ restaurantId: restaurantObjectId }),
    MenuItemModel.countDocuments({
      restaurantId,
      status: "active",
    }),
    ReviewModel.countDocuments({ restaurantId: restaurantObjectId }),
    VoucherModel.countDocuments({
      restaurantId: restaurantObjectId,
      createdByType: "owner",
      createdById: ownerId,
      archivedAt: null,
      surface: { $ne: "menu_markdown" },
    }),
    NotificationModel.countDocuments({
      ownerId,
      isRead: false,
    }),
  ]);

  return {
    liveOrders,
    categories,
    menuItems,
    reviews,
    promotions,
    unreadNotifications,
  };
}

async function resolveRecommendedMenuItemIds(params: {
  restaurantId: mongoose.Types.ObjectId | string;
  itemIds?: string[];
  currentItemId?: mongoose.Types.ObjectId | string;
}) {
  const currentItemId = params.currentItemId
    ? String(params.currentItemId)
    : "";
  const uniqueIds = [
    ...new Set(
      (params.itemIds ?? [])
        .map((id) => id.trim())
        .filter(
          (id) =>
            id && mongoose.Types.ObjectId.isValid(id) && id !== currentItemId,
        ),
    ),
  ];

  if (!uniqueIds.length) return [];

  const validRows = await MenuItemModel.find({
    _id: { $in: uniqueIds.map((id) => new mongoose.Types.ObjectId(id)) },
    restaurantId: params.restaurantId,
    status: "active",
  })
    .select({ _id: 1 })
    .lean();

  const validIds = new Set(validRows.map((row) => row._id.toString()));
  return uniqueIds.filter((id) => validIds.has(id));
}

export async function createMenuItem(params: {
  ownerId: string;
  categoryId: string;
  name: string;
  description?: string;
  images?: Array<{ url?: string; publicId?: string }>;
  status: "active" | "archived";
  availability: "available" | "unavailable";
  kind: "simple" | "variant";
  basePrice: number;
  variants?: unknown[];
  addOnGroups?: unknown[];
  recommendedItemIds?: string[];
  isPopular?: boolean;
}) {
  const { restaurantId } = await getOwnerRestaurantContext(params.ownerId);
  const category = await CategoryModel.findOne({
    _id: params.categoryId,
    restaurantId,
    status: "active",
  });

  if (!category) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_CATEGORY",
      "Category is not available",
    );
  }

  const recommendedItemIds = await resolveRecommendedMenuItemIds({
    restaurantId,
    itemIds: params.recommendedItemIds,
  });

  const proposedSnapshot = buildMenuItemSnapshot({
    categoryId: params.categoryId,
    name: params.name,
    description: params.description ?? "",
    images: params.images ?? [],
    status: params.status,
    availability: params.availability,
    kind: params.kind,
    basePrice: params.basePrice,
    variants: params.variants ?? [],
    addOnGroups: params.addOnGroups ?? [],
    recommendedItemIds,
    isPopular: params.isPopular ?? false,
  });

  return submitNewMenuItemApproval({
    ownerId: params.ownerId,
    restaurantId,
    proposedSnapshot,
  });
}

export async function updateMenuItem(params: {
  ownerId: string;
  itemId: string;
  categoryId?: string;
  name?: string;
  description?: string;
  images?: Array<{ url?: string; publicId?: string }>;
  status?: "active" | "archived";
  availability?: "available" | "unavailable";
  kind?: "simple" | "variant";
  basePrice?: number;
  variants?: unknown[];
  addOnGroups?: unknown[];
  recommendedItemIds?: string[];
  isPopular?: boolean;
}) {
  const { restaurantId } = await getOwnerRestaurantContext(params.ownerId);
  const menuItem = await MenuItemModel.findOne({
    _id: params.itemId,
    restaurantId,
  });

  if (!menuItem) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "MENU_ITEM_NOT_FOUND",
      "Menu item not found",
    );
  }

  if (params.categoryId !== undefined) {
    const category = await CategoryModel.findOne({
      _id: params.categoryId,
      restaurantId,
      status: "active",
    });

    if (!category) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "INVALID_CATEGORY",
        "Category is not available",
      );
    }

    menuItem.categoryId = category._id;
  }

  const currentSnapshot = buildProposedMenuItemSnapshot({
    current: menuItem.toObject(),
  });
  const proposedSnapshot = buildProposedMenuItemSnapshot({
    current: menuItem.toObject(),
    categoryId: params.categoryId,
    name: params.name,
    description: params.description,
    images: params.images,
    status: params.status,
    availability: params.availability,
    kind: params.kind,
    basePrice: params.basePrice,
    variants: params.variants,
    addOnGroups: params.addOnGroups,
    recommendedItemIds:
      params.recommendedItemIds !== undefined
        ? await resolveRecommendedMenuItemIds({
            restaurantId,
            itemIds: params.recommendedItemIds,
            currentItemId: menuItem._id,
          })
        : undefined,
    isPopular: params.isPopular,
  });
  const requiresPriceApproval =
    hasMenuPricingPayload(params) &&
    hasMenuPricingChange(currentSnapshot, proposedSnapshot);

  if (params.name !== undefined) {
    menuItem.name = params.name;
    menuItem.slug = slugify(params.name);
  }

  if (params.description !== undefined)
    menuItem.description = params.description;
  if (params.images !== undefined) {
    menuItem.set("images", params.images);
  }
  if (params.status !== undefined) menuItem.status = params.status;
  if (params.availability !== undefined)
    menuItem.availability = params.availability;
  if (!requiresPriceApproval) {
    if (params.kind !== undefined) menuItem.kind = params.kind;
    if (params.basePrice !== undefined) menuItem.basePrice = params.basePrice;
    if (params.variants !== undefined) {
      menuItem.set("variants", params.variants);
    }
    if (params.addOnGroups !== undefined) {
      menuItem.set("addOnGroups", params.addOnGroups);
    }
  }
  if (params.recommendedItemIds !== undefined) {
    menuItem.set(
      "recommendedItemIds",
      proposedSnapshot.recommendedItemIds,
    );
  }
  if (params.isPopular !== undefined) menuItem.isPopular = params.isPopular;

  await menuItem.save();
  // availability/status/name/images/isPopular apply instantly (only pricing is
  // approval-gated), so this edit is customer-visible now → flush the read caches.
  flushCustomerAvailabilityCaches();
  if (requiresPriceApproval) {
    const approvalRequest = await submitMenuPriceUpdateApproval({
      ownerId: params.ownerId,
      restaurantId,
      menuItemId: String(menuItem._id),
      currentSnapshot,
      proposedSnapshot,
    });
    const payload = {
      ...menuItem.toObject(),
      approvalRequired: true,
      approvalRequest,
      approval: approvalRequest,
    };
    emitSocketEvent(`owner:${params.ownerId}`, "menu.updated", payload);
    return payload;
  }

  emitSocketEvent(
    `owner:${params.ownerId}`,
    "menu.updated",
    menuItem.toObject(),
  );
  emitSocketEvent(
    `restaurant:${restaurantId}`,
    "menu.updated",
    menuItem.toObject(),
  );
  return menuItem;
}

export async function archiveMenuItem(params: {
  ownerId: string;
  itemId: string;
}) {
  return updateMenuItem({
    ownerId: params.ownerId,
    itemId: params.itemId,
    status: "archived",
  });
}

export async function deleteMenuItemPermanently(params: {
  ownerId: string;
  itemId: string;
}) {
  const { restaurantId } = await getOwnerRestaurantContext(params.ownerId);
  const menuItem = await MenuItemModel.findOne({
    _id: params.itemId,
    restaurantId,
  });

  if (!menuItem) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "MENU_ITEM_NOT_FOUND",
      "Menu item not found",
    );
  }

  await MenuItemModel.deleteOne({ _id: params.itemId, restaurantId });
  flushCustomerAvailabilityCaches();
  emitSocketEvent(`owner:${params.ownerId}`, "menu.updated", {
    itemId: params.itemId,
    deleted: true,
  });
  emitSocketEvent(`restaurant:${restaurantId}`, "menu.updated", {
    itemId: params.itemId,
    deleted: true,
  });

  return { deleted: true };
}

export async function listOrders(params: {
  ownerId: string;
  tab?: "live" | "history";
  status?: string;
  search?: string;
  paymentMethod?: string;
  sortBy?: string;
  preset?: string;
  from?: string;
  to?: string;
  dateBasis?: "created" | "history" | "activity";
  page?: number;
  pageSize?: number;
}) {
  const { restaurantId } = await getOwnerRestaurantContext(params.ownerId);
  const content = await getPlatformContent();
  const ownerAppSettings = getOwnerAppSettings(content as Record<string, any>);
  // Off-platform (external) deliveries have their own dedicated page + settlement flow, so
  // they are kept out of the normal in-app Orders list and its counts to avoid confusion
  // and keep the two revenue streams cleanly separated. ($ne also matches legacy orders
  // that predate the `source` field.)
  const query: Record<string, unknown> = {
    restaurantId,
    source: { $ne: "external" },
  };
  const andClauses: Array<Record<string, unknown>> = [];

  if (params.tab === "live") {
    query.status = { $in: [...liveStatuses] };
  }

  if (params.tab === "history") {
    query.status = { $in: [...historyStatuses] };
  }

  if (params.status) {
    query.status = params.status;
  }

  if (params.paymentMethod) {
    query.paymentMethod = params.paymentMethod;
  }

  if (params.search) {
    const searchClauses: Array<Record<string, unknown>> = [
      { orderNumber: { $regex: params.search, $options: "i" } },
      { "customerSnapshot.fullName": { $regex: params.search, $options: "i" } },
    ];

    if (ownerAppSettings.showCustomerPhoneNumbers) {
      searchClauses.push({
        "customerSnapshot.phone": { $regex: params.search, $options: "i" },
      });
    }

    andClauses.push({
      $or: searchClauses,
    });
  }

  const range = buildDhakaPresetRange(params);

  if (range) {
    const createdRangeClause = {
      createdAt: { $gte: range.start, $lte: range.end },
    };
    const historyRangeClause = buildOrderHistoryDateRangeMatch(params, range);

    if (params.dateBasis === "activity") {
      andClauses.push({
        $or: [createdRangeClause, ...(historyRangeClause?.$or ?? [])],
      });
    } else if (shouldUseHistoryDateRange(params) && historyRangeClause) {
      andClauses.push(historyRangeClause);
    } else {
      query.createdAt = createdRangeClause.createdAt;
    }
  }

  if (andClauses.length > 0) {
    query.$and = andClauses;
  }

  const isHistoryList =
    params.tab === "history" ||
    Boolean(params.status && historyStatuses.has(params.status));
  const sort: Record<string, SortOrder> =
    params.sortBy === "oldest"
      ? isHistoryList
        ? { updatedAt: 1, createdAt: 1 }
        : { createdAt: 1 }
      : params.sortBy === "highestValue"
        ? { "pricing.subtotal": -1, createdAt: -1 }
        : isHistoryList
          ? { updatedAt: -1, createdAt: -1 }
          : { createdAt: -1 };
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));

  const [items, total, restaurant, statusCountRows] = await Promise.all([
    OrderModel.find(query)
      .sort(sort)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    OrderModel.countDocuments(query),
    RestaurantModel.findById(restaurantId).lean(),
    // Per-status totals for the owner app's filter chips, so each chip can show how
    // many orders it holds. Independent of the current filter/paging.
    // NOTE: aggregate() does not cast like find() does — restaurantId is a string here,
    // so it must be converted or the $match silently matches nothing.
    OrderModel.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          restaurantId: new mongoose.Types.ObjectId(restaurantId),
          source: { $ne: "external" },
        },
      },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const statusCounts = statusCountRows.reduce<Record<string, number>>(
    (result, row) => {
      if (row?._id) {
        result[row._id] = Number(row.count ?? 0);
      }
      return result;
    },
    {},
  );
  statusCounts.live = [...liveStatuses].reduce(
    (sum, status) => sum + (statusCounts[status] ?? 0),
    0,
  );
  const contentRecord = content as Record<string, any>;
  const automationSettingsCache = new Map<
    string,
    Promise<OwnerAutomationSettings>
  >();

  return {
    items: await Promise.all(
      items.map(async (order) =>
        decorateOwnerOrderAutomation(
          applyOwnerOrderPrivacy(order, ownerAppSettings),
          await getOwnerAutomationSettings(
            contentRecord,
            order.serviceAreaSnapshot as Record<string, any> | undefined,
            automationSettingsCache,
          ),
          restaurant as Record<string, any> | null,
        ),
      ),
    ),
    total,
    statusCounts,
  };
}

export async function getOrderById(params: {
  ownerId: string;
  orderId: string;
}) {
  const { restaurantId } = await getOwnerRestaurantContext(params.ownerId);
  const [order, content, restaurant] = await Promise.all([
    OrderModel.findOne({ _id: params.orderId, restaurantId }).lean(),
    getPlatformContent(),
    RestaurantModel.findById(restaurantId).lean(),
  ]);

  if (!order) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "ORDER_NOT_FOUND",
      "Order not found",
    );
  }

  const contentRecord = content as Record<string, any>;
  return decorateOwnerOrderAutomation(
    applyOwnerOrderPrivacy(order, getOwnerAppSettings(contentRecord)),
    await getOwnerAutomationSettings(
      contentRecord,
      order.serviceAreaSnapshot as Record<string, any> | undefined,
    ),
    restaurant as Record<string, any> | null,
  );
}

export async function listOwnerRidersForAssignment(ownerId: string) {
  await getOwnerRestaurantContext(ownerId);

  const riders = await RiderModel.find({
    status: "active",
  })
    .select("_id fullName phone vehicleType isAvailableForAssignments")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  const riderIds = riders.map((rider) => rider._id.toString());
  const activeCounts = riderIds.length
    ? await OrderModel.aggregate<{ _id: string; activeOrders: number }>([
        {
          $match: {
            riderId: { $in: riderIds },
            status: { $in: ["ReadyForPickup", "PickedUp"] },
          },
        },
        {
          $group: {
            _id: "$riderId",
            activeOrders: { $sum: 1 },
          },
        },
      ])
    : [];

  const countMap = new Map(
    activeCounts.map((entry) => [entry._id, entry.activeOrders]),
  );

  return riders.map((rider) => ({
    id: rider._id.toString(),
    fullName: rider.fullName,
    phone: rider.phone,
    vehicleType: rider.vehicleType ?? "cycle",
    isAvailableForAssignments: rider.isAvailableForAssignments ?? true,
    activeOrders: countMap.get(rider._id.toString()) ?? 0,
  }));
}

export async function assignOwnerRiderToOrder(params: {
  ownerId: string;
  orderId: string;
  riderId: string;
}) {
  const { restaurantId } = await getOwnerRestaurantContext(params.ownerId);
  const rider = await RiderModel.findById(params.riderId);

  if (!rider) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RIDER_NOT_FOUND",
      "Rider not found",
    );
  }

  if (rider.status !== "active") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "RIDER_ACCOUNT_UNAVAILABLE",
      "This rider account is not active",
    );
  }

  if (!rider.isAvailableForAssignments) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "RIDER_NOT_AVAILABLE",
      "This rider is currently unavailable for new assignments",
    );
  }

  const order = await OrderModel.findOne({ _id: params.orderId, restaurantId });

  if (!order) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "ORDER_NOT_FOUND",
      "Order not found",
    );
  }

  if (order.status !== "ReadyForPickup") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "ORDER_NOT_ASSIGNABLE",
      "Only ready-for-pickup orders can be assigned to a rider",
    );
  }

  const previousRiderId =
    typeof order.riderId === "string" ? order.riderId : "";
  if (previousRiderId !== rider.id) {
    const [activeOrdersCount, maxActiveOrdersPerRider] = await Promise.all([
      OrderModel.countDocuments({
        _id: { $ne: order._id },
        riderId: rider.id,
        status: { $in: ["ReadyForPickup", "PickedUp"] },
      }),
      getMaxActiveOrdersPerRider(),
    ]);

    if (activeOrdersCount >= maxActiveOrdersPerRider) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "RIDER_CAPACITY_REACHED",
        `This rider already has ${activeOrdersCount} active orders. Choose another rider or increase the dispatch capacity.`,
      );
    }
  }
  order.riderId = rider.id;
  order.riderSnapshot = {
    ...(order.riderSnapshot ?? {}),
    name: rider.fullName,
    phone: rider.phone,
    vehicleType: rider.vehicleType,
  };
  await order.save();

  if (previousRiderId && previousRiderId !== rider.id) {
    emitSocketEvent(`rider:${previousRiderId}`, "rider.assignment.updated", {
      orderId: order.id,
      orderNumber: order.orderNumber,
      message: `Order ${order.orderNumber} has been reassigned to another rider.`,
      assignmentAction: "unassigned",
    });
    emitSocketEvent(
      `rider:${previousRiderId}`,
      "rider.order.updated",
      order.toObject(),
    );
    enqueueBackgroundTask("owner.assignment.previous_rider_push", async () => {
      await sendPushToRider({
        riderId: previousRiderId,
        payload: {
          title: "অ্যাসাইনমেন্ট আপডেট",
          body: `অর্ডার ${order.orderNumber} অন্য রাইডারকে দেওয়া হয়েছে।`,
          data: {
            type: "rider_assignment",
            orderId: order.id,
            path: "/(app)/available",
          },
        },
      });
    });
  }

  const ownerOrderObject = await buildOwnerFacingOrderPayload(order.toObject());
  emitSocketEvent(`owner:${params.ownerId}`, "order.updated", ownerOrderObject);
  emitSocketEvent(
    `restaurant:${restaurantId}`,
    "order.updated",
    ownerOrderObject,
  );
  emitSocketEvent(`rider:${rider.id}`, "rider.assignment.updated", {
    orderId: order.id,
    orderNumber: order.orderNumber,
    message: `একটি রেডি অর্ডার আপনাকে অ্যাসাইন করা হয়েছে।`,
    assignmentAction:
      previousRiderId && previousRiderId !== rider.id
        ? "reassigned"
        : "assigned",
  });
  emitSocketEvent(`rider:${rider.id}`, "rider.order.updated", order.toObject());
  emitSocketEvent(
    `customer:${order.customerId}`,
    "customer.order.updated",
    order.toObject(),
  );
  emitAdminOrderUpdated(order.toObject());
  emitAdminLiveMapUpdated({
    type: "rider.assignment",
    orderId: order.id,
    riderId: rider.id,
  });
  enqueueBackgroundTask("owner.assignment.rider_push", async () => {
    await sendPushToRider({
      riderId: rider.id,
      payload: {
        title:
          previousRiderId && previousRiderId !== rider.id
            ? "অর্ডার রিঅ্যাসাইনড"
            : "নতুন ডেলিভারি অ্যাসাইনমেন্ট",
        body:
          previousRiderId && previousRiderId !== rider.id
            ? `${order.orderNumber} এখন আপনাকে অ্যাসাইন করা হয়েছে।`
            : `${order.orderNumber} পিকআপের জন্য রেডি এবং আপনাকে অ্যাসাইন করা হয়েছে।`,
        // A brand-new delivery for this rider → the dedicated new-delivery sound.
        channelId: "new-delivery",
        data: {
          type: "rider_assignment",
          orderId: order.id,
          path: `/orders/${order.id}`,
        },
      },
    });
  });
  // Rider assignment is recorded in-app (and shows live on the tracking map) but does
  // NOT push — it's redundant with the "on the way" push that follows at pickup, and
  // keeping it push-free avoids notification fatigue.
  enqueueBackgroundTask("owner.assignment.customer_notification", async () => {
    await createCustomerNotification({
      customerId: order.customerId,
      payload: {
        title:
          previousRiderId && previousRiderId !== rider.id
            ? "🛵 Rider updated"
            : "🛵 Rider assigned",
        body:
          previousRiderId && previousRiderId !== rider.id
            ? `${rider.fullName} will now deliver your order.`
            : `${rider.fullName} is assigned to deliver your order.`,
        data: {
          type: "rider_assigned",
          orderId: order.id,
          path: `/orders/${order.id}/tracking`,
        },
      },
    });
  });

  return ownerOrderObject;
}

export async function transitionOrder(params: {
  ownerId: string;
  orderId: string;
  nextStatus:
    | "Accepted"
    | "Rejected"
    | "Preparing"
    | "ReadyForPickup"
    | "Cancelled";
  actor: "owner";
  note?: string;
  // Owner's per-order prep-time choice (from the accept dropdown), in minutes.
  preparationMinutes?: number;
}) {
  const { owner, restaurantId } = await getOwnerRestaurantContext(
    params.ownerId,
  );
  const currentOrder = await OrderModel.findOne({
    _id: params.orderId,
    restaurantId,
  }).lean();

  if (!currentOrder) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "ORDER_NOT_FOUND",
      "Order not found",
    );
  }

  const allowedNextStatuses = ownerOrderTransitions[currentOrder.status] ?? [];

  if (!allowedNextStatuses.includes(params.nextStatus)) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_ORDER_TRANSITION",
      `Order cannot move from ${currentOrder.status} to ${params.nextStatus}`,
    );
  }

  const now = new Date();
  const restaurant =
    params.nextStatus === "Preparing"
      ? await RestaurantModel.findById(restaurantId).lean()
      : null;
  const plannedPrepMinutes = clampPreparationMinutes(params.preparationMinutes);
  const setPayload: Record<string, unknown> = {
    status: params.nextStatus,
    timestamps: applyOrderStatusTimestamp(
      currentOrder.timestamps as Record<string, unknown> | undefined,
      params.nextStatus,
      now,
    ),
  };

  // Owner chose a per-order prep time (from the accept dropdown). Persist it before prep
  // starts so buildPreparationMetaForStart uses it as the base minutes instead of the avg.
  if (plannedPrepMinutes !== null && params.nextStatus !== "Preparing") {
    setPayload["preparationMeta.plannedBaseMinutes"] = plannedPrepMinutes;
  }

  if (params.nextStatus === "Preparing") {
    const content = await getPlatformContent();
    const settings = await getOwnerAutomationSettings(
      content as Record<string, any>,
      currentOrder.serviceAreaSnapshot as Record<string, any> | undefined,
    );
    setPayload.preparationMeta = buildPreparationMetaForStart({
      order: currentOrder,
      restaurant: restaurant as Record<string, any> | null,
      startedAt: now,
      autoStarted: false,
      maxExtraMinutes: settings.preparationMaxExtraMinutes,
      plannedBaseMinutes: plannedPrepMinutes ?? undefined,
    });
  }

  if (params.nextStatus === "Rejected") {
    setPayload.rejectionReason = params.note ?? "";
    setPayload.terminalReason = "owner_rejected";

    if (
      currentOrder.paymentMethod === "Bkash" &&
      currentOrder.paymentStatus === "paid"
    ) {
      setPayload.paymentStatus = "refund_pending";
      setPayload["paymentSnapshot.refundStatus"] = "pending";
      setPayload["paymentSnapshot.refundRequestedAt"] = now;
    }
    if (
      currentOrder.paymentMethod === "Cash" &&
      currentOrder.paymentStatus !== "paid"
    ) {
      setPayload.paymentStatus = "cancelled";
    }
  }

  if (params.nextStatus === "Cancelled") {
    setPayload.cancelledBy = "owner";
    setPayload.terminalReason = params.note ?? "owner_cancelled";
    setPayload["riderTracking.isActive"] = false;
    setPayload["riderTracking.completedAt"] = now;
    setPayload["riderTracking.endedAt"] = now;

    if (
      currentOrder.paymentMethod === "Bkash" &&
      currentOrder.paymentStatus === "paid"
    ) {
      setPayload.paymentStatus = "refund_pending";
      setPayload["paymentSnapshot.refundStatus"] = "pending";
      setPayload["paymentSnapshot.refundRequestedAt"] = now;
    }
    if (
      currentOrder.paymentMethod === "Cash" &&
      currentOrder.paymentStatus !== "paid"
    ) {
      setPayload.paymentStatus = "cancelled";
    }
  }

  const order = await OrderModel.findOneAndUpdate(
    { _id: currentOrder._id, restaurantId, status: currentOrder.status },
    {
      $set: setPayload,
      $push: {
        history: {
          $each: [
            {
              status: params.nextStatus,
              actor: params.actor,
              note: params.note ?? "",
              createdAt: now,
            },
          ],
          $slice: -MAX_ORDER_HISTORY_ENTRIES,
        },
      },
    },
    { new: true },
  );

  if (!order) {
    const latestOrder = await OrderModel.findById(params.orderId).lean();
    throw new AppError(
      StatusCodes.CONFLICT,
      "ORDER_STATUS_CHANGED",
      `Order status is already ${latestOrder?.status ?? "updated"}`,
    );
  }

  if (params.nextStatus === "Rejected" || params.nextStatus === "Cancelled") {
    await Promise.all([
      syncOrderLedgerForFinalStatus({
        restaurantId,
        orderId: order.id,
        nextStatus: params.nextStatus,
        finalizedAt: now,
      }),
      releaseVoucherRedemptionsForOrder(
        order._id,
        params.nextStatus === "Rejected" ? "owner_rejected" : "owner_cancelled",
      ),
      releaseFirstOrderDiscountForOrder({
        orderId: order._id,
        customerId: order.customerId,
        reason:
          params.nextStatus === "Rejected"
            ? "owner_rejected"
            : "owner_cancelled",
      }),
    ]);
  }

  const orderObject = order.toObject();
  const responseContent = await getPlatformContent();
  const responseContentRecord = responseContent as Record<string, any>;
  const ownerOrderObject = decorateOwnerOrderAutomation(
    applyOwnerOrderPrivacy(
      orderObject,
      getOwnerAppSettings(responseContentRecord),
    ),
    await getOwnerAutomationSettings(
      responseContentRecord,
      orderObject.serviceAreaSnapshot as Record<string, any> | undefined,
    ),
    restaurant as Record<string, any> | null,
  );
  emitSocketEvent(`owner:${owner.id}`, "order.updated", ownerOrderObject);
  emitSocketEvent(
    `restaurant:${restaurantId}`,
    "order.updated",
    ownerOrderObject,
  );
  emitSocketEvent(
    `customer:${order.customerId}`,
    "customer.order.updated",
    orderObject,
  );
  emitAdminOrderUpdated(orderObject);
  emitAdminLiveMapUpdated({
    type: "order.transition",
    orderId: order.id,
    status: order.status,
  });

  if (params.nextStatus === "Rejected" || params.nextStatus === "Cancelled") {
    enqueueAdminOrderTerminalExceptionAlert({
      order: orderObject,
      actor: "owner",
      nextStatus: params.nextStatus,
      previousStatus: currentOrder.status,
      reason: params.note,
      occurredAt: now,
      alwaysNotify: true,
    });
  }

  await safeSendCustomerOrderStatusPush({
    customerId: order.customerId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    nextStatus: params.nextStatus,
  });

  if (params.nextStatus === "ReadyForPickup") {
    void runAutoDispatchForReadyOrders().catch(() => undefined);
  }

  return ownerOrderObject;
}

export async function extendOrderPreparation(params: {
  ownerId: string;
  orderId: string;
  minutes: 5 | 10 | 15;
}) {
  const { owner, restaurantId } = await getOwnerRestaurantContext(
    params.ownerId,
  );
  const [currentOrder, restaurant, content] = await Promise.all([
    OrderModel.findOne({ _id: params.orderId, restaurantId }).lean(),
    RestaurantModel.findById(restaurantId).lean(),
    getPlatformContent(),
  ]);

  if (!currentOrder) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "ORDER_NOT_FOUND",
      "Order not found",
    );
  }

  if (currentOrder.status !== "Preparing") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "PREPARATION_EXTENSION_NOT_ALLOWED",
      "Extra preparation time can only be added while food is being prepared",
    );
  }

  const currentExtraMinutes =
    typeof currentOrder.preparationMeta?.extraMinutes === "number"
      ? currentOrder.preparationMeta.extraMinutes
      : 0;
  const contentRecord = content as Record<string, any>;
  const settings = await getOwnerAutomationSettings(
    contentRecord,
    currentOrder.serviceAreaSnapshot as Record<string, any> | undefined,
  );
  // Capped by the restaurant's admin-set max extra time — once used up, no more can be added.
  const remainingExtraMinutes = Math.max(
    0,
    settings.preparationMaxExtraMinutes - currentExtraMinutes,
  );

  if (remainingExtraMinutes <= 0 || params.minutes > remainingExtraMinutes) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "PREPARATION_EXTENSION_LIMIT_REACHED",
      `Only ${remainingExtraMinutes} minutes can be added to this order`,
    );
  }

  const now = new Date();
  const preparationMeta = buildPreparationMetaForExtension({
    order: currentOrder,
    restaurant: restaurant as Record<string, any> | null,
    minutesToAdd: params.minutes,
    extendedAt: now,
    maxExtraMinutes: settings.preparationMaxExtraMinutes,
  });

  const updatedOrder = await OrderModel.findOneAndUpdate(
    { _id: currentOrder._id, restaurantId, status: "Preparing" },
    {
      $set: {
        preparationMeta,
      },
      $push: {
        history: {
          $each: [
            {
              status: "Preparing",
              actor: "owner",
              note: `Owner added ${params.minutes} minutes to preparation time.`,
              createdAt: now,
            },
          ],
          $slice: -MAX_ORDER_HISTORY_ENTRIES,
        },
      },
    },
    { new: true },
  );

  if (!updatedOrder) {
    const latestOrder = await OrderModel.findById(params.orderId).lean();
    throw new AppError(
      StatusCodes.CONFLICT,
      "ORDER_STATUS_CHANGED",
      `Order status is already ${latestOrder?.status ?? "updated"}`,
    );
  }

  const orderObject = updatedOrder.toObject();
  const ownerOrderObject = decorateOwnerOrderAutomation(
    applyOwnerOrderPrivacy(orderObject, getOwnerAppSettings(contentRecord)),
    await getOwnerAutomationSettings(
      contentRecord,
      orderObject.serviceAreaSnapshot as Record<string, any> | undefined,
    ),
    restaurant as Record<string, any> | null,
  );
  emitSocketEvent(`owner:${owner.id}`, "order.updated", ownerOrderObject);
  emitSocketEvent(
    `restaurant:${restaurantId}`,
    "order.updated",
    ownerOrderObject,
  );
  emitSocketEvent(
    `customer:${updatedOrder.customerId}`,
    "customer.order.updated",
    orderObject,
  );
  emitAdminOrderUpdated(orderObject);
  emitAdminLiveMapUpdated({
    type: "order.preparation_extended",
    orderId: updatedOrder.id,
    status: updatedOrder.status,
  });

  return ownerOrderObject;
}

export async function transitionOrderBySystem(params: {
  orderId: string;
  nextStatus: "PickedUp" | "Delivered" | "Cancelled";
  actor: "rider" | "system" | "admin";
  note?: string;
}) {
  const order = await OrderModel.findById(params.orderId);

  if (!order) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "ORDER_NOT_FOUND",
      "Order not found",
    );
  }

  const allowedNextStatuses = systemOrderTransitions[order.status] ?? [];

  if (!allowedNextStatuses.includes(params.nextStatus)) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_ORDER_TRANSITION",
      `Order cannot move from ${order.status} to ${params.nextStatus}`,
    );
  }

  const now = new Date();
  const setPayload: Record<string, unknown> = {
    status: params.nextStatus,
    timestamps: applyOrderStatusTimestamp(
      order.timestamps,
      params.nextStatus,
      now,
    ),
  };
  if (params.nextStatus === "Cancelled") {
    setPayload.cancelledBy = params.actor;
    setPayload.terminalReason = params.note ?? "system_cancelled";

    if (order.paymentMethod === "Bkash" && order.paymentStatus === "paid") {
      setPayload.paymentStatus = "refund_pending";
      setPayload["paymentSnapshot.refundStatus"] = "pending";
      setPayload["paymentSnapshot.refundRequestedAt"] = now;
    }
    if (order.paymentMethod === "Cash" && order.paymentStatus !== "paid") {
      setPayload.paymentStatus = "cancelled";
    }
  }

  if (params.nextStatus === "Delivered") {
    setPayload.terminalReason = "delivered";
    setPayload.reviewRequest = {
      ...((order.get("reviewRequest") ?? {}) as Record<string, unknown>),
      deliveredAt: now,
    };
  }

  // Off-platform (external) order: on delivery Foodbela now holds the money — rider cash
  // for COD, or the customer's online payment. Auto-mark it "collected" so it enters the
  // settlement queue; the admin then reconciles + settles the owner's share. Normal orders
  // are untouched (they settle through the commission ledger below).
  if (params.nextStatus === "Delivered" && order.source === "external") {
    setPayload.paymentStatus = "paid";
    setPayload["external.collectedAt"] = now;
    setPayload["external.settlementStatus"] = "collected";
  }
  // A failed/cancelled external delivery never collected any money — mark it terminal so it
  // stays out of the settlement queue.
  if (params.nextStatus === "Cancelled" && order.source === "external") {
    setPayload["external.settlementStatus"] = "cancelled";
  }

  if (params.nextStatus === "PickedUp") {
    setPayload.riderTracking = {
      ...(order.get("riderTracking") ?? {}),
      isActive: true,
      startedAt: new Date(),
      lastUpdatedAt: new Date(),
    };
  }

  if (params.nextStatus === "Delivered" || params.nextStatus === "Cancelled") {
    setPayload.riderTracking = {
      ...(order.get("riderTracking") ?? {}),
      isActive: false,
      completedAt: new Date(),
      lastUpdatedAt: new Date(),
      endedAt: new Date(),
      disconnectedAt: new Date(),
    };
  }

  const updatedOrder = await OrderModel.findOneAndUpdate(
    { _id: order._id, status: order.status },
    {
      $set: setPayload,
      $push: {
        history: {
          $each: [
            {
              status: params.nextStatus,
              actor: params.actor,
              note: params.note ?? "",
              createdAt: now,
            },
          ],
          $slice: -MAX_ORDER_HISTORY_ENTRIES,
        },
      },
    },
    { new: true },
  );

  if (!updatedOrder) {
    const latestOrder = await OrderModel.findById(params.orderId).lean();
    throw new AppError(
      StatusCodes.CONFLICT,
      "ORDER_STATUS_CHANGED",
      `Order status is already ${latestOrder?.status ?? "updated"}`,
    );
  }

  if (params.nextStatus === "Delivered" || params.nextStatus === "Cancelled") {
    // External (off-platform) orders never touch the commission ledger, vouchers, or
    // first-order discounts — their money runs through the separate settlement flow. This
    // keeps the two revenue streams 100% financially separate.
    if (updatedOrder.source !== "external") {
      await Promise.all([
        syncOrderLedgerForFinalStatus({
          restaurantId: updatedOrder.restaurantId.toString(),
          orderId: updatedOrder.id,
          nextStatus: params.nextStatus,
          finalizedAt: now,
        }),
        params.nextStatus === "Cancelled"
          ? releaseVoucherRedemptionsForOrder(
              updatedOrder._id,
              params.note ?? "system_cancelled",
            )
          : Promise.resolve(),
        params.nextStatus === "Cancelled"
          ? releaseFirstOrderDiscountForOrder({
              orderId: updatedOrder._id,
              customerId: updatedOrder.customerId,
              reason: params.note ?? "system_cancelled",
            })
          : Promise.resolve(),
      ]);
    }

    await clearRiderActiveTrackingForFinalOrder(updatedOrder);
  }

  if (params.nextStatus === "Delivered" && updatedOrder.source !== "external") {
    await grantReferralRewardForDeliveredOrder({
      orderId: updatedOrder.id,
    }).catch(() => undefined);
    await handleCustomerCustomOfferDeliveredOrder({
      customerId: updatedOrder.customerId,
      orderId: updatedOrder.id,
    }).catch(() => undefined);
  }

  const restaurantOwner = await OwnerModel.findOne({
    activeRestaurantId: updatedOrder.restaurantId,
  });
  const ownerFacingOrder = await buildOwnerFacingOrderPayload(
    updatedOrder.toObject(),
  );

  if (restaurantOwner) {
    enqueueBackgroundTask(
      "owner.system_transition.owner_notification",
      async () => {
        await createOwnerNotification({
          ownerId: restaurantOwner.id,
          restaurantId: updatedOrder.restaurantId.toString(),
          type: "order",
          eventType: "order.updated",
          entityType: "order",
          entityId: updatedOrder.id,
          title: getOrderActionTitle(params.nextStatus),
          description: `Order ${updatedOrder.orderNumber} is now ${params.nextStatus}.`,
          titleBn: getOrderActionTitleBn(params.nextStatus),
          descriptionBn: `অর্ডার ${updatedOrder.orderNumber} এখন ${
            ORDER_STATUS_LABEL_BN[params.nextStatus] ?? params.nextStatus
          }।`,
          actionPath: `/orders?order=${updatedOrder.id}`,
        });
      },
    );

    emitSocketEvent(
      `owner:${restaurantOwner.id}`,
      "order.updated",
      ownerFacingOrder,
    );
  }

  emitSocketEvent(
    `restaurant:${updatedOrder.restaurantId.toString()}`,
    "order.updated",
    ownerFacingOrder,
  );
  emitSocketEvent(
    `customer:${updatedOrder.customerId}`,
    "customer.order.updated",
    updatedOrder.toObject(),
  );
  emitAdminOrderUpdated(updatedOrder.toObject());
  if (updatedOrder.riderId) {
    emitSocketEvent(
      `rider:${updatedOrder.riderId}`,
      "rider.order.updated",
      updatedOrder.toObject(),
    );
  }
  emitAdminLiveMapUpdated({
    type: "order.transition",
    orderId: updatedOrder.id,
    status: updatedOrder.status,
  });

  if (
    params.nextStatus === "Cancelled" &&
    (params.actor !== "admin" || updatedOrder.paymentMethod === "Bkash")
  ) {
    enqueueAdminOrderTerminalExceptionAlert({
      order: updatedOrder.toObject(),
      actor: params.actor,
      nextStatus: "Cancelled",
      previousStatus: order.status,
      reason: params.note,
      occurredAt: now,
      alwaysNotify: params.actor !== "admin",
      refundOnly: params.actor === "admin",
    });
  }

  await safeSendCustomerOrderStatusPush({
    customerId: updatedOrder.customerId,
    orderId: updatedOrder.id,
    orderNumber: updatedOrder.orderNumber,
    nextStatus: params.nextStatus,
  });

  return updatedOrder;
}

export async function updateOrderRiderLocation(params: {
  orderId: string;
  actor: "rider" | "admin" | "system";
  latitude: number;
  longitude: number;
  heading?: number;
  accuracyMeters?: number;
  speedKmph?: number;
  riderName?: string;
  riderPhone?: string;
}) {
  const order = await OrderModel.findById(params.orderId);

  if (!order) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "ORDER_NOT_FOUND",
      "Order not found",
    );
  }

  if (order.status !== "PickedUp") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "RIDER_TRACKING_NOT_ACTIVE",
      "Rider tracking can only update after pickup",
    );
  }

  const deliveryAddress = order.customerSnapshot?.deliveryAddress;
  if (
    typeof deliveryAddress?.latitude !== "number" ||
    typeof deliveryAddress?.longitude !== "number"
  ) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "DELIVERY_LOCATION_NOT_AVAILABLE",
      "Customer delivery coordinates are required for live tracking",
    );
  }

  const currentTracking =
    (order.get("riderTracking") as {
      isFocused?: boolean;
      currentLocation?: {
        latitude?: number;
        longitude?: number;
      };
      lastUpdatedAt?: string | Date | null;
      nearCustomerNotifiedAt?: string | Date | null;
      history?: Array<Record<string, unknown>>;
    } | null) ?? {};

  const platformContent = await getPlatformContent();
  const riderEtaSettings = getRiderEtaSettings(platformContent);
  const trackingEstimate = estimateCycleTracking({
    riderLatitude: params.latitude,
    riderLongitude: params.longitude,
    customerLatitude: deliveryAddress.latitude,
    customerLongitude: deliveryAddress.longitude,
    previousLatitude: currentTracking.currentLocation?.latitude,
    previousLongitude: currentTracking.currentLocation?.longitude,
    previousUpdatedAt: currentTracking.lastUpdatedAt,
    reportedSpeedKmph: params.speedKmph,
    etaSpeedKmph: riderEtaSettings.speedKmph,
    routeFactor: riderEtaSettings.routeFactor,
  });
  const routeMetrics = await getOrderRouteMetrics({
    orderId: order.id,
    origin: { latitude: params.latitude, longitude: params.longitude },
    destination: {
      latitude: deliveryAddress.latitude,
      longitude: deliveryAddress.longitude,
    },
    source: "live_location",
    sessionKey: "delivery_leg",
  });
  const remainingDistanceKm =
    typeof routeMetrics?.distanceKm === "number"
      ? routeMetrics.distanceKm
      : trackingEstimate.routeDistanceKm;
  const remainingDurationMinutes =
    typeof routeMetrics?.durationMinutes === "number"
      ? routeMetrics.durationMinutes
      : trackingEstimate.remainingDurationMinutes;
  const isNearCustomer =
    trackingEstimate.directDistanceKm <= RIDER_NEAR_CUSTOMER_DISTANCE_KM ||
    remainingDistanceKm <= RIDER_NEAR_CUSTOMER_DISTANCE_KM;

  const trackingSnapshot = {
    isActive: true,
    isFocused: Boolean(currentTracking.isFocused),
    startedAt:
      currentTracking.lastUpdatedAt ??
      order.timestamps?.PickedUp ??
      order.createdAt,
    lastUpdatedAt: new Date(),
    currentLocation: {
      latitude: params.latitude,
      longitude: params.longitude,
      heading: params.heading ?? null,
      accuracyMeters: params.accuracyMeters ?? null,
    },
    remainingDistanceKm,
    directDistanceKm: trackingEstimate.directDistanceKm,
    remainingDurationMinutes,
    speedKmph: trackingEstimate.speedKmph,
    routeProvider: routeMetrics?.provider ?? null,
    trafficAware: routeMetrics?.trafficAware ?? false,
    isNearCustomer,
    nearCustomerNotifiedAt:
      currentTracking.nearCustomerNotifiedAt ??
      (isNearCustomer ? new Date() : null),
    history: [
      ...((currentTracking.history ?? []) as Array<Record<string, unknown>>),
      {
        latitude: params.latitude,
        longitude: params.longitude,
        heading: params.heading ?? null,
        accuracyMeters: params.accuracyMeters ?? null,
        speedKmph: trackingEstimate.speedKmph,
        createdAt: new Date(),
      },
    ].slice(-12),
  };

  if (params.riderName || params.riderPhone) {
    order.riderSnapshot = {
      ...(order.riderSnapshot ?? {}),
      name: params.riderName ?? order.riderSnapshot?.name ?? "",
      phone: params.riderPhone ?? order.riderSnapshot?.phone ?? "",
      vehicleType: "cycle",
    };
  }

  order.set("riderTracking", trackingSnapshot);
  await order.save();

  const restaurantOwner = await OwnerModel.findOne({
    activeRestaurantId: order.restaurantId,
  });
  const ownerFacingOrder = await buildOwnerFacingOrderPayload(order.toObject());

  if (restaurantOwner) {
    emitSocketEvent(
      `owner:${restaurantOwner.id}`,
      "order.updated",
      ownerFacingOrder,
    );
  }
  emitSocketEvent(
    `restaurant:${order.restaurantId.toString()}`,
    "order.updated",
    ownerFacingOrder,
  );
  // Ship the freshly-computed delivery-leg route WITH the location update. Without
  // this, the socket payload only carries the rider's new position while the road
  // polyline stays whatever the customer last fetched (screen open / pull-to-refresh),
  // so the marker drifts off a stale route and only realigns on a manual refresh.
  // routeMetrics is the same cached "delivery_leg" route the customer detail builds, so
  // this is free — we just forward its polyline. `mergeOrderPayload` on the client
  // prefers this incoming route over the stale cached one.
  const liveRouteToCustomer =
    routeMetrics && routeMetrics.polyline
      ? {
          distanceKm: routeMetrics.distanceKm,
          durationMinutes: routeMetrics.durationMinutes,
          polyline: routeMetrics.polyline,
          provider: routeMetrics.provider,
          trafficAware: routeMetrics.trafficAware,
        }
      : null;

  emitSocketEvent(
    `customer:${order.customerId}`,
    "customer.order.updated",
    { ...order.toObject(), routeToCustomer: liveRouteToCustomer },
  );
  // NOTE: we intentionally do NOT echo this live-location update back to the rider.
  // The rider is the source of the location, and their own app shows their position via
  // the native map dot — echoing rider.order.updated here every ~10s only forced a heavy
  // order-screen + map re-render on the rider. Status/assignment changes still reach the
  // rider through their own dedicated emits (pickup/deliver/assignment). Customer, owner
  // and admin still receive the live update above.
  emitAdminLiveMapUpdated({
    type: "rider.location",
    orderId: order.id,
    status: order.status,
  });

  if (isNearCustomer && !currentTracking.nearCustomerNotifiedAt) {
    enqueueBackgroundTask("owner.rider_near.customer_push", async () => {
      await sendPushToCustomer({
        customerId: order.customerId,
        payload: {
          title: "Rider is nearby",
          body: "Your rider is almost there. Please be ready to receive your order.",
          data: {
            type: "rider_near",
            notificationType: "rider_near",
            orderId: order.id,
            path: `/orders/${order.id}/tracking`,
            remainingDistanceKm: Number(remainingDistanceKm.toFixed(3)),
            directDistanceKm: Number(
              trackingEstimate.directDistanceKm.toFixed(3),
            ),
            source: "live_tracking",
          },
        },
      });
    });
  }

  return order;
}

export async function listNotifications(ownerId: string) {
  return listNotificationsWithFilters({ ownerId });
}

export async function listNotificationsWithFilters(params: {
  ownerId: string;
  filter?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const query: Record<string, unknown> = { ownerId: params.ownerId };

  if (params.filter === "unread") {
    query.isRead = false;
  } else if (
    params.filter &&
    ["order", "payout", "system", "promotion", "support", "review"].includes(
      params.filter,
    )
  ) {
    query.type = params.filter;
  }

  if (params.search) {
    query.$or = [
      { title: { $regex: params.search, $options: "i" } },
      { description: { $regex: params.search, $options: "i" } },
      { eventType: { $regex: params.search, $options: "i" } },
    ];
  }

  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));

  const [items, total, unreadCount] = await Promise.all([
    NotificationModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
    NotificationModel.countDocuments(query),
    NotificationModel.countDocuments({
      ownerId: params.ownerId,
      isRead: false,
    }),
  ]);

  return { items, total, unreadCount };
}

export async function markNotificationAsRead(params: {
  ownerId: string;
  notificationId: string;
}) {
  const existingNotification = await NotificationModel.findOne({
    _id: params.notificationId,
    ownerId: params.ownerId,
  });

  if (!existingNotification) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "NOTIFICATION_NOT_FOUND",
      "Notification not found",
    );
  }

  if (existingNotification.isRead) {
    return existingNotification;
  }

  existingNotification.isRead = true;
  existingNotification.readAt = new Date();
  await existingNotification.save();

  return existingNotification;
}

export async function markAllNotificationsAsRead(ownerId: string) {
  await NotificationModel.updateMany(
    { ownerId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );

  return { updated: true };
}
