import mongoose from "mongoose"
import { StatusCodes } from "http-status-codes"

import { AppError } from "../../common/utils/app-error"
import { createInMemoryAsyncCache } from "../../common/utils/in-memory-cache"
import { isQuizEnabled } from "../quiz/quiz.service"
import { RestaurantModel } from "../auth/auth.model"
import { CustomerModel } from "../customer/customer.model"
import { CategoryModel, MenuItemModel, OrderModel } from "../owner/operational.model"
import {
  HYPE_EVENT_TYPES,
  HYPE_SECTIONS,
  HypeCommentModel,
  HypeItemModel,
  HypePollVoteModel,
  HypeSettingsModel,
  HypeVideoReactionModel,
  HypeGoingModel,
  HypeOrderAttributionModel,
} from "./hype.model"
import {
  isDropVisible,
  isEventVisible,
  isPollOpen,
  parseYoutubeId,
  pollPercentages,
  reactionDelta,
  sanitizePollOptions,
  videoScore,
} from "./hype.rules"

type LeanItem = Record<string, any>

// The public feed is the same for everyone (reactions are merged per caller), so cache it briefly.
const feedCache = createInMemoryAsyncCache<LeanItem[]>({ ttlMs: 30_000, maxEntries: 4 })
const FEED_KEY = "published"

function invalidateFeed() {
  feedCache.clear()
}

async function loadPublishedItems() {
  return feedCache.getOrSet(FEED_KEY, async () => {
    const items = await HypeItemModel.find({ isPublished: true })
      .sort({ position: 1, createdAt: -1 })
      .limit(200)
      .lean()
    const restaurantIds = [
      ...new Set(items.map((item) => item.restaurantId?.toString()).filter(Boolean) as string[]),
    ]
    const restaurants = restaurantIds.length
      ? await RestaurantModel.find({ _id: { $in: restaurantIds } })
          .select({ name: 1, logo: 1 })
          .lean()
      : []
    const nameById = new Map(restaurants.map((r: any) => [String(r._id), r.name as string]))
    return items.map((item) => ({
      ...item,
      restaurantName: item.restaurantId ? nameById.get(String(item.restaurantId)) ?? "" : "",
    }))
  })
}

function toPublic(item: LeanItem) {
  return {
    id: String(item._id),
    kind: item.kind,
    title: item.title,
    description: item.description ?? "",
    imageUrl: item.imageUrl ?? "",
    restaurantId: item.restaurantId ? String(item.restaurantId) : null,
    restaurantName: item.restaurantName ?? "",
    menuItemId: item.restaurantId && item.menuItemId ? String(item.menuItemId) : null,
    ctaLabel: item.ctaLabel ?? "",
    ctaPath: item.ctaPath ?? "",
    externalUrl: item.externalUrl ?? "",
    startsAt: item.startsAt ? new Date(item.startsAt).toISOString() : null,
    endsAt: item.endsAt ? new Date(item.endsAt).toISOString() : null,
    limitLabel: item.limitLabel ?? "",
    location: item.location ?? "",
    youtubeId: item.youtubeId ?? "",
    category: item.category ?? "food",
    durationLabel: item.durationLabel ?? "",
    likeCount: item.likeCount ?? 0,
    dislikeCount: item.dislikeCount ?? 0,
    // "New" dot in the app (videos added in the last few days that you haven't watched).
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
    isPinned: item.isPinned === true,
    goingCount: item.goingCount ?? 0,
    // drop: real numbers for "X grabbed · Y left" (0 stock = not shown).
    grabbedCount: item.kind === "drop" ? item.ctaCount ?? 0 : 0,
    stockTotal: item.kind === "drop" ? item.stockTotal ?? 0 : 0,
    viewCount: item.viewCount ?? 0,
    // poll (vote counts are filled per caller in pollView — hidden until you vote)
    pollOptions: ((item.pollOptions ?? []) as Array<{ id: string; label: string }>).map((option) => ({
      id: option.id,
      label: option.label,
    })),
    allowComments: item.allowComments === true,
    commentCount: item.commentCount ?? 0,
  }
}

/** Results are shown after you vote (or once the poll closed) so early votes don't steer later ones. */
function pollView(item: LeanItem, myVote: string | null, now: number) {
  const open = isPollOpen(item, now)
  const options = (item.pollOptions ?? []) as Array<{ id: string; label: string; voteCount?: number }>
  const showResults = Boolean(myVote) || !open
  const percents = pollPercentages(options.map((option) => option.voteCount ?? 0))
  return {
    ...toPublic(item),
    pollOpen: open,
    myVote,
    voteCount: showResults ? item.voteCount ?? 0 : null,
    pollOptions: options.map((option, index) => ({
      id: option.id,
      label: option.label,
      percent: showResults ? percents[index] : null,
      voteCount: showResults ? option.voteCount ?? 0 : null,
    })),
  }
}

