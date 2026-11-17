import { Schema, model } from "mongoose"

// Friend quiz ("তুমি আমাকে কতটা চেনো?"): a customer answers questions about themself, shares a
// link, friends play on the website (no app needed) and land on a leaderboard.

// Admin settings (single doc, key "default"). OFF until the admin turns it on.
const quizSettingsSchema = new Schema(
  {
    key: { type: String, default: "default", unique: true },
    enabled: { type: Boolean, default: false },
    /** Small "make your quiz" card on the delivered-order screen. */
    deliveredPrompt: { type: Boolean, default: false },
    questionCount: { type: Number, default: 10, min: 5, max: 15 },
    linkExpiryDays: { type: Number, default: 30, min: 1, max: 365 },
    /** "রাকিব তোমাকে ৭/১০ চেনে!" push to the quiz owner. */
    notifyOnPlay: { type: Boolean, default: true },
    /** Customers may suggest questions (admin approves). */
    submissionsEnabled: { type: Boolean, default: false },
    /** "✍️ প্রশ্ন: রাকিব" under customer-made questions. */
    showAuthorName: { type: Boolean, default: true },
    /** Coins when a suggestion is approved (0 = none). */
    approveRewardCoins: { type: Number, default: 0, min: 0, max: 500 },
    /** After N approved suggestions the next ones go live without review (admin can still remove). */
    trustedAutoApprove: { type: Boolean, default: false },
    trustedThreshold: { type: Number, default: 3, min: 1, max: 50 },
    /** Admin-edited texts (share message, link preview, web page, reactions, push…). Empty = defaults. */
    copy: { type: Schema.Types.Mixed, default: undefined },
    /** Result titles: [{ key, minPercent, emoji, labels[] }] — several variants per tier. */
    tiers: { type: Schema.Types.Mixed, default: undefined },
    /** Starter questions were inserted once (never re-seed after the admin deletes them). */
    seeded: { type: Boolean, default: false },
  },
  { timestamps: true },
)

const optionSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true, maxlength: 80 },
  },
  { _id: false },
)

// Question bank (admin-managed).
const quizQuestionSchema = new Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 140 },
    options: { type: [optionSchema], default: [] },
    category: { type: String, default: "fun", trim: true, maxlength: 30 },
    isActive: { type: Boolean, default: true, index: true },
    position: { type: Number, default: 0 },
    /** Customer-suggested questions keep their author (credit line + stats). */
    source: { type: String, enum: ["admin", "customer"], default: "admin" },
    authorCustomerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null },
    authorName: { type: String, default: "", trim: true, maxlength: 24 },
    /** How many quizzes picked it (helps the admin see what people like). */
    useCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
)

// One quiz a customer made. Questions are snapshotted so later bank edits don't change it.
const friendQuizSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    ownerName: { type: String, required: true, trim: true, maxlength: 24 },
    questions: {
      type: [
        new Schema(
          {
            questionId: { type: Schema.Types.ObjectId, ref: "QuizQuestion", required: true },
            text: { type: String, required: true },
            options: { type: [optionSchema], default: [] },
            answerId: { type: String, required: true },
            authorName: { type: String, default: "" },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    status: { type: String, enum: ["active", "closed"], default: "active", index: true },
    expiresAt: { type: Date, required: true },
    viewCount: { type: Number, default: 0, min: 0 },
    playCount: { type: Number, default: 0, min: 0 },
    /** Friends who tapped "make your own" after playing. */
    makeOwnClicks: { type: Number, default: 0, min: 0 },
    lastPushAt: { type: Date, default: null },
  },
  { timestamps: true },
)
friendQuizSchema.index({ customerId: 1, status: 1, createdAt: -1 })
friendQuizSchema.index({ createdAt: -1 })

// A friend's play. playerKey = random id from a website cookie (one play per browser).
const quizPlaySchema = new Schema(
  {
    quizId: { type: Schema.Types.ObjectId, ref: "FriendQuiz", required: true },
    playerKey: { type: String, required: true, trim: true, maxlength: 80 },
    playerName: { type: String, required: true, trim: true, maxlength: 24 },
    answers: { type: [String], default: [] },
    score: { type: Number, default: 0, min: 0 },
    completed: { type: Boolean, default: false, index: true },
    completedAt: { type: Date, default: null },
    hidden: { type: Boolean, default: false },
  },
  { timestamps: true },
)
quizPlaySchema.index({ quizId: 1, playerKey: 1 }, { unique: true })
quizPlaySchema.index({ quizId: 1, completed: 1, score: -1, completedAt: 1 })
quizPlaySchema.index({ createdAt: -1 })

// A question a customer suggested. Lives here until the admin approves (→ QuizQuestion) or rejects.
const quizSubmissionSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    authorName: { type: String, required: true, trim: true, maxlength: 24 },
    text: { type: String, required: true, trim: true, maxlength: 140 },
    options: { type: [String], default: [] },
    category: { type: String, default: "fun", trim: true, maxlength: 30 },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    rejectReason: { type: String, default: "", trim: true, maxlength: 160 },
    autoApproved: { type: Boolean, default: false },
    questionId: { type: Schema.Types.ObjectId, ref: "QuizQuestion", default: null },
    rewardCoins: { type: Number, default: 0 },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: String, default: "" },
  },
  { timestamps: true },
)
quizSubmissionSchema.index({ status: 1, createdAt: -1 })
quizSubmissionSchema.index({ customerId: 1, createdAt: -1 })

export const QuizSubmissionModel = model("QuizSubmission", quizSubmissionSchema)
export const QuizSettingsModel = model("QuizSettings", quizSettingsSchema)
export const QuizQuestionModel = model("QuizQuestion", quizQuestionSchema)
export const FriendQuizModel = model("FriendQuiz", friendQuizSchema)
export const QuizPlayModel = model("QuizPlay", quizPlaySchema)
