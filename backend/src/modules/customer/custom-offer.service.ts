import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import { AppError } from "../../common/utils/app-error";
import { createAdminOperationalAlert } from "../admin/admin-alert.service";
import { OrderModel } from "../owner/operational.model";
import { getPlatformContent, type PlatformContentScope } from "../public/content.service";
import { CustomerModel, VoucherRedemptionModel } from "./customer.model";
import { sendPushToCustomer } from "./push.service";

const DEFAULT_CUSTOM_OFFER_TARGET_ORDER_COUNT = 10;
const DEFAULT_CUSTOM_OFFER_ADMIN_RESPONSE_HOURS = 72;
const DEFAULT_CUSTOM_OFFER_CODE_MAX_LENGTH = 12;

type CustomerCustomOfferStatus = "locked" | "eligible" | "requested" | "ready";

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dateOrNull(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function latestDateOrNull(...values: Array<unknown>) {
  const dates = values
    .map((value) => dateOrNull(value))
    .filter((date): date is Date => Boolean(date));
  if (!dates.length) return null;
  return dates.reduce((latest, date) =>
    date.getTime() > latest.getTime() ? date : latest,
  );
}

function renderTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
    template,
  );
}

export async function getCustomerCustomOfferSettings(scope?: PlatformContentScope) {
  const content = await getPlatformContent(scope);
  const settings = content.operations.customOffers ?? {};
  const cmsMyOfferSection = content.customerApp.homeCms.myOfferSection;
  return {
    enabled: settings.enabled !== false,
    profileSectionEnabled:
      settings.profileSectionEnabled !== false &&
      cmsMyOfferSection?.enabled !== false,
    thresholdDeliveredOrders:
      typeof settings.thresholdDeliveredOrders === "number" &&
      Number.isFinite(settings.thresholdDeliveredOrders)
        ? Math.max(1, Math.floor(settings.thresholdDeliveredOrders))
        : DEFAULT_CUSTOM_OFFER_TARGET_ORDER_COUNT,
    countStartsAt: latestDateOrNull(
      settings.countStartsAt,
      cmsMyOfferSection?.activeFrom,
    ),
    adminResponseHours:
      typeof settings.adminResponseHours === "number" &&
      Number.isFinite(settings.adminResponseHours)
        ? Math.max(1, Math.floor(settings.adminResponseHours))
        : DEFAULT_CUSTOM_OFFER_ADMIN_RESPONSE_HOURS,
    requestedCodeMaxLength:
      typeof settings.requestedCodeMaxLength === "number" &&
      Number.isFinite(settings.requestedCodeMaxLength)
        ? Math.max(4, Math.min(24, Math.floor(settings.requestedCodeMaxLength)))
        : DEFAULT_CUSTOM_OFFER_CODE_MAX_LENGTH,
    qualificationPushEnabled: settings.qualificationPushEnabled !== false,
    qualificationPushTitle:
      stringValue(settings.qualificationPushTitle) || "My offer is unlocked",
    qualificationPushBody:
      stringValue(settings.qualificationPushBody) ||
      "You completed {{threshold}} orders. Request your personal voucher now.",
  };
}

function getActiveCustomerPersonalOfferNotifications(customer: Record<string, any>) {
  const notifications = Array.isArray(customer.notifications)
    ? customer.notifications
    : [];

  return notifications
    .filter((notification) => notification?.personalOffer === true)
    .filter((notification) => {
      const expiresAt = notification?.voucherExpiresAt
        ? new Date(notification.voucherExpiresAt).getTime()
        : null;
      return !expiresAt || Number.isNaN(expiresAt) || expiresAt > Date.now();
    })
    .sort((left, right) => {
      const leftTime = new Date(left?.createdAt ?? 0).getTime();
      const rightTime = new Date(right?.createdAt ?? 0).getTime();
      return rightTime - leftTime;
    })[0];
}

function getCustomerServiceAreaScope(customer: Record<string, any>) {
  const serviceArea =
    customer.serviceArea && typeof customer.serviceArea === "object"
      ? (customer.serviceArea as Record<string, unknown>)
      : {};
  const zoneId = stringValue(serviceArea.zoneId);
  const districtId = stringValue(serviceArea.districtId);

  return {
    serviceArea,
    zoneId,
    districtId,
  };
}