function voterKeyOf(params: { customerId?: string; deviceId?: string }) {
  if (params.customerId) return `c:${params.customerId}`
  const device = String(params.deviceId ?? "").trim().slice(0, 80)
  return device ? `d:${device}` : ""
}

export async function getHypeFeed(params: { customerId?: string; deviceId?: string; videoLimit?: number }) {
  const now = Date.now()
  const items = await loadPublishedItems()
  const drops = items
    .filter((item) => item.kind === "drop" && isDropVisible(item, now))
    .sort((a, b) => {
      // live first, then soonest to start
      const aLive = new Date(a.startsAt ?? 0).getTime() <= now ? 0 : 1
      const bLive = new Date(b.startsAt ?? 0).getTime() <= now ? 0 : 1
      if (aLive !== bLive) return aLive - bLive
      return (a.position ?? 0) - (b.position ?? 0)
    })
  const events = items
    .filter((item) => item.kind === "event" && isEventVisible(item, now))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  const videos = items
    .filter((item) => item.kind === "video" && item.youtubeId)
    .sort((a, b) => {
      if ((a.position ?? 0) !== (b.position ?? 0)) return (a.position ?? 0) - (b.position ?? 0)
      return videoScore(b) - videoScore(a)
    })

  // Polls: open ones, plus closed ones for 3 days so people can see the result.
  const polls = items.filter((item) => {
    if (item.kind !== "poll" || !(item.pollOptions ?? []).length) return false
    if (isPollOpen(item, now)) return true
    return new Date(item.endsAt).getTime() > now - 3 * 24 * 3_600_000
  })

  const voterKey = voterKeyOf(params)
  const myVotes: Record<string, string> = {}
  if (voterKey && polls.length) {
    const rows = await HypePollVoteModel.find({ voterKey, pollId: { $in: polls.map((poll) => poll._id) } })
      .select({ pollId: 1, optionId: 1 })
      .lean()
    for (const row of rows) myVotes[String(row.pollId)] = row.optionId
  }
  const myReactions: Record<string, "like" | "dislike"> = {}
  const myGoing: Record<string, boolean> = {}
  if (voterKey && events.length) {
    const rows = await HypeGoingModel.find({ voterKey, itemId: { $in: events.map((event) => event._id) } })
      .select({ itemId: 1 })
      .lean()
    for (const row of rows) myGoing[String(row.itemId)] = true
  }
  // Likes / dislikes on videos and on "Happening in Netrakona" events share one table.
  const reactable = [...videos, ...events]
  if (voterKey && reactable.length) {
    const rows = await HypeVideoReactionModel.find({
      voterKey,
      videoId: { $in: reactable.map((item) => item._id) },
    })
      .select({ videoId: 1, reaction: 1 })
      .lean()
    for (const row of rows) myReactions[String(row.videoId)] = row.reaction as "like" | "dislike"
  }

  return {
    serverTime: new Date(now).toISOString(),
    drops: drops.map(toPublic),
    events: events.map(toPublic),
    // New apps ask for a short rail (videoLimit) and page the rest via /hype/videos; old apps get all.
    videos: (params.videoLimit ? videos.slice(0, params.videoLimit) : videos).map(toPublic),
    videoTotal: videos.length,
    videoCategories: await getHypeVideoCategories(),
    latestAt: latestContentAt(items, now),
    polls: polls.map((poll) => pollView(poll, myVotes[String(poll._id)] ?? null, now)),
    myReactions,
    myGoing,
    // Admin "Featured" pins: shown at the very top of "For you" (any kind that is currently visible).
    pinned: [
      ...videos.filter((item) => item.isPinned).map(toPublic),
      ...drops.filter((item) => item.isPinned).map(toPublic),
      ...events.filter((item) => item.isPinned).map(toPublic),
      ...polls.filter((item) => item.isPinned).map((poll) => pollView(poll, myVotes[String(poll._id)] ?? null, now)),
    ].slice(0, 3),
    // Friend quiz card at the top of Hype (admin on/off). Older apps ignore it.
    quiz: { enabled: await isQuizEnabled() },
    // Admin-chosen order of the "For you" sections (older apps ignore it).
    sectionOrder: await getHypeSectionOrder(),
  }
}

