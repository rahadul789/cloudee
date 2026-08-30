import { randomInt } from "node:crypto"

import mongoose from "mongoose"
import { StatusCodes } from "http-status-codes"

import { AppError } from "../../common/utils/app-error"
import { RestaurantModel } from "../auth/auth.model"
import { resolveRestaurantServiceAreaSnapshot } from "../service-area/service-area.service"
import { runAutoDispatchForReadyOrders } from "../admin/orders-monitor.service"
import { notifyExternalDeliveryRequest } from "../monitoring/business-telegram.service"
import { emitSocketEvent } from "../../config/socket"
import { sendPushToRider } from "../rider/push.service"
import { OrderModel } from "./operational.model"

// ── Off-platform / owner-initiated delivery (Flow 2) — a fully SEPARATE module ─
// The owner got an order via their own channel (FB/WhatsApp) and asks Foodbela to
// deliver it. The end customer is NOT a Foodbela app user, so nothing here touches the
// customer app. Foodbela collects the money (COD cash / online), keeps a FLAT per-
// restaurant delivery fee (admin-set on the restaurant), and remits the rest to the owner.
//
// This flow is kept 100% separate from the platform's commission/payout/analytics — its
// money runs through its own settlement lifecycle (pending → collected → reconciled →
// settled). It also does NOT reuse the customer delivery-pricing engine: the fee is a
// single flat amount configured per restaurant, so no drop coordinates are needed.
//
// KEY reuse: an external order is stored as a NORMAL order at status "ReadyForPickup"
// with riderId "" so the existing dispatch + rider pipeline handles it transparently.
// Riders are scoped by the restaurant's own service-area zone (no drop geo required);
// the source:"external" flag + external{} sub-object are additive, for the money layer.

const SETTLEMENT_POLICIES = [
  "same_day",
  "t_plus_1",
  "t_plus_n",
  "platform_default",
] as const
type SettlementPolicy = (typeof SETTLEMENT_POLICIES)[number]

// Money states an external order moves through. Settlement pays the owner only after
// the cash is reconciled (deposited); cancelled/held are terminal side-states.
const UNSETTLED_STATES = ["pending", "collected", "reconciled", "held"] as const

function roundTaka(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function createExternalOrderNumber() {
  // Same shape as customer orders (FB-<ms>-<rand>) so admin/rider tooling reads it the
  // same way; the source flag is what distinguishes the two flows.
  return `FB-${Date.now()}-${randomInt(1000, 10000)}`
}

// ── Config shaping (per-restaurant, stored on commercial.externalDelivery) ─────

export type ExternalDeliveryConfig = {
  enabled: boolean
  // Flat delivery fee (Tk) Foodbela keeps per external delivery for this restaurant.
  deliveryFeeTaka: number
  settlementPolicy: SettlementPolicy
  settlementDays: number | null
  exposureCapTaka: number | null
  enabledByAdminId: string
  enabledAt: Date | null
}

function shapeExternalConfig(
  raw: Record<string, any> | null | undefined,
): ExternalDeliveryConfig {
  const config = raw ?? {}
  const policy = SETTLEMENT_POLICIES.includes(config.settlementPolicy)
    ? (config.settlementPolicy as SettlementPolicy)
    : "t_plus_1"
  return {
    enabled: config.enabled === true,
    deliveryFeeTaka:
      typeof config.deliveryFeeTaka === "number" ? config.deliveryFeeTaka : 0,
    settlementPolicy: policy,
    settlementDays:
      typeof config.settlementDays === "number" ? config.settlementDays : null,
    exposureCapTaka:
      typeof config.exposureCapTaka === "number" ? config.exposureCapTaka : null,
    enabledByAdminId: String(config.enabledByAdminId ?? ""),
    enabledAt: config.enabledAt ?? null,
  }
}

// Load + authorise a restaurant for external delivery: it must exist and have the feature
// enabled by an admin. Returns the shaped config alongside the doc.
async function loadEnabledRestaurant(restaurantId: string) {
  const restaurant = (await RestaurantModel.findById(restaurantId).lean()) as
    | Record<string, any>
    | null
  if (!restaurant) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RESTAURANT_NOT_FOUND",
      "Restaurant not found",
    )
  }
  const config = shapeExternalConfig(restaurant.commercial?.externalDelivery)
  if (!config.enabled) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "EXTERNAL_DELIVERY_DISABLED",
      "External delivery is not enabled for this restaurant",
    )
  }
  return { restaurant, config }
}

