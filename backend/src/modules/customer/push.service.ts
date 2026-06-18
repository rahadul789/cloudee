import mongoose from "mongoose"

import { fetchWithTimeout } from "../../common/utils/fetch-with-timeout"
import { logger } from "../../config/logger"
import { emitSocketEvent } from "../../config/socket"
import { AdminNotificationScheduleModel } from "../admin/notification-schedule.model"
import { OrderModel } from "../owner/operational.model"
import { CustomerModel } from "./customer.model"

type CustomerPushPayload = {
  title: string
  body: string
  contentType?: "text" | "image" | "image_text"
  imageUrl?: string
  data?: Record<string, unknown>
}

type CustomerNotificationRecord = {
  id: string
  type: string
  title: string
  description: string
  path: string
  campaignId: string
  campaignVariant: string
  ctaLabel: string
  ctaPath: string
  contentType: string
  imageUrl: string
  voucherId: string
  voucherCode: string
  voucherLabel: string
  voucherExpiresAt: string | null
  voucherMinOrder: number | null
  personalOffer: boolean
  zoneId: string
  districtId: string
  isRead: boolean
  readAt: string | null
  createdAt: string
}

type ExpoPushMessage = {
  to: string
  sound: "default"
  title: string
  body: string
  mutableContent?: boolean
  image?: string
  richContent?: {
    image?: string
  }
  data?: Record<string, unknown>
}

function isExpoPushToken(token: string) {
  return /^ExponentPushToken\[[^\]]+\]$/.test(token) || /^ExpoPushToken\[[^\]]+\]$/.test(token)
}

function notificationScopeValue(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

async function resolveNotificationScope(params: {
  data?: Record<string, unknown>
  zoneId?: string
  districtId?: string
}) {
  const explicitZoneId =
    notificationScopeValue(params.zoneId) || notificationScopeValue(params.data?.zoneId)
  const explicitDistrictId =
    notificationScopeValue(params.districtId) || notificationScopeValue(params.data?.districtId)
  if (explicitZoneId || explicitDistrictId) {
    return { zoneId: explicitZoneId, districtId: explicitDistrictId }
  }

  const orderId = notificationScopeValue(params.data?.orderId)
  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    return { zoneId: "", districtId: "" }
  }

  const order = await OrderModel.findById(orderId, { serviceAreaSnapshot: 1 }).lean()
  const serviceArea = (order?.serviceAreaSnapshot ?? {}) as Record<string, unknown>
  return {
    zoneId: notificationScopeValue(serviceArea.zoneId),
    districtId: notificationScopeValue(serviceArea.districtId),
  }
}

