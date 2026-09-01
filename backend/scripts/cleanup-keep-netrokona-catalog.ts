import mongoose, { type ClientSession } from "mongoose"

import { env } from "../src/config/env"
import {
  AdminAuditLogModel,
  AdminModel,
  AdminRefreshTokenSessionModel,
} from "../src/modules/admin/admin.model"
import { AdminOperationalAlertModel } from "../src/modules/admin/admin-alert.model"
import { AdminActivityLogModel } from "../src/modules/admin/activity-log.model"
import { AdminBusinessEventModel } from "../src/modules/admin/business-event.model"
import { AdminCustomerGroupModel } from "../src/modules/admin/customer-group.model"
import { DispatchDecisionLogModel } from "../src/modules/admin/dispatch-log.model"
import { AdminNotificationScheduleModel } from "../src/modules/admin/notification-schedule.model"
import { RiderPayrollCycleModel } from "../src/modules/admin/rider-payroll.model"
import {
  ImpersonationHandoffModel,
  OnboardingDraftModel,
  OpeningHoursModel,
  OtpAbuseBlockModel,
  OtpSecurityEventModel,
  OtpSessionModel,
  OwnerModel,
  PayoutMethodModel,
  RefreshTokenSessionModel,
  RestaurantModel,
  ReviewCaseModel,
  RiderModel,
  RiderRefreshTokenSessionModel,
} from "../src/modules/auth/auth.model"
import { OtpAttemptModel } from "../src/modules/auth/otp-monitor.model"
import { AccountDeletionRequestModel } from "../src/modules/customer/account-deletion.model"
import { CustomerAnalyticsEventModel } from "../src/modules/customer/customer-analytics.model"
import {
  BkashPaymentAttemptModel,
  BkashSandboxPaymentSessionModel,
  CustomerModel,
  CustomerRefreshTokenSessionModel,
  FirstOrderDiscountClaimModel,
  FirstOrderDiscountDeviceLockModel,
  RestaurantCollectionModel,
  VoucherAuditModel,
  VoucherModel,
  VoucherRedemptionModel,
  VoucherUserUsageModel,
} from "../src/modules/customer/customer.model"
import { PollModel, PollVoteModel } from "../src/modules/customer/poll.model"
import { MediaAssetModel } from "../src/modules/media/media.model"
import { AlertDeliveryLogModel } from "../src/modules/monitoring/alert-delivery-log.model"
import { AlertDeliverySettingsModel } from "../src/modules/monitoring/alert-settings.model"
import { InfrastructureHealthModel } from "../src/modules/monitoring/infrastructure-health.model"
import { PublicContentModel } from "../src/modules/public/content.model"
import { RiderAvailabilitySessionModel } from "../src/modules/rider/availability-session.model"
import { RoutingApiUsageModel } from "../src/modules/routing/routing-usage.model"
import {
  CategoryModel,
  MenuApprovalRequestModel,
  MenuItemModel,
  NotificationModel,
  OrderModel,
} from "../src/modules/owner/operational.model"
import {
  DailyFinanceSnapshotModel,
  LedgerEntryModel,
  PayoutBatchModel,
  PlatformFinanceEntryModel,
  RestaurantMetricsModel,
} from "../src/modules/owner/finance.model"
import { RestaurantAvailabilitySessionModel } from "../src/modules/owner/restaurant-availability-session.model"
import { ReviewModel, SupportCaseModel } from "../src/modules/owner/experience.model"
import {
  ServiceDistrictModel,
  ServiceZoneModel,
} from "../src/modules/service-area/service-area.model"
import {
  WebsiteAnalyticsEventModel,
  WebsiteLeadModel,
  WebsiteSettingsModel,
} from "../src/modules/website/website.model"

type AnyModel = mongoose.Model<any>
type DeletePlanRow = {
  collection: string
  matched: number
  note: string
}
type DeleteResultRow = DeletePlanRow & {
  deleted: number
}

const NETROKONA_PATTERN = /netr[ao]kona/i
const APPLY = process.argv.includes("--apply")
const PREVIEW = process.argv.includes("--preview") || !APPLY

const PRESERVED_WHOLE_MODELS: AnyModel[] = [
  AdminModel,
  AdminRefreshTokenSessionModel,
  CustomerModel,
  CustomerRefreshTokenSessionModel,
  PublicContentModel,
  MediaAssetModel,
  WebsiteSettingsModel,
]