// Sum of money Foodbela is on the hook to remit for this restaurant's external orders
// that are not yet settled — used to enforce the admin's per-restaurant exposure cap.
async function getUnsettledExposureTaka(restaurantId: string) {
  const rows = await OrderModel.aggregate<{ _id: null; total: number }>([
    {
      $match: {
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
        source: "external",
        "external.settlementStatus": { $in: [...UNSETTLED_STATES] },
      },
    },
    { $group: { _id: null, total: { $sum: "$external.netToOwner" } } },
  ])
  return roundTaka(rows[0]?.total ?? 0)
}

// ── Owner: read the feature status + fee (drives nav visibility + fee display) ─

export type OwnerExternalDeliveryConfig = {
  enabled: boolean
  deliveryFeeTaka: number
}

export async function getOwnerExternalDeliveryConfig(
  restaurantId: string,
): Promise<OwnerExternalDeliveryConfig> {
  const restaurant = (await RestaurantModel.findById(restaurantId)
    .select("commercial.externalDelivery")
    .lean()) as Record<string, any> | null
  const config = shapeExternalConfig(restaurant?.commercial?.externalDelivery)
  return { enabled: config.enabled, deliveryFeeTaka: config.deliveryFeeTaka }
}

// ── Owner: create / list / cancel ─────────────────────────────────────────────

export type CreateExternalDeliveryParams = {
  restaurantId: string
  createdByOwnerId: string
  customerName: string
  customerPhone: string
  dropAddress: string
  // The goods value the owner is charging the customer for the food.
  orderValue: number
  paymentMode: "cod" | "online"
}

export type ExternalDeliveryResult = {
  orderId: string
  orderNumber: string
  status: string
  source: "external"
  deliveryFee: number
  orderValue: number
  collectAmount: number
  netToOwner: number
  paymentMode: "cod" | "online"
  settlementStatus: string
  drop: { address: string }
  createdAt: Date
}

