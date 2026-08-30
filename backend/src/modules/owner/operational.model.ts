import mongoose, { Schema } from "mongoose"

const variantOptionSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    priceDelta: { type: Number, default: 0 }
  },
  { _id: false }
)

const variantGroupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    minSelect: { type: Number, default: 0 },
    maxSelect: { type: Number, default: 1 },
    options: { type: [variantOptionSchema], default: [] }
  },
  { _id: false }
)

const addOnOptionSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    price: { type: Number, default: 0 }
  },
  { _id: false }
)

const addOnGroupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    minSelect: { type: Number, default: 0 },
    maxSelect: { type: Number, default: 10 },
    options: { type: [addOnOptionSchema], default: [] }
  },
  { _id: false }
)

const categorySchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    status: { type: String, enum: ["active", "archived", "deleted"], default: "active" },
    displayOrder: { type: Number, default: 0 },
    // Soft-delete trash: a deleted category is hidden everywhere (status "deleted") but kept so
    // the owner (or admin) can restore it. `isDeleted` drives the partial unique indexes below
    // so a same-named category can be created again after deletion.
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: "" },
    statusBeforeDelete: { type: String, default: "" },
    adminModeration: {
      lastAction: { type: String, default: "" },
      reason: { type: String, default: "" },
      adminId: { type: String, default: "" },
      actedAt: { type: Date, default: null },
      notifyOwner: { type: Boolean, default: false }
    }
  },
  { timestamps: true }
)

categorySchema.index(
  { restaurantId: 1, name: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
)
categorySchema.index(
  { restaurantId: 1, slug: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
)
categorySchema.index({ restaurantId: 1, status: 1, displayOrder: 1 })

const menuItemSchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    images: {
      type: [
        new Schema(
          {
            url: { type: String, default: "" },
            publicId: { type: String, default: "" }
          },
          { _id: false }
        )
      ],
      default: []
    },
    status: { type: String, enum: ["active", "archived", "deleted"], default: "active" },
    availability: { type: String, enum: ["available", "unavailable"], default: "available" },
    kind: { type: String, enum: ["simple", "variant"], default: "simple" },
    basePrice: { type: Number, required: true, min: 0 },
    variants: { type: [variantGroupSchema], default: [] },
    addOnGroups: { type: [addOnGroupSchema], default: [] },
    recommendedItemIds: {
      type: [Schema.Types.ObjectId],
      ref: "MenuItem",
      default: []
    },
    isPopular: { type: Boolean, default: false },
    // Soft-delete trash (see categorySchema): a deleted item stays recoverable and `isDeleted`
    // keeps it out of the partial unique slug index so the name can be reused.
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: "" },
    statusBeforeDelete: { type: String, default: "" }
  },
  { timestamps: true }
)