const FULL_DELETE_MODELS: AnyModel[] = [
  AccountDeletionRequestModel,
  AdminActivityLogModel,
  AdminAuditLogModel,
  AdminBusinessEventModel,
  AdminCustomerGroupModel,
  AdminNotificationScheduleModel,
  AdminOperationalAlertModel,
  AlertDeliverySettingsModel,
  AlertDeliveryLogModel,
  BkashPaymentAttemptModel,
  BkashSandboxPaymentSessionModel,
  CustomerAnalyticsEventModel,
  DailyFinanceSnapshotModel,
  DispatchDecisionLogModel,
  FirstOrderDiscountClaimModel,
  FirstOrderDiscountDeviceLockModel,
  ImpersonationHandoffModel,
  InfrastructureHealthModel,
  LedgerEntryModel,
  MenuApprovalRequestModel,
  NotificationModel,
  OnboardingDraftModel,
  OrderModel,
  OtpAbuseBlockModel,
  OtpAttemptModel,
  OtpSecurityEventModel,
  OtpSessionModel,
  PlatformFinanceEntryModel,
  PayoutBatchModel,
  PollModel,
  PollVoteModel,
  RestaurantAvailabilitySessionModel,
  RestaurantMetricsModel,
  ReviewCaseModel,
  ReviewModel,
  RiderAvailabilitySessionModel,
  RiderModel,
  RiderPayrollCycleModel,
  RiderRefreshTokenSessionModel,
  RoutingApiUsageModel,
  SupportCaseModel,
  VoucherAuditModel,
  VoucherModel,
  VoucherRedemptionModel,
  VoucherUserUsageModel,
  WebsiteAnalyticsEventModel,
  WebsiteLeadModel,
]

const SCOPED_MODELS: AnyModel[] = [
  CategoryModel,
  MenuItemModel,
  OpeningHoursModel,
  OwnerModel,
  PayoutMethodModel,
  RefreshTokenSessionModel,
  RestaurantCollectionModel,
  RestaurantModel,
  ServiceDistrictModel,
  ServiceZoneModel,
]

function parseCsvEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
}

function uniqueModels(models: AnyModel[]) {
  const byCollection = new Map<string, AnyModel>()
  for (const model of models) {
    byCollection.set(model.collection.collectionName, model)
  }
  return [...byCollection.values()]
}

function uniqueObjectIds(values: unknown[]) {
  const byId = new Map<string, mongoose.Types.ObjectId>()

  for (const value of values) {
    if (value instanceof mongoose.Types.ObjectId) {
      byId.set(value.toString(), value)
      continue
    }
    if (typeof value === "string" && mongoose.Types.ObjectId.isValid(value)) {
      byId.set(value, new mongoose.Types.ObjectId(value))
    }
  }

  return [...byId.values()]
}

function idString(value: unknown) {
  if (value instanceof mongoose.Types.ObjectId) return value.toString()
  return typeof value === "string" ? value : ""
}

function redactMongoUri(uri: string) {
  return uri.replace(/\/\/([^@/]+)@/, "//<credentials>@")
}

function mongoUriLooksLocal(uri: string) {
  const normalized = uri.toLowerCase()
  return ["localhost", "127.0.0.1", "0.0.0.0", "host.docker.internal"].some(
    (host) => normalized.includes(host),
  )
}

function assertCleanupAllowed() {
  if (!APPLY) return

  if (process.env.CONFIRM_NETROKONA_CATALOG_CLEANUP !== "YES") {
    throw new Error(
      'Refusing to delete data. Run preview first, then set CONFIRM_NETROKONA_CATALOG_CLEANUP="YES".',
    )
  }

  if (
    env.NODE_ENV === "production" &&
    process.env.ALLOW_PRODUCTION_NETROKONA_CATALOG_CLEANUP !== "YES"
  ) {
    throw new Error(
      'Refusing production cleanup. Set ALLOW_PRODUCTION_NETROKONA_CATALOG_CLEANUP="YES" only when intentional.',
    )
  }

  if (
    !mongoUriLooksLocal(env.MONGODB_URI) &&
    process.env.ALLOW_REMOTE_NETROKONA_CATALOG_CLEANUP !== "YES"
  ) {
    throw new Error(
      'MONGODB_URI looks remote. Set ALLOW_REMOTE_NETROKONA_CATALOG_CLEANUP="YES" only after checking the target DB.',
    )
  }
}