// Create an off-platform delivery request. Persists a normal-looking order at
// ReadyForPickup so the existing dispatch pipeline assigns a rider (scoped by the
// restaurant's zone), then triggers a dispatch sweep. The customer always pays the flat
// delivery fee on top of the goods value, so: collectAmount = orderValue + deliveryFee,
// netToOwner = orderValue.
export async function createExternalDelivery(
  params: CreateExternalDeliveryParams,
): Promise<ExternalDeliveryResult> {
  const { restaurant, config } = await loadEnabledRestaurant(params.restaurantId)

  const customerName = params.customerName.trim()
  const customerPhone = params.customerPhone.trim()
  const dropAddress = params.dropAddress.trim()
  if (!customerName || !customerPhone) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "CUSTOMER_DETAILS_REQUIRED",
      "Customer name and phone are required",
    )
  }
  if (!dropAddress) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "DROP_ADDRESS_REQUIRED",
      "Enter the delivery address",
    )
  }

  const orderValue = roundTaka(params.orderValue)
  if (!(orderValue > 0)) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_ORDER_VALUE",
      "Enter a valid order value",
    )
  }

  const deliveryFee = roundTaka(config.deliveryFeeTaka)
  // Customer always pays the delivery fee on top; the owner receives the full goods value.
  const collectAmount = roundTaka(orderValue + deliveryFee)
  const netToOwner = orderValue

  // Per-restaurant exposure guardrail: cap how much unsettled money Foodbela is holding
  // for this merchant at once, to bound the risk on off-platform orders.
  if (typeof config.exposureCapTaka === "number" && config.exposureCapTaka > 0) {
    const current = await getUnsettledExposureTaka(params.restaurantId)
    if (current + netToOwner > config.exposureCapTaka) {
      throw new AppError(
        StatusCodes.CONFLICT,
        "EXPOSURE_CAP_REACHED",
        "This restaurant has reached its external-delivery limit. Please settle pending orders first.",
      )
    }
  }

  // Riders are scoped by the restaurant's own zone (no drop coordinates needed).
  const serviceAreaSnapshot: Record<string, any> =
    (await resolveRestaurantServiceAreaSnapshot(restaurant)) ?? {}

  const placedAt = new Date()
  const orderId = new mongoose.Types.ObjectId()
  const [created] = await OrderModel.create([
    {
      _id: orderId,
      restaurantId: params.restaurantId,
      customerId: "",
      source: "external",
      riderId: "",
      // Owner already has the food ready → straight into the dispatch pool.
      status: "ReadyForPickup",
      orderNumber: createExternalOrderNumber(),
      paymentMethod: params.paymentMode === "online" ? "Online" : "Cash",
      paymentStatus: "pending",
      pricing: {
        subtotal: orderValue,
        deliveryFee,
        total: collectAmount,
        grandTotal: collectAmount,
        currency: "BDT",
      },
      // Text address only — no coordinates. The rider navigates via the address + phone.
      customerSnapshot: {
        id: "",
        fullName: customerName,
        phone: customerPhone,
        deliveryAddress: {
          label: "Delivery",
          addressLine: dropAddress,
          latitude: null,
          longitude: null,
        },
      },
      serviceAreaSnapshot,
      external: {
        customerName,
        customerPhone,
        drop: { address: dropAddress, lat: null, lng: null },
        orderValue,
        collectAmount,
        paymentMode: params.paymentMode,
        deliveryFee,
        netToOwner,
        settlementStatus: "pending",
        createdByOwnerId: params.createdByOwnerId,
      },
      itemsSnapshot: [],
      timestamps: {
        placedAt,
        ReadyForPickup: placedAt,
        readyForPickupAt: placedAt,
      },
      history: [
        {
          status: "ReadyForPickup",
          actor: "owner",
          note: "External delivery requested",
          createdAt: placedAt,
        },
      ],
    },
  ])

  // Trigger the same auto-dispatch sweep a normal ready order uses. Fire-and-forget: the
  // periodic sweep would pick it up anyway, this just makes assignment immediate. Errors
  // here must never fail the create.
  void runAutoDispatchForReadyOrders({
    zoneId: serviceAreaSnapshot?.zoneId,
    districtId: serviceAreaSnapshot?.districtId,
  }).catch(() => {})

  // Notify the business Telegram bot about the new external request. Fire-and-forget.
  void notifyExternalDeliveryRequest({
    restaurantName: String(restaurant?.name ?? "Restaurant"),
    orderNumber: created.orderNumber,
    customerName,
    customerPhone,
    dropAddress,
    orderValue,
    deliveryFee,
    paymentMode: params.paymentMode,
  }).catch(() => {})

  return {
    orderId: String(created._id),
    orderNumber: created.orderNumber,
    status: created.status,
    source: "external",
    deliveryFee,
    orderValue,
    collectAmount,
    netToOwner,
    paymentMode: params.paymentMode,
    settlementStatus: "pending",
    drop: { address: dropAddress },
    createdAt: placedAt,
  }
}

function shapeExternalOrder(order: Record<string, any>) {
  const external = (order.external ?? {}) as Record<string, any>
  const status = order.status ?? ""
  const rawSettlement = external.settlementStatus ?? "pending"
  // Defensive: a cancelled/rejected order never collected money, so always present it as
  // "cancelled" even if some transition path missed updating the sub-field.
  const settlementStatus =
    (status === "Cancelled" || status === "Rejected") && rawSettlement !== "settled"
      ? "cancelled"
      : rawSettlement
  return {
    orderId: String(order._id),
    restaurantId: String(order.restaurantId ?? ""),
    orderNumber: order.orderNumber ?? "",
    status,
    riderId: order.riderId ?? "",
    riderName: order.riderSnapshot?.fullName ?? "",
    customerName: external.customerName ?? "",
    customerPhone: external.customerPhone ?? "",
    drop: {
      address: external.drop?.address ?? "",
    },
    orderValue: external.orderValue ?? 0,
    deliveryFee: external.deliveryFee ?? 0,
    collectAmount: external.collectAmount ?? 0,
    netToOwner: external.netToOwner ?? 0,
    paymentMode: external.paymentMode ?? "cod",
    settlementStatus,
    collectedAt: external.collectedAt ?? null,
    reconciledAt: external.reconciledAt ?? null,
    settledAt: external.settledAt ?? null,
    createdAt: order.createdAt ?? null,
    updatedAt: order.updatedAt ?? null,
  }
}