function getCustomerPlatformContentScope(customer: Record<string, any>): PlatformContentScope {
  const serviceAreaScope = getCustomerServiceAreaScope(customer);
  return {
    zoneId: serviceAreaScope.zoneId,
    districtId: serviceAreaScope.districtId,
  };
}

async function getActiveCustomerPersonalOffer(customer: Record<string, any>, customerId: string) {
  const notifications = getActiveCustomerPersonalOfferNotifications(customer);
  const personalOffers = Array.isArray(customer.notifications)
    ? customer.notifications
        .filter((notification) => notification?.personalOffer === true)
        .filter((notification) => {
          const expiresAt = notification?.voucherExpiresAt
            ? new Date(notification.voucherExpiresAt).getTime()
            : null;
          return !expiresAt || Number.isNaN(expiresAt) || expiresAt > Date.now();
        })
        .sort((left, right) => {
          const leftTime = new Date(left?.createdAt ?? 0).getTime();
          const rightTime = new Date(right?.createdAt ?? 0).getTime();
          return rightTime - leftTime;
        })
    : [];
  const voucherIds = personalOffers
    .map((notification) => stringValue(notification?.voucherId))
    .filter((voucherId) => mongoose.Types.ObjectId.isValid(voucherId));

  if (!voucherIds.length) return notifications;

  const redemptions = await VoucherRedemptionModel.find({
    voucherId: { $in: voucherIds },
    releasedAt: null,
    "voucherSnapshot.customerId": customerId,
  })
    .select("voucherId")
    .lean();
  const usedVoucherIds = new Set(redemptions.map((redemption) => String(redemption.voucherId)));

  return personalOffers.find(
    (notification) => !usedVoucherIds.has(stringValue(notification?.voucherId)),
  );
}

async function countDeliveredOrdersInCurrentCycle(
  customerId: string,
  cycleStartedAt?: Date | null,
  countStartsAt?: Date | null,
) {
  const effectiveStartAt = latestDateOrNull(cycleStartedAt, countStartsAt);
  const deliveredAtFilter = effectiveStartAt
    ? {
        $or: [
          { "timestamps.Delivered": { $gt: effectiveStartAt } },
          { "timestamps.deliveredAt": { $gt: effectiveStartAt } },
          {
            "timestamps.Delivered": { $exists: false },
            "timestamps.deliveredAt": { $exists: false },
            updatedAt: { $gt: effectiveStartAt },
          },
        ],
      }
    : {};

  return OrderModel.countDocuments({
    customerId,
    status: "Delivered",
    ...deliveredAtFilter,
  });
}

function buildCustomerCustomOfferSummary(params: {
  customer: Record<string, any>;
  completedOrderCount: number;
  targetOrderCount: number;
  requestedCodeMaxLength: number;
  enabled: boolean;
  profileSectionEnabled: boolean;
  activeOffer?: Record<string, any>;
}) {
  const {
    customer,
    completedOrderCount,
    targetOrderCount,
    requestedCodeMaxLength,
    enabled,
    profileSectionEnabled,
    activeOffer,
  } = params;
  const request = customer.customOfferRequest ?? {};
  const remainingOrderCount = Math.max(targetOrderCount - completedOrderCount, 0);
  const requestStatus = String(request.status ?? "none");
  const reachedTarget = completedOrderCount >= targetOrderCount;
  const status: CustomerCustomOfferStatus = !enabled
    ? "locked"
    : requestStatus === "requested"
      ? "requested"
      : reachedTarget
        ? "eligible"
        : activeOffer
          ? "ready"
          : "locked";

  return {
    status,
    enabled,
    profileSectionEnabled,
    completedOrderCount,
    targetOrderCount,
    requestedCodeMaxLength,
    remainingOrderCount,
    progressRatio:
      targetOrderCount > 0 ? Math.min(completedOrderCount / targetOrderCount, 1) : 0,
    cycleStartedAt: request.cycleStartedAt ?? null,
    cycleNumber: typeof request.cycleNumber === "number" ? request.cycleNumber : 1,
    qualifiedAt: request.qualifiedAt ?? null,
    qualificationNotifiedAt: request.qualificationNotifiedAt ?? null,
    requestedAt: request.requestedAt ?? null,
    expectedReadyAt: request.expectedReadyAt ?? null,
    fulfilledAt: request.fulfilledAt ?? null,
    requestedCode: request.requestedCode || "",
    voucherId: activeOffer?.voucherId || request.voucherId || "",
    voucherCode: activeOffer?.voucherCode || request.voucherCode || "",
    voucherLabel: activeOffer?.voucherLabel || activeOffer?.title || request.voucherLabel || "",
    voucherExpiresAt: activeOffer?.voucherExpiresAt ?? null,
    analytics: request.analytics ?? {},
  };
}