async function connect() {
  mongoose.set("strictQuery", true)
  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
    minPoolSize: Math.min(env.MONGODB_MIN_POOL_SIZE, env.MONGODB_MAX_POOL_SIZE),
    serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
  })
}

async function supportsTransactions() {
  const database = mongoose.connection.db
  if (!database) return false
  const hello = await database.admin().command({ hello: 1 })
  return Boolean(hello.setName || hello.msg === "isdbgrid")
}

async function findTargetScope() {
  const districtSlugs = parseCsvEnv("NETROKONA_CLEANUP_DISTRICT_SLUGS")
  const zoneSlugs = parseCsvEnv("NETROKONA_CLEANUP_ZONE_SLUGS")

  const districts = await ServiceDistrictModel.find(
    districtSlugs.length
      ? { slug: { $in: districtSlugs } }
      : {
          $or: [
            { slug: NETROKONA_PATTERN },
            { name: NETROKONA_PATTERN },
          ],
        },
  )
    .select({ _id: 1, name: 1, slug: 1 })
    .lean()

  const districtIds = uniqueObjectIds(districts.map((district) => district._id))
  const districtIdStrings = districtIds.map((id) => id.toString())

  const zoneFilter = zoneSlugs.length
    ? { slug: { $in: zoneSlugs } }
    : {
        $or: [
          { slug: NETROKONA_PATTERN },
          { name: NETROKONA_PATTERN },
          { districtName: NETROKONA_PATTERN },
          ...(districtIds.length ? [{ districtId: { $in: districtIds } }] : []),
        ],
      }

  const zones = await ServiceZoneModel.find(zoneFilter)
    .select({ _id: 1, name: 1, slug: 1, districtId: 1, districtName: 1 })
    .lean()

  const zoneIds = uniqueObjectIds(zones.map((zone) => zone._id))
  const zoneIdStrings = zoneIds.map((id) => id.toString())
  const foundZoneSlugs = zones
    .map((zone) => (typeof zone.slug === "string" ? zone.slug : ""))
    .filter(Boolean)

  const restaurantClauses: Record<string, unknown>[] = []
  if (zoneIdStrings.length) {
    restaurantClauses.push({ "serviceArea.zoneId": { $in: zoneIdStrings } })
  }
  if (foundZoneSlugs.length) {
    restaurantClauses.push({ "serviceArea.zoneSlug": { $in: foundZoneSlugs } })
  }
  if (!zoneSlugs.length) {
    if (districtIdStrings.length) {
      restaurantClauses.push({
        "serviceArea.districtId": { $in: districtIdStrings },
      })
    }
    restaurantClauses.push(
      { "serviceArea.zoneSlug": NETROKONA_PATTERN },
      { "serviceArea.zoneName": NETROKONA_PATTERN },
      { "serviceArea.districtName": NETROKONA_PATTERN },
      { "address.city": NETROKONA_PATTERN },
    )
  }

  const restaurants = await RestaurantModel.find({ $or: restaurantClauses })
    .select({
      _id: 1,
      name: 1,
      slug: 1,
      ownerId: 1,
      serviceArea: 1,
      "address.city": 1,
    })
    .sort({ createdAt: -1 })
    .lean()

  const restaurantIds = uniqueObjectIds(
    restaurants.map((restaurant) => restaurant._id),
  )
  const ownerIds = uniqueObjectIds(restaurants.map((restaurant) => restaurant.ownerId))

  if (!restaurantIds.length && process.env.ALLOW_EMPTY_NETROKONA_CATALOG_CLEANUP !== "YES") {
    throw new Error(
      'No Netrokona/Netrakona restaurants found. Refusing cleanup. If this is expected, set ALLOW_EMPTY_NETROKONA_CATALOG_CLEANUP="YES".',
    )
  }

  return {
    districts,
    districtIds,
    restaurants,
    restaurantIds,
    ownerIds,
    zones,
    zoneIds,
  }
}