export type ExternalDeliveryListItem = ReturnType<typeof shapeExternalOrder>

// List an owner's off-platform delivery orders (newest first), with a light status filter.
// Parse an inclusive [from, to] day range (YYYY-MM-DD) into UTC-ish Date bounds. Returns null
// when neither bound is given, so callers can skip the filter entirely.
function buildExternalDateRange(from?: string, to?: string) {
  const start = from ? new Date(`${from}T00:00:00.000`) : null
  const end = to ? new Date(`${to}T23:59:59.999`) : null
  if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) {
    return null
  }
  if (!start && !end) return null
  return { start, end }
}

export async function listExternalDeliveries(params: {
  restaurantId: string
  tab?: "live" | "history"
  from?: string
  to?: string
  page?: number
  pageSize?: number
}) {
  const liveStatuses = ["New", "Accepted", "Preparing", "ReadyForPickup", "PickedUp"]
  const historyStatuses = ["Delivered", "Rejected", "Cancelled"]
  const query: Record<string, unknown> = {
    restaurantId: params.restaurantId,
    source: "external",
  }
  if (params.tab === "live") query.status = { $in: liveStatuses }
  if (params.tab === "history") query.status = { $in: historyStatuses }

  // Date range filters History + is ignored for Live (owner always wants all active ones).
  const range = params.tab !== "live" ? buildExternalDateRange(params.from, params.to) : null
  if (range) {
    query.createdAt = {
      ...(range.start ? { $gte: range.start } : {}),
      ...(range.end ? { $lte: range.end } : {}),
    }
  }

  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))

  const [items, total] = await Promise.all([
    OrderModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    OrderModel.countDocuments(query),
  ])

  return {
    items: items.map((order) => shapeExternalOrder(order as Record<string, any>)),
    total,
    page,
    pageSize,
  }
}

// KPI totals for the owner's external deliveries within an optional date range. `orderValue`
// and `youReceive` count only Delivered (completed) orders, so the numbers reflect real,
// settled business rather than in-flight or cancelled requests.
export async function getExternalDeliveryStats(params: {
  restaurantId: string
  from?: string
  to?: string
}) {
  const match: Record<string, unknown> = {
    restaurantId: mongoose.Types.ObjectId.isValid(params.restaurantId)
      ? new mongoose.Types.ObjectId(params.restaurantId)
      : params.restaurantId,
    source: "external",
  }
  const range = buildExternalDateRange(params.from, params.to)
  if (range) {
    match.createdAt = {
      ...(range.start ? { $gte: range.start } : {}),
      ...(range.end ? { $lte: range.end } : {}),
    }
  }

  const [row] = await OrderModel.aggregate<{
    requests: number
    delivered: number
    orderValue: number
    youReceive: number
  }>([
    { $match: match },
    {
      $group: {
        _id: null,
        requests: { $sum: 1 },
        delivered: {
          $sum: { $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0] },
        },
        orderValue: {
          $sum: {
            $cond: [
              { $eq: ["$status", "Delivered"] },
              { $ifNull: ["$external.orderValue", 0] },
              0,
            ],
          },
        },
        youReceive: {
          $sum: {
            $cond: [
              { $eq: ["$status", "Delivered"] },
              { $ifNull: ["$external.netToOwner", 0] },
              0,
            ],
          },
        },
      },
    },
  ])

  return {
    requests: row?.requests ?? 0,
    delivered: row?.delivered ?? 0,
    orderValue: row?.orderValue ?? 0,
    youReceive: row?.youReceive ?? 0,
  }
}