// ── Engagement analytics (batched from the app; each item/type once per app session) ──
export async function recordHypeEvents(events: Array<{ id: string; type: string }>) {
  const fieldByType: Record<string, string> = {
    impression: "impressionCount",
    open: "openCount",
    cta: "ctaCount",
    website: "websiteCount",
    remind: "remindCount",
  }
  const tally = new Map<string, Record<string, number>>()
  for (const event of events.slice(0, 100)) {
    if (!mongoose.Types.ObjectId.isValid(event.id)) continue
    if (!(HYPE_EVENT_TYPES as readonly string[]).includes(event.type)) continue
    const inc = tally.get(event.id) ?? {}
    const field = fieldByType[event.type]
    inc[field] = (inc[field] ?? 0) + 1
    tally.set(event.id, inc)
  }
  if (!tally.size) return { recorded: 0 }
  await HypeItemModel.bulkWrite(
    [...tally.entries()].map(([id, inc]) => ({
      updateOne: { filter: { _id: new mongoose.Types.ObjectId(id) }, update: { $inc: inc } },
    })),
    { ordered: false },
  )
  return { recorded: tally.size }
}

// ── Polls ──
export async function voteHypePoll(params: {
  pollId: string
  optionId: string
  customerId?: string
  deviceId?: string
}) {
  if (!mongoose.Types.ObjectId.isValid(params.pollId)) {
    throw new AppError(StatusCodes.NOT_FOUND, "POLL_NOT_FOUND", "Poll not found")
  }
  const voterKey = voterKeyOf(params)
  if (!voterKey) throw new AppError(StatusCodes.BAD_REQUEST, "VOTER_REQUIRED", "deviceId is required")
  const poll = await HypeItemModel.findOne({ _id: params.pollId, kind: "poll", isPublished: true }).lean()
  if (!poll) throw new AppError(StatusCodes.NOT_FOUND, "POLL_NOT_FOUND", "Poll not found")
  if (!isPollOpen(poll, Date.now())) {
    throw new AppError(StatusCodes.CONFLICT, "POLL_CLOSED", "This poll has closed")
  }
  if (!(poll.pollOptions ?? []).some((option) => option.id === params.optionId)) {
    throw new AppError(StatusCodes.BAD_REQUEST, "OPTION_NOT_FOUND", "Pick one of the options")
  }
  let alreadyVoted = false
  try {
    await HypePollVoteModel.create({ pollId: poll._id, voterKey, optionId: params.optionId })
    await HypeItemModel.updateOne(
      { _id: poll._id, "pollOptions.id": params.optionId },
      { $inc: { "pollOptions.$.voteCount": 1, voteCount: 1 } },
    )
    invalidateFeed()
  } catch (error: any) {
    if (error?.code !== 11000) throw error
    alreadyVoted = true // one vote per person — the first one stands
  }
  const fresh = await HypeItemModel.findById(poll._id).lean()
  const mine = alreadyVoted
    ? (await HypePollVoteModel.findOne({ pollId: poll._id, voterKey }).lean())?.optionId ?? params.optionId
    : params.optionId
  return { alreadyVoted, poll: pollView({ ...fresh, restaurantName: "" }, mine, Date.now()) }
}

export async function listHypePollComments(pollId: string, before?: string) {
  if (!mongoose.Types.ObjectId.isValid(pollId)) return { items: [], hasMore: false }
  const filter: Record<string, unknown> = { pollId, status: "visible" }
  if (before && !Number.isNaN(new Date(before).getTime())) filter.createdAt = { $lt: new Date(before) }
  const rows = await HypeCommentModel.find(filter).sort({ createdAt: -1 }).limit(31).lean()
  return {
    items: rows.slice(0, 30).map((row) => ({
      id: String(row._id),
      authorName: row.authorName || "Foodbela user",
      text: row.text,
      createdAt: new Date(row.createdAt as Date).toISOString(),
      customerId: String(row.customerId),
    })),
    hasMore: rows.length > 30,
  }
}

/** First name + last initial ("Rahim K.") — never the phone number. */
function publicName(fullName?: string | null) {
  const parts = String(fullName ?? "").trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "Foodbela user"
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
}