function isNotificationEnabled(
  settings: {
    orderUpdates?: boolean
    restaurantStatus?: boolean
    reviewReplies?: boolean
  } | null | undefined,
  type: string
) {
  switch (type) {
    case "order_status":
      return settings?.orderUpdates ?? true
    case "restaurant_status":
      return settings?.restaurantStatus ?? true
    case "review_reply":
      return settings?.reviewReplies ?? true
    default:
      return true
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeOrderTrackingPath(path: string, orderId: string) {
  if (orderId) return `/orders/${orderId}/tracking`

  const match = path.match(/^\/orders\/([A-Za-z0-9_-]+)(?:\/tracking)?(?:[?#].*)?$/)
  if (match?.[1]) return `/orders/${match[1]}/tracking`

  return path
}

function stripVisibleOrderReferences(text: string) {
  return text
    .replace(/\bOrder\s+#?[A-Z0-9][A-Z0-9-]{3,}\b/gi, "Your order")
    .replace(/\b#[A-Z0-9][A-Z0-9-]{3,}\b/g, "your order")
    .replace(/\s+/g, " ")
    .trim()
}

function buildCleanOrderStatusPushMessage(status: string, hint: string) {
  if (status === "cancelled" || status === "canceled" || hint.includes("cancel")) {
    return {
      title: "❌ Order cancelled",
      body: "Your order was cancelled. You can order again anytime."
    }
  }

  if (status === "rejected" || hint.includes("reject") || hint.includes("not accepted")) {
    return {
      title: "😕 Order not accepted",
      body: "The restaurant could not accept your order. Please try another restaurant."
    }
  }

  if (hint.includes("accepted") && !hint.includes("not accepted")) {
    return {
      title: "✅ Order accepted",
      body: "Your order is confirmed. The kitchen will start soon."
    }
  }

  if (hint.includes("preparing") || hint.includes("cooking")) {
    return {
      title: "🍳 Food is preparing",
      body: "Your food is being prepared now."
    }
  }

  if (hint.includes("ready")) {
    return {
      title: "📦 Ready for pickup",
      body: "Your order is packed. A rider will pick it up soon."
    }
  }

  if (hint.includes("picked up") || hint.includes("on the way")) {
    return {
      title: "🛵 On the way",
      body: "Your rider picked up the order and is heading to you."
    }
  }

  if (hint.includes("delivered")) {
    return {
      title: "🎉 Delivered",
      body: "Your food has arrived. Tap to rate your order."
    }
  }

  return {
    title: "🔔 Order update",
    body: "There is a new update on your order."
  }
}

function getOrderStatusPushMessage(payload: CustomerPushPayload) {
  const status = stringValue(payload.data?.status).toLowerCase()
  const hint = `${stringValue(payload.data?.status)} ${payload.title} ${payload.body}`.toLowerCase()
  return buildCleanOrderStatusPushMessage(status, hint)
}

function normalizeCustomerPushPayload(payload: CustomerPushPayload): CustomerPushPayload {
  const data = { ...(payload.data ?? {}) }
  const type = stringValue(data.type)
  const orderId = stringValue(data.orderId ?? data.order_id)
  const path = stringValue(data.path)
  const isOrderRelated =
    Boolean(orderId) ||
    path.startsWith("/orders/") ||
    ["order_status", "rider_assigned", "rider_near"].includes(type)

  if (!isOrderRelated) return payload

  if (path || orderId) {
    data.path = normalizeOrderTrackingPath(path, orderId)
  }

  if (type === "order_status") {
    return {
      ...payload,
      ...getOrderStatusPushMessage(payload),
      data
    }
  }

  if (type === "rider_assigned") {
    return {
      ...payload,
      title: payload.title.includes("updated") ? "🛵 Rider updated" : "🛵 Rider assigned",
      body: stripVisibleOrderReferences(payload.body || "A rider has been assigned to your order."),
      data
    }
  }

  if (type === "rider_near") {
    return {
      ...payload,
      title: "Deliveryman nearby",
      body: stripVisibleOrderReferences(payload.body || "Your deliveryman is getting close."),
      data
    }
  }

  return {
    ...payload,
    title: stripVisibleOrderReferences(payload.title),
    body: stripVisibleOrderReferences(payload.body),
    data
  }
}

function mapCustomerNotification(notification: {
  _id?: mongoose.Types.ObjectId | string
  type?: string
  title?: string
  description?: string
  path?: string
  campaignId?: string
  campaignVariant?: string
  ctaLabel?: string
  ctaPath?: string
  contentType?: string
  imageUrl?: string
  voucherId?: string
  voucherCode?: string
  voucherLabel?: string
  voucherExpiresAt?: Date | string | null
  voucherMinOrder?: number | null
  personalOffer?: boolean
  zoneId?: string
  districtId?: string
  isRead?: boolean
  readAt?: Date | string | null
  createdAt?: Date | string | null
}): CustomerNotificationRecord {
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
    voucherExpiresAt: notification.voucherExpiresAt
      ? new Date(notification.voucherExpiresAt).toISOString()
      : null,
    voucherMinOrder:
      typeof notification.voucherMinOrder === "number" ? notification.voucherMinOrder : null,
    personalOffer: notification.personalOffer === true,
    zoneId: notification.zoneId ?? "",
    districtId: notification.districtId ?? "",
    isRead: Boolean(notification.isRead),
    readAt: notification.readAt ? new Date(notification.readAt).toISOString() : null,
    createdAt: notification.createdAt
      ? new Date(notification.createdAt).toISOString()
      : new Date().toISOString()
  }
}

export async function createCustomerNotification(params: {
  customerId: string
  payload: CustomerPushPayload
  zoneId?: string
  districtId?: string
}) {
  const payload = normalizeCustomerPushPayload(params.payload)
  const path =
    typeof payload.data?.path === "string" ? payload.data.path : ""
  const type =
    typeof payload.data?.type === "string" ? payload.data.type : "system"
  const campaignId =
    typeof payload.data?.campaignId === "string" ? payload.data.campaignId : ""
  const campaignVariant =
    typeof payload.data?.variant === "string" ? payload.data.variant : ""
  const ctaLabel =
    typeof payload.data?.ctaLabel === "string" ? payload.data.ctaLabel : ""
  const ctaPath =
    typeof payload.data?.ctaPath === "string" ? payload.data.ctaPath : ""
  const voucherCode =
    typeof payload.data?.voucherCode === "string" ? payload.data.voucherCode.trim().toUpperCase() : ""
  const voucherId =
    typeof payload.data?.voucherId === "string" ? payload.data.voucherId.trim() : ""
  const voucherLabel =
    typeof payload.data?.voucherLabel === "string" ? payload.data.voucherLabel.trim() : ""
  const rawVoucherExpiresAt =
    typeof payload.data?.voucherExpiresAt === "string" || payload.data?.voucherExpiresAt instanceof Date
      ? new Date(payload.data.voucherExpiresAt)
      : null
  const voucherExpiresAt =
    rawVoucherExpiresAt && !Number.isNaN(rawVoucherExpiresAt.getTime()) ? rawVoucherExpiresAt : null
  const voucherMinOrder =
    typeof payload.data?.voucherMinOrder === "number" && Number.isFinite(payload.data.voucherMinOrder)
      ? Math.max(0, payload.data.voucherMinOrder)
      : null
  const personalOffer = payload.data?.personalOffer === true
  const { zoneId, districtId } = await resolveNotificationScope({
    data: payload.data,
    zoneId: params.zoneId,
    districtId: params.districtId,
  })
  const customer = await CustomerModel.findById(params.customerId).select("notificationSettings")

  if (!isNotificationEnabled(customer?.notificationSettings, type)) {
    logger.info({ customerId: params.customerId, type }, "Notification skipped by customer preference")
    return null
  }

  const notificationId = new mongoose.Types.ObjectId()

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
              createdAt: new Date()
            }
          ],
          $position: 0,
          $slice: 100
        }
      }
    }
  )

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
    createdAt: new Date()
  })

  emitSocketEvent(`customer:${params.customerId}`, "customer.notification.created", notification)

  return notification
}