// Fetch a single external order that belongs to the owner's restaurant.
export async function getExternalDeliveryById(params: {
  restaurantId: string
  orderId: string
}) {
  const order = await OrderModel.findOne({
    _id: params.orderId,
    restaurantId: params.restaurantId,
    source: "external",
  }).lean()
  if (!order) {
    throw new AppError(StatusCodes.NOT_FOUND, "ORDER_NOT_FOUND", "Order not found")
  }
  return shapeExternalOrder(order as Record<string, any>)
}

// Cancel an off-platform delivery — only while it is still unassigned and waiting for a
// rider. Once a rider is assigned or the order is picked up, the owner must go through
// support so the rider can be unwound safely.
export async function cancelExternalDelivery(params: {
  restaurantId: string
  orderId: string
  reason?: string
}) {
  const order = await OrderModel.findOne({
    _id: params.orderId,
    restaurantId: params.restaurantId,
    source: "external",
  })
  if (!order) {
    throw new AppError(StatusCodes.NOT_FOUND, "ORDER_NOT_FOUND", "Order not found")
  }

  const riderId = String(order.get("riderId") ?? "").trim()
  // Owner may cancel any in-flight external delivery (before it is delivered) — even after a
  // rider has been assigned or has already picked it up. The assigned rider is notified
  // immediately below so they stop the delivery.
  if (!["ReadyForPickup", "PickedUp"].includes(order.status)) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "EXTERNAL_ORDER_NOT_CANCELLABLE",
      "This delivery can no longer be cancelled.",
    )
  }

  const now = new Date()
  const orderNumber = String(order.get("orderNumber") ?? "")
  order.status = "Cancelled"
  order.set("cancelledBy", "owner")
  order.set("terminalReason", params.reason?.trim() || "Cancelled by owner")
  order.set("riderId", "")
  order.set("external", {
    ...(order.get("external") ?? {}),
    settlementStatus: "cancelled",
  })
  order.set("timestamps", {
    ...(order.get("timestamps") ?? {}),
    Cancelled: now,
    cancelledAt: now,
  })
  order.history.push({
    status: "Cancelled",
    actor: "owner",
    note: params.reason?.trim() || "Cancelled by owner",
    createdAt: now,
  } as any)
  await order.save()

  // Notify the assigned rider immediately: drop the order from their active list
  // (rider.order.updated) and pop a clear cancel notice (rider.assignment.updated), plus a
  // push as a fallback. Fire-and-forget — a notification hiccup must not fail the cancel.
  if (riderId) {
    const plain = order.toObject()
    emitSocketEvent(`rider:${riderId}`, "rider.order.updated", plain)
    emitSocketEvent(`rider:${riderId}`, "rider.assignment.updated", {
      orderId: String(order._id ?? ""),
      orderNumber,
      message: `এক্সটার্নাল ডেলিভারি ${orderNumber} রেস্টুরেন্ট বাতিল করেছে। এই অর্ডারটি আর ডেলিভার করবেন না।`,
      assignmentAction: "cancelled",
    })
    try {
      await sendPushToRider({
        riderId,
        payload: {
          title: "ডেলিভারি বাতিল হয়েছে",
          body: `এক্সটার্নাল অর্ডার ${orderNumber} বাতিল হয়েছে। এই অর্ডারটি আর ডেলিভার করবেন না।`,
          data: {
            type: "rider_order_cancelled",
            orderId: String(order._id ?? ""),
            path: "/(app)/active",
          },
        },
      })
    } catch {
      // Cancel already saved; a push failure must not fail it.
    }
  }

  return shapeExternalOrder(order.toObject() as Record<string, any>)
}

// ── Admin: per-restaurant config + settlement oversight + reports ─────────────

// Admin reads the current external-delivery config for a restaurant, plus how much
// unsettled money Foodbela is currently holding for it.
export async function getExternalDeliveryConfig(restaurantId: string) {
  const restaurant = (await RestaurantModel.findById(restaurantId)
    .select("name commercial.externalDelivery")
    .lean()) as Record<string, any> | null
  if (!restaurant) {
    throw new AppError(StatusCodes.NOT_FOUND, "RESTAURANT_NOT_FOUND", "Restaurant not found")
  }
  return {
    restaurantId,
    restaurantName: restaurant.name ?? "",
    config: shapeExternalConfig(restaurant.commercial?.externalDelivery),
    currentExposureTaka: await getUnsettledExposureTaka(restaurantId),
  }
}

