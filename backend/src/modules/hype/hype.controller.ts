import type { Request, Response } from "express"
import { z } from "zod"

import { sendSuccess } from "../../common/utils/api-response"
import { asyncHandler } from "../../common/utils/async-handler"
import { HYPE_EVENT_TYPES, HYPE_KINDS, HYPE_VIDEO_CATEGORIES } from "./hype.model"
import {
  addHypePollComment,
  createAdminHypeItem,
  deleteAdminHypeItem,
  getHypeFeed,
  listAdminHypeComments,
  listAdminHypeItems,
  listHypePollComments,
  moderateAdminHypeComment,
  recordHypeEvents,
  voteHypePoll,
  reactToHypeVideo,
  recordHypeVideoView,
  updateAdminHypeItem,
} from "./hype.service"

const customerIdOf = (req: Request) => (req.user?.role === "customer" ? req.user.id : undefined)
const param = (value: unknown) => (Array.isArray(value) ? String(value[0] ?? "") : String(value ?? ""))

export const getCustomerHypeFeed = asyncHandler(async (req: Request, res: Response) => {
  const deviceId = typeof req.query.deviceId === "string" ? req.query.deviceId : undefined
  const data = await getHypeFeed({ customerId: customerIdOf(req), deviceId })
  return sendSuccess(res, { data })
})

const reactionSchema = z.object({
  reaction: z.enum(["like", "dislike", "none"]),
  deviceId: z.string().trim().max(80).optional(),
})

export const postCustomerHypeVideoReaction = asyncHandler(async (req: Request, res: Response) => {
  const body = reactionSchema.parse(req.body)
  const data = await reactToHypeVideo({
    videoId: param(req.params.videoId),
    reaction: body.reaction,
    deviceId: body.deviceId,
    customerId: customerIdOf(req),
  })
  return sendSuccess(res, { data })
})

export const postCustomerHypeVideoView = asyncHandler(async (req: Request, res: Response) => {
  const data = await recordHypeVideoView(param(req.params.videoId))
  return sendSuccess(res, { data })
})

const optionalDate = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine((value) => !value || !Number.isNaN(new Date(value).getTime()), "Invalid date")

const itemSchema = z.object({
  kind: z.enum(HYPE_KINDS),
  title: z.string().trim().max(120),
  description: z.string().trim().max(400).optional(),
  imageUrl: z.string().trim().max(1000).optional(),
  restaurantId: z.string().trim().optional().nullable(),
  ctaLabel: z.string().trim().max(40).optional(),
  ctaPath: z.string().trim().max(300).optional(),
  externalUrl: z.string().trim().max(500).optional(),
  startsAt: optionalDate,
  endsAt: optionalDate,
  limitLabel: z.string().trim().max(60).optional(),
  location: z.string().trim().max(120).optional(),
  youtubeUrl: z.string().trim().max(300).optional(),
  category: z.enum(HYPE_VIDEO_CATEGORIES).optional(),
  durationLabel: z.string().trim().max(12).optional(),
  isPublished: z.boolean().optional(),
  position: z.coerce.number().int().min(-1000).max(1000).optional(),
  pollOptions: z
    .array(z.object({ id: z.string().trim().max(40).optional(), label: z.string().trim().max(80) }))
    .max(6)
    .optional(),
  allowComments: z.boolean().optional(),
})

export const getAdminHypeItems = asyncHandler(async (req: Request, res: Response) => {
  const kind = typeof req.query.kind === "string" && (HYPE_KINDS as readonly string[]).includes(req.query.kind)
    ? req.query.kind
    : undefined
  const data = await listAdminHypeItems(kind)
  return sendSuccess(res, { data })
})

export const postAdminHypeItem = asyncHandler(async (req: Request, res: Response) => {
  const data = await createAdminHypeItem(itemSchema.parse(req.body))
  return sendSuccess(res, { message: "Hype item created", data })
})

export const putAdminHypeItem = asyncHandler(async (req: Request, res: Response) => {
  const data = await updateAdminHypeItem(param(req.params.itemId), itemSchema.parse(req.body))
  return sendSuccess(res, { message: "Hype item updated", data })
})

export const deleteAdminHypeItemController = asyncHandler(async (req: Request, res: Response) => {
  const data = await deleteAdminHypeItem(param(req.params.itemId))
  return sendSuccess(res, { message: "Hype item deleted", data })
})

// ── Analytics + polls (customer) ──
const eventsSchema = z.object({
  events: z.array(z.object({ id: z.string().trim().max(40), type: z.enum(HYPE_EVENT_TYPES) })).max(100),
})

export const postCustomerHypeEvents = asyncHandler(async (req: Request, res: Response) => {
  const body = eventsSchema.parse(req.body)
  const data = await recordHypeEvents(body.events)
  return sendSuccess(res, { data })
})

const voteSchema = z.object({ optionId: z.string().trim().min(1).max(40), deviceId: z.string().trim().max(80).optional() })

export const postCustomerHypePollVote = asyncHandler(async (req: Request, res: Response) => {
  const body = voteSchema.parse(req.body)
  const data = await voteHypePoll({
    pollId: param(req.params.pollId),
    optionId: body.optionId,
    deviceId: body.deviceId,
    customerId: customerIdOf(req),
  })
  return sendSuccess(res, { data })
})

export const getCustomerHypePollComments = asyncHandler(async (req: Request, res: Response) => {
  const before = typeof req.query.before === "string" ? req.query.before : undefined
  const data = await listHypePollComments(param(req.params.pollId), before)
  return sendSuccess(res, { data })
})

const commentSchema = z.object({ text: z.string().trim().min(2).max(300) })

export const postCustomerHypePollComment = asyncHandler(async (req: Request, res: Response) => {
  const body = commentSchema.parse(req.body)
  const data = await addHypePollComment({ pollId: param(req.params.pollId), customerId: req.user?.id ?? "", text: body.text })
  return sendSuccess(res, { data })
})

// ── Admin comment moderation ──
export const getAdminHypeComments = asyncHandler(async (req: Request, res: Response) => {
  const data = await listAdminHypeComments(param(req.params.itemId))
  return sendSuccess(res, { data })
})

const moderateSchema = z.object({ action: z.enum(["hide", "show", "delete"]) })

export const postAdminHypeCommentModeration = asyncHandler(async (req: Request, res: Response) => {
  const body = moderateSchema.parse(req.body)
  const data = await moderateAdminHypeComment(param(req.params.commentId), body.action)
  return sendSuccess(res, { data })
})
