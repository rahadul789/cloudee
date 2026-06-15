import mongoose, { Schema } from "mongoose"

const mediaAssetSchema = new Schema(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, required: true, trim: true, unique: true },
    folder: { type: String, default: "", trim: true },
    resourceType: { type: String, default: "image", trim: true },
    context: { type: String, default: "admin_media", trim: true, index: true },
    uploadedByRole: { type: String, default: "", trim: true },
    uploadedById: { type: String, default: "", trim: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, versionKey: false },
)

mediaAssetSchema.index({ context: 1, deletedAt: 1, createdAt: -1 })

export const MediaAssetModel = mongoose.model("MediaAsset", mediaAssetSchema)
