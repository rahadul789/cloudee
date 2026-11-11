import type { Request, Response } from "express"
import { StatusCodes } from "http-status-codes"
import { z } from "zod"

import { sendSuccess } from "../../common/utils/api-response"
import { asyncHandler } from "../../common/utils/async-handler"
import {
  CHAT_MAX_LENGTH,
  getAdminOrderChat,
  getOrderChatThread,
  markOrderChatRead,
  sendOrderChatMessage,
  type ChatRole,
} from "./order-chat.service"

const sendSchema = z.object({
  text: z.string().trim().min(1).max(CHAT_MAX_LENGTH * 2),
  clientMessageId: z.string().trim().max(64).optional(),
})

function orderIdOf(req: Request) {
  const value = req.params.orderId
  return typeof value === "string" ? value.trim() : ""
}

function handlers(role: ChatRole) {
  return {
    getThread: asyncHandler(async (req: Request, res: Response) => {
      const data = await getOrderChatThread({
        orderId: orderIdOf(req),
        role,
        userId: req.user?.id ?? "",
      })
      return sendSuccess(res, { message: "Chat loaded", data })
    }),
    send: asyncHandler(async (req: Request, res: Response) => {
      const body = sendSchema.parse(req.body)
      const data = await sendOrderChatMessage({
        orderId: orderIdOf(req),
        role,
        userId: req.user?.id ?? "",
        text: body.text,
        clientMessageId: body.clientMessageId,
      })
      return sendSuccess(res, { statusCode: StatusCodes.CREATED, message: "Message sent", data })
    }),
    markRead: asyncHandler(async (req: Request, res: Response) => {
      const data = await markOrderChatRead({
        orderId: orderIdOf(req),
        role,
        userId: req.user?.id ?? "",
      })
      return sendSuccess(res, { message: "Chat marked as read", data })
    }),
  }
}

export const customerOrderChat = handlers("customer")
export const riderOrderChat = handlers("rider")

export const getAdminOrderChatController = asyncHandler(async (req: Request, res: Response) => {
  const data = await getAdminOrderChat(orderIdOf(req))
  return sendSuccess(res, { message: "Chat loaded", data })
})