// Admin enables/disables external delivery for a restaurant and sets its flat fee,
// settlement policy + exposure cap. Enabling stamps an audit trail.
export async function setExternalDeliveryConfig(params: {
  restaurantId: string
  adminId: string
  enabled?: boolean
  deliveryFeeTaka?: number
  settlementPolicy?: SettlementPolicy
  settlementDays?: number | null
  exposureCapTaka?: number | null
}) {
  const restaurant = await RestaurantModel.findById(params.restaurantId)
  if (!restaurant) {
    throw new AppError(StatusCodes.NOT_FOUND, "RESTAURANT_NOT_FOUND", "Restaurant not found")
  }

  const current = shapeExternalConfig(
    (restaurant.get("commercial.externalDelivery") ?? {}) as Record<string, any>,
  )
  const nextEnabled = params.enabled ?? current.enabled
  const next: Record<string, any> = {
    enabled: nextEnabled,
    deliveryFeeTaka:
      params.deliveryFeeTaka !== undefined
        ? params.deliveryFeeTaka
        : current.deliveryFeeTaka,
    settlementPolicy: params.settlementPolicy ?? current.settlementPolicy,
    settlementDays:
      params.settlementDays !== undefined
        ? params.settlementDays
        : current.settlementDays,
    exposureCapTaka:
      params.exposureCapTaka !== undefined
        ? params.exposureCapTaka
        : current.exposureCapTaka,
    // Preserve the original enable audit; stamp it fresh only on a false→true flip.
    enabledByAdminId:
      nextEnabled && !current.enabled ? params.adminId : current.enabledByAdminId,
    enabledAt: nextEnabled && !current.enabled ? new Date() : current.enabledAt,
  }

  restaurant.set("commercial.externalDelivery", next)
  await restaurant.save()

  return {
    restaurantId: params.restaurantId,
    config: shapeExternalConfig(next),
  }
}

// Admin oversight list across all restaurants, filterable by order/settlement status.
export async function listExternalDeliveriesForAdmin(params: {
  restaurantId?: string
  status?: string
  settlementStatus?: string
  page?: number
  pageSize?: number
}) {
  const query: Record<string, unknown> = { source: "external" }
  if (params.restaurantId) query.restaurantId = params.restaurantId
  if (params.status) query.status = params.status
  if (params.settlementStatus) {
    query["external.settlementStatus"] = params.settlementStatus
  }

  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))

  const [items, total] = await Promise.all([
    OrderModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    OrderModel.countDocuments(query),
  ])

  const restaurantIds = [
    ...new Set(items.map((order) => String(order.restaurantId ?? ""))),
  ].filter(Boolean)
  const restaurants = restaurantIds.length
    ? await RestaurantModel.find({ _id: { $in: restaurantIds } })
        .select("name")
        .lean()
    : []
  const nameById = new Map(
    restaurants.map((restaurant) => [
      String(restaurant._id),
      (restaurant as Record<string, any>).name ?? "",
    ]),
  )

  return {
    items: items.map((order) => ({
      ...shapeExternalOrder(order as Record<string, any>),
      restaurantName: nameById.get(String(order.restaurantId ?? "")) ?? "",
    })),
    total,
    page,
    pageSize,
  }
}

