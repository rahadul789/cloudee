import mongoose, { Schema } from "mongoose";

const restaurantAvailabilitySessionSchema = new Schema(
  {
    restaurantId: { type: String, required: true, index: true },
    ownerId: { type: String, default: "", index: true },
    startedAt: { type: Date, required: true, default: Date.now, index: true },
    endedAt: { type: Date, default: null, index: true },
    durationSeconds: { type: Number, default: 0 },
    startSource: {
      type: String,
      enum: ["owner_app", "owner_web", "admin", "system", "unknown"],
      default: "unknown",
      index: true,
    },
    endSource: {
      type: String,
      enum: ["owner_app", "owner_web", "admin", "system", "unknown", ""],
      default: "",
      index: true,
    },
    endReason: {
      type: String,
      enum: [
        "manual_offline",
        "admin_offline",
        "enforcement",
        "restaurant_hidden",
        "replaced",
        "system",
        "",
      ],
      default: "",
      index: true,
    },
    activeOrderCountAtStart: { type: Number, default: 0 },
    activeOrderCountAtEnd: { type: Number, default: 0 },
    activeOrderNumbersAtEnd: { type: [String], default: [] },
    startedByOwnerId: { type: String, default: "" },
    endedByOwnerId: { type: String, default: "" },
    endedByAdminId: { type: String, default: "" },
  },
  { timestamps: true },
);

restaurantAvailabilitySessionSchema.index({ restaurantId: 1, startedAt: -1 });
restaurantAvailabilitySessionSchema.index({ restaurantId: 1, endedAt: -1 });
restaurantAvailabilitySessionSchema.index(
  { restaurantId: 1, endedAt: 1 },
  {
    unique: true,
    partialFilterExpression: { endedAt: null },
  },
);

export const RestaurantAvailabilitySessionModel = mongoose.model(
  "RestaurantAvailabilitySession",
  restaurantAvailabilitySessionSchema,
);