function buildScopedDeleteSpecs(scope: Awaited<ReturnType<typeof findTargetScope>>) {
  const specs: Array<{
    filter: mongoose.FilterQuery<any>
    model: AnyModel
    note: string
  }> = [
    {
      model: CategoryModel,
      filter: { restaurantId: { $nin: scope.restaurantIds } },
      note: "delete categories outside Netrokona restaurants",
    },
    {
      model: MenuItemModel,
      filter: { restaurantId: { $nin: scope.restaurantIds } },
      note: "delete menu items outside Netrokona restaurants",
    },
    {
      model: OpeningHoursModel,
      filter: { restaurantId: { $nin: scope.restaurantIds } },
      note: "delete opening hours outside Netrokona restaurants",
    },
    {
      model: PayoutMethodModel,
      filter: { restaurantId: { $nin: scope.restaurantIds } },
      note: "delete payout methods outside Netrokona restaurants",
    },
    {
      model: RestaurantModel,
      filter: { _id: { $nin: scope.restaurantIds } },
      note: "delete restaurants outside Netrokona scope",
    },
    {
      model: OwnerModel,
      filter: { _id: { $nin: scope.ownerIds } },
      note: "keep only owners attached to preserved restaurants",
    },
    {
      model: RefreshTokenSessionModel,
      filter: { ownerId: { $nin: scope.ownerIds } },
      note: "delete owner sessions outside preserved owners",
    },
  ]

  if (scope.zoneIds.length) {
    specs.push({
      model: ServiceZoneModel,
      filter: { _id: { $nin: scope.zoneIds } },
      note: "keep only Netrokona/Netrakona zones",
    })
  }

  if (scope.districtIds.length) {
    specs.push({
      model: ServiceDistrictModel,
      filter: { _id: { $nin: scope.districtIds } },
      note: "keep only Netrokona/Netrakona districts",
    })
  }

  return specs
}

async function buildDeletePlan(scope: Awaited<ReturnType<typeof findTargetScope>>) {
  const rows: DeletePlanRow[] = []

  for (const spec of buildScopedDeleteSpecs(scope)) {
    rows.push({
      collection: spec.model.collection.collectionName,
      matched: await spec.model.countDocuments(spec.filter),
      note: spec.note,
    })
  }

  for (const model of uniqueModels(FULL_DELETE_MODELS)) {
    rows.push({
      collection: model.collection.collectionName,
      matched: await model.countDocuments({}),
      note: "delete all documents",
    })
  }

  const knownCollections = new Set(
    uniqueModels([
      ...PRESERVED_WHOLE_MODELS,
      ...FULL_DELETE_MODELS,
      ...SCOPED_MODELS,
    ]).map((model) => model.collection.collectionName),
  )

  const database = mongoose.connection.db
  if (!database) throw new Error("MongoDB connection is not ready.")

  const collections = await database.listCollections({}, { nameOnly: false }).toArray()
  for (const collection of collections) {
    if (
      collection.type !== "collection" ||
      collection.name.startsWith("system.") ||
      knownCollections.has(collection.name)
    ) {
      continue
    }

    rows.push({
      collection: collection.name,
      matched: await database.collection(collection.name).countDocuments({}),
      note: "delete all documents from unknown/non-preserved collection",
    })
  }

  return rows.sort((left, right) => left.collection.localeCompare(right.collection))
}

function scrubObjectIdList(value: unknown, keptIds: Set<string>) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => keptIds.has(String(item)))
}

function scrubHomeCms(value: unknown, keptRestaurantIds: Set<string>) {
  if (!value || typeof value !== "object") return

  const homeCms = value as Record<string, any>
  const restaurantSections = homeCms.restaurantSections
  if (restaurantSections && typeof restaurantSections === "object") {
    for (const section of Object.values(restaurantSections)) {
      if (!section || typeof section !== "object") continue
      const sectionRecord = section as Record<string, unknown>
      sectionRecord.selectedRestaurantIds = scrubObjectIdList(
        sectionRecord.selectedRestaurantIds,
        keptRestaurantIds,
      )
    }
  }

  const timeBasedSection = homeCms.timeBasedSection as Record<string, unknown> | undefined
  const windows = timeBasedSection?.windows
  if (Array.isArray(windows)) {
    for (const window of windows) {
      if (!window || typeof window !== "object") continue
      const windowRecord = window as Record<string, unknown>
      windowRecord.selectedRestaurantIds = scrubObjectIdList(
        windowRecord.selectedRestaurantIds,
        keptRestaurantIds,
      )
    }
  }

  const pushCampaign = homeCms.pushCampaign as Record<string, unknown> | undefined
  if (pushCampaign && typeof pushCampaign === "object") {
    pushCampaign.selectedRestaurantIds = scrubObjectIdList(
      pushCampaign.selectedRestaurantIds,
      keptRestaurantIds,
    )
    pushCampaign.recipientEvents = []
    pushCampaign.openEvents = []
    pushCampaign.conversions = {
      orderCount: 0,
      deliveredOrderCount: 0,
      deliveredRevenue: 0,
      uniqueOrderingCustomers: 0,
      conversionRate: 0,
      refreshedAt: null,
      convertedOrders: [],
    }
  }

  const dealsSection = homeCms.dealsSection as Record<string, unknown> | undefined
  if (dealsSection && typeof dealsSection === "object") {
    dealsSection.offerIds = []
  }

  homeCms.analyticsEvents = []
}