// Money totals across every external order, grouped by settlement state — the finance
// oversight dashboard. Foodbela's revenue is the delivery-fee sum; the owner liability is
// the netToOwner still owed (collected + reconciled but not yet settled).
export async function getExternalDeliveryAdminSummary(
  params: { restaurantId?: string } = {},
) {
  const match: Record<string, unknown> = { source: "external" }
  if (params.restaurantId) {
    match.restaurantId = new mongoose.Types.ObjectId(params.restaurantId)
  }

  const rows = await OrderModel.aggregate<{
    _id: string
    count: number
    collectAmount: number
    deliveryFee: number
    netToOwner: number
  }>([
    { $match: match },
    {
      $group: {
        _id: "$external.settlementStatus",
        count: { $sum: 1 },
        collectAmount: { $sum: "$external.collectAmount" },
        deliveryFee: { $sum: "$external.deliveryFee" },
        netToOwner: { $sum: "$external.netToOwner" },
      },
    },
  ])

  const byStatus: Record<
    string,
    { count: number; collectAmount: number; deliveryFee: number; netToOwner: number }
  > = {}
  for (const row of rows) {
    byStatus[row._id || "pending"] = {
      count: row.count,
      collectAmount: roundTaka(row.collectAmount),
      deliveryFee: roundTaka(row.deliveryFee),
      netToOwner: roundTaka(row.netToOwner),
    }
  }

  const sumOver = (
    statuses: string[],
    field: "collectAmount" | "deliveryFee" | "netToOwner",
  ) =>
    roundTaka(
      statuses.reduce((sum, status) => sum + (byStatus[status]?.[field] ?? 0), 0),
    )

  return {
    byStatus,
    // Owner money awaiting payout (collected cash + reconciled, not yet settled).
    owedToOwners: sumOver(["collected", "reconciled"], "netToOwner"),
    // Cash the admin still needs to confirm as deposited.
    awaitingReconcile: sumOver(["collected"], "netToOwner"),
    // Reconciled and ready to pay out.
    readyToSettle: sumOver(["reconciled"], "netToOwner"),
    // Foodbela's earned delivery revenue on delivered (collected+) orders.
    foodbelaRevenue: sumOver(["collected", "reconciled", "settled"], "deliveryFee"),
    settledToOwners: sumOver(["settled"], "netToOwner"),
  }
}

// Per-restaurant reports over an optional date range — this module's own analytics,
// independent of the platform finance/analytics.
export async function getExternalDeliveryReports(params: {
  from?: string
  to?: string
}) {
  const match: Record<string, any> = { source: "external" }
  const createdAt: Record<string, Date> = {}
  if (params.from) {
    const from = new Date(params.from)
    if (!Number.isNaN(from.getTime())) createdAt.$gte = from
  }
  if (params.to) {
    const to = new Date(params.to)
    if (!Number.isNaN(to.getTime())) createdAt.$lte = to
  }
  if (Object.keys(createdAt).length) match.createdAt = createdAt

  const rows = await OrderModel.aggregate<{
    _id: mongoose.Types.ObjectId
    orders: number
    delivered: number
    cancelled: number
    collectAmount: number
    deliveryFee: number
    netToOwner: number
    settledToOwner: number
  }>([
    { $match: match },
    {
      $group: {
        _id: "$restaurantId",
        orders: { $sum: 1 },
        delivered: {
          $sum: { $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0] },
        },
        cancelled: {
          $sum: {
            $cond: [{ $in: ["$status", ["Cancelled", "Rejected"]] }, 1, 0],
          },
        },
        // Money is only real for Delivered orders — cancelled/in-flight orders still carry
        // collectAmount/netToOwner from creation but no cash actually moved, so exclude them.
        collectAmount: {
          $sum: {
            $cond: [{ $eq: ["$status", "Delivered"] }, "$external.collectAmount", 0],
          },
        },
        deliveryFee: {
          $sum: {
            $cond: [{ $eq: ["$status", "Delivered"] }, "$external.deliveryFee", 0],
          },
        },
        netToOwner: {
          $sum: {
            $cond: [{ $eq: ["$status", "Delivered"] }, "$external.netToOwner", 0],
          },
        },
        settledToOwner: {
          $sum: {
            $cond: [
              { $eq: ["$external.settlementStatus", "settled"] },
              "$external.netToOwner",
              0,
            ],
          },
        },
      },
    },
    { $sort: { deliveryFee: -1 } },
  ])

  const restaurantIds = rows.map((row) => row._id).filter(Boolean)
  const restaurants = restaurantIds.length
    ? await RestaurantModel.find({ _id: { $in: restaurantIds } })
        .select("name")
        .lean()
    : []
  const nameById = new Map(
    restaurants.map((restaurant) => [
      String(restaurant._id),
      (restaurant as Record<string, any>).name ?? "",
    ]),
  )

  const restaurantRows = rows.map((row) => ({
    restaurantId: String(row._id ?? ""),
    restaurantName: nameById.get(String(row._id ?? "")) ?? "",
    orders: row.orders,
    delivered: row.delivered,
    cancelled: row.cancelled,
    collectAmount: roundTaka(row.collectAmount),
    deliveryFee: roundTaka(row.deliveryFee),
    netToOwner: roundTaka(row.netToOwner),
    settledToOwner: roundTaka(row.settledToOwner),
  }))

  const totals = restaurantRows.reduce(
    (acc, row) => ({
      orders: acc.orders + row.orders,
      delivered: acc.delivered + row.delivered,
      cancelled: acc.cancelled + row.cancelled,
      collectAmount: roundTaka(acc.collectAmount + row.collectAmount),
      deliveryFee: roundTaka(acc.deliveryFee + row.deliveryFee),
      netToOwner: roundTaka(acc.netToOwner + row.netToOwner),
      settledToOwner: roundTaka(acc.settledToOwner + row.settledToOwner),
    }),
    {
      orders: 0,
      delivered: 0,
      cancelled: 0,
      collectAmount: 0,
      deliveryFee: 0,
      netToOwner: 0,
      settledToOwner: 0,
    },
  )

  return {
    range: { from: params.from ?? null, to: params.to ?? null },
    restaurants: restaurantRows,
    totals,
  }
}