export async function addHypePollComment(params: { pollId: string; customerId: string; text: string }) {
  if (!mongoose.Types.ObjectId.isValid(params.pollId)) {
    throw new AppError(StatusCodes.NOT_FOUND, "POLL_NOT_FOUND", "Poll not found")
  }
  const poll = await HypeItemModel.findOne({ _id: params.pollId, kind: "poll", isPublished: true })
    .select({ allowComments: 1 })
    .lean()
  if (!poll) throw new AppError(StatusCodes.NOT_FOUND, "POLL_NOT_FOUND", "Poll not found")
  if (!poll.allowComments) {
    throw new AppError(StatusCodes.FORBIDDEN, "COMMENTS_OFF", "Comments are turned off for this poll")
  }
  const text = params.text.replace(/\s+/g, " ").trim().slice(0, 300)
  if (text.length < 2) throw new AppError(StatusCodes.BAD_REQUEST, "COMMENT_EMPTY", "Write a comment first")
  // Anti-spam: 1 comment per 20s, max 10 per poll per person.
  const [recent, total] = await Promise.all([
    HypeCommentModel.exists({
      customerId: params.customerId,
      createdAt: { $gt: new Date(Date.now() - 20_000) },
    }),
    HypeCommentModel.countDocuments({ pollId: poll._id, customerId: params.customerId }),
  ])
  if (recent) throw new AppError(StatusCodes.TOO_MANY_REQUESTS, "COMMENT_TOO_FAST", "Please wait a moment before commenting again")
  if (total >= 10) throw new AppError(StatusCodes.TOO_MANY_REQUESTS, "COMMENT_LIMIT", "You've reached the comment limit for this poll")
  const customer = await CustomerModel.findById(params.customerId).select({ fullName: 1 }).lean()
  const created = await HypeCommentModel.create({
    pollId: poll._id,
    customerId: params.customerId,
    authorName: publicName((customer as any)?.fullName),
    text,
  })
  await HypeItemModel.updateOne({ _id: poll._id }, { $inc: { commentCount: 1 } })
  invalidateFeed()
  return {
    id: String(created._id),
    authorName: created.authorName,
    text: created.text,
    createdAt: new Date(created.createdAt as Date).toISOString(),
    customerId: params.customerId,
  }
}

export async function listAdminHypeComments(pollId: string) {
  if (!mongoose.Types.ObjectId.isValid(pollId)) return []
  const rows = await HypeCommentModel.find({ pollId }).sort({ createdAt: -1 }).limit(300).lean()
  // Admin sees who actually wrote it (full name + phone) for moderation; the app only shows "Rahim K.".
  const customers = await CustomerModel.find({ _id: { $in: [...new Set(rows.map((row) => String(row.customerId)))] } })
    .select({ fullName: 1, phone: 1 })
    .lean()
  const byId = new Map(customers.map((customer: any) => [String(customer._id), customer]))
  return rows.map((row) => ({
    id: String(row._id),
    authorName: row.authorName,
    customerName: (byId.get(String(row.customerId)) as any)?.fullName ?? "",
    customerPhone: (byId.get(String(row.customerId)) as any)?.phone ?? "",
    text: row.text,
    status: row.status,
    customerId: String(row.customerId),
    createdAt: new Date(row.createdAt as Date).toISOString(),
  }))
}

export async function moderateAdminHypeComment(commentId: string, action: "hide" | "show" | "delete") {
  if (!mongoose.Types.ObjectId.isValid(commentId)) {
    throw new AppError(StatusCodes.NOT_FOUND, "NOT_FOUND", "Comment not found")
  }
  const comment = await HypeCommentModel.findById(commentId)
  if (!comment) throw new AppError(StatusCodes.NOT_FOUND, "NOT_FOUND", "Comment not found")
  const wasVisible = comment.status === "visible"
  if (action === "delete") {
    await comment.deleteOne()
    if (wasVisible) await HypeItemModel.updateOne({ _id: comment.pollId, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1 } })
  } else {
    const nextVisible = action === "show"
    if (nextVisible !== wasVisible) {
      comment.status = nextVisible ? "visible" : "hidden"
      await comment.save()
      await HypeItemModel.updateOne(
        { _id: comment.pollId, ...(nextVisible ? {} : { commentCount: { $gt: 0 } }) },
        { $inc: { commentCount: nextVisible ? 1 : -1 } },
      )
    }
  }
  invalidateFeed()
  return { ok: true }
}

