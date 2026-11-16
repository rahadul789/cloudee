import type { Request, Response } from "express"
import { z } from "zod"

import { sendSuccess } from "../../common/utils/api-response"
import { asyncHandler } from "../../common/utils/async-handler"
import { HYPE_EVENT_TYPES, HYPE_KINDS } from "./hype.model"
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
  getHypeSectionOrder,
  saveHypeSectionOrder,
  getHypeLatest,
  getHypeVideo,
  listAdminRestaurantMenuItems,
  setHypeGoing,
  attributeHypeOrder,
  getHypeVideoCategories,
  listHypeVideos,
  saveHypeVideoCategories,
} from "./hype.service"

const customerIdOf = (req: Request) => (req.user?.role === "customer" ? req.user.id : undefined)
const param = (value: unknown) => (Array.isArray(value) ? String(value[0] ?? "") : String(value ?? ""))

export const getCustomerHypeFeed = asyncHandler(async (req: Request, res: Response) => {
  const deviceId = typeof req.query.deviceId === "string" ? req.query.deviceId : undefined
  const limit = Number(req.query.videoLimit)
  const videoLimit = Number.isInteger(limit) && limit > 0 && limit <= 50 ? limit : undefined
  const data = await getHypeFeed({ customerId: customerIdOf(req), deviceId, videoLimit })
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
  menuItemId: z.string().trim().max(40).optional().nullable(),
  ctaLabel: z.string().trim().max(40).optional(),
  ctaPath: z.string().trim().max(300).optional(),
  externalUrl: z.string().trim().max(500).optional(),
  startsAt: optionalDate,
  endsAt: optionalDate,
  limitLabel: z.string().trim().max(60).optional(),
  stockTotal: z.coerce.number().int().min(0).max(100000).optional(),
  isPinned: z.boolean().optional(),
  location: z.string().trim().max(120).optional(),
  youtubeUrl: z.string().trim().max(300).optional(),
  category: z.string().trim().min(1).max(30).optional(),
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

// ── Admin: order of the "For you" sections ──
export const getAdminHypeLayout = asyncHandler(async (_req: Request, res: Response) => {
  const data = { sectionOrder: await getHypeSectionOrder(), videoCategories: await getHypeVideoCategories() }
  return sendSuccess(res, { data })
})

const layoutSchema = z.object({
  sectionOrder: z.array(z.string().trim().max(20)).max(20).optional(),
  videoCategories: z
    .array(z.object({ id: z.string().trim().max(30).optional(), label: z.string().trim().min(1).max(30) }))
    .max(20)
    .optional(),
})

export const putAdminHypeLayout = asyncHandler(async (req: Request, res: Response) => {
  const body = layoutSchema.parse(req.body)
  const data: Record<string, unknown> = {}
  if (body.sectionOrder) Object.assign(data, await saveHypeSectionOrder(body.sectionOrder))
  if (body.videoCategories) Object.assign(data, await saveHypeVideoCategories(body.videoCategories))
  return sendSuccess(res, { message: "Hype layout saved", data })
})

// ── Customer: light "anything new?" check + paged videos ──
export const getCustomerHypeLatest = asyncHandler(async (_req: Request, res: Response) => {
  const data = await getHypeLatest()
  return sendSuccess(res, { data })
})

export const getCustomerHypeVideos = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Math.min(200, Number(req.query.page) || 1))
  const pageSize = Math.max(4, Math.min(30, Number(req.query.pageSize) || 10))
  const category = typeof req.query.category === "string" ? req.query.category.trim().slice(0, 30) : undefined
  const data = await listHypeVideos({ category, page, pageSize })
  return sendSuccess(res, { data })
})

export const getCustomerHypeVideo = asyncHandler(async (req: Request, res: Response) => {
  const data = await getHypeVideo(param(req.params.videoId))
  return sendSuccess(res, { data })
})

export const getAdminHypeRestaurantMenuItems = asyncHandler(async (req: Request, res: Response) => {
  const data = await listAdminRestaurantMenuItems(param(req.params.restaurantId))
  return sendSuccess(res, { data })
})

const goingSchema = z.object({ going: z.boolean(), deviceId: z.string().trim().max(80).optional() })

export const postCustomerHypeGoing = asyncHandler(async (req: Request, res: Response) => {
  const body = goingSchema.parse(req.body)
  const data = await setHypeGoing({
    itemId: param(req.params.itemId),
    going: body.going,
    deviceId: body.deviceId,
    customerId: customerIdOf(req),
  })
  return sendSuccess(res, { data })
})

const attributionSchema = z.object({ orderId: z.string().trim().max(40), itemId: z.string().trim().max(40) })

export const postCustomerHypeAttribution = asyncHandler(async (req: Request, res: Response) => {
  const body = attributionSchema.parse(req.body)
  const data = await attributeHypeOrder({ customerId: req.user?.id ?? "", orderId: body.orderId, itemId: body.itemId })
  return sendSuccess(res, { data })
})