function scrubPublicContent(content: unknown, keptRestaurantIds: Set<string>) {
  if (!content || typeof content !== "object") return content

  const cloned = structuredClone(content) as Record<string, any>
  const customerApp = cloned.customerApp as Record<string, any> | undefined
  if (!customerApp || typeof customerApp !== "object") return cloned

  scrubHomeCms(customerApp.homeCms, keptRestaurantIds)

  const overrides = customerApp.homeCmsAreaOverrides
  if (overrides && typeof overrides === "object") {
    for (const override of Object.values(overrides)) {
      if (!override || typeof override !== "object") continue
      scrubHomeCms((override as Record<string, unknown>).homeCms, keptRestaurantIds)
    }
  }

  const operations = cloned.operations as Record<string, any> | undefined
  const dispatch = operations?.dispatch as Record<string, unknown> | undefined
  if (dispatch && typeof dispatch === "object") {
    dispatch.primaryRiderId = ""
  }

  return cloned
}

async function scrubRestaurantCollections(
  scope: Awaited<ReturnType<typeof findTargetScope>>,
  session?: ClientSession,
) {
  const keptRestaurantIds = new Set(scope.restaurantIds.map((id) => id.toString()))
  const collections = await RestaurantCollectionModel.find()
  let changed = 0

  for (const collection of collections) {
    const currentRestaurantIds = Array.isArray(collection.restaurantIds)
      ? collection.restaurantIds
      : []
    const currentSortOrders = Array.isArray(collection.sortOrders)
      ? collection.sortOrders
      : []
    const nextRestaurantIds = currentRestaurantIds.filter((restaurantId) =>
      keptRestaurantIds.has(idString(restaurantId)),
    )
    const nextSortOrders = currentSortOrders.filter((sortOrder: any) =>
      keptRestaurantIds.has(idString(sortOrder.restaurantId)),
    )

    if (
      nextRestaurantIds.length === currentRestaurantIds.length &&
      nextSortOrders.length === currentSortOrders.length
    ) {
      continue
    }

    changed += 1
    collection.set("restaurantIds", nextRestaurantIds)
    collection.set("sortOrders", nextSortOrders)
    await collection.save(session ? { session } : undefined)
  }

  return changed
}

async function scrubPublicContentReferences(
  scope: Awaited<ReturnType<typeof findTargetScope>>,
  session?: ClientSession,
) {
  const keptRestaurantIds = new Set(scope.restaurantIds.map((id) => id.toString()))
  const docs = await PublicContentModel.find()
  let changed = 0

  for (const doc of docs) {
    const before = JSON.stringify(doc.content)
    const nextContent = scrubPublicContent(doc.content, keptRestaurantIds)
    const after = JSON.stringify(nextContent)
    if (before === after) continue

    changed += 1
    doc.content = nextContent
    await doc.save(session ? { session } : undefined)
  }

  return changed
}