export async function reactToHypeVideo(params: {
  videoId: string
  reaction: "like" | "dislike" | "none"
  customerId?: string
  deviceId?: string
}) {
  if (!mongoose.Types.ObjectId.isValid(params.videoId)) {
    throw new AppError(StatusCodes.NOT_FOUND, "VIDEO_NOT_FOUND", "Video not found")
  }
  const voterKey = voterKeyOf(params)
  if (!voterKey) {
    throw new AppError(StatusCodes.BAD_REQUEST, "VOTER_REQUIRED", "deviceId is required")
  }
  // Videos and events can be liked / disliked (same endpoint and table).
  const video = await HypeItemModel.findOne({ _id: params.videoId, kind: { $in: ["video", "event"] }, isPublished: true })
    .select({ _id: 1 })
    .lean()
  if (!video) throw new AppError(StatusCodes.NOT_FOUND, "VIDEO_NOT_FOUND", "Video not found")

  const next = params.reaction === "none" ? null : params.reaction
  const existing = await HypeVideoReactionModel.findOne({ videoId: video._id, voterKey }).lean()
  const previous = (existing?.reaction as string | undefined) ?? null
  if (previous !== next) {
    if (next) {
      await HypeVideoReactionModel.updateOne(
        { videoId: video._id, voterKey },
        { $set: { reaction: next } },
        { upsert: true },
      )
    } else {
      await HypeVideoReactionModel.deleteOne({ videoId: video._id, voterKey })
    }
    const delta = reactionDelta(previous, next)
    await HypeItemModel.updateOne({ _id: video._id }, { $inc: delta })
    // Counters can't go negative even under a race.
    await HypeItemModel.updateOne(
      { _id: video._id, $or: [{ likeCount: { $lt: 0 } }, { dislikeCount: { $lt: 0 } }] },
      { $max: { likeCount: 0, dislikeCount: 0 } },
    )
    invalidateFeed()
  }
  const fresh = await HypeItemModel.findById(video._id).select({ likeCount: 1, dislikeCount: 1 }).lean()
  return {
    videoId: String(video._id),
    reaction: next,
    likeCount: fresh?.likeCount ?? 0,
    dislikeCount: fresh?.dislikeCount ?? 0,
  }
}

export async function recordHypeVideoView(videoId: string) {
  if (!mongoose.Types.ObjectId.isValid(videoId)) return { ok: false }
  await HypeItemModel.updateOne({ _id: videoId, kind: "video" }, { $inc: { viewCount: 1 } })
  return { ok: true }
}

// ── Admin ──

export type HypeItemInput = {
  kind: "drop" | "event" | "video" | "poll"
  title: string
  description?: string
  imageUrl?: string
  restaurantId?: string | null
  menuItemId?: string | null
  ctaLabel?: string
  ctaPath?: string
  externalUrl?: string
  startsAt?: string | null
  endsAt?: string | null
  limitLabel?: string
  stockTotal?: number
  isPinned?: boolean
  location?: string
  youtubeUrl?: string
  category?: string
  durationLabel?: string
  isPublished?: boolean
  position?: number
  pollOptions?: Array<{ id?: string; label?: string }>
  allowComments?: boolean
}

// Only http(s) links; a bare domain ("facebook.com/x") gets https:// added.
function normalizeExternalUrl(value?: string) {
  const raw = value?.trim() ?? ""
  if (!raw) return ""
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("bad")
    return parsed.toString()
  } catch {
    throw new AppError(StatusCodes.BAD_REQUEST, "BAD_URL", "Website link is not valid")
  }
}

function normalizeInput(input: HypeItemInput, existingOptions: Array<{ id: string; voteCount?: number }> = []) {
  const toDate = (value?: string | null) => (value ? new Date(value) : null)
  const startsAt = toDate(input.startsAt)
  const endsAt = toDate(input.endsAt)
  if (input.kind === "drop" && !endsAt) {
    throw new AppError(StatusCodes.BAD_REQUEST, "END_REQUIRED", "A drop needs an end time")
  }
  if (input.kind === "event" && !startsAt) {
    throw new AppError(StatusCodes.BAD_REQUEST, "START_REQUIRED", "An event needs a start time")
  }
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw new AppError(StatusCodes.BAD_REQUEST, "BAD_RANGE", "End time must be after start time")
  }
  let youtubeId = ""
  if (input.kind === "video") {
    youtubeId = parseYoutubeId(input.youtubeUrl ?? "")
    if (!youtubeId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "BAD_YOUTUBE", "Paste a valid YouTube link")
    }
  }
  const hasImage = Boolean(input.imageUrl?.trim())
  if (!(input.title ?? "").trim() && !(input.kind === "poll" && hasImage)) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "TITLE_REQUIRED",
      input.kind === "poll" ? "Add a question or an image" : "Add a title",
    )
  }
  const pollOptions = input.kind === "poll" ? sanitizePollOptions(input.pollOptions, existingOptions) : []
  if (input.kind === "poll" && pollOptions.length < 2) {
    throw new AppError(StatusCodes.BAD_REQUEST, "POLL_OPTIONS", "A poll needs at least 2 different options")
  }
  const restaurantId =
    input.restaurantId && mongoose.Types.ObjectId.isValid(input.restaurantId) ? input.restaurantId : null
  return {
    kind: input.kind,
    title: (input.title ?? "").trim(),
    description: input.description?.trim() ?? "",
    imageUrl: input.imageUrl?.trim() ?? "",
    restaurantId,
    // A dish only makes sense together with its restaurant.
    menuItemId:
      restaurantId && input.menuItemId && mongoose.Types.ObjectId.isValid(input.menuItemId) ? input.menuItemId : null,
    ctaLabel: input.ctaLabel?.trim() ?? "",
    ctaPath: input.ctaPath?.trim() ?? "",
    externalUrl: normalizeExternalUrl(input.externalUrl),
    startsAt,
    endsAt,
    limitLabel: input.limitLabel?.trim() ?? "",
    stockTotal: input.kind === "drop" && Number.isFinite(input.stockTotal) ? Math.max(0, Math.round(Number(input.stockTotal))) : 0,
    isPinned: input.isPinned === true,
    location: input.location?.trim() ?? "",
    youtubeId,
    category: input.category ?? "food",
    durationLabel: input.durationLabel?.trim() ?? "",
    isPublished: input.isPublished !== false,
    position: Number.isFinite(input.position) ? Number(input.position) : 0,
    ...(input.kind === "poll"
      ? {
          pollOptions,
          voteCount: pollOptions.reduce((sum, option) => sum + (option.voteCount ?? 0), 0),
          allowComments: input.allowComments === true,
        }
      : {}),
  }
}

