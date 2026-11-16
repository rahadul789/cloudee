import { Schema, model, type InferSchemaType } from "mongoose"

// "Hype" tab content, curated by admins only (no user posts → no moderation burden).
//   drop  — a time-boxed flash deal with a countdown (startsAt → endsAt)
//   event — something happening in town (match night, café opening…) with a start time
//   video — a YouTube video played in-app (food / funny / local), optionally tied to a restaurant
//   poll  — a question with admin-made options; one vote per voter, optional comments
export const HYPE_KINDS = ["drop", "event", "video", "poll"] as const
// Engagement counters per item (admin analytics). impression = shown in the feed.
export const HYPE_EVENT_TYPES = ["impression", "open", "cta", "website", "remind"] as const
export const HYPE_VIDEO_CATEGORIES = ["food", "funny", "local", "other"] as const

const hypeItemSchema = new Schema(
  {
    kind: { type: String, enum: HYPE_KINDS, required: true, index: true },
    // Required for everything except an image poll (picture + options, no question).
    title: { type: String, default: "", trim: true, maxlength: 120 },
    description: { type: String, default: "", trim: true, maxlength: 400 },
    imageUrl: { type: String, default: "", trim: true },
    // Where "Grab the deal" / "Order this" goes: a restaurant, or any in-app path.
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", default: null },
    // Optional dish: "Order this" opens the restaurant straight on this item (customize → cart).
    menuItemId: { type: Schema.Types.ObjectId, ref: "MenuItem", default: null },
    ctaLabel: { type: String, default: "", trim: true, maxlength: 40 },
    ctaPath: { type: String, default: "", trim: true, maxlength: 300 },
    // Optional outside link (Facebook event, ticket site, news page…) → "Visit website" button.
    externalUrl: { type: String, default: "", trim: true, maxlength: 500 },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    // drop: optional real stock — app shows "X grabbed · Y left" (grabbed = button taps).
    stockTotal: { type: Number, default: 0, min: 0 },
    // event: "I'm going" count.
    goingCount: { type: Number, default: 0, min: 0 },
    // Pinned to the very top of "For you" (admin "Featured").
    isPinned: { type: Boolean, default: false },
    // Orders placed after "Order this" on this item (attributed by the app, verified server-side).
    orderCount: { type: Number, default: 0, min: 0 },
    // drop: short scarcity line ("Only 50 orders") — display only.
    limitLabel: { type: String, default: "", trim: true, maxlength: 60 },
    // event: where it happens.
    location: { type: String, default: "", trim: true, maxlength: 120 },
    // video
    youtubeId: { type: String, default: "", trim: true, maxlength: 20 },
    // Video category id — admin-managed list (HypeSettings.videoCategories); the 4 built-ins are the defaults.
    category: { type: String, default: "food", trim: true, maxlength: 30 },
    durationLabel: { type: String, default: "", trim: true, maxlength: 12 },
    likeCount: { type: Number, default: 0, min: 0 },
    dislikeCount: { type: Number, default: 0, min: 0 },
    viewCount: { type: Number, default: 0, min: 0 },
    // analytics
    impressionCount: { type: Number, default: 0, min: 0 },
    openCount: { type: Number, default: 0, min: 0 },
    ctaCount: { type: Number, default: 0, min: 0 },
    websiteCount: { type: Number, default: 0, min: 0 },
    remindCount: { type: Number, default: 0, min: 0 },
    // poll
    pollOptions: {
      type: [
        new Schema(
          {
            id: { type: String, required: true, trim: true },
            label: { type: String, required: true, trim: true, maxlength: 80 },
            voteCount: { type: Number, default: 0, min: 0 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    voteCount: { type: Number, default: 0, min: 0 },
    allowComments: { type: Boolean, default: false },
    commentCount: { type: Number, default: 0, min: 0 },
    isPublished: { type: Boolean, default: true, index: true },
    position: { type: Number, default: 0 },
  },
  { timestamps: true },
)

hypeItemSchema.index({ kind: 1, isPublished: 1, position: 1 })

// One reaction per video per voter (customer id when signed in, else the device id).
const hypeVideoReactionSchema = new Schema(
  {
    videoId: { type: Schema.Types.ObjectId, ref: "HypeItem", required: true },
    voterKey: { type: String, required: true, trim: true },
    reaction: { type: String, enum: ["like", "dislike"], required: true },
  },
  { timestamps: true },
)

hypeVideoReactionSchema.index({ videoId: 1, voterKey: 1 }, { unique: true })
hypeVideoReactionSchema.index({ voterKey: 1 })

// One vote per poll per voter (customer id when signed in, else the device id). Final.
const hypePollVoteSchema = new Schema(
  {
    pollId: { type: Schema.Types.ObjectId, ref: "HypeItem", required: true },
    voterKey: { type: String, required: true, trim: true },
    optionId: { type: String, required: true, trim: true },
  },
  { timestamps: true },
)
hypePollVoteSchema.index({ pollId: 1, voterKey: 1 }, { unique: true })
hypePollVoteSchema.index({ voterKey: 1 })

// Poll comments: signed-in customers only, admin can hide or delete.
const hypeCommentSchema = new Schema(
  {
    pollId: { type: Schema.Types.ObjectId, ref: "HypeItem", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    authorName: { type: String, default: "", trim: true, maxlength: 40 },
    text: { type: String, required: true, trim: true, maxlength: 300 },
    status: { type: String, enum: ["visible", "hidden"], default: "visible", index: true },
  },
  { timestamps: true },
)
hypeCommentSchema.index({ pollId: 1, status: 1, createdAt: -1 })

// Admin layout of the Hype tab ("For you"): which section comes first. Single doc, key "default".
export const HYPE_SECTIONS = ["featured", "quiz", "stamps", "videos", "drops", "polls", "events"] as const
const hypeSettingsSchema = new Schema(
  {
    key: { type: String, default: "default", unique: true },
    sectionOrder: { type: [String], default: [...HYPE_SECTIONS] },
    /** Video categories (chips in the app). Admin can add / rename / remove. */
    videoCategories: {
      type: [
        new Schema(
          {
            id: { type: String, required: true, trim: true, maxlength: 30 },
            label: { type: String, required: true, trim: true, maxlength: 30 },
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },
  },
  { timestamps: true },
)

export const HypeSettingsModel = model("HypeSettings", hypeSettingsSchema)

// "Going" on an event — one per voter (customer id or device id).
const hypeGoingSchema = new Schema(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "HypeItem", required: true },
    voterKey: { type: String, required: true, trim: true },
  },
  { timestamps: true },
)
hypeGoingSchema.index({ itemId: 1, voterKey: 1 }, { unique: true })
hypeGoingSchema.index({ voterKey: 1 })
export const HypeGoingModel = model("HypeGoing", hypeGoingSchema)

// One attribution per order: "this order came from that video / drop".
const hypeOrderAttributionSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, unique: true },
    itemId: { type: Schema.Types.ObjectId, ref: "HypeItem", required: true, index: true },
    customerId: { type: String, required: true },
  },
  { timestamps: true },
)
export const HypeOrderAttributionModel = model("HypeOrderAttribution", hypeOrderAttributionSchema)
export type HypeItem = InferSchemaType<typeof hypeItemSchema>
export const HypeItemModel = model("HypeItem", hypeItemSchema)
export const HypeVideoReactionModel = model("HypeVideoReaction", hypeVideoReactionSchema)
export const HypePollVoteModel = model("HypePollVote", hypePollVoteSchema)
export const HypeCommentModel = model("HypeComment", hypeCommentSchema)
