import { Schema, model, type InferSchemaType } from "mongoose"

// "Notify me when Foodbela opens" — one pending request per customer. The worker sends a
// push at `notifyAt` (the area's reopen time) and marks it sent. Sent/cancelled rows stay
// for the admin demand stats (that's the point of step 1: measure pre-order demand).
const openNotifyRequestSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    zoneId: { type: String, default: "", trim: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    notifyAt: { type: Date, required: true },
    opensAtLabel: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["pending", "sent", "cancelled", "failed"],
      default: "pending",
      index: true,
    },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true },
)

openNotifyRequestSchema.index({ status: 1, notifyAt: 1 })
openNotifyRequestSchema.index({ createdAt: -1 })

export type OpenNotifyRequest = InferSchemaType<typeof openNotifyRequestSchema>
export const OpenNotifyRequestModel = model("OpenNotifyRequest", openNotifyRequestSchema)