function toAdmin(item: LeanItem) {
  return {
    ...toPublic(item),
    dislikeCount: item.dislikeCount ?? 0,
    impressionCount: item.impressionCount ?? 0,
    openCount: item.openCount ?? 0,
    ctaCount: item.ctaCount ?? 0,
    orderCount: item.orderCount ?? 0,
    websiteCount: item.websiteCount ?? 0,
    remindCount: item.remindCount ?? 0,
    voteCount: item.voteCount ?? 0,
    pollOptions: ((item.pollOptions ?? []) as Array<{ id: string; label: string; voteCount?: number }>).map(
      (option) => ({ id: option.id, label: option.label, voteCount: option.voteCount ?? 0 }),
    ),
    isPublished: item.isPublished !== false,
    position: item.position ?? 0,
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
  }
}

export async function listAdminHypeItems(kind?: string) {
  const filter = kind ? { kind } : {}
  const items = await HypeItemModel.find(filter).sort({ position: 1, createdAt: -1 }).limit(300).lean()
  const restaurantIds = [
    ...new Set(items.map((item) => item.restaurantId?.toString()).filter(Boolean) as string[]),
  ]
  const restaurants = restaurantIds.length
    ? await RestaurantModel.find({ _id: { $in: restaurantIds } }).select({ name: 1 }).lean()
    : []
  const nameById = new Map(restaurants.map((r: any) => [String(r._id), r.name as string]))
  return items.map((item) =>
    toAdmin({ ...item, restaurantName: item.restaurantId ? nameById.get(String(item.restaurantId)) ?? "" : "" }),
  )
}

export async function createAdminHypeItem(input: HypeItemInput) {
  const created = await HypeItemModel.create(normalizeInput(input))
  invalidateFeed()
  return toAdmin(created.toObject())
}

export async function updateAdminHypeItem(id: string, input: HypeItemInput) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(StatusCodes.NOT_FOUND, "NOT_FOUND", "Item not found")
  }
  const existing = await HypeItemModel.findById(id).select({ pollOptions: 1 }).lean()
  const updated = await HypeItemModel.findByIdAndUpdate(
    id,
    { $set: normalizeInput(input, (existing?.pollOptions ?? []) as Array<{ id: string; voteCount?: number }>) },
    { new: true },
  ).lean()
  if (!updated) throw new AppError(StatusCodes.NOT_FOUND, "NOT_FOUND", "Item not found")
  invalidateFeed()
  return toAdmin(updated)
}

export async function deleteAdminHypeItem(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) return { deleted: false }
  await HypeItemModel.deleteOne({ _id: id })
  await HypeVideoReactionModel.deleteMany({ videoId: id })
  await HypePollVoteModel.deleteMany({ pollId: id })
  await HypeCommentModel.deleteMany({ pollId: id })
  invalidateFeed()
  return { deleted: true }
}

// ── Section order of the "For you" feed (admin) ──
let sectionOrderCache: { value: string[]; at: number } | null = null

/** Valid, de-duplicated order; sections missing from the saved list are appended (new ones show). */
export function normaliseSectionOrder(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map(String) : []
  const known = new Set<string>(HYPE_SECTIONS)
  const ordered = list.filter((key, index) => known.has(key) && list.indexOf(key) === index)
  HYPE_SECTIONS.forEach((key, defaultIndex) => {
    if (!ordered.includes(key)) ordered.splice(Math.min(defaultIndex, ordered.length), 0, key)
  })
  return ordered
}

