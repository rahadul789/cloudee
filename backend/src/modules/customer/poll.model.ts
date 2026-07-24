import mongoose, { Schema } from "mongoose"

// A poll is a first-class record (like a push campaign): created, shown while "active",
// then "closed" (manually by an admin or automatically once endsAt passes). Only one poll
// is active at a time — creating a new one closes the previous. Old polls stay in the
// collection so their results/comments remain retrievable as history.
const pollOptionSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
  },
  { _id: false },
)

const pollSchema = new Schema(
  {
    question: { type: String, default: "", trim: true },
    imageUrl: { type: String, default: "", trim: true },
    imagePublicId: { type: String, default: "", trim: true },
    options: { type: [pollOptionSchema], default: [] },
    allowFeedback: { type: Boolean, default: false },
    feedbackPrompt: { type: String, default: "Tell us more (optional)", trim: true },
    showResultsToUser: { type: Boolean, default: false },
    thanksMessage: {
      type: String,
      default: "Thanks for sharing your opinion!",
      trim: true,
    },
    endsAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["active", "closed"],
      default: "active",
      index: true,
    },
    closedAt: { type: Date, default: null },
    createdByAdminId: { type: String, default: "", trim: true },
  },
  { timestamps: true },
)

export const PollModel = mongoose.model("Poll", pollSchema)

// One row per vote. `pollId` is the Poll _id (stringified). `voterKey` is the device id;
// the unique (pollId, voterKey) index enforces "one vote per device" per poll.
const pollVoteSchema = new Schema(
  {
    pollId: { type: String, required: true, trim: true, index: true },
    voterKey: { type: String, required: true, trim: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null },
    deviceId: { type: String, default: "", trim: true },
    optionId: { type: String, required: true, trim: true },
    feedback: { type: String, default: "", trim: true },
  },
  { timestamps: true },
)

pollVoteSchema.index({ pollId: 1, voterKey: 1 }, { unique: true })

export const PollVoteModel = mongoose.model("PollVote", pollVoteSchema)
