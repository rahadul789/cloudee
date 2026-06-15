import { Schema, model } from "mongoose"

const publicContentHistoryEntrySchema = new Schema(
  {
    updatedByAdminId: {
      type: String,
      default: null,
    },
    updatedByAdminName: {
      type: String,
      default: "",
    },
    updatedAt: {
      type: Date,
      required: true,
    },
    changedSections: {
      type: [String],
      default: [],
    },
    content: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  {
    _id: false,
  }
)

const publicContentSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    content: {
      type: Schema.Types.Mixed,
      required: true,
    },
    updatedByAdminId: {
      type: String,
      default: null,
    },
    updatedByAdminName: {
      type: String,
      default: "",
    },
    history: {
      type: [publicContentHistoryEntrySchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

export const PublicContentModel = model(
  "PublicContent",
  publicContentSchema
)