export async function getCustomerCustomOfferSummary(customerId: string) {
  const customer = await CustomerModel.findById(customerId)
    .select("customOfferRequest notifications serviceArea")
    .lean();

  if (!customer) {
    throw new AppError(StatusCodes.NOT_FOUND, "CUSTOMER_NOT_FOUND", "Customer not found");
  }

  const settings = await getCustomerCustomOfferSettings(
    getCustomerPlatformContentScope(customer as Record<string, any>),
  );
  const cycleStartedAt = dateOrNull(customer.customOfferRequest?.cycleStartedAt);
  const completedOrderCount = await countDeliveredOrdersInCurrentCycle(
    customerId,
    cycleStartedAt,
    settings.countStartsAt,
  );
  const activeOffer = await getActiveCustomerPersonalOffer(customer, customerId);

  return buildCustomerCustomOfferSummary({
    customer,
    completedOrderCount,
    targetOrderCount: settings.thresholdDeliveredOrders,
    requestedCodeMaxLength: settings.requestedCodeMaxLength,
    enabled: settings.enabled,
    profileSectionEnabled: settings.profileSectionEnabled,
    activeOffer,
  });
}

function normalizeRequestedCode(value?: string, maxLength = 24) {
  return stringValue(value)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, Math.max(4, Math.min(24, Math.floor(maxLength))));
}