menuItemSchema.index(
  { restaurantId: 1, slug: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
)
menuItemSchema.index({ restaurantId: 1, status: 1, availability: 1, isPopular: -1, createdAt: -1 })
menuItemSchema.index({ restaurantId: 1, categoryId: 1, status: 1, availability: 1 })
menuItemSchema.index({ restaurantId: 1, recommendedItemIds: 1 })

const menuApprovalPriceDiffSchema = new Schema(
  {
    path: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    oldPrice: { type: Number, default: null },
    newPrice: { type: Number, default: null },
    delta: { type: Number, default: 0 },
    percentDelta: { type: Number, default: null },
  },
  { _id: false },
)

const menuApprovalRequestSchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "Owner", required: true },
    menuItemId: { type: Schema.Types.ObjectId, ref: "MenuItem", default: null },
    type: {
      type: String,
      enum: ["new_item", "price_update"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled", "superseded"],
      default: "pending",
      index: true,
    },
    currentSnapshot: { type: Schema.Types.Mixed, default: {} },
    proposedSnapshot: { type: Schema.Types.Mixed, required: true },
    priceDiffs: { type: [menuApprovalPriceDiffSchema], default: [] },
    ownerNote: { type: String, default: "", trim: true },
    ownerReason: { type: String, default: "", trim: true },
    internalNote: { type: String, default: "", trim: true },
    allowResubmit: { type: Boolean, default: true },
    reviewedByAdminId: { type: String, default: "", trim: true },
    submittedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

menuApprovalRequestSchema.index({ status: 1, createdAt: -1 })
menuApprovalRequestSchema.index({ restaurantId: 1, status: 1, createdAt: -1 })
menuApprovalRequestSchema.index({ ownerId: 1, status: 1, createdAt: -1 })
menuApprovalRequestSchema.index({ menuItemId: 1, status: 1, createdAt: -1 })
menuApprovalRequestSchema.index({ "proposedSnapshot.slug": 1, restaurantId: 1, status: 1 })

const orderHistoryEntrySchema = new Schema(
  {
    status: { type: String, required: true },
    actor: { type: String, required: true },
    note: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
)

const orderItemSnapshotSchema = new Schema(
  {
    itemId: { type: String, required: true },
    categoryId: { type: String, required: true },
    itemName: { type: String, default: "" },
    name: { type: String, default: "" },
    itemSlug: { type: String, default: "" },
    categoryName: { type: String, default: "" },
    categorySlug: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    selectedVariantOptions: { type: [Schema.Types.Mixed], default: [] },
    selectedAddOnOptions: { type: [Schema.Types.Mixed], default: [] }
  },
  { _id: false }
)

// Flow 2 — off-platform (owner-initiated) delivery. The end customer is NOT a Foodbela app
// user; the owner got the order via their own channel and Foodbela only delivers. Money
// lifecycle: pending -> collected (COD cash / online paid) -> reconciled (deposited/settled)
// -> settled (owner paid). Invariant: collectAmount = deliveryFee + netToOwner.
const externalOrderSchema = new Schema(
  {
    customerName: { type: String, default: "", trim: true },
    customerPhone: { type: String, default: "", trim: true },
    drop: {
      address: { type: String, default: "" },
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    orderValue: { type: Number, min: 0, default: 0 },
    collectAmount: { type: Number, min: 0, default: 0 },
    paymentMode: { type: String, enum: ["cod", "online"], default: "cod" },
    deliveryFee: { type: Number, min: 0, default: 0 },
    netToOwner: { type: Number, default: 0 },
    collectedAt: { type: Date, default: null },
    reconciledAt: { type: Date, default: null },
    settlementId: { type: String, default: "" },
    settledAt: { type: Date, default: null },
    settlementStatus: {
      type: String,
      enum: ["pending", "collected", "reconciled", "settled", "held", "cancelled"],
      default: "pending",
    },
    createdByOwnerId: { type: String, default: "" },
  },
  { _id: false },
)

const orderSchema = new Schema(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    customerId: { type: String, default: "" },
    clientOrderId: { type: String, default: "" },
    // "external" = owner-initiated off-platform delivery; "customer_app" = normal in-app
    // order. All finance/analytics group on this so the two flows never mix.
    source: {
      type: String,
      enum: ["customer_app", "external"],
      default: "customer_app",
      index: true,
    },
    external: { type: externalOrderSchema, default: null },
    riderId: { type: String, default: "" },
    orderNumber: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: [
        "New",
        "Accepted",
        "Preparing",
        "ReadyForPickup",
        "PickedUp",
        "Delivered",
        "Rejected",
        "Cancelled"
      ],
      default: "New"
    },
    terminalReason: { type: String, default: "" },
    cancelledBy: { type: String, default: "" },
    rejectionReason: { type: String, default: "" },
    // Customer paid for urgent/priority delivery. Drives admin/owner/rider badges and
    // (later) dispatch prioritisation. Defaults false so every existing order is normal.
    isUrgent: { type: Boolean, default: false },
    note: { type: String, default: "", trim: true },
    paymentMethod: { type: String, default: "Cash" },
    paymentStatus: { type: String, default: "pending" },
    paymentSnapshot: { type: Schema.Types.Mixed, default: {} },
    pricing: { type: Schema.Types.Mixed, default: {} },
    customerSnapshot: { type: Schema.Types.Mixed, default: {} },
    serviceAreaSnapshot: { type: Schema.Types.Mixed, default: {} },
    riderSnapshot: { type: Schema.Types.Mixed, default: {} },
    riderTracking: { type: Schema.Types.Mixed, default: {} },
    dispatchMeta: { type: Schema.Types.Mixed, default: {} },
    preparationMeta: { type: Schema.Types.Mixed, default: {} },
    appliedVouchers: { type: [Schema.Types.Mixed], default: [] },
    itemsSnapshot: { type: [orderItemSnapshotSchema], default: [] },
    timestamps: { type: Schema.Types.Mixed, default: {} },
    // Tracks automated post-delivery review-request pushes:
    // { pushCount, lastPushAt, lastChannel }.
    reviewRequest: { type: Schema.Types.Mixed, default: {} },
    history: { type: [orderHistoryEntrySchema], default: [] }
  },
  { timestamps: true }
)

orderSchema.index({ restaurantId: 1, status: 1, createdAt: -1 })
orderSchema.index({ createdAt: -1 })
orderSchema.index({ updatedAt: -1, createdAt: -1 })
orderSchema.index({ status: 1, createdAt: -1 })
orderSchema.index({ status: 1, updatedAt: -1 })
orderSchema.index({ paymentMethod: 1, paymentStatus: 1, createdAt: -1 })
orderSchema.index({ customerId: 1, createdAt: -1 })
orderSchema.index({ customerId: 1, status: 1, createdAt: -1 })
orderSchema.index({ customerId: 1, status: 1, updatedAt: -1, createdAt: -1 })
orderSchema.index(
  { customerId: 1, clientOrderId: 1 },
  { unique: true, partialFilterExpression: { clientOrderId: { $type: "string", $ne: "" } } }
)
orderSchema.index({ riderId: 1, status: 1, createdAt: -1 })
orderSchema.index({ riderId: 1, status: 1, updatedAt: -1, createdAt: -1 })
orderSchema.index({ riderId: 1, status: 1, "timestamps.PickedUp": 1, createdAt: 1 })
orderSchema.index({ "serviceAreaSnapshot.zoneId": 1, status: 1, createdAt: -1 })
orderSchema.index({ "serviceAreaSnapshot.zoneSlug": 1, status: 1, createdAt: -1 })
orderSchema.index({ "serviceAreaSnapshot.districtId": 1, status: 1, createdAt: -1 })
orderSchema.index({ status: 1, "itemsSnapshot.categoryId": 1, createdAt: -1 })
orderSchema.index({ status: 1, "itemsSnapshot.itemId": 1, createdAt: -1 })
orderSchema.index({ status: 1, "timestamps.Delivered": -1 })
orderSchema.index({ restaurantId: 1, status: 1, "timestamps.Delivered": -1 })
orderSchema.index({ restaurantId: 1, status: 1, "timestamps.deliveredAt": -1 })
orderSchema.index({ restaurantId: 1, status: 1, "timestamps.Cancelled": -1 })
orderSchema.index({ restaurantId: 1, status: 1, "timestamps.cancelledAt": -1 })
orderSchema.index({ restaurantId: 1, status: 1, "timestamps.Rejected": -1 })
orderSchema.index({ restaurantId: 1, status: 1, "timestamps.rejectedAt": -1 })

const notificationSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "Owner", required: true },
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    type: {
      type: String,
      enum: ["order", "payout", "system", "promotion", "support", "review"],
      required: true
    },
    eventType: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    actionPath: { type: String, default: "" },
    contentType: { type: String, enum: ["text", "image", "image_text"], default: "text" },
    imageUrl: { type: String, default: "", trim: true },
    zoneId: { type: String, default: "", trim: true },
    districtId: { type: String, default: "", trim: true },
    serviceAreaSnapshot: { type: Schema.Types.Mixed, default: {} },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null }
  },
  { timestamps: true }
)

notificationSchema.index({ ownerId: 1, createdAt: -1 })
notificationSchema.index({ entityType: 1, isRead: 1, createdAt: -1 })
notificationSchema.index({ entityType: 1, entityId: 1, ownerId: 1 })
notificationSchema.index({ zoneId: 1, isRead: 1, createdAt: -1 })
notificationSchema.index({ districtId: 1, isRead: 1, createdAt: -1 })

export const CategoryModel = mongoose.model("Category", categorySchema)
export const MenuItemModel = mongoose.model("MenuItem", menuItemSchema)
export const MenuApprovalRequestModel = mongoose.model(
  "MenuApprovalRequest",
  menuApprovalRequestSchema,
)
export const OrderModel = mongoose.model("Order", orderSchema)
export const NotificationModel = mongoose.model("Notification", notificationSchema)
