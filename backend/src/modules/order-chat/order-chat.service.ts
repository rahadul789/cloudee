import { StatusCodes } from "http-status-codes"
import mongoose from "mongoose"

import { emitSocketEvent, hasActiveSocketChannel } from "../../config/socket"
import { AppError } from "../../common/utils/app-error"
import { logger } from "../../config/logger"
import { sendPushToCustomer } from "../customer/push.service"
import { OrderModel } from "../owner/operational.model"
import { sendPushToRider } from "../rider/push.service"
import { OrderChatMessageModel } from "./order-chat.model"

import {
  CHAT_MAX_LENGTH,
  consumeChatSendBudget,
  getChatAvailability,
  normalizeChatText,
  shouldSendChatPush,
  type ChatRole,
} from "./order-chat.rules"

export { CHAT_MAX_LENGTH, type ChatRole } from "./order-chat.rules"

type OrderChatContext = {
  orderId: string
  orderNumber: string
  status: string
  customerId: string
  riderId: string
  customerName: string
  riderName: string
}

export type OrderChatMessageDto = {
  id: string
  orderId: string
  senderRole: ChatRole
  text: string
  createdAt: string
  readAt: string | null
  clientMessageId: string
}

// --- data access ------------------------------------------------------------------------

function toDto(doc: Record<string, any>): OrderChatMessageDto {
  return {
    id: String(doc._id),
    orderId: String(doc.orderId),
    senderRole: doc.senderRole,
    text: doc.text,
    createdAt: new Date(doc.createdAt).toISOString(),
    readAt: doc.readAt ? new Date(doc.readAt).toISOString() : null,
    clientMessageId: doc.clientMessageId ?? "",
  }
}

async function loadChatContext(orderId: string): Promise<OrderChatContext> {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new AppError(StatusCodes.NOT_FOUND, "ORDER_NOT_FOUND", "Order not found")
  }
  const order = await OrderModel.findById(orderId)
    .select("_id orderNumber status customerId riderId riderSnapshot customerSnapshot")
    .lean<Record<string, any> | null>()
  if (!order) {
    throw new AppError(StatusCodes.NOT_FOUND, "ORDER_NOT_FOUND", "Order not found")
  }
  return {
    orderId: String(order._id),
    orderNumber: String(order.orderNumber ?? ""),
    status: String(order.status ?? ""),
    customerId: String(order.customerId ?? ""),
    riderId: order.riderId ? String(order.riderId) : "",
    customerName: String(order.customerSnapshot?.fullName ?? "").trim() || "Customer",
    riderName: String(order.riderSnapshot?.name ?? "").trim() || "Rider",
  }
}

function assertParticipant(context: OrderChatContext, role: ChatRole, userId: string) {
  const allowed =
    role === "customer" ? context.customerId === userId : Boolean(context.riderId) && context.riderId === userId
  if (!allowed) {
    // Same 404 as a missing order — never reveal other people's orders.
    throw new AppError(StatusCodes.NOT_FOUND, "ORDER_NOT_FOUND", "Order not found")
  }
}

function buildThreadMeta(context: OrderChatContext, role: ChatRole) {
  const availability = getChatAvailability(context)
  return {
    orderId: context.orderId,
    orderNumber: context.orderNumber,
    status: context.status,
    canSend: availability.canSend,
    closedReason: availability.closedReason,
    counterpart:
      role === "customer"
        ? { role: "rider" as const, name: context.riderName }
        : { role: "customer" as const, name: context.customerName },
  }
}

export async function getOrderChatThread(params: { orderId: string; role: ChatRole; userId: string }) {
  const context = await loadChatContext(params.orderId)
  assertParticipant(context, params.role, params.userId)
  const docs = await OrderChatMessageModel.find({ orderId: context.orderId })
    .sort({ createdAt: 1 })
    .limit(300)
    .lean()
  const messages = docs.map(toDto)
  const unreadCount = messages.filter(
    (message) => message.senderRole !== params.role && !message.readAt,
  ).length
  return { ...buildThreadMeta(context, params.role), messages, unreadCount }
}