export async function requestCustomerCustomOffer(params: {
  customerId: string;
  requestedCode?: string;
}) {
  const customer = await CustomerModel.findById(params.customerId);
  if (!customer) {
    throw new AppError(StatusCodes.NOT_FOUND, "CUSTOMER_NOT_FOUND", "Customer not found");
  }
  if (customer.status === "suspended" || customer.status === "locked") {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "ACCOUNT_NOT_ACTIVE",
      "This account is not active.",
    );
  }

  const customerObject = customer.toObject() as Record<string, any>;
  const serviceAreaScope = getCustomerServiceAreaScope(customerObject);
  const settings = await getCustomerCustomOfferSettings({
    zoneId: serviceAreaScope.zoneId,
    districtId: serviceAreaScope.districtId,
  });
  if (!settings.enabled || !settings.profileSectionEnabled) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "CUSTOM_OFFER_DISABLED",
      "My offer is not available right now.",
    );
  }
  const currentRequest = customerObject.customOfferRequest ?? {};
  const cycleStartedAt = dateOrNull(currentRequest.cycleStartedAt);
  const completedOrderCount = await countDeliveredOrdersInCurrentCycle(
    params.customerId,
    cycleStartedAt,
    settings.countStartsAt,
  );

  if (completedOrderCount < settings.thresholdDeliveredOrders) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "CUSTOM_OFFER_NOT_ELIGIBLE",
      "Complete more delivered orders to request my offer.",
    );
  }

  if (currentRequest.status !== "requested") {
    const now = new Date();
    const expectedReadyAt = new Date(
      now.getTime() + settings.adminResponseHours * 60 * 60 * 1000,
    );
    const history = Array.isArray(currentRequest.history)
      ? currentRequest.history
      : [];
    const analytics = currentRequest.analytics ?? {};
    const requestedCode = normalizeRequestedCode(
      params.requestedCode,
      settings.requestedCodeMaxLength,
    );
    const cycleNumber =
      typeof currentRequest.cycleNumber === "number" ? currentRequest.cycleNumber : 1;

    customer.set("customOfferRequest", {
      ...currentRequest,
      status: "requested",
      qualifiedAt: currentRequest.qualifiedAt ?? now,
      requestedAt: now,
      expectedReadyAt,
      fulfilledAt: null,
      requestedCode,
      lastRequestOrderCount: completedOrderCount,
      analytics: {
        ...analytics,
        requestedCount: (analytics.requestedCount ?? 0) + 1,
        lastRequestedAt: now,
        lastRequestedCode: requestedCode,
      },
      history: [
        ...history.slice(-24),
        {
          action: "requested",
          note: requestedCode
            ? `Customer requested code ${requestedCode}.`
            : "Customer requested my offer.",
          actorId: params.customerId,
          actorName: customer.fullName || "Customer",
          createdAt: now,
        },
      ],
    });
    await customer.save();

    await createAdminOperationalAlert({
      alertType: "customer_custom_offer_request",
      severity: "info",
      title: requestedCode
        ? `Customer requested code ${requestedCode}`
        : "Customer requested my offer",
      description: `${
        customer.fullName || customer.phone || "A customer"
      } completed ${completedOrderCount} delivered orders and requested a personal voucher${
        requestedCode ? ` with preferred code ${requestedCode}` : ""
      }.`,
      source: "Customer offers",
      entityType: "customer",
      entityId: params.customerId,
      path: `/users?customerId=${params.customerId}&tab=offers`,
      iconKey: "gift",
      dedupeKey: `customer-custom-offer-request:${params.customerId}:${cycleNumber}`,
      metadata: {
        customerId: params.customerId,
        customerName: customer.fullName || "",
        customerPhone: customer.phone || "",
        completedOrderCount,
        targetOrderCount: settings.thresholdDeliveredOrders,
        requestedCode,
        cycleNumber,
        expectedReadyAt: expectedReadyAt.toISOString(),
        couponsPath: `/coupons?customerId=${params.customerId}&customerName=${encodeURIComponent(
          customer.fullName || "",
        )}&customerPhone=${encodeURIComponent(customer.phone || "")}&requestedCode=${encodeURIComponent(
          requestedCode,
        )}&personalOffer=1${
          serviceAreaScope.zoneId
            ? `&zoneId=${encodeURIComponent(serviceAreaScope.zoneId)}`
            : ""
        }${
          serviceAreaScope.districtId
            ? `&districtId=${encodeURIComponent(serviceAreaScope.districtId)}`
            : ""
        }`,
        serviceArea: serviceAreaScope.serviceArea,
        zoneId: serviceAreaScope.zoneId,
        districtId: serviceAreaScope.districtId,
      },
    });
  }

  return getCustomerCustomOfferSummary(params.customerId);
}