export async function listCustomerNotifications(customerId: string, params?: {
  page?: number
  limit?: number
  category?: "all" | "orders" | "offers" | "personal_offers"
}) {
  const customer = await CustomerModel.findById(customerId).select("notifications")
  const notifications = [...(customer?.notifications ?? [])]
    .sort((left, right) => {
      const leftTime = new Date(left.createdAt ?? 0).getTime()
      const rightTime = new Date(right.createdAt ?? 0).getTime()
      return rightTime - leftTime
    })
  const category = params?.category ?? "all"
  const mappedNotifications = notifications
    .map((notification) => mapCustomerNotification(notification.toObject()))
    .filter((notification) => {
      if (category === "offers") {
        return ["promotion", "voucher", "campaign"].includes(notification.type)
      }
      if (category === "personal_offers") {
        return notification.personalOffer === true
      }
      if (category === "orders") {
        return ["order_status", "rider_assigned", "rider_near"].includes(notification.type)
      }
      return true
    })
  const limit = Math.min(Math.max(params?.limit ?? 20, 1), 50)
  const page = Math.max(params?.page ?? 1, 1)
  const start = (page - 1) * limit
  const items = mappedNotifications.slice(start, start + limit)
  const total = mappedNotifications.length

  return {
    items,
    total,
    unreadCount: mappedNotifications.filter((notification) => !notification.isRead).length,
    page,
    limit,
    hasMore: start + items.length < total,
    nextPage: start + items.length < total ? page + 1 : null
  }
}

export async function getCustomerNotificationByCampaignId(params: {
  customerId: string
  campaignId: string
}) {
  const campaignId = params.campaignId.trim()
  if (!campaignId) return null

  const customer = await CustomerModel.findOne(
    {
      _id: params.customerId,
      "notifications.campaignId": campaignId,
    },
    {
      notifications: {
        $elemMatch: { campaignId },
      },
    }
  ).select("notifications")

  const notification = customer?.notifications?.[0]
  return notification ? mapCustomerNotification(notification.toObject()) : null
}

export async function markCustomerNotificationAsRead(params: {
  customerId: string
  notificationId: string
}) {
  await CustomerModel.updateOne(
    {
      _id: params.customerId,
      "notifications._id": params.notificationId
    },
    {
      $set: {
        "notifications.$.isRead": true,
        "notifications.$.readAt": new Date()
      }
    }
  )

  return listCustomerNotifications(params.customerId)
}

export async function markCustomerNotificationOpened(params: {
  customerId: string
  notificationId?: string
  campaignId?: string
}) {
  const filters: Record<string, unknown>[] = []

  if (params.notificationId) {
    filters.push({ "notifications._id": params.notificationId })
  }

  if (params.campaignId) {
    filters.push({ "notifications.campaignId": params.campaignId })
  }

  if (!filters.length) return { recorded: false, matched: 0, modified: 0 }

  const result = await CustomerModel.updateOne(
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
  )

  if (params.campaignId && result.matchedCount > 0) {
    await AdminNotificationScheduleModel.updateOne(
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
    ).catch((error) => {
      logger.warn(
        { error, customerId: params.customerId, campaignId: params.campaignId },
        "Failed to update admin notification open analytics",
      )
    })
  }

  return {
    recorded: result.matchedCount > 0,
    matched: result.matchedCount,
    modified: result.modifiedCount,
  }
}