export async function sendOrderChatMessage(params: {
  orderId: string
  role: ChatRole
  userId: string
  text: unknown
  clientMessageId?: unknown
}) {
  const context = await loadChatContext(params.orderId)
  assertParticipant(context, params.role, params.userId)
  const availability = getChatAvailability(context)
  if (!availability.canSend) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "ORDER_CHAT_CLOSED",
      availability.closedReason === "no_rider"
        ? "Chat opens once a rider is assigned."
        : "This order is finished, so the chat is closed.",
    )
  }
  const text = normalizeChatText(params.text)
  if (!text) {
    throw new AppError(StatusCodes.BAD_REQUEST, "ORDER_CHAT_EMPTY", "Message cannot be empty.")
  }
  if (!consumeChatSendBudget(params.userId)) {
    throw new AppError(
      StatusCodes.TOO_MANY_REQUESTS,
      "ORDER_CHAT_RATE_LIMITED",
      "You're sending messages too fast. Please wait a moment.",
    )
  }
  const clientMessageId = String(params.clientMessageId ?? "").trim().slice(0, 64)

  let doc: Record<string, any>
  try {
    doc = (
      await OrderChatMessageModel.create({
        orderId: context.orderId,
        customerId: context.customerId,
        riderId: context.riderId,
        senderRole: params.role,
        senderId: params.userId,
        text,
        clientMessageId,
      })
    ).toObject()
  } catch (error) {
    // Retried send with the same clientMessageId → return the original message.
    if ((error as { code?: number })?.code === 11000 && clientMessageId) {
      const existing = await OrderChatMessageModel.findOne({
        orderId: context.orderId,
        senderId: params.userId,
        clientMessageId,
      }).lean()
      if (existing) return toDto(existing)
    }
    throw error
  }

  const message = toDto(doc)
  const event = { orderId: context.orderId, message }
  emitSocketEvent(`customer:${context.customerId}`, "order.chat.message", event)
  emitSocketEvent(`rider:${context.riderId}`, "order.chat.message", event)
  emitSocketEvent("admin:order-chat", "admin.order-chat.message", event)

  void notifyRecipient(context, params.role, text)
  return message
}

// Push only when the recipient has no live socket (app closed/backgrounded), and at most
// once per order per 45s so a burst of messages doesn't flood their notification list.
async function notifyRecipient(context: OrderChatContext, senderRole: ChatRole, text: string) {
  try {
    const preview = text.length > 120 ? `${text.slice(0, 117)}…` : text
    if (senderRole === "rider") {
      if (hasActiveSocketChannel(`customer:${context.customerId}`)) return
      if (!shouldSendChatPush(`customer:${context.customerId}:${context.orderId}`)) return
      await sendPushToCustomer({
        customerId: context.customerId,
        payload: {
          title: `${context.riderName} (your rider)`,
          body: preview,
          data: {
            type: "order_chat",
            orderId: context.orderId,
            path: `/orders/${context.orderId}/chat`,
          },
        },
      })
    } else {
      if (hasActiveSocketChannel(`rider:${context.riderId}`)) return
      if (!shouldSendChatPush(`rider:${context.riderId}:${context.orderId}`)) return
      await sendPushToRider({
        riderId: context.riderId,
        payload: {
          title: `গ্রাহকের মেসেজ · #${context.orderNumber}`,
          body: preview,
          data: { type: "order_chat", orderId: context.orderId },
        },
      })
    }
  } catch (error) {
    logger.warn({ err: error, orderId: context.orderId }, "Order chat push failed")
  }
}

export async function markOrderChatRead(params: { orderId: string; role: ChatRole; userId: string }) {
  const context = await loadChatContext(params.orderId)
  assertParticipant(context, params.role, params.userId)
  const readAt = new Date()
  const result = await OrderChatMessageModel.updateMany(
    { orderId: context.orderId, senderRole: { $ne: params.role }, readAt: null },
    { $set: { readAt } },
  )
  if (result.modifiedCount > 0) {
    const event = { orderId: context.orderId, readerRole: params.role, readAt: readAt.toISOString() }
    emitSocketEvent(`customer:${context.customerId}`, "order.chat.read", event)
    if (context.riderId) emitSocketEvent(`rider:${context.riderId}`, "order.chat.read", event)
  }
  return { updated: result.modifiedCount }
}

// Admin audit view (read-only): the whole thread with both names.
export async function getAdminOrderChat(orderId: string) {
  const context = await loadChatContext(orderId)
  const docs = await OrderChatMessageModel.find({ orderId: context.orderId })
    .sort({ createdAt: 1 })
    .lean()
  return {
    orderId: context.orderId,
    orderNumber: context.orderNumber,
    status: context.status,
    customerName: context.customerName,
    riderName: context.riderName,
    messages: docs.map(toDto),
  }
}