async function scrubCustomerAccounts(
  scope: Awaited<ReturnType<typeof findTargetScope>>,
  session?: ClientSession,
) {
  const keptRestaurantIds = scope.restaurantIds.map((id) => id.toString())

  const result = await CustomerModel.updateMany(
    {},
    [
      {
        $set: {
          favoriteRestaurantIds: {
            $filter: {
              input: { $ifNull: ["$favoriteRestaurantIds", []] },
              as: "restaurantId",
              cond: {
                $in: [{ $toString: "$$restaurantId" }, keptRestaurantIds],
              },
            },
          },
          firstOrderDiscountAmount: 0,
          firstOrderDiscountOrderId: null,
          firstOrderDiscountRedeemedAt: null,
          notifications: [],
          refereeRewardGrantedAt: null,
          refereeRewardVoucherId: null,
          referralRewardOrderId: null,
          referralRewardSkippedAt: null,
          referralRewardSkippedReason: "",
          referralRewardStatus: "pending",
          referralRewardVoucherId: null,
          "customOfferRequest.expectedReadyAt": null,
          "customOfferRequest.fulfilledAt": null,
          "customOfferRequest.history": [],
          "customOfferRequest.lastRequestOrderCount": 0,
          "customOfferRequest.qualifiedAt": null,
          "customOfferRequest.qualificationNotifiedAt": null,
          "customOfferRequest.requestedAt": null,
          "customOfferRequest.status": "none",
          "customOfferRequest.voucherCode": "",
          "customOfferRequest.voucherId": "",
        },
      },
    ],
    session ? { session } : undefined,
  )

  return result.modifiedCount ?? 0
}

async function scrubKeptCatalogue(scope: Awaited<ReturnType<typeof findTargetScope>>, session?: ClientSession) {
  const keptMenuItems = await MenuItemModel.find({
    restaurantId: { $in: scope.restaurantIds },
  })
    .select({ _id: 1 })
    .lean()
  const keptMenuItemIds = new Set(
    keptMenuItems.map((item) => idString(item._id)).filter(Boolean),
  )
  const keptRestaurantIdStrings = scope.restaurantIds.map((id) => id.toString())

  await OwnerModel.updateMany(
    { _id: { $in: scope.ownerIds } },
    { $pull: { pushTokens: {} } },
    session ? { session } : undefined,
  )
  await MenuItemModel.updateMany(
    { restaurantId: { $in: scope.restaurantIds } },
    [
      {
        $set: {
          recommendedItemIds: {
            $filter: {
              input: "$recommendedItemIds",
              as: "itemId",
              cond: { $in: [{ $toString: "$$itemId" }, [...keptMenuItemIds]] },
            },
          },
        },
      },
    ],
    session ? { session } : undefined,
  )
  await RestaurantModel.updateMany(
    { _id: { $in: scope.restaurantIds } },
    {
      $set: {
        "runtime.isVisible": true,
        "runtime.currentOperationalStatus": "open",
        "runtime.status": "open",
      },
    },
    session ? { session } : undefined,
  )
  await ServiceZoneModel.updateMany(
    { _id: { $in: scope.zoneIds } },
    { $set: { "dispatch.primaryRiderId": "" } },
    session ? { session } : undefined,
  )
  await RestaurantCollectionModel.updateMany(
    {},
    {
      $pull: {
        restaurantIds: { $nin: scope.restaurantIds },
        sortOrders: { restaurantId: { $nin: scope.restaurantIds } },
      },
    },
    session ? { session } : undefined,
  )

  return {
    keptMenuItems: keptMenuItems.length,
    keptRestaurants: keptRestaurantIdStrings.length,
  }
}

async function performDeletes(
  scope: Awaited<ReturnType<typeof findTargetScope>>,
  session?: ClientSession,
) {
  const results: DeleteResultRow[] = []
  const database = mongoose.connection.db
  if (!database) throw new Error("MongoDB connection is not ready.")

  for (const spec of buildScopedDeleteSpecs(scope)) {
    const matched = await spec.model.countDocuments(spec.filter)
    const result = await spec.model.deleteMany(
      spec.filter,
      session ? { session } : undefined,
    )
    results.push({
      collection: spec.model.collection.collectionName,
      matched,
      deleted: result.deletedCount ?? 0,
      note: spec.note,
    })
  }

  for (const model of uniqueModels(FULL_DELETE_MODELS)) {
    const matched = await model.countDocuments({})
    const result = await model.deleteMany({}, session ? { session } : undefined)
    results.push({
      collection: model.collection.collectionName,
      matched,
      deleted: result.deletedCount ?? 0,
      note: "delete all documents",
    })
  }

  const knownCollections = new Set(
    uniqueModels([
      ...PRESERVED_WHOLE_MODELS,
      ...FULL_DELETE_MODELS,
      ...SCOPED_MODELS,
    ]).map((model) => model.collection.collectionName),
  )
  const collections = await database.listCollections({}, { nameOnly: false }).toArray()
  for (const collection of collections) {
    if (
      collection.type !== "collection" ||
      collection.name.startsWith("system.") ||
      knownCollections.has(collection.name)
    ) {
      continue
    }

    const target = database.collection(collection.name)
    const matched = await target.countDocuments({})
    const result = await target.deleteMany({}, session ? { session } : undefined)
    results.push({
      collection: collection.name,
      matched,
      deleted: result.deletedCount ?? 0,
      note: "delete all documents from unknown/non-preserved collection",
    })
  }

  return results.sort((left, right) => left.collection.localeCompare(right.collection))
}

