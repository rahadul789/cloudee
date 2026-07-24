import mongoose from "mongoose";
import { StatusCodes } from "http-status-codes";

import { AppError } from "../../common/utils/app-error";
import { fetchWithTimeout } from "../../common/utils/fetch-with-timeout";
import { optimizePushImageUrl } from "../../common/utils/push-image";
import { logger } from "../../config/logger";
import { emitSocketEvent } from "../../config/socket";
import { AdminNotificationScheduleModel } from "../admin/notification-schedule.model";
import { OrderModel } from "../owner/operational.model";
import { ReviewModel } from "../owner/experience.model";
import { getPlatformContent } from "../public/content.service";
import {
  CustomerModel,
  VoucherModel,
  VoucherRedemptionModel,
} from "./customer.model";

// content.service also imports sendPushToCustomer from this module. The cycle is
// safe because both sides only call the imported symbols inside functions (never
// at module load), so getPlatformContent is resolved by the time it runs.
async function loadPlatformContent() {
  return getPlatformContent();
}

type CustomerPushPayload = {
  title: string;
  body: string;
  contentType?: "text" | "image" | "image_text";
  imageUrl?: string;
  data?: Record<string, unknown>;
};

type CustomerNotificationRecord = {
  id: string;
  type: string;
  title: string;
  description: string;
  path: string;
  campaignId: string;
  campaignVariant: string;
  ctaLabel: string;
  ctaPath: string;
  contentType: string;
  imageUrl: string;
  voucherId: string;
  voucherCode: string;
  voucherLabel: string;
  voucherExpiresAt: string | null;
  voucherMinOrder: number | null;
  voucherUsageStatus: "available" | "used" | "expired" | "info";
  voucherAppliedAt: string | null;
  voucherOrderId: string;
  isOfferDisabled: boolean;
  personalOffer: boolean;
  zoneId: string;
  districtId: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

type ExpoPushMessage = {
  to: string;
  sound: "default";
  priority?: "default" | "normal" | "high";
  channelId?: string;
  title: string;
  body: string;
  mutableContent?: boolean;
  richContent?: {
    image?: string;
  };
  data?: Record<string, unknown>;
};

function isExpoPushToken(token: string) {
  return (
    /^ExponentPushToken\[[^\]]+\]$/.test(token) ||
    /^ExpoPushToken\[[^\]]+\]$/.test(token)
  );
}

function notificationScopeValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function resolveNotificationScope(params: {
  data?: Record<string, unknown>;
  zoneId?: string;
  districtId?: string;
}) {
  const explicitZoneId =
    notificationScopeValue(params.zoneId) ||
    notificationScopeValue(params.data?.zoneId);
  const explicitDistrictId =
    notificationScopeValue(params.districtId) ||
    notificationScopeValue(params.data?.districtId);
  if (explicitZoneId || explicitDistrictId) {
    return { zoneId: explicitZoneId, districtId: explicitDistrictId };
  }

  const orderId = notificationScopeValue(params.data?.orderId);
  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    return { zoneId: "", districtId: "" };
  }

  const order = await OrderModel.findById(orderId, {
    serviceAreaSnapshot: 1,
  }).lean();
  const serviceArea = (order?.serviceAreaSnapshot ?? {}) as Record<
    string,
    unknown
  >;
  return {
    zoneId: notificationScopeValue(serviceArea.zoneId),
    districtId: notificationScopeValue(serviceArea.districtId),
  };
}

