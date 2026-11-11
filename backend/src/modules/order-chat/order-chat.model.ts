import mongoose, { Schema } from "mongoose"

// One message in the rider ↔ customer chat of a single order. Kept in its own collection
// (not embedded on the order) so the hot order document never grows with chat traffic.
const orderChatMessageSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    customerId: { type: String, required: true, trim: true },
    // Rider at the time the message was sent (orders can be reassigned).
    riderId: { type: String, required: true, trim: true },
    senderRole: { type: String, enum: ["customer", "rider"], required: true },
    senderId: { type: String, required: true, trim: true },
    text: { type: String, required: true, trim: true, maxlength: 500 },
    // Client-generated id so a retried send never duplicates the message.
    clientMessageId: { type: String, default: "", trim: true },
    // When the OTHER party read it (null = unread).
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
)

orderChatMessageSchema.index({ orderId: 1, createdAt: 1 })
orderChatMessageSchema.index(
  { orderId: 1, senderId: 1, clientMessageId: 1 },
  { unique: true, partialFilterExpression: { clientMessageId: { $gt: "" } } },
)

export const OrderChatMessageModel = mongoose.model(
  "OrderChatMessage",
  orderChatMessageSchema,
)
