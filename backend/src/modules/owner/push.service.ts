import { fetchWithTimeout } from "../../common/utils/fetch-with-timeout"
import { logger } from "../../config/logger"
import { OwnerModel } from "../auth/auth.model"

type OwnerPushPayload = {
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

function pruneOwnerPushTokens(owner: { pushTokens: any[] }) {
  owner.pushTokens = (owner.pushTokens ?? [])
    .sort((a, b) => {
      const aDate = a.lastSeenAt instanceof Date ? a.lastSeenAt.getTime() : 0
      const bDate = b.lastSeenAt instanceof Date ? b.lastSeenAt.getTime() : 0
      return bDate - aDate
    })
    .slice(0, 10)
}

export async function registerOwnerPushToken(params: {
  ownerId: string
  expoPushToken: string
  platform: "android" | "ios"
  deviceId?: string
  appVersion?: string
  language?: "bn" | "en"
}) {
  const owner = await OwnerModel.findById(params.ownerId).select(
    "pushTokens status preferredLanguage"
  )

  if (!owner || owner.status !== "active") {
    return { registered: false }
  }

  const language =
    params.language === "en" || params.language === "bn"
      ? params.language
      : owner.preferredLanguage === "en"
        ? "en"
        : "bn"

  const existingToken = owner.pushTokens.find(
    (token) => token.expoPushToken === params.expoPushToken
  )

  if (existingToken) {
    existingToken.platform = params.platform
    existingToken.deviceId = params.deviceId ?? existingToken.deviceId ?? ""
    existingToken.appVersion = params.appVersion ?? existingToken.appVersion ?? ""
    existingToken.language = language
    existingToken.lastSeenAt = new Date()
    existingToken.disabledAt = null
  } else {
    if (params.deviceId) {
      owner.pushTokens.forEach((token) => {
        if (token.deviceId === params.deviceId && token.expoPushToken !== params.expoPushToken) {
          token.disabledAt = new Date()
        }
      })
    }

    owner.pushTokens.push({
      expoPushToken: params.expoPushToken,
      platform: params.platform,
      deviceId: params.deviceId ?? "",
      appVersion: params.appVersion ?? "",
      language,
      lastSeenAt: new Date(),
      disabledAt: null
    } as any)
  }

  owner.preferredLanguage = language
  pruneOwnerPushTokens(owner)
  await owner.save()

  return { registered: true }
}

export async function unregisterOwnerPushToken(params: {
  ownerId: string
  expoPushToken: string
}) {
  const owner = await OwnerModel.findById(params.ownerId).select("pushTokens")

  if (!owner) {
    return { removed: false }
  }

  const pushToken = owner.pushTokens.find(
    (token) => token.expoPushToken === params.expoPushToken
  )

  if (pushToken) {
    pushToken.disabledAt = new Date()
    pushToken.lastSeenAt = new Date()
    pruneOwnerPushTokens(owner)
    await owner.save()
  }

  return { removed: true }
}

export async function sendPushToOwner(params: {
  ownerId: string
  payload: OwnerPushPayload
}) {
  const owner = await OwnerModel.findById(params.ownerId).select("pushTokens")

  if (!owner?.pushTokens?.length) {
    logger.info({ ownerId: params.ownerId }, "Push skipped: no owner push tokens")
    return { sent: 0, disabled: 0 }
  }

  const activeTokens = owner.pushTokens.filter(
    (token) => !token.disabledAt && isExpoPushToken(token.expoPushToken)
  )

  if (!activeTokens.length) {
    logger.info({ ownerId: params.ownerId }, "Push skipped: no active owner Expo push tokens")
    return { sent: 0, disabled: 0 }
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
          richContent: { image: params.payload.imageUrl },
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
    logger.warn({ error, ownerId: params.ownerId }, "Expo owner push send timed out or failed")
    return null
  })

  if (!response) {
    return { sent: 0, disabled: 0 }
  }

  if (!response.ok) {
    logger.error(
      {
        ownerId: params.ownerId,
        status: response.status
      },
      "Expo owner push send failed"
    )
    return { sent: 0, disabled: 0 }
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
      await OwnerModel.updateOne(
        { _id: params.ownerId },
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
      ownerId: params.ownerId,
      sent,
      disabled: invalidIndexes.length
    },
    "Expo owner push processed"
  )

  return { sent, disabled: invalidIndexes.length }
}