function isNotificationEnabled(
  settings:
    | {
        orderUpdates?: boolean;
        restaurantStatus?: boolean;
        reviewReplies?: boolean;
        promotions?: boolean;
      }
    | null
    | undefined,
  type: string,
  isPersonalOffer = false,
) {
  switch (type) {
    case "order_status":
      return settings?.orderUpdates ?? true;
    case "restaurant_status":
      return settings?.restaurantStatus ?? true;
    case "review_reply":
      return settings?.reviewReplies ?? true;
    case "promotion":
    case "voucher":
    case "campaign":
      // Personal/targeted offers (order-target rewards, admin-assigned vouchers)
      // are not marketing broadcasts — always deliver them so they still reach the
      // customer's "My offers", regardless of the promotions opt-out. Only generic
      // broadcast promos honour the toggle.
      return isPersonalOffer ? true : (settings?.promotions ?? true);
    default:
      return true;
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOrderTrackingPath(path: string, orderId: string) {
  if (orderId) return `/orders/${orderId}/tracking`;

  const match = path.match(
    /^\/orders\/([A-Za-z0-9_-]+)(?:\/tracking)?(?:[?#].*)?$/,
  );
  if (match?.[1]) return `/orders/${match[1]}/tracking`;

  return path;
}

function stripVisibleOrderReferences(text: string) {
  return text
    .replace(/\bYour\s+Order\s+#?[A-Z0-9][A-Z0-9-]{3,}\b/gi, "Your order")
    .replace(/\bOrder\s+#?[A-Z0-9][A-Z0-9-]{3,}\b/gi, "Your order")
    .replace(/\b#[A-Z0-9][A-Z0-9-]{3,}\b/g, "your order")
    .replace(/\bYour\s+Your\s+order\b/gi, "Your order")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCleanOrderStatusPushMessage(status: string, hint: string) {
  if (
    status === "cancelled" ||
    status === "canceled" ||
    hint.includes("cancel")
  ) {
    return {
      title: "❌ Order cancelled",
      body: "Your order was cancelled. You can order again anytime.",
    };
  }

  if (
    status === "rejected" ||
    hint.includes("reject") ||
    hint.includes("not accepted")
  ) {
    return {
      title: "😕 Order not accepted",
      body: "The restaurant could not accept your order. Please try another restaurant.",
    };
  }

  if (hint.includes("accepted") && !hint.includes("not accepted")) {
    return {
      title: "✅ Order accepted",
      body: "Your order is confirmed. The kitchen will start soon.",
    };
  }

  if (hint.includes("preparing") || hint.includes("cooking")) {
    return {
      title: "🍳 Food is preparing",
      body: "Your food is being prepared now.",
    };
  }

  if (hint.includes("ready")) {
    return {
      title: "📦 Ready for pickup",
      body: "Your order is packed. A rider will pick it up soon.",
    };
  }

  if (hint.includes("picked up") || hint.includes("on the way")) {
    return {
      title: "🛵 On the way",
      body: "Your rider picked up the order and is heading to you.",
    };
  }

  if (hint.includes("delivered")) {
    return {
      title: "🎉 Delivered",
      body: "Your food has arrived. Enjoy your food!",
    };
  }

  return {
    title: "🔔 Order update",
    body: "There is a new update on your order.",
  };
}

function getOrderStatusPushMessage(payload: CustomerPushPayload) {
  const status = stringValue(payload.data?.status).toLowerCase();
  const hint =
    `${stringValue(payload.data?.status)} ${payload.title} ${payload.body}`.toLowerCase();
  return buildCleanOrderStatusPushMessage(status, hint);
}

function normalizeCustomerPushPayload(
  payload: CustomerPushPayload,
): CustomerPushPayload {
  const data = { ...(payload.data ?? {}) };
  const type = stringValue(data.type);
  const orderId = stringValue(data.orderId ?? data.order_id);
  const path = stringValue(data.path);

  if (type === "review_request") {
    return {
      ...payload,
      data,
    };
  }

  const isOrderRelated =
    Boolean(orderId) ||
    path.startsWith("/orders/") ||
    ["order_status", "rider_assigned", "rider_near"].includes(type);

  if (!isOrderRelated) return payload;

  if (path || orderId) {
    data.path = normalizeOrderTrackingPath(path, orderId);
  }

  if (type === "order_status") {
    return {
      ...payload,
      ...getOrderStatusPushMessage(payload),
      data,
    };
  }

  if (type === "rider_assigned") {
    return {
      ...payload,
      title: payload.title.includes("updated")
        ? "🛵 Rider updated"
        : "🛵 Rider assigned",
      body: stripVisibleOrderReferences(
        payload.body || "A rider has been assigned to your order.",
      ),
      data,
    };
  }

  if (type === "rider_near") {
    return {
      ...payload,
      title: "Deliveryman nearby",
      body: stripVisibleOrderReferences(
        payload.body || "Your deliveryman is getting close.",
      ),
      data,
    };
  }

  return {
    ...payload,
    title: stripVisibleOrderReferences(payload.title),
    body: stripVisibleOrderReferences(payload.body),
    data,
  };
}

function mapCustomerNotification(notification: {
  _id?: mongoose.Types.ObjectId | string;
  type?: string;
  title?: string;
  description?: string;
  path?: string;
  campaignId?: string;
  campaignVariant?: string;
  ctaLabel?: string;
  ctaPath?: string;
  contentType?: string;
  imageUrl?: string;
  voucherId?: string;
  voucherCode?: string;
  voucherLabel?: string;
  voucherExpiresAt?: Date | string | null;
  voucherMinOrder?: number | null;
  voucherUsageStatus?: "available" | "used" | "expired" | "info";
  voucherAppliedAt?: Date | string | null;
  voucherOrderId?: string;
  isOfferDisabled?: boolean;
  personalOffer?: boolean;
  zoneId?: string;
  districtId?: string;
  isRead?: boolean;
  readAt?: Date | string | null;
  createdAt?: Date | string | null;
}): CustomerNotificationRecord {
  const voucherExpiresAt = notification.voucherExpiresAt
    ? new Date(notification.voucherExpiresAt).toISOString()
    : null;
  const isExpired = voucherExpiresAt
    ? new Date(voucherExpiresAt).getTime() <= Date.now()
    : false;
  const voucherUsageStatus =
    notification.voucherUsageStatus ??
    (isExpired
      ? "expired"
      : notification.voucherId || notification.voucherCode
        ? "available"
        : "info");

  return {
    id: String(notification._id ?? ""),
    type: notification.type ?? "system",
    title: notification.title ?? "",
    description: notification.description ?? "",
    path: notification.path ?? "",
    campaignId: notification.campaignId ?? "",
    campaignVariant: notification.campaignVariant ?? "",
    ctaLabel: notification.ctaLabel ?? "",
    ctaPath: notification.ctaPath ?? "",
    contentType: notification.contentType ?? "text",
    imageUrl: notification.imageUrl ?? "",
    voucherId: notification.voucherId ?? "",
    voucherCode: notification.voucherCode ?? "",
    voucherLabel: notification.voucherLabel ?? "",
    voucherExpiresAt,
    voucherMinOrder:
      typeof notification.voucherMinOrder === "number"
        ? notification.voucherMinOrder
        : null,
    voucherUsageStatus,
    voucherAppliedAt: notification.voucherAppliedAt
      ? new Date(notification.voucherAppliedAt).toISOString()
      : null,
    voucherOrderId: notification.voucherOrderId ?? "",
    isOfferDisabled:
      notification.isOfferDisabled === true ||
      voucherUsageStatus === "used" ||
      voucherUsageStatus === "expired",
    personalOffer: notification.personalOffer === true,
    zoneId: notification.zoneId ?? "",
    districtId: notification.districtId ?? "",
    isRead: Boolean(notification.isRead),
    readAt: notification.readAt
      ? new Date(notification.readAt).toISOString()
      : null,
    createdAt: notification.createdAt
      ? new Date(notification.createdAt).toISOString()
      : new Date().toISOString(),
  };
}

async function enrichNotificationVoucherUsage(
  customerId: string,
  items: CustomerNotificationRecord[],
) {
  const voucherIds = items
    .map((item) => item.voucherId)
    .filter((voucherId) => mongoose.Types.ObjectId.isValid(voucherId));

  if (!voucherIds.length) return items;

  const [redemptions, vouchers] = await Promise.all([
    VoucherRedemptionModel.find({
      voucherId: { $in: voucherIds },
      releasedAt: null,
      "voucherSnapshot.customerId": customerId,
    })
      .select("voucherId orderId appliedAt")
      .sort({ appliedAt: -1, createdAt: -1 })
      .lean(),
    VoucherModel.find({ _id: { $in: voucherIds } })
      .select("audienceType selectedCustomerIds")
      .lean(),
  ]);
  const redemptionByVoucherId = new Map(
    redemptions.map((redemption) => [String(redemption.voucherId), redemption]),
  );
  const customerIdString = String(customerId);
  const selectedUserVoucherIds = new Set(
    vouchers
      .filter((voucher) => voucher.audienceType === "selected_users")
      .filter((voucher) =>
        (voucher.selectedCustomerIds ?? []).some(
          (selectedCustomerId) =>
            String(selectedCustomerId) === customerIdString,
        ),
      )
      .map((voucher) => String(voucher._id)),
  );

  return items.map((item) => {
    const isExpired = item.voucherExpiresAt
      ? new Date(item.voucherExpiresAt).getTime() <= Date.now()
      : false;
    const redemption = redemptionByVoucherId.get(item.voucherId);
    const personalOffer =
      item.personalOffer || selectedUserVoucherIds.has(item.voucherId);

    if (isExpired) {
      return {
        ...item,
        personalOffer,
        voucherUsageStatus: "expired" as const,
        isOfferDisabled: true,
      };
    }

    if (redemption) {
      return {
        ...item,
        personalOffer,
        voucherUsageStatus: "used" as const,
        voucherAppliedAt: redemption.appliedAt
          ? new Date(redemption.appliedAt).toISOString()
          : item.voucherAppliedAt,
        voucherOrderId: String(redemption.orderId ?? ""),
        isOfferDisabled: true,
      };
    }

    return {
      ...item,
      personalOffer,
      voucherUsageStatus:
        item.voucherId || item.voucherCode
          ? ("available" as const)
          : item.voucherUsageStatus,
      isOfferDisabled: false,
    };
  });
}

export async function createCustomerNotification(params: {
  customerId: string;
  payload: CustomerPushPayload;
  zoneId?: string;
  districtId?: string;
}) {
  const payload = normalizeCustomerPushPayload(params.payload);
  const path = typeof payload.data?.path === "string" ? payload.data.path : "";
  const type =
    typeof payload.data?.type === "string" ? payload.data.type : "system";
  const campaignId =
    typeof payload.data?.campaignId === "string" ? payload.data.campaignId : "";
  const campaignVariant =
    typeof payload.data?.variant === "string" ? payload.data.variant : "";
  const ctaLabel =
    typeof payload.data?.ctaLabel === "string" ? payload.data.ctaLabel : "";
  const ctaPath =
    typeof payload.data?.ctaPath === "string" ? payload.data.ctaPath : "";
  const voucherCode =
    typeof payload.data?.voucherCode === "string"
      ? payload.data.voucherCode.trim().toUpperCase()
      : "";
  const voucherId =
    typeof payload.data?.voucherId === "string"
      ? payload.data.voucherId.trim()
      : "";
  const voucherLabel =
    typeof payload.data?.voucherLabel === "string"
      ? payload.data.voucherLabel.trim()
      : "";
  const rawVoucherExpiresAt =
    typeof payload.data?.voucherExpiresAt === "string" ||
    payload.data?.voucherExpiresAt instanceof Date
      ? new Date(payload.data.voucherExpiresAt)
      : null;
  const voucherExpiresAt =
    rawVoucherExpiresAt && !Number.isNaN(rawVoucherExpiresAt.getTime())
      ? rawVoucherExpiresAt
      : null;
  const voucherMinOrder =
    typeof payload.data?.voucherMinOrder === "number" &&
    Number.isFinite(payload.data.voucherMinOrder)
      ? Math.max(0, payload.data.voucherMinOrder)
      : null;
  const personalOffer = payload.data?.personalOffer === true;
  const { zoneId, districtId } = await resolveNotificationScope({
    data: payload.data,
    zoneId: params.zoneId,
    districtId: params.districtId,
  });
  const customer = await CustomerModel.findById(params.customerId).select(
    "notificationSettings",
  );

  const notificationEnabled = isNotificationEnabled(
    customer?.notificationSettings,
    type,
  );
  if (!notificationEnabled && !personalOffer) {
    logger.info(
      { customerId: params.customerId, type },
      "Notification skipped by customer preference",
    );
    return null;
  }

  const notificationId = new mongoose.Types.ObjectId();

  await CustomerModel.updateOne(
    { _id: params.customerId },
    {
      $push: {
        notifications: {
          $each: [
            {
              _id: notificationId,
              type,
              title: payload.title,
              description: payload.body,
              path,
              campaignId,
              campaignVariant,
              ctaLabel,
              ctaPath,
              contentType: payload.contentType ?? "text",
              imageUrl: payload.imageUrl ?? "",
              voucherId,
              voucherCode,
              voucherLabel,
              voucherExpiresAt,
              voucherMinOrder,
              personalOffer,
              zoneId,
              districtId,
              isRead: false,
              readAt: null,
              createdAt: new Date(),
            },
          ],
          $position: 0,
          // Keep only the most recent notifications per customer — older ones are
          // rarely useful and this keeps the stored array (and every read) small.
          $slice: 30,
        },
      },
    },
  );

  const notification = mapCustomerNotification({
    _id: notificationId,
    type,
    title: payload.title,
    description: payload.body,
    path,
    campaignId,
    campaignVariant,
    ctaLabel,
    ctaPath,
    contentType: payload.contentType ?? "text",
    imageUrl: payload.imageUrl ?? "",
    voucherId,
    voucherCode,
    voucherLabel,
    voucherExpiresAt,
    voucherMinOrder,
    personalOffer,
    zoneId,
    districtId,
    isRead: false,
    readAt: null,
    createdAt: new Date(),
  });

  emitSocketEvent(
    `customer:${params.customerId}`,
    "customer.notification.created",
    notification,
  );

  return notification;
}

export async function listCustomerNotifications(
  customerId: string,
  params?: {
    page?: number;
    limit?: number;
    category?: "all" | "orders" | "offers" | "personal_offers";
  },
) {
  const customer =
    await CustomerModel.findById(customerId).select("notifications");
  const notifications = [...(customer?.notifications ?? [])].sort(
    (left, right) => {
      const leftTime = new Date(left.createdAt ?? 0).getTime();
      const rightTime = new Date(right.createdAt ?? 0).getTime();
      return rightTime - leftTime;
    },
  );
  const category = params?.category ?? "all";
  const enrichedNotifications = await enrichNotificationVoucherUsage(
    customerId,
    notifications.map((notification) =>
      mapCustomerNotification(notification.toObject()),
    ),
  );
  const mappedNotifications = enrichedNotifications.filter((notification) => {
    if (category === "offers") {
      return ["promotion", "voucher", "campaign"].includes(notification.type);
    }
    if (category === "personal_offers") {
      return notification.personalOffer === true;
    }
    if (category === "orders") {
      return ["order_status", "rider_assigned", "rider_near"].includes(
        notification.type,
      );
    }
    return true;
  });
  const limit = Math.min(Math.max(params?.limit ?? 20, 1), 50);
  const page = Math.max(params?.page ?? 1, 1);
  const start = (page - 1) * limit;
  const items = mappedNotifications.slice(start, start + limit);
  const total = mappedNotifications.length;

  return {
    items,
    total,
    unreadCount: mappedNotifications.filter(
      (notification) => !notification.isRead,
    ).length,
    page,
    limit,
    hasMore: start + items.length < total,
    nextPage: start + items.length < total ? page + 1 : null,
  };
}

export async function getCustomerNotificationByCampaignId(params: {
  customerId: string;
  campaignId: string;
}) {
  const campaignId = params.campaignId.trim();
  if (!campaignId) return null;

  const customer = await CustomerModel.findOne(
    {
      _id: params.customerId,
      "notifications.campaignId": campaignId,
    },
    {
      notifications: {
        $elemMatch: { campaignId },
      },
    },
  ).select("notifications");

  const notification = customer?.notifications?.[0];
  if (!notification) return null;
  const [item] = await enrichNotificationVoucherUsage(params.customerId, [
    mapCustomerNotification(notification.toObject()),
  ]);
  return item ?? null;
}

export async function getCustomerNotificationById(params: {
  customerId: string;
  notificationId: string;
}) {
  const notificationId = params.notificationId.trim();
  if (!notificationId) return null;

  const customer = await CustomerModel.findOne(
    {
      _id: params.customerId,
      "notifications._id": notificationId,
    },
    {
      notifications: {
        $elemMatch: { _id: notificationId },
      },
    },
  ).select("notifications");

  const notification = customer?.notifications?.[0];
  if (!notification) return null;
  const [item] = await enrichNotificationVoucherUsage(params.customerId, [
    mapCustomerNotification(notification.toObject()),
  ]);
  return item ?? null;
}

export async function markCustomerNotificationAsRead(params: {
  customerId: string;
  notificationId: string;
}) {
  await CustomerModel.updateOne(
    {
      _id: params.customerId,
      "notifications._id": params.notificationId,
    },
    {
      $set: {
        "notifications.$.isRead": true,
        "notifications.$.readAt": new Date(),
      },
    },
  );

  return listCustomerNotifications(params.customerId);
}

export async function markCustomerNotificationOpened(params: {
  customerId: string;
  notificationId?: string;
  campaignId?: string;
}) {
  const filters: Record<string, unknown>[] = [];

  if (params.notificationId) {
    filters.push({ "notifications._id": params.notificationId });
  }

  if (params.campaignId) {
    filters.push({ "notifications.campaignId": params.campaignId });
  }

  if (!filters.length) return { recorded: false, matched: 0, openRecorded: false };

  // Mark the in-app notification as read — best-effort, isolated so it can never block the
  // campaign-open record below.
  let readMatched = 0;
  try {
    const readResult = await CustomerModel.updateOne(
      {
        _id: params.customerId,
        $or: filters,
      },
      {
        $set: {
          "notifications.$.isRead": true,
          "notifications.$.readAt": new Date(),
        },
      },
    );
    readMatched = readResult.matchedCount ?? 0;
  } catch (error) {
    logger.warn(
      { error, customerId: params.customerId },
      "Failed to mark customer notification read on open",
    );
  }

  // Record the campaign OPEN for the admin timeline. Crucially this is DECOUPLED from the
  // read-mark above: the recipient is already known from the campaign's recipientEvents, so
  // the open must be stamped even when the in-app read-mark doesn't match (the old code
  // gated this on the read-mark, which silently dropped every open).
  let openRecorded = false;
  if (params.campaignId && mongoose.Types.ObjectId.isValid(params.campaignId)) {
    try {
      const openResult = await AdminNotificationScheduleModel.updateOne(
        {
          _id: params.campaignId,
          "result.recipientEvents.customerId": params.customerId,
        },
        {
          $set: {
            "result.recipientEvents.$.openedAt": new Date().toISOString(),
            "result.recipientEvents.$.openStatus": "opened",
          },
        },
      );
      openRecorded = (openResult.matchedCount ?? 0) > 0;
    } catch (error) {
      logger.warn(
        { error, customerId: params.customerId, campaignId: params.campaignId },
        "Failed to update admin notification open analytics",
      );
    }
  }

  return {
    recorded: readMatched > 0 || openRecorded,
    matched: readMatched,
    openRecorded,
  };
}

export async function markAllCustomerNotificationsAsRead(customerId: string) {
  await CustomerModel.updateOne(
    { _id: customerId },
    {
      $set: {
        "notifications.$[notification].isRead": true,
        "notifications.$[notification].readAt": new Date(),
      },
    },
    {
      arrayFilters: [
        {
          "notification.isRead": false,
        },
      ],
    },
  );

  return listCustomerNotifications(customerId);
}

export async function sendPushToCustomer(params: {
  customerId: string;
  payload: CustomerPushPayload;
  excludeExpoTokens?: Set<string>;
  zoneId?: string;
  districtId?: string;
}) {
  const payload = normalizeCustomerPushPayload(params.payload);
  const createdNotification = await createCustomerNotification({
    customerId: params.customerId,
    payload,
    zoneId: params.zoneId,
    districtId: params.districtId,
  });

  if (!createdNotification) {
    return {
      sent: 0,
      disabled: 0,
      inAppCreated: 0,
      skipped: true,
      sentExpoTokens: [],
      ticketIds: [],
    };
  }

  const customer = await CustomerModel.findById(params.customerId).select(
    "pushTokens notificationSettings",
  );

  if (
    !isNotificationEnabled(
      customer?.notificationSettings,
      String(payload.data?.type ?? "system"),
      payload.data?.personalOffer === true,
    )
  ) {
    logger.info(
      { customerId: params.customerId },
      "Push skipped by customer preference after in-app notification",
    );
    return {
      sent: 0,
      disabled: 0,
      inAppCreated: 1,
      skipped: true,
      sentExpoTokens: [],
      ticketIds: [],
    };
  }

  if (!customer?.pushTokens?.length) {
    logger.info(
      { customerId: params.customerId },
      "Push skipped: no customer push tokens",
    );
    return {
      sent: 0,
      disabled: 0,
      inAppCreated: 1,
      sentExpoTokens: [],
      ticketIds: [],
    };
  }

  const activeTokens = customer.pushTokens.filter(
    (token) => !token.disabledAt && isExpoPushToken(token.expoPushToken),
  );
  const latestActiveToken = [...activeTokens]
    .filter((token) => !params.excludeExpoTokens?.has(token.expoPushToken))
    .sort((left, right) => {
      const leftTime = new Date(left.lastSeenAt ?? 0).getTime();
      const rightTime = new Date(right.lastSeenAt ?? 0).getTime();
      return rightTime - leftTime;
    })[0];
  const uniqueActiveTokens = latestActiveToken ? [latestActiveToken] : [];

  if (!uniqueActiveTokens.length) {
    logger.info(
      { customerId: params.customerId },
      "Push skipped: no active Expo push tokens",
    );
    return {
      sent: 0,
      disabled: 0,
      inAppCreated: 1,
      sentExpoTokens: [],
      ticketIds: [],
    };
  }

  const sentExpoTokens = uniqueActiveTokens.map((token) => token.expoPushToken);
  const messages: ExpoPushMessage[] = uniqueActiveTokens.map((token) => ({
    to: token.expoPushToken,
    sound: "default",
    // High priority + an explicit Android channel so promotional/marketing pushes
    // are actually delivered and shown as a banner. Without these Android/FCM
    // frequently delays or silently drops non-order pushes.
    priority: "high",
    channelId: "default",
    title: payload.title,
    body: payload.body,
    // Expo only supports images through `richContent.image` (Android big-picture)
    // plus `mutableContent` for the iOS service extension. The old top-level
    // `image` field is NOT a valid Expo push field and made Expo reject the whole
    // message — which is why image (offer/promo) pushes never arrived.
    ...(payload.imageUrl
      ? {
          mutableContent: true,
          richContent: { image: optimizePushImageUrl(payload.imageUrl) },
        }
      : {}),
    data: {
      ...payload.data,
      notificationId: createdNotification.id,
    },
  }));

  const response = await fetchWithTimeout(
    "https://exp.host/--/api/v2/push/send",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
      timeoutMs: 3_000,
    },
  ).catch((error) => {
    logger.warn(
      { error, customerId: params.customerId },
      "Expo push send timed out or failed",
    );
    return null;
  });

  if (!response) {
    return {
      sent: 0,
      disabled: 0,
      inAppCreated: 1,
      sentExpoTokens,
      ticketIds: [],
    };
  }

  if (!response.ok) {
    logger.error(
      {
        customerId: params.customerId,
        status: response.status,
      },
      "Expo push send failed",
    );
    return {
      sent: 0,
      disabled: 0,
      inAppCreated: 1,
      sentExpoTokens: [],
      ticketIds: [],
    };
  }

  const expoResponse = (await response.json()) as {
    data?: Array<{
      status?: string;
      id?: string;
      details?: {
        error?: string;
      };
    }>;
  };

  const invalidIndexes: number[] = [];
  let sent = 0;
  const ticketIds: string[] = [];

  expoResponse.data?.forEach((entry, index) => {
    if (entry.status === "ok") {
      sent += 1;
      if (entry.id) ticketIds.push(entry.id);
      return;
    }

    if (entry.details?.error === "DeviceNotRegistered") {
      invalidIndexes.push(index);
      return;
    }

    // Any other error (bad payload field, message too big, etc.) is silently
    // fatal for that push — surface it so delivery problems are diagnosable.
    logger.warn(
      {
        customerId: params.customerId,
        status: entry.status,
        error: entry.details?.error,
        type: payload.data?.type,
      },
      "Expo push ticket rejected",
    );
  });

  if (invalidIndexes.length) {
    const invalidTokenIds = invalidIndexes
      .map((index) => uniqueActiveTokens[index]?._id)
      .filter(Boolean);

    if (invalidTokenIds.length) {
      await CustomerModel.updateOne(
        { _id: params.customerId },
        {
          $set: {
            "pushTokens.$[token].disabledAt": new Date(),
          },
        },
        {
          arrayFilters: [
            {
              "token._id": { $in: invalidTokenIds },
            },
          ],
        },
      );
    }
  }

  logger.info(
    {
      customerId: params.customerId,
      sent,
      disabled: invalidIndexes.length,
    },
    "Expo push processed",
  );

  return {
    sent,
    disabled: invalidIndexes.length,
    inAppCreated: 1,
    sentExpoTokens,
    ticketIds,
  };
}

// ---------------------------------------------------------------------------
// Post-delivery review requests (auto scheduler + manual trigger)
// ---------------------------------------------------------------------------

type ReviewRequestConfig = {
  autoEnabled: boolean;
  // Minutes after delivery before the single rating push goes out (admin-set).
  delayMinutes: number;
  // Safety cap: never nudge an order older than this (avoids waking someone about a
  // 3-day-old order if the scheduler was down). Not a "repeat" — still one push only.
  windowHours: number;
  quietHoursStart: number;
  quietHoursEnd: number;
  pushTitle: string;
  pushBody: string;
};

const REVIEW_REQUEST_DEFAULTS: ReviewRequestConfig = {
  autoEnabled: true,
  delayMinutes: 20,
  windowHours: 72,
  quietHoursStart: 22,
  quietHoursEnd: 9,
  pushTitle: "How was your food?",
  pushBody: "Tap to rate your order and help others choose with confidence.",
};

function cleanReviewRequestText(value: unknown, fallback: string): string {
  const text =
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!text) return fallback;
  if (/[�]|[âÃÂ]/.test(text)) return fallback;
  if (/\byour\s+your\b/i.test(text) || /\border\s+user\b/i.test(text)) {
    return fallback;
  }
  return text;
}

async function getReviewRequestConfig(): Promise<ReviewRequestConfig> {
  try {
    const content = await loadPlatformContent();
    const config = (content as any)?.operations?.reviewRequests;
    const merged = { ...REVIEW_REQUEST_DEFAULTS, ...(config ?? {}) };
    return {
      ...merged,
      pushTitle: cleanReviewRequestText(
        merged.pushTitle,
        REVIEW_REQUEST_DEFAULTS.pushTitle,
      ),
      pushBody: cleanReviewRequestText(
        merged.pushBody,
        REVIEW_REQUEST_DEFAULTS.pushBody,
      ),
    };
  } catch (error) {
    logger.error(error, "Failed to load review-request config; using defaults");
    return REVIEW_REQUEST_DEFAULTS;
  }
}

function getDhakaHour(now = new Date()): number {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Dhaka",
      hour: "2-digit",
      hour12: false,
    })
      .formatToParts(now)
      .find((part) => part.type === "hour")?.value ?? "0",
  );
  return hour === 24 ? 0 : hour;
}

function isWithinQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  // wraps past midnight (e.g. 22 -> 9)
  return hour >= start || hour < end;
}

function buildReviewRequestPayload(
  orderId: string,
  config: ReviewRequestConfig,
): CustomerPushPayload {
  return {
    title: config.pushTitle,
    body: config.pushBody,
    data: {
      type: "review_request",
      // Keep orderId for scope/debugging. normalizeCustomerPushPayload bypasses
      // review_request, so this does not hijack the review route to tracking.
      orderId,
      path: `/rate-order?orderId=${orderId}`,
      ctaPath: `/rate-order?orderId=${orderId}`,
      ctaLabel: "Rate order",
    },
  };
}

function getOrderDeliveredAtMs(order: {
  get: (path: string) => unknown;
  updatedAt?: Date;
}): number {
  const timestamps = (order.get("timestamps") ?? {}) as Record<string, unknown>;
  const reviewRequest = (order.get("reviewRequest") ?? {}) as Record<
    string,
    unknown
  >;
  const delivered =
    timestamps.Delivered ??
    timestamps.deliveredAt ??
    reviewRequest.deliveredAt ??
    order.updatedAt ??
    null;
  const ms = delivered ? new Date(delivered as string).getTime() : NaN;
  return Number.isFinite(ms) ? ms : NaN;
}

/**
 * Manually trigger a review-request push for one order (admin action). Respects
 * the "already reviewed" guard but ignores the auto on/off toggle and quiet
 * hours, since an admin is explicitly sending it.
 */
export async function sendReviewRequestForOrder(params: {
  orderId: string;
  force?: boolean;
}) {
  if (!mongoose.Types.ObjectId.isValid(params.orderId)) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_ORDER",
      "Invalid order id",
    );
  }

  const order = await OrderModel.findById(params.orderId);
  if (!order) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "ORDER_NOT_FOUND",
      "Order not found",
    );
  }
  if (order.get("status") !== "Delivered") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "ORDER_NOT_DELIVERED",
      "Review requests can only be sent for delivered orders",
    );
  }

  const customerId = String(order.get("customerId") ?? "").trim();
  if (!customerId) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "ORDER_HAS_NO_CUSTOMER",
      "This order has no linked customer account to notify",
    );
  }

  const existingReview = await ReviewModel.exists({ orderId: order._id });
  if (existingReview && !params.force) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "REVIEW_ALREADY_EXISTS",
      "This order already has a review",
    );
  }

  const config = await getReviewRequestConfig();
  const result = await sendPushToCustomer({
    customerId,
    payload: buildReviewRequestPayload(String(order._id), config),
  });

  const previous = (order.get("reviewRequest") ?? {}) as Record<
    string,
    unknown
  >;
  order.set("reviewRequest", {
    ...previous,
    pushCount: Number(previous.pushCount ?? 0) + 1,
    lastPushAt: new Date(),
    lastChannel: "manual",
  });
  await order.save();

  return result;
}