export async function getHypeSectionOrder(): Promise<string[]> {
  if (sectionOrderCache && Date.now() - sectionOrderCache.at < 30_000) return sectionOrderCache.value
  try {
    const doc = await HypeSettingsModel.findOne({ key: "default" }).lean()
    const value = normaliseSectionOrder(doc?.sectionOrder)
    sectionOrderCache = { value, at: Date.now() }
    return value
  } catch {
    return [...HYPE_SECTIONS]
  }
}

export async function saveHypeSectionOrder(order: string[]) {
  const value = normaliseSectionOrder(order)
  await HypeSettingsModel.updateOne({ key: "default" }, { $set: { sectionOrder: value } }, { upsert: true })
  sectionOrderCache = null
  invalidateFeed()
  return { sectionOrder: value }
}

// ── Video categories (admin) ──
export const DEFAULT_VIDEO_CATEGORIES = [
  { id: "food", label: "Food" },
  { id: "funny", label: "Funny" },
  { id: "local", label: "Netrakona" },
  { id: "other", label: "More" },
]
let videoCategoryCache: { value: Array<{ id: string; label: string }>; at: number } | null = null

export function normaliseVideoCategories(raw: unknown) {
  const list = Array.isArray(raw) ? raw : []
  const seen = new Set<string>()
  const out: Array<{ id: string; label: string }> = []
  for (const entry of list) {
    const label = String((entry as { label?: unknown })?.label ?? "").trim().slice(0, 30)
    let id = String((entry as { id?: unknown })?.id ?? "").trim().toLowerCase()
    if (!id) id = label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "")
    id = id.slice(0, 30)
    if (!label || !id || seen.has(id)) continue
    seen.add(id)
    out.push({ id, label })
  }
  return out.length ? out.slice(0, 20) : DEFAULT_VIDEO_CATEGORIES
}

export async function getHypeVideoCategories() {
  if (videoCategoryCache && Date.now() - videoCategoryCache.at < 30_000) return videoCategoryCache.value
  try {
    const doc = await HypeSettingsModel.findOne({ key: "default" }).lean()
    const value = normaliseVideoCategories(doc?.videoCategories)
    videoCategoryCache = { value, at: Date.now() }
    return value
  } catch {
    return DEFAULT_VIDEO_CATEGORIES
  }
}

export async function saveHypeVideoCategories(categories: Array<{ id?: string; label: string }>) {
  const value = normaliseVideoCategories(categories)
  await HypeSettingsModel.updateOne({ key: "default" }, { $set: { videoCategories: value } }, { upsert: true })
  videoCategoryCache = null
  invalidateFeed()
  return { videoCategories: value }
}

/** Newest publish time among items currently visible in the feed (drives the Hype tab dot). */
function latestContentAt(items: LeanItem[], now: number) {
  let latest = 0
  for (const item of items) {
    const visible =
      item.kind === "video" ? Boolean(item.youtubeId)
      : item.kind === "drop" ? isDropVisible(item, now)
      : item.kind === "event" ? isEventVisible(item, now)
      : item.kind === "poll" ? isPollOpen(item, now)
      : false
    if (!visible) continue
    const at = new Date(item.createdAt ?? 0).getTime()
    if (Number.isFinite(at) && at > latest && at <= now) latest = at
  }
  return latest ? new Date(latest).toISOString() : null
}

/** Light check for the bottom-tab dot: only the newest publish time. */
export async function getHypeLatest() {
  const items = await loadPublishedItems()
  return { latestAt: latestContentAt(items, Date.now()) }
}

/** Paged videos for the Videos tab / watch screen (infinite scroll), optionally one category. */
export async function listHypeVideos(params: { category?: string; page: number; pageSize: number }) {
  const items = await loadPublishedItems()
  const videos = items
    .filter((item) => item.kind === "video" && item.youtubeId)
    .filter((item) => !params.category || params.category === "all" || item.category === params.category)
    .sort((a, b) => {
      if ((a.position ?? 0) !== (b.position ?? 0)) return (a.position ?? 0) - (b.position ?? 0)
      return videoScore(b) - videoScore(a)
    })
  const start = (params.page - 1) * params.pageSize
  const pageItems = videos.slice(start, start + params.pageSize)
  return {
    items: pageItems.map(toPublic),
    page: params.page,
    total: videos.length,
    hasMore: start + pageItems.length < videos.length,
  }
}

