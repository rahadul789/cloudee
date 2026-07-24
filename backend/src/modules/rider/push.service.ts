import mongoose from "mongoose"

import { fetchWithTimeout } from "../../common/utils/fetch-with-timeout"
import { optimizePushImageUrl } from "../../common/utils/push-image"
import { logger } from "../../config/logger"
import { emitSocketEvent } from "../../config/socket"
import { RiderModel } from "../auth/auth.model"
import { OrderModel } from "../owner/operational.model"

type RiderPushPayload = {
  title: string
  body: string
  contentType?: "text" | "image" | "image_text"
  imageUrl?: string
  data?: Record<string, unknown>
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

export async function createRiderNotification(params: {
  riderId: string
  payload: RiderPushPayload
  zoneId?: string
  districtId?: string
}) {
  const path =
    typeof params.payload.data?.path === "string" ? params.payload.data.path : ""
  const type =
    typeof params.payload.data?.type === "string" ? params.payload.data.type : "system"
  const campaignId =
    typeof params.payload.data?.campaignId === "string" ? params.payload.data.campaignId : ""
  const { zoneId, districtId } = await resolveNotificationScope({
    data: params.payload.data,
    zoneId: params.zoneId,
    districtId: params.districtId,
  })
  const notificationId = new mongoose.Types.ObjectId()

  await RiderModel.updateOne(
    { _id: params.riderId },
    {
      $push: {
        notifications: {
          $each: [
            {
              _id: notificationId,
              type,
              title: params.payload.title,
              description: params.payload.body,
              path,
              campaignId,
              contentType: params.payload.contentType ?? "text",
              imageUrl: params.payload.imageUrl ?? "",
              zoneId,
              districtId,
              isRead: false,
              readAt: null,
              createdAt: new Date(),
            },
          ],
          $position: 0,
          $slice: 100,
        },
      },
    },
  )

  emitSocketEvent(`rider:${params.riderId}`, "rider.notification.created", {
    id: notificationId.toString(),
    type,
    title: params.payload.title,
    description: params.payload.body,
    path,
    campaignId,
    contentType: params.payload.contentType ?? "text",
    imageUrl: params.payload.imageUrl ?? "",
    zoneId,
    districtId,
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
  })
}

export async function sendPushToRider(params: {
  riderId: string
  payload: RiderPushPayload
  zoneId?: string
  districtId?: string
}) {
  await createRiderNotification(params)
  const rider = await RiderModel.findById(params.riderId).select("pushTokens")

  if (!rider?.pushTokens?.length) {
    logger.info({ riderId: params.riderId }, "Push skipped: no rider push tokens")
    return { sent: 0, disabled: 0, inAppCreated: 1 }
  }

  const activeTokens = rider.pushTokens.filter(
    (token) => !token.disabledAt && isExpoPushToken(token.expoPushToken)
  )

  if (!activeTokens.length) {
    logger.info({ riderId: params.riderId }, "Push skipped: no active rider Expo push tokens")
    return { sent: 0, disabled: 0, inAppCreated: 1 }
  }

  const messages: ExpoPushMessage[] = activeTokens.map((token) => ({
    to: token.expoPushToken,
    sound: "default",
    title: params.payload.title,
    body: params.payload.body,
    data: params.payload.data,
    ...(params.payload.imageUrl
      ? {
          mutableContent: true,
          image: params.payload.imageUrl,
          richContent: { image: optimizePushImageUrl(params.payload.imageUrl) },
        }
      : {}),
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
    logger.warn({ error, riderId: params.riderId }, "Expo rider push send timed out or failed")
    return null
  })

  if (!response) {
    return { sent: 0, disabled: 0, inAppCreated: 1 }
  }

  if (!response.ok) {
    logger.error(
      {
        riderId: params.riderId,
        status: response.status
      },
      "Expo rider push send failed"
    )
    return { sent: 0, disabled: 0, inAppCreated: 1 }
  }

  const payload = (await response.json()) as {
    data?: Array<{
      status?: string
      details?: {
        error?: string
      }
    }>
  }

  const invalidIndexes: number[] = []
  let sent = 0

  payload.data?.forEach((entry, index) => {
    if (entry.status === "ok") {
      sent += 1
      return
    }

    if (entry.details?.error === "DeviceNotRegistered") {
      invalidIndexes.push(index)
    }
  })

  if (invalidIndexes.length) {
    const invalidTokenIds = invalidIndexes
      .map((index) => activeTokens[index]?._id)
      .filter(Boolean)

    if (invalidTokenIds.length) {
      await RiderModel.updateOne(
        { _id: params.riderId },
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
      riderId: params.riderId,
      sent,
      disabled: invalidIndexes.length
    },
    "Expo rider push processed"
  )

  return { sent, disabled: invalidIndexes.length, inAppCreated: 1 }
}
