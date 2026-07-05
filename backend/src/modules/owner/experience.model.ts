import mongoose, { Schema } from "mongoose"

const reviewReplySchema = new Schema(
  {
    message: { type: String, default: "" },
    createdAt: { type: Date, default: null },
    updatedAt: { type: Date, default: null }
  },
  { _id: false }
)

const reviewSchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    customerId: { type: String, default: "" },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: "" },
    riderId: { type: String, default: "" },
    riderRating: { type: Number, min: 1, max: 5, default: null },
    riderComment: { type: String, default: "" },
    ownerReply: { type: reviewReplySchema, default: () => ({}) },
    moderationStatus: {
      type: String,
      enum: ["visible", "hidden", "flagged"],
      default: "visible"
    },
    isHidden: { type: Boolean, default: false },
    hiddenAt: { type: Date, default: null },
    hiddenByAdminId: { type: String, default: "" },
    hiddenReason: { type: String, default: "" },
    flaggedAt: { type: Date, default: null },
    flaggedByAdminId: { type: String, default: "" },
    flaggedReason: { type: String, default: "" },
    moderationHistory: {
      type: [
        {
          action: { type: String, required: true },
          reason: { type: String, default: "" },
          adminId: { type: String, default: "" },
          createdAt: { type: Date, default: Date.now }
        }
      ],
      default: []
    }
  },
  { timestamps: true }
)

reviewSchema.index({ restaurantId: 1, createdAt: -1 })
reviewSchema.index({ restaurantId: 1, moderationStatus: 1, isHidden: 1, createdAt: -1 })
reviewSchema.index({ moderationStatus: 1, isHidden: 1, createdAt: -1 })
reviewSchema.index({ customerId: 1, createdAt: -1 })
// One review per order. Partial so it only constrains real order-linked reviews —
// reviews with a null orderId (non-order sources) are exempt and can coexist. This is
// the DB-level guard behind createCustomerReview's find-then-create duplicate check.
reviewSchema.index(
  { orderId: 1 },
  { unique: true, partialFilterExpression: { orderId: { $type: "objectId" } } }
)

const supportCaseSchema = new Schema(
  {
    source: { type: String, enum: ["owner", "customer", "rider", "admin"], default: "owner" },
    ownerId: { type: Schema.Types.ObjectId, ref: "Owner", default: null },
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", default: null },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null },
    riderId: { type: Schema.Types.ObjectId, ref: "Rider", default: null },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    customerSnapshot: {
      fullName: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" }
    },
    requesterSnapshot: {
      fullName: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
      role: { type: String, default: "" }
    },
    kind: { type: String, enum: ["report", "question"], default: "report" },
    subject: { type: String, required: true, trim: true },
    categoryId: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open"
    },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    assignedAdminId: { type: String, default: "" },
    assignedAdminName: { type: String, default: "" },
    slaDueAt: { type: Date, default: null },
    firstResponseAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    resolutionNote: { type: String, default: "" },
    tags: { type: [String], default: [] },
    internalNotes: {
      type: [
        {
          note: { type: String, default: "" },
          adminId: { type: String, default: "" },
          adminName: { type: String, default: "Admin" },
          createdAt: { type: Date, default: Date.now }
        }
      ],
      default: []
    },
    history: {
      type: [
        {
          action: { type: String, default: "" },
          actorId: { type: String, default: "" },
          actorName: { type: String, default: "" },
          note: { type: String, default: "" },
          previousValue: { type: String, default: "" },
          nextValue: { type: String, default: "" },
          createdAt: { type: Date, default: Date.now }
        }
      ],
      default: []
    },
    attachments: [
      {
        url: { type: String, default: "" },
        publicId: { type: String, default: "" },
        fileName: { type: String, default: "" },
        fileType: { type: String, default: "" }
      }
    ],
    replies: [
      {
        message: { type: String, default: "" },
        senderType: { type: String, enum: ["admin", "customer"], default: "admin" },
        senderId: { type: String, default: "" },
        senderName: { type: String, default: "" },
        attachments: [
          {
            url: { type: String, default: "" },
            publicId: { type: String, default: "" },
            fileName: { type: String, default: "" },
            fileType: { type: String, default: "" }
          }
        ],
        createdAt: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
)

supportCaseSchema.index({ ownerId: 1, createdAt: -1 })
supportCaseSchema.index({ source: 1, status: 1, priority: 1, createdAt: -1 })
supportCaseSchema.index({ assignedAdminId: 1, status: 1, createdAt: -1 })
supportCaseSchema.index({ slaDueAt: 1, status: 1 })
supportCaseSchema.index({ customerId: 1, createdAt: -1 })
supportCaseSchema.index({ riderId: 1, createdAt: -1 })
supportCaseSchema.index({ orderId: 1, createdAt: -1 })

export const ReviewModel = mongoose.model("Review", reviewSchema)
export const SupportCaseModel = mongoose.model("SupportCase", supportCaseSchema)