/** One published video (the watch screen can open videos that aren't in the feed rail). */
export async function getHypeVideo(videoId: string) {
  const items = await loadPublishedItems()
  const video = items.find((item) => item.kind === "video" && item.youtubeId && String(item._id) === videoId)
  if (!video) throw new AppError(StatusCodes.NOT_FOUND, "VIDEO_NOT_FOUND", "Video not found")
  return toPublic(video)
}

/** Admin picker: a restaurant's live dishes (for "Order this" → that item). */
export async function listAdminRestaurantMenuItems(restaurantId: string) {
  if (!mongoose.Types.ObjectId.isValid(restaurantId)) return []
  const [items, categories] = await Promise.all([
    MenuItemModel.find({ restaurantId, isDeleted: { $ne: true }, status: { $ne: "deleted" } })
      .select({ name: 1, categoryId: 1, basePrice: 1, status: 1 })
      .sort({ name: 1 })
      .limit(500)
      .lean(),
    CategoryModel.find({ restaurantId, status: { $ne: "deleted" } }).select({ name: 1, displayOrder: 1 }).lean(),
  ])
  const categoryById = new Map(categories.map((category) => [String(category._id), category]))
  return items
    .map((item) => {
      const category = categoryById.get(String(item.categoryId))
      return {
        id: String(item._id),
        name: item.name,
        categoryName: category?.name ?? "",
        categoryOrder: category?.displayOrder ?? 0,
        price: item.basePrice ?? 0,
        archived: item.status === "archived",
      }
    })
    .sort((a, b) => a.categoryOrder - b.categoryOrder || a.categoryName.localeCompare(b.categoryName) || a.name.localeCompare(b.name))
}

// ── Event "Going" ──
export async function setHypeGoing(params: { itemId: string; going: boolean; customerId?: string; deviceId?: string }) {
  if (!mongoose.Types.ObjectId.isValid(params.itemId)) {
    throw new AppError(StatusCodes.NOT_FOUND, "EVENT_NOT_FOUND", "Event not found")
  }
  const voterKey = voterKeyOf(params)
  if (!voterKey) throw new AppError(StatusCodes.BAD_REQUEST, "VOTER_REQUIRED", "deviceId is required")
  const event = await HypeItemModel.findOne({ _id: params.itemId, kind: "event", isPublished: true }).select({ _id: 1 }).lean()
  if (!event) throw new AppError(StatusCodes.NOT_FOUND, "EVENT_NOT_FOUND", "Event not found")
  if (params.going) {
    const result = await HypeGoingModel.updateOne(
      { itemId: event._id, voterKey },
      { $setOnInsert: { itemId: event._id, voterKey } },
      { upsert: true },
    )
    if (result.upsertedCount) await HypeItemModel.updateOne({ _id: event._id }, { $inc: { goingCount: 1 } })
  } else {
    const result = await HypeGoingModel.deleteOne({ itemId: event._id, voterKey })
    if (result.deletedCount) {
      await HypeItemModel.updateOne({ _id: event._id, goingCount: { $gt: 0 } }, { $inc: { goingCount: -1 } })
    }
  }
  invalidateFeed()
  const fresh = await HypeItemModel.findById(event._id).select({ goingCount: 1 }).lean()
  return { itemId: String(event._id), going: params.going, goingCount: fresh?.goingCount ?? 0 }
}

// ── "This order came from that video / drop" ──
const ATTRIBUTION_WINDOW_MS = 3 * 60 * 60_000

/** App reports it after an order placed within 3h of tapping "Order this"; verified here. */
export async function attributeHypeOrder(params: { customerId: string; orderId: string; itemId: string }) {
  if (!mongoose.Types.ObjectId.isValid(params.orderId) || !mongoose.Types.ObjectId.isValid(params.itemId)) {
    return { attributed: false }
  }
  const [order, item] = await Promise.all([
    OrderModel.findById(params.orderId).select({ customerId: 1, restaurantId: 1, createdAt: 1 }).lean(),
    HypeItemModel.findById(params.itemId).select({ restaurantId: 1 }).lean(),
  ])
  if (!order || !item?.restaurantId) return { attributed: false }
  if (String(order.customerId) !== params.customerId) return { attributed: false }
  if (String(order.restaurantId) !== String(item.restaurantId)) return { attributed: false }
  const createdAt = new Date((order as { createdAt?: Date }).createdAt ?? 0).getTime()
  if (!createdAt || Date.now() - createdAt > ATTRIBUTION_WINDOW_MS) return { attributed: false }
  try {
    await HypeOrderAttributionModel.create({ orderId: order._id, itemId: item._id, customerId: params.customerId })
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return { attributed: false }
    throw error
  }
  await HypeItemModel.updateOne({ _id: item._id }, { $inc: { orderCount: 1 } })
  return { attributed: true }
}