/**
 * Scheduler tick: send due automatic review-request pushes for recently
 * delivered orders that have no review yet, honoring delay, reminder caps,
 * reminder gap, the delivery age window, and Asia/Dhaka quiet hours.
 */
export async function processDueReviewRequests() {
  const config = await getReviewRequestConfig();
  if (!config.autoEnabled) return;

  if (
    isWithinQuietHours(
      getDhakaHour(),
      config.quietHoursStart,
      config.quietHoursEnd,
    )
  ) {
    return;
  }

  const now = Date.now();
  const windowStart = new Date(now - config.windowHours * 3_600_000);
  const candidates = await OrderModel.find({
    status: "Delivered",
    customerId: { $nin: ["", null] },
    // Skip orders that already got the single review push (pushCount >= 1) so each
    // tick only looks at ones still awaiting their one-and-only nudge.
    "reviewRequest.pushCount": { $not: { $gte: 1 } },
    $or: [
      { "timestamps.Delivered": { $gte: windowStart } },
      { "timestamps.deliveredAt": { $gte: windowStart } },
      { "reviewRequest.deliveredAt": { $gte: windowStart } },
      { updatedAt: { $gte: windowStart } },
    ],
  })
    .sort({
      "timestamps.deliveredAt": 1,
      "timestamps.Delivered": 1,
      "reviewRequest.deliveredAt": 1,
      updatedAt: 1,
    })
    .limit(200);

  for (const order of candidates) {
    try {
      const customerId = String(order.get("customerId") ?? "").trim();
      if (!customerId) continue;

      const deliveredAtMs = getOrderDeliveredAtMs(order);
      if (!Number.isFinite(deliveredAtMs)) continue;
      const ageMs = now - deliveredAtMs;
      if (ageMs < config.delayMinutes * 60_000) continue; // not due yet
      if (ageMs > config.windowHours * 3_600_000) continue; // too old to nudge

      if (await ReviewModel.exists({ orderId: order._id })) continue; // already reviewed

      // Atomically claim the single review push by flipping pushCount 0 -> 1. Only ONE
      // caller can match the "not yet pushed" filter, so even with several backend
      // instances (or overlapping ticks) each running this scheduler, exactly one push
      // is ever sent per order — this is what stops the duplicate rating spam.
      const claimed = await OrderModel.findOneAndUpdate(
        {
          _id: order._id,
          $or: [
            { "reviewRequest.pushCount": { $in: [null, undefined, 0] } },
            { reviewRequest: { $in: [null, undefined] } },
          ],
        },
        {
          $set: {
            "reviewRequest.pushCount": 1,
            "reviewRequest.lastPushAt": new Date(),
            "reviewRequest.lastChannel": "auto",
          },
        },
      );
      if (!claimed) continue; // another instance/tick already sent it

      await sendPushToCustomer({
        customerId,
        payload: buildReviewRequestPayload(String(order._id), config),
      });
    } catch (error) {
      logger.error(
        { error, orderId: String(order._id) },
        "Failed to send automatic review request",
      );
    }
  }
}
