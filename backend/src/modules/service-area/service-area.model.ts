import mongoose, { Schema } from "mongoose"

const serviceDistrictSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    status: {
      type: String,
      enum: ["active", "paused", "archived"],
      default: "active"
    },
    country: { type: String, default: "Bangladesh", trim: true },
    displayOrder: { type: Number, default: 0 },
    notes: { type: String, default: "", trim: true }
  },
  { timestamps: true }
)

const coordinateSchema = new Schema(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true }
  },
  { _id: false }
)

const serviceZoneSchema = new Schema(
  {
    districtId: {
      type: Schema.Types.ObjectId,
      ref: "ServiceDistrict",
      required: true
    },
    districtName: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["active", "paused", "archived"],
      default: "active"
    },
    center: { type: coordinateSchema, required: true },
    centerPoint: {
      type: new Schema(
        {
          type: { type: String, enum: ["Point"], default: "Point" },
          coordinates: { type: [Number], required: true }
        },
        { _id: false }
      ),
      required: true
    },
    radiusKm: { type: Number, required: true, min: 0.1 },
    priority: { type: Number, default: 0 },
    delivery: {
      type: new Schema(
        {
          baseFeeTaka: { type: Number, default: null, min: 0 },
          distanceSurchargeEnabled: { type: Boolean, default: null },
          surchargeStartsAfterKm: { type: Number, default: null, min: 0 },
          surchargeStepMeters: { type: Number, default: null, min: 1 },
          surchargeAmountTaka: { type: Number, default: null, min: 0 },
          maxRestaurantDistanceKm: { type: Number, default: null, min: 0 },
          rainSurchargeEnabled: { type: Boolean, default: false },
          rainSurchargeTaka: { type: Number, default: 0, min: 0 },
          // Per-zone override of the global operations.platformFee. `override:true`
          // makes this zone use these values; otherwise the global default applies.
          platformFee: {
            type: new Schema(
              {
                override: { type: Boolean, default: false },
                enabled: { type: Boolean, default: false },
                mode: {
                  type: String,
                  enum: ["flat", "percentage", "optional"],
                  default: "flat"
                },
                amountTaka: { type: Number, default: 0, min: 0 },
                percentage: { type: Number, default: 0, min: 0, max: 100 },
                label: { type: String, default: "Platform fee", trim: true },
                note: { type: String, default: "", trim: true }
              },
              { _id: false }
            ),
            default: () => ({})
          }
        },
        { _id: false }
      ),
      default: () => ({})
    },
    // Per-zone service-window override. null = inherit the platform default
    // (operations.serviceHours). Minutes-from-midnight in Asia/Dhaka (0–1440).
    serviceHours: {
      type: new Schema(
        {
          enabled: { type: Boolean, default: null },
          openMinute: { type: Number, default: null, min: 0, max: 1440 },
          closeMinute: { type: Number, default: null, min: 0, max: 1440 }
        },
        { _id: false }
      ),
      default: () => ({})
    },
    dispatch: {
      type: new Schema(
        {
          autoAssignEnabled: { type: Boolean, default: true },
          autoReassignTimedOutOrders: { type: Boolean, default: null },
          dispatchMode: {
            type: String,
            enum: ["fleet", "primary_rider"],
            default: null
          },
          primaryRiderId: { type: String, default: "" },
          primaryRiderFallbackEnabled: { type: Boolean, default: null },
          algorithm: {
            type: String,
            enum: ["nearest_eligible_balanced", "least_loaded_first"],
            default: null
          },
          maxActiveOrdersPerRiderOverride: { type: Number, default: null, min: 1 },
          staleLocationCutoffMinutes: { type: Number, default: null, min: 1 },
          assignmentTimeoutMinutes: { type: Number, default: null, min: 1 },
          ownerAcceptanceTimeoutMinutes: { type: Number, default: null, min: 1 },
          prepStartGraceMinutes: { type: Number, default: null, min: 1 },
          preparationMaxExtraMinutes: { type: Number, default: null, min: 0 },
          prepLateGraceMinutes: { type: Number, default: null, min: 0 },
          pickupLateGraceMinutes: { type: Number, default: null, min: 1 },
          deliveryLateGraceMinutes: { type: Number, default: null, min: 1 },
          deliveryWatchAfterPickupMinutes: { type: Number, default: null, min: 1 },
          deliveryLateAfterPickupMinutes: { type: Number, default: null, min: 1 },
          deliveryCriticalAfterPickupMinutes: { type: Number, default: null, min: 1 },
          retryCooldownMinutes: { type: Number, default: null, min: 1 },
          surgeReadyOrderThreshold: { type: Number, default: null, min: 1 },
          surgeUnassignedOrderThreshold: { type: Number, default: null, min: 1 },
          autoCancelUnacceptedOrdersEnabled: { type: Boolean, default: null },
          autoCancelAfterMinutes: { type: Number, default: null, min: 2 },
          autoCancelNotifyBeforeMinutes: { type: Number, default: null, min: 1 }
        },
        { _id: false }
      ),
      default: () => ({})
    },
    notes: { type: String, default: "", trim: true },
    displayOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
)

serviceDistrictSchema.index({ status: 1, displayOrder: 1, name: 1 })
serviceZoneSchema.index({ districtId: 1, slug: 1 }, { unique: true })
serviceZoneSchema.index({ status: 1, districtId: 1, priority: -1, displayOrder: 1 })
serviceZoneSchema.index({ centerPoint: "2dsphere" })

serviceZoneSchema.pre("validate", function setCenterPoint(next) {
  const zone = this as any
  if (
    typeof zone.center?.latitude === "number" &&
    typeof zone.center?.longitude === "number"
  ) {
    zone.centerPoint = {
      type: "Point",
      coordinates: [zone.center.longitude, zone.center.latitude]
    }
  }
  next()
})

export const ServiceDistrictModel = mongoose.model(
  "ServiceDistrict",
  serviceDistrictSchema
)
export const ServiceZoneModel = mongoose.model("ServiceZone", serviceZoneSchema)