function printScope(scope: Awaited<ReturnType<typeof findTargetScope>>) {
  console.log(`Database: ${redactMongoUri(env.MONGODB_URI)}`)
  console.log(`Mode: ${PREVIEW ? "preview" : "apply"}`)
  console.log("Preserved whole collections:")
  console.log(
    uniqueModels(PRESERVED_WHOLE_MODELS)
      .map((model) => model.collection.collectionName)
      .sort()
      .join(", "),
  )
  console.log("")
  console.log("Target districts:")
  console.table(
    scope.districts.map((district) => ({
      id: idString(district._id),
      name: district.name,
      slug: district.slug,
    })),
  )
  console.log("Target zones:")
  console.table(
    scope.zones.map((zone) => ({
      id: idString(zone._id),
      name: zone.name,
      slug: zone.slug,
      districtName: zone.districtName,
    })),
  )
  console.log("Restaurants that will be kept:")
  console.table(
    scope.restaurants.map((restaurant) => ({
      id: idString(restaurant._id),
      name: restaurant.name,
      slug: restaurant.slug,
      zone: restaurant.serviceArea?.zoneName ?? "",
      city: restaurant.address?.city ?? "",
    })),
  )
}

async function printPreservedCustomerCounts() {
  const [customers, customerSessions] = await Promise.all([
    CustomerModel.countDocuments(),
    CustomerRefreshTokenSessionModel.countDocuments(),
  ])

  console.log(`Customer accounts that will be kept: ${customers}`)
  console.log(`Customer sessions that will be kept: ${customerSessions}`)
}

async function main() {
  assertCleanupAllowed()
  await connect()

  const scope = await findTargetScope()
  printScope(scope)
  await printPreservedCustomerCounts()

  const deletePlan = await buildDeletePlan(scope)
  console.log("Delete plan:")
  console.table(deletePlan)

  if (PREVIEW) {
    console.log("")
    console.log("Preview only. No data was deleted.")
    console.log(
      'To apply: set CONFIRM_NETROKONA_CATALOG_CLEANUP="YES" and run with --apply.',
    )
    return
  }

  let results: DeleteResultRow[] = []
  let collectionDocsScrubbed = 0
  let customerDocsScrubbed = 0
  let publicContentDocsScrubbed = 0

  if (await supportsTransactions()) {
    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        results = await performDeletes(scope, session)
        await scrubKeptCatalogue(scope, session)
        customerDocsScrubbed = await scrubCustomerAccounts(scope, session)
        collectionDocsScrubbed = await scrubRestaurantCollections(scope, session)
        publicContentDocsScrubbed = await scrubPublicContentReferences(scope, session)
      })
    } finally {
      await session.endSession()
    }
  } else {
    console.warn("MongoDB transactions are unavailable; running cleanup without a transaction.")
    results = await performDeletes(scope)
    await scrubKeptCatalogue(scope)
    customerDocsScrubbed = await scrubCustomerAccounts(scope)
    collectionDocsScrubbed = await scrubRestaurantCollections(scope)
    publicContentDocsScrubbed = await scrubPublicContentReferences(scope)
  }

  console.log("Cleanup completed.")
  console.table(results)
  console.log(`Restaurant collection docs scrubbed: ${collectionDocsScrubbed}`)
  console.log(`Customer docs scrubbed: ${customerDocsScrubbed}`)
  console.log(`Public content docs scrubbed: ${publicContentDocsScrubbed}`)
  console.log(`Kept restaurants: ${scope.restaurantIds.length}`)
  console.log(`Kept owner docs: ${scope.ownerIds.length}`)
  console.log(`Customer accounts preserved: ${await CustomerModel.countDocuments()}`)
  console.log(
    `Customer sessions preserved: ${await CustomerRefreshTokenSessionModel.countDocuments()}`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect()
  })