// Admin confirms the COD cash for an order has been deposited: collected → reconciled.
export async function reconcileExternalDelivery(params: {
  orderId: string
  adminId: string
}) {
  const order = await OrderModel.findOne({
    _id: params.orderId,
    source: "external",
  })
  if (!order) {
    throw new AppError(StatusCodes.NOT_FOUND, "ORDER_NOT_FOUND", "Order not found")
  }
  const external = (order.get("external") ?? {}) as Record<string, any>
  if (external.settlementStatus !== "collected") {
    throw new AppError(
      StatusCodes.CONFLICT,
      "EXTERNAL_NOT_RECONCILABLE",
      "Only collected orders can be reconciled",
    )
  }
  order.set("external", {
    ...external,
    settlementStatus: "reconciled",
    reconciledAt: new Date(),
  })
  await order.save()
  return shapeExternalOrder(order.toObject() as Record<string, any>)
}

function createSettlementId() {
  return `EXT-${Date.now()}-${randomInt(1000, 10000)}`
}

// Admin pays out one or more reconciled orders to the owner in a single settlement batch:
// reconciled → settled. Returns the batch id + totals for the finance record.
export async function settleExternalDeliveries(params: {
  orderIds: string[]
  adminId: string
}) {
  if (!Array.isArray(params.orderIds) || params.orderIds.length === 0) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "NO_ORDERS_SELECTED",
      "Select at least one order to settle",
    )
  }

  const orders = await OrderModel.find({
    _id: { $in: params.orderIds },
    source: "external",
    "external.settlementStatus": "reconciled",
  })

  if (orders.length === 0) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "NO_SETTLEABLE_ORDERS",
      "None of the selected orders are reconciled and ready to settle",
    )
  }

  const settlementId = createSettlementId()
  const now = new Date()
  let totalNetToOwner = 0
  let totalDeliveryFee = 0

  for (const order of orders) {
    const external = (order.get("external") ?? {}) as Record<string, any>
    order.set("external", {
      ...external,
      settlementStatus: "settled",
      settledAt: now,
      settlementId,
    })
    await order.save()
    totalNetToOwner += Number(external.netToOwner ?? 0)
    totalDeliveryFee += Number(external.deliveryFee ?? 0)
  }

  return {
    settlementId,
    settledByAdminId: params.adminId,
    settledCount: orders.length,
    totalNetToOwner: roundTaka(totalNetToOwner),
    totalDeliveryFee: roundTaka(totalDeliveryFee),
    settledAt: now,
  }
}