export async function handleCustomerCustomOfferDeliveredOrder(params: {
  customerId: string;
  orderId: string;
}) {
  if (!params.customerId) return { qualified: false };

  const customer = await CustomerModel.findById(params.customerId);
  if (!customer || customer.status !== "active") return { qualified: false };

  const customerObject = customer.toObject() as Record<string, any>;
  const serviceAreaScope = getCustomerServiceAreaScope(customerObject);
  const settings = await getCustomerCustomOfferSettings({
    zoneId: serviceAreaScope.zoneId,
    districtId: serviceAreaScope.districtId,
  });
  if (!settings.enabled || !settings.profileSectionEnabled) {
    return { qualified: false };
  }
  const currentRequest = customerObject.customOfferRequest ?? {};
  if (currentRequest.status === "requested") {
    return { qualified: false };
  }

  const cycleStartedAt = dateOrNull(currentRequest.cycleStartedAt);
  const completedOrderCount = await countDeliveredOrdersInCurrentCycle(
    params.customerId,
    cycleStartedAt,
    settings.countStartsAt,
  );
  if (completedOrderCount < settings.thresholdDeliveredOrders) {
    return { qualified: false, completedOrderCount };
  }

  if (currentRequest.qualificationNotifiedAt) {
    return { qualified: true, completedOrderCount, alreadyNotified: true };
  }

  const now = new Date();
  const history = Array.isArray(currentRequest.history) ? currentRequest.history : [];
  const analytics = currentRequest.analytics ?? {};
  customer.set("customOfferRequest", {
    ...currentRequest,
    status: "none",
    qualifiedAt: currentRequest.qualifiedAt ?? now,
    qualificationNotifiedAt: now,
    lastRequestOrderCount: completedOrderCount,
    analytics: {
      ...analytics,
      qualifiedCount: (analytics.qualifiedCount ?? 0) + 1,
      lastQualifiedAt: now,
    },
    history: [
      ...history.slice(-24),
      {
        action: "qualified",
        note: `Customer reached ${settings.thresholdDeliveredOrders} delivered orders in this cycle.`,
        actorId: "system",
        actorName: "System",
        createdAt: now,
      },
    ],
  });
  await customer.save();

  await createAdminOperationalAlert({
    alertType: "customer_custom_offer_qualified",
    severity: "info",
    title: "Customer unlocked my offer",
    description: `${customer.fullName || customer.phone || "A customer"} reached ${settings.thresholdDeliveredOrders} delivered orders and is ready for a personal voucher.`,
    source: "Customer offers",
    entityType: "customer",
    entityId: params.customerId,
    path: `/users?customerId=${params.customerId}&tab=offers`,
    iconKey: "gift",
    dedupeKey: `customer-custom-offer-qualified:${params.customerId}:${currentRequest.cycleNumber ?? 1}`,
    metadata: {
      customerId: params.customerId,
      customerName: customer.fullName || "",
      customerPhone: customer.phone || "",
      completedOrderCount,
      targetOrderCount: settings.thresholdDeliveredOrders,
      couponsPath: `/coupons?customerId=${params.customerId}&customerName=${encodeURIComponent(
        customer.fullName || "",
      )}&customerPhone=${encodeURIComponent(customer.phone || "")}&personalOffer=1${
        serviceAreaScope.zoneId
          ? `&zoneId=${encodeURIComponent(serviceAreaScope.zoneId)}`
          : ""
      }${
        serviceAreaScope.districtId
          ? `&districtId=${encodeURIComponent(serviceAreaScope.districtId)}`
          : ""
      }`,
      serviceArea: serviceAreaScope.serviceArea,
      zoneId: serviceAreaScope.zoneId,
      districtId: serviceAreaScope.districtId,
    },
  });

  if (settings.qualificationPushEnabled) {
    await sendPushToCustomer({
      customerId: params.customerId,
      payload: {
        title: renderTemplate(settings.qualificationPushTitle, {
          threshold: settings.thresholdDeliveredOrders,
          completed: completedOrderCount,
        }),
        body: renderTemplate(settings.qualificationPushBody, {
          threshold: settings.thresholdDeliveredOrders,
          completed: completedOrderCount,
        }),
        data: {
          type: "custom_offer_qualified",
          path: "/offers",
        },
      },
    });
  }

  return { qualified: true, completedOrderCount };
}

export async function markCustomerCustomOfferFulfilled(params: {
  customerId: string;
  voucherId: string;
  voucherCode?: string;
  voucherLabel?: string;
  adminId?: string;
}) {
  if (!params.customerId) return;
  const customer = await CustomerModel.findById(params.customerId);
  if (!customer) return;

  const currentRequest = (customer.toObject() as Record<string, any>).customOfferRequest ?? {};
  const history = Array.isArray(currentRequest.history) ? currentRequest.history : [];
  const analytics = currentRequest.analytics ?? {};
  const now = new Date();
  customer.set("customOfferRequest", {
    ...currentRequest,
    status: "fulfilled",
    fulfilledAt: now,
    cycleStartedAt: now,
    cycleNumber: (currentRequest.cycleNumber ?? 1) + 1,
    qualifiedAt: null,
    qualificationNotifiedAt: null,
    requestedAt: null,
    expectedReadyAt: null,
    requestedCode: "",
    lastRequestOrderCount: 0,
    voucherId: params.voucherId,
    voucherCode: normalizeRequestedCode(params.voucherCode),
    voucherLabel: stringValue(params.voucherLabel),
    analytics: {
      ...analytics,
      fulfilledCount: (analytics.fulfilledCount ?? 0) + 1,
      lastFulfilledAt: now,
    },
    history: [
      ...history.slice(-24),
      {
        action: "fulfilled",
        note: params.voucherCode
          ? `Voucher ${params.voucherCode} assigned. New cycle started.`
          : "My offer assigned. New cycle started.",
        actorId: params.adminId ?? "system",
        actorName: params.adminId ? "Admin" : "System",
        createdAt: now,
      },
    ],
  });
  await customer.save();
}
