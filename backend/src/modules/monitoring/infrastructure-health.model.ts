import mongoose, { Schema } from "mongoose";

const infrastructureHealthSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    status: {
      type: String,
      enum: ["healthy", "warning", "critical", "unknown"],
      default: "unknown",
      index: true,
    },
    checkedAt: { type: Date, default: Date.now, index: true },
    components: { type: Schema.Types.Mixed, default: [] },
  },
  { timestamps: true, versionKey: false },
);

export const InfrastructureHealthModel = mongoose.model(
  "InfrastructureHealth",
  infrastructureHealthSchema,
);