export async function markAllCustomerNotificationsAsRead(customerId: string) {
  await CustomerModel.updateOne(
    { _id: customerId },
    {
      $set: {
        "notifications.$[notification].isRead": true,
        "notifications.$[notification].readAt": new Date()
      }
    },
    {
      arrayFilters: [
        {
          "notification.isRead": false
        }
      ]
    }
  )

  return listCustomerNotifications(customerId)
}

export async function sendPushToCustomer(params: {
  customerId: string
  payload: CustomerPushPayload
  excludeExpoTokens?: Set<string>
  zoneId?: string
  districtId?: string
}) {
  const payload = normalizeCustomerPushPayload(params.payload)
  const createdNotification = await createCustomerNotification({
    customerId: params.customerId,
    payload,
    zoneId: params.zoneId,
    districtId: params.districtId,
  })

  if (!createdNotification) {
    return { sent: 0, disabled: 0, inAppCreated: 0, skipped: true, sentExpoTokens: [], ticketIds: [] }
  }

  const customer = await CustomerModel.findById(params.customerId).select("pushTokens")

  if (!customer?.pushTokens?.length) {
    logger.info({ customerId: params.customerId }, "Push skipped: no customer push tokens")
    return { sent: 0, disabled: 0, inAppCreated: 1, sentExpoTokens: [], ticketIds: [] }
  }

  const activeTokens = customer.pushTokens.filter(
    (token) => !token.disabledAt && isExpoPushToken(token.expoPushToken)
  )
  const latestActiveToken = [...activeTokens]
    .filter((token) => !params.excludeExpoTokens?.has(token.expoPushToken))
    .sort((left, right) => {
      const leftTime = new Date(left.lastSeenAt ?? 0).getTime()
      const rightTime = new Date(right.lastSeenAt ?? 0).getTime()
      return rightTime - leftTime
    })[0]
  const uniqueActiveTokens = latestActiveToken ? [latestActiveToken] : []

  if (!uniqueActiveTokens.length) {
    logger.info({ customerId: params.customerId }, "Push skipped: no active Expo push tokens")
    return { sent: 0, disabled: 0, inAppCreated: 1, sentExpoTokens: [], ticketIds: [] }
  }

  const sentExpoTokens = uniqueActiveTokens.map((token) => token.expoPushToken)
  const messages: ExpoPushMessage[] = uniqueActiveTokens.map((token) => ({
    to: token.expoPushToken,
    sound: "default",
    title: payload.title,
    body: payload.body,
    ...(payload.imageUrl
      ? {
          mutableContent: true,
          image: payload.imageUrl,
          richContent: { image: payload.imageUrl },
        }
      : {}),
    data: {
      ...payload.data,
      notificationId: createdNotification.id,
    }
  }))

  const response = await fetchWithTimeout("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(messages),
    timeoutMs: 3_000,
  }).catch((error) => {
    logger.warn({ error, customerId: params.customerId }, "Expo push send timed out or failed")
    return null
  })

  if (!response) {
    return { sent: 0, disabled: 0, inAppCreated: 1, sentExpoTokens, ticketIds: [] }
  }

  if (!response.ok) {
    logger.error(
      {
        customerId: params.customerId,
        status: response.status
      },
      "Expo push send failed"
    )
    return { sent: 0, disabled: 0, inAppCreated: 1, sentExpoTokens: [], ticketIds: [] }
  }

  const expoResponse = (await response.json()) as {
    data?: Array<{
      status?: string
      id?: string
      details?: {
        error?: string
      }
    }>
  }

  const invalidIndexes: number[] = []
  let sent = 0
  const ticketIds: string[] = []

  expoResponse.data?.forEach((entry, index) => {
    if (entry.status === "ok") {
      sent += 1
      if (entry.id) ticketIds.push(entry.id)
      return
    }

    if (entry.details?.error === "DeviceNotRegistered") {
      invalidIndexes.push(index)
    }
  })

  if (invalidIndexes.length) {
    const invalidTokenIds = invalidIndexes
      .map((index) => uniqueActiveTokens[index]?._id)
      .filter(Boolean)

    if (invalidTokenIds.length) {
      await CustomerModel.updateOne(
        { _id: params.customerId },
        {
          $set: {
            "pushTokens.$[token].disabledAt": new Date()
          }
        },
        {
          arrayFilters: [
            {
              "token._id": { $in: invalidTokenIds }
            }
          ]
        }
      )
    }
  }

  logger.info(
    {
      customerId: params.customerId,
      sent,
      disabled: invalidIndexes.length
    },
    "Expo push processed"
  )

  return { sent, disabled: invalidIndexes.length, inAppCreated: 1, sentExpoTokens, ticketIds }
}
