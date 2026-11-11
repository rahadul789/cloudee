import { StatusCodes } from "http-status-codes";
import mongoose from "mongoose";

import { AppError } from "../../common/utils/app-error";
import { createAdminOperationalAlert } from "../admin/admin-alert.service";
import { OrderModel } from "../owner/operational.model";
import { getPlatformContent, type PlatformContentScope } from "../public/content.service";
import { CustomerModel, VoucherModel, VoucherRedemptionModel } from "./customer.model";
import { sendPushToCustomer } from "./push.service";
import { computeStampLedger, getRewardSettings, isRewardsTester } from "../rewards/rewards.settings";
import { MysteryBoxModel } from "../rewards/rewards.model";
import { renderTemplate as renderRewardTemplate } from "../rewards/rewards.rules";

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

// A customer's personal offers are surfaced from their notifications. Some
// selected-user vouchers reach a customer whose notification predates the
// personalOffer flag, so we also resolve which of the referenced vouchers are
// genuinely assigned to this customer. Shared by the customer summary and the
// admin customer detail view so both apply identical rules.
export async function getSelectedUserPersonalOfferVoucherIds(
  customerId: string,
  notifications: Array<Record<string, any>>,
) {
  const voucherIds = notifications
    .map((notification) => stringValue(notification?.voucherId))
    .filter((voucherId) => mongoose.Types.ObjectId.isValid(voucherId));

  if (!voucherIds.length) return new Set<string>();

  const vouchers = await VoucherModel.find({
    _id: { $in: voucherIds },
    audienceType: "selected_users",
    selectedCustomerIds: new mongoose.Types.ObjectId(customerId),
  })
    .select("_id")
    .lean();

  return new Set(vouchers.map((voucher) => String(voucher._id)));
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
  const activeNotifications = Array.isArray(customer.notifications)
    ? customer.notifications
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
  const selectedUserVoucherIds = await getSelectedUserPersonalOfferVoucherIds(
    customerId,
    activeNotifications,
  );
  const personalOffers = activeNotifications.filter(
    (notification) =>
      notification?.personalOffer === true ||
      selectedUserVoucherIds.has(stringValue(notification?.voucherId)),
  );
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

// Stamps on the card right now = the ledger's AVAILABLE stamps (delivered orders + spin bonus
// + coin-bought − already turned into boxes). Extras carry over to the next card.
async function countDeliveredOrdersInCurrentCycle(
  customerId: string,
  request?: Record<string, any> | null,
  countStartsAt?: Date | null,
) {
  const ledger = await computeStampLedger({ customerId, request, countStartsAt });
  return ledger.available;
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
  const completedOrderCount = await countDeliveredOrdersInCurrentCycle(
    customerId,
    customer.customOfferRequest,
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
  const completedOrderCount = await countDeliveredOrdersInCurrentCycle(
    params.customerId,
    currentRequest,
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

    // The claim becomes a mystery box. In auto mode rewards.service opens it right after
    // (processMysteryBoxClaim); in approval mode it waits in the admin Rewards queue.
    const openBox = await MysteryBoxModel.exists({
      customerId: params.customerId,
      status: { $in: ["requested", "ready"] },
    });
    const rewardSettings = await getRewardSettings();
    if (!openBox) {
      await MysteryBoxModel.create({
        customerId: params.customerId,
        status: "requested",
        stampsUsed: settings.thresholdDeliveredOrders,
        requestedCode,
        isTest: isRewardsTester(rewardSettings, params.customerId),
      });
    }
    if (rewardSettings.claimMode === "auto") {
      return getCustomerCustomOfferSummary(params.customerId);
    }

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
      path: "/rewards",
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

/** Optional (admin) nudge for customers who reached the target but haven't claimed. */
export async function sendCustomOfferClaimReminders(limit = 200) {
  const rewardSettings = await getRewardSettings();
  if (!rewardSettings.claimReminderEnabled) return { sent: 0 };
  const cutoff = new Date(Date.now() - rewardSettings.claimReminderAfterDays * 24 * 3_600_000);
  const customers = await CustomerModel.find({
    status: "active",
    "customOfferRequest.qualificationNotifiedAt": { $lte: cutoff },
    "customOfferRequest.status": { $nin: ["requested", "fulfilled"] },
    "customOfferRequest.claimReminderSentAt": null,
  })
    .select({ _id: 1 })
    .limit(limit)
    .lean();
  let sent = 0;
  for (const customer of customers) {
    const customerId = String(customer._id);
    // Claim the reminder slot first so overlapping runs never double-send.
    const claimed = await CustomerModel.updateOne(
      { _id: customer._id, "customOfferRequest.claimReminderSentAt": null },
      { $set: { "customOfferRequest.claimReminderSentAt": new Date() } },
    );
    if (!claimed.modifiedCount) continue;
    const settings = await getCustomerCustomOfferSettings();
    const values = { threshold: settings.thresholdDeliveredOrders, amount: rewardSettings.claimAmount };
    await sendPushToCustomer({
      customerId,
      payload: {
        title: renderRewardTemplate(rewardSettings.claimReminderTitle, values),
        body: renderRewardTemplate(rewardSettings.claimReminderBody, values),
        data: { type: "custom_offer_qualified", path: "/offers" },
      },
    }).catch(() => undefined);
    sent += 1;
  }
  return { sent };
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

  const completedOrderCount = await countDeliveredOrdersInCurrentCycle(
    params.customerId,
    currentRequest,
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
  const offerSettings = await getCustomerCustomOfferSettings(
    getCustomerPlatformContentScope(customer.toObject() as Record<string, any>),
  );
  const ledger = await computeStampLedger({
    customerId: params.customerId,
    request: currentRequest,
    countStartsAt: offerSettings.countStartsAt,
  });
  // Manual path (admin Coupons) also completes the open mystery box.
  await MysteryBoxModel.updateMany(
    { customerId: params.customerId, status: "requested" },
    {
      $set: {
        status: "ready",
        readyAt: now,
        voucherId: mongoose.Types.ObjectId.isValid(params.voucherId) ? params.voucherId : null,
        voucherCode: normalizeRequestedCode(params.voucherCode),
        decidedBy: params.adminId ?? "manual",
      },
    },
  );
  customer.set("customOfferRequest", {
    ...currentRequest,
    // One full card used; any extra stamps carry over to the next card.
    stampsConsumed: ledger.consumed + offerSettings.thresholdDeliveredOrders,
    status: "fulfilled",
    fulfilledAt: now,
    cycleStartedAt: now,
    cycleNumber: (currentRequest.cycleNumber ?? 1) + 1,
    qualifiedAt: null,
    qualificationNotifiedAt: null,
    claimReminderSentAt: null,
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
