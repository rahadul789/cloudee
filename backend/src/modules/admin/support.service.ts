import mongoose from "mongoose"
import { StatusCodes } from "http-status-codes"

import { AppError } from "../../common/utils/app-error"
import { emitSocketEvent, hasActiveSocketChannel } from "../../config/socket"
import { AdminAuditLogModel, AdminModel } from "./admin.model"
import { OwnerModel, RestaurantModel, RiderModel } from "../auth/auth.model"
import { CustomerModel } from "../customer/customer.model"
import { createCustomerNotification, sendPushToCustomer } from "../customer/push.service"
import { SupportCaseModel } from "../owner/experience.model"
import { createOwnerNotification } from "../owner/operational.service"
import { OrderModel } from "../owner/operational.model"
import {
  buildOrderServiceAreaScopeFilter,
  buildRestaurantServiceAreaScopeFilter,
  buildRiderServiceAreaScopeFilter,
} from "../service-area/service-area.service"

type SupportCaseStatus = "open" | "in_progress" | "resolved" | "closed"
type SupportCasePriority = "low" | "medium" | "high"
type SupportCaseSource = "all" | "customer" | "owner" | "rider" | "admin"

const MAX_SUPPORT_CASE_REPLIES = 300
const MAX_SUPPORT_CASE_HISTORY = 200
const MAX_SUPPORT_CASE_INTERNAL_NOTES = 200

type ListSupportCasesParams = {
  search?: string
  zoneId?: string
  districtId?: string
  source?: SupportCaseSource
  status?: "all" | SupportCaseStatus
  priority?: "all" | SupportCasePriority
  assigned?: "all" | "me" | "unassigned"
  categoryId?: string
  sla?: "all" | "overdue" | "due_soon" | "healthy"
  sortBy?: "newest" | "oldest" | "updated" | "priority" | "sla"
  page?: number
  pageSize?: number
  adminId?: string
}

function objectIdString(value: unknown) {
  if (!value) return ""
  if (typeof value === "string") return value
  if (value instanceof mongoose.Types.ObjectId) return value.toString()
  if (typeof value === "object" && "toString" in value) return String(value)
  return ""
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function capSupportCaseActivity(supportCase: {
  replies?: any[]
  history?: any[]
  internalNotes?: any[]
}) {
  supportCase.replies = (supportCase.replies ?? []).slice(-MAX_SUPPORT_CASE_REPLIES)
  supportCase.history = (supportCase.history ?? []).slice(-MAX_SUPPORT_CASE_HISTORY)
  supportCase.internalNotes = (supportCase.internalNotes ?? []).slice(-MAX_SUPPORT_CASE_INTERNAL_NOTES)
}

function serializeDate(value: unknown) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function clampPage(value?: number) {
  if (!value || Number.isNaN(value)) return 1
  return Math.max(1, Math.floor(value))
}

function clampPageSize(value?: number) {
  if (!value || Number.isNaN(value)) return 20
  return Math.min(100, Math.max(5, Math.floor(value)))
}

function buildSlaDueAt(priority: SupportCasePriority) {
  const hours = priority === "high" ? 4 : priority === "medium" ? 12 : 24
  return new Date(Date.now() + hours * 60 * 60 * 1000)
}

function getSlaState(supportCase: Record<string, any>) {
  if (supportCase.status === "resolved" || supportCase.status === "closed") {
    return { key: "done", label: "Completed", minutesRemaining: null }
  }
  const dueAt = supportCase.slaDueAt ? new Date(supportCase.slaDueAt) : buildSlaDueAt(stringValue(supportCase.priority, "medium") as SupportCasePriority)
  const minutesRemaining = Math.round((dueAt.getTime() - Date.now()) / 60000)
  if (minutesRemaining < 0) return { key: "overdue", label: "Overdue", minutesRemaining }
  if (minutesRemaining <= 120) return { key: "due_soon", label: "Due soon", minutesRemaining }
  return { key: "healthy", label: "On track", minutesRemaining }
}

async function getAdmin(adminId?: string) {
  if (!adminId) return { id: "", name: "Admin", role: "admin" }
  const admin = await AdminModel.findById(adminId, { fullName: 1, role: 1 }).lean()
  return {
    id: adminId,
    name: stringValue(admin?.fullName, "Admin"),
    role: stringValue(admin?.role, "admin"),
  }
}

async function writeSupportAudit(params: {
  adminId?: string
  supportCaseId: string
  action: string
  title: string
  description?: string
  metadata?: Record<string, unknown>
}) {
  const admin = await getAdmin(params.adminId)
  await AdminAuditLogModel.create({
    actorAdminId: params.adminId ?? "",
    actorName: admin.name,
    actorRole: admin.role,
    entityType: "support_case",
    entityId: params.supportCaseId,
    action: params.action,
    title: params.title,
    description: params.description ?? "",
    metadata: params.metadata ?? {},
  })
}

async function buildSupportQuery(params: ListSupportCasesParams) {
  const query: Record<string, any> = {}
  if (params.source && params.source !== "all") query.source = params.source
  if (params.status && params.status !== "all") query.status = params.status
  if (params.priority && params.priority !== "all") query.priority = params.priority
  if (params.categoryId && params.categoryId !== "all") query.categoryId = params.categoryId
  if (params.assigned === "unassigned") query.assignedAdminId = { $in: ["", null] }
  if (params.assigned === "me" && params.adminId) query.assignedAdminId = params.adminId
  if (params.sla && params.sla !== "all") {
    const now = new Date()
    if (params.sla === "overdue") {
      query.status = { $nin: ["resolved", "closed"] }
      query.slaDueAt = { $lt: now }
    } else if (params.sla === "due_soon") {
      query.status = { $nin: ["resolved", "closed"] }
      query.slaDueAt = { $gte: now, $lte: new Date(Date.now() + 2 * 60 * 60 * 1000) }
    } else {
      query.$or = [{ slaDueAt: null }, { slaDueAt: { $gt: new Date(Date.now() + 2 * 60 * 60 * 1000) } }]
    }
  }
  if (params.search?.trim()) {
    const search = params.search.trim()
    query.$and = [
      ...(query.$and ?? []),
      {
        $or: [
          { subject: { $regex: search, $options: "i" } },
          { message: { $regex: search, $options: "i" } },
          { categoryId: { $regex: search, $options: "i" } },
          { "customerSnapshot.fullName": { $regex: search, $options: "i" } },
          { "requesterSnapshot.fullName": { $regex: search, $options: "i" } },
          { "requesterSnapshot.phone": { $regex: search, $options: "i" } },
        ],
      },
    ]
  }
  const [restaurantIds, orderIds, riderIds] = await Promise.all([
    Object.keys(buildRestaurantServiceAreaScopeFilter(params)).length
      ? RestaurantModel.distinct("_id", buildRestaurantServiceAreaScopeFilter(params))
      : Promise.resolve([]),
    Object.keys(buildOrderServiceAreaScopeFilter(params)).length
      ? OrderModel.distinct("_id", buildOrderServiceAreaScopeFilter(params))
      : Promise.resolve([]),
    Object.keys(buildRiderServiceAreaScopeFilter(params)).length
      ? RiderModel.distinct("_id", buildRiderServiceAreaScopeFilter(params))
      : Promise.resolve([]),
  ])
  const scopeConditions: Record<string, any>[] = []
  if (restaurantIds.length) scopeConditions.push({ restaurantId: { $in: restaurantIds } })
  if (orderIds.length) scopeConditions.push({ orderId: { $in: orderIds } })
  if (riderIds.length) scopeConditions.push({ riderId: { $in: riderIds } })
  if (params.zoneId?.trim() || params.districtId?.trim()) {
    query.$and = [
      ...(query.$and ?? []),
      scopeConditions.length ? { $or: scopeConditions } : { _id: { $exists: false } },
    ]
  }
  return query
}

function mapSupportCase(params: {
  supportCase: Record<string, any>
  restaurant?: Record<string, any>
  owner?: Record<string, any>
  customer?: Record<string, any>
  rider?: Record<string, any>
  order?: Record<string, any>
  assignedAdmin?: Record<string, any>
}) {
  const item = params.supportCase
  const requesterName =
    stringValue(item.requesterSnapshot?.fullName) ||
    stringValue(item.customerSnapshot?.fullName) ||
    stringValue(params.customer?.fullName) ||
    stringValue(params.owner?.fullName) ||
    stringValue(params.rider?.fullName) ||
    "Requester"
  const requesterPhone =
    stringValue(item.requesterSnapshot?.phone) ||
    stringValue(item.customerSnapshot?.phone) ||
    stringValue(params.customer?.phone) ||
    stringValue(params.owner?.phone) ||
    stringValue(params.rider?.phone)
  const replies = Array.isArray(item.replies) ? item.replies : []
  const lastReply = replies.at(-1)
  return {
    id: objectIdString(item._id),
    source: stringValue(item.source, "owner"),
    ownerId: objectIdString(item.ownerId),
    restaurantId: objectIdString(item.restaurantId),
    customerId: objectIdString(item.customerId),
    riderId: objectIdString(item.riderId),
    orderId: objectIdString(item.orderId),
    restaurantName: stringValue(params.restaurant?.name),
    orderNumber: stringValue(params.order?.orderNumber),
    requesterName,
    requesterPhone,
    kind: item.kind === "question" ? "question" : "report",
    subject: stringValue(item.subject),
    categoryId: stringValue(item.categoryId),
    message: stringValue(item.message),
    status: stringValue(item.status, "open") as SupportCaseStatus,
    priority: stringValue(item.priority, "medium") as SupportCasePriority,
    assignedAdminId: stringValue(item.assignedAdminId),
    assignedAdminName: stringValue(item.assignedAdminName) || stringValue(params.assignedAdmin?.fullName),
    slaDueAt: serializeDate(item.slaDueAt),
    sla: getSlaState(item),
    firstResponseAt: serializeDate(item.firstResponseAt),
    resolvedAt: serializeDate(item.resolvedAt),
    closedAt: serializeDate(item.closedAt),
    resolutionNote: stringValue(item.resolutionNote),
    tags: Array.isArray(item.tags) ? item.tags.map((tag: unknown) => stringValue(tag)).filter(Boolean) : [],
    attachmentCount: Array.isArray(item.attachments) ? item.attachments.length : 0,
    replyCount: replies.length,
    latestReplyMessage: stringValue(lastReply?.message),
    latestReplyAt: serializeDate(lastReply?.createdAt),
    createdAt: serializeDate(item.createdAt),
    updatedAt: serializeDate(item.updatedAt),
  }
}

async function hydrateSupportRows(cases: Array<Record<string, any>>) {
  const restaurantIds = [...new Set(cases.map((item) => objectIdString(item.restaurantId)).filter(Boolean))]
  const ownerIds = [...new Set(cases.map((item) => objectIdString(item.ownerId)).filter(Boolean))]
  const customerIds = [...new Set(cases.map((item) => objectIdString(item.customerId)).filter(Boolean))]
  const riderIds = [...new Set(cases.map((item) => objectIdString(item.riderId)).filter(Boolean))]
  const orderIds = [...new Set(cases.map((item) => objectIdString(item.orderId)).filter(Boolean))]
  const adminIds = [...new Set(cases.map((item) => stringValue(item.assignedAdminId)).filter(Boolean))]
  const [restaurants, owners, customers, riders, orders, admins] = await Promise.all([
    restaurantIds.length ? RestaurantModel.find({ _id: { $in: restaurantIds } }, { name: 1, address: 1 }).lean() : [],
    ownerIds.length ? OwnerModel.find({ _id: { $in: ownerIds } }, { fullName: 1, phone: 1, email: 1 }).lean() : [],
    customerIds.length ? CustomerModel.find({ _id: { $in: customerIds } }, { fullName: 1, phone: 1, email: 1 }).lean() : [],
    riderIds.length ? RiderModel.find({ _id: { $in: riderIds } }, { fullName: 1, phone: 1 }).lean() : [],
    orderIds.length ? OrderModel.find({ _id: { $in: orderIds } }, { orderNumber: 1, status: 1, pricing: 1 }).lean() : [],
    adminIds.length ? AdminModel.find({ _id: { $in: adminIds } }, { fullName: 1 }).lean() : [],
  ])
  const restaurantMap = new Map(restaurants.map((item) => [objectIdString(item._id), item]))
  const ownerMap = new Map(owners.map((item) => [objectIdString(item._id), item]))
  const customerMap = new Map(customers.map((item) => [objectIdString(item._id), item]))
  const riderMap = new Map(riders.map((item) => [objectIdString(item._id), item]))
  const orderMap = new Map(orders.map((item) => [objectIdString(item._id), item]))
  const adminMap = new Map(admins.map((item) => [objectIdString(item._id), item]))
  return cases.map((supportCase) =>
    mapSupportCase({
      supportCase,
      restaurant: restaurantMap.get(objectIdString(supportCase.restaurantId)),
      owner: ownerMap.get(objectIdString(supportCase.ownerId)),
      customer: customerMap.get(objectIdString(supportCase.customerId)),
      rider: riderMap.get(objectIdString(supportCase.riderId)),
      order: orderMap.get(objectIdString(supportCase.orderId)),
      assignedAdmin: adminMap.get(stringValue(supportCase.assignedAdminId)),
    })
  )
}

export async function listSupportCases(params: ListSupportCasesParams = {}) {
  const page = clampPage(params.page)
  const pageSize = clampPageSize(params.pageSize)
  const query = await buildSupportQuery(params)
  const sort: Record<string, 1 | -1> =
    params.sortBy === "oldest"
      ? { createdAt: 1 }
      : params.sortBy === "updated"
        ? { updatedAt: -1, createdAt: -1 }
        : params.sortBy === "priority"
          ? { priority: -1, createdAt: -1 }
          : params.sortBy === "sla"
            ? { slaDueAt: 1, createdAt: -1 }
            : { updatedAt: -1, createdAt: -1 }
  const [cases, total, summaryRows, categories, admins] = await Promise.all([
    SupportCaseModel.find(query).sort(sort).skip((page - 1) * pageSize).limit(pageSize).lean(),
    SupportCaseModel.countDocuments(query),
    SupportCaseModel.aggregate<Record<string, any>>([
      { $match: query },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          open: { $sum: { $cond: [{ $eq: ["$status", "open"] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] } },
          resolved: { $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] } },
          closed: { $sum: { $cond: [{ $eq: ["$status", "closed"] }, 1, 0] } },
          highPriority: { $sum: { $cond: [{ $eq: ["$priority", "high"] }, 1, 0] } },
          unassigned: { $sum: { $cond: [{ $in: ["$assignedAdminId", ["", null]] }, 1, 0] } },
          overdue: {
            $sum: {
              $cond: [
                { $and: [{ $not: [{ $in: ["$status", ["resolved", "closed"]] }] }, { $lt: ["$slaDueAt", new Date()] }] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    SupportCaseModel.distinct("categoryId", query),
    AdminModel.find({ status: "active" }, { fullName: 1, role: 1 }).sort({ fullName: 1 }).lean(),
  ])
  const items = await hydrateSupportRows(cases)
  const summary = summaryRows[0] ?? {}
  return {
    items,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    summary: {
      total: numberValue(summary.total),
      open: numberValue(summary.open),
      inProgress: numberValue(summary.inProgress),
      resolved: numberValue(summary.resolved),
      closed: numberValue(summary.closed),
      highPriority: numberValue(summary.highPriority),
      unassigned: numberValue(summary.unassigned),
      overdue: numberValue(summary.overdue),
    },
    categories: categories.map((category) => stringValue(category)).filter(Boolean).sort(),
    admins: admins.map((admin) => ({
      id: objectIdString(admin._id),
      name: stringValue(admin.fullName, "Admin"),
      role: stringValue(admin.role, "admin"),
    })),
  }
}

export async function getSupportCaseDetails(supportCaseId: string) {
  if (!mongoose.Types.ObjectId.isValid(supportCaseId)) {
    throw new AppError(StatusCodes.NOT_FOUND, "SUPPORT_CASE_NOT_FOUND", "Support case not found")
  }
  const supportCase = await SupportCaseModel.findById(supportCaseId).lean()
  if (!supportCase) {
    throw new AppError(StatusCodes.NOT_FOUND, "SUPPORT_CASE_NOT_FOUND", "Support case not found")
  }
  const [mapped] = await hydrateSupportRows([supportCase])
  const [auditLogs, order] = await Promise.all([
    AdminAuditLogModel.find({ entityType: "support_case", entityId: supportCaseId }).sort({ createdAt: -1 }).limit(30).lean(),
    supportCase.orderId
      ? OrderModel.findById(supportCase.orderId, { orderNumber: 1, status: 1, pricing: 1, paymentMethod: 1, paymentStatus: 1, createdAt: 1 }).lean()
      : null,
  ])
  return {
    supportCase: mapped,
    messages: [
      {
        id: `${supportCaseId}-root`,
        senderType: stringValue(supportCase.source, "customer"),
        senderName: mapped.requesterName,
        message: stringValue(supportCase.message),
        createdAt: serializeDate(supportCase.createdAt),
        attachments: supportCase.attachments ?? [],
      },
      ...((supportCase.replies as Array<Record<string, any>> | undefined) ?? []).map((reply, index) => ({
        id: `${supportCaseId}-reply-${index}`,
        senderType: reply.senderType === "customer" ? "customer" : "admin",
        senderName: stringValue(reply.senderName, reply.senderType === "admin" ? "Support Team" : mapped.requesterName),
        message: stringValue(reply.message),
        createdAt: serializeDate(reply.createdAt),
        attachments: reply.attachments ?? [],
      })),
    ],
    internalNotes: ((supportCase.internalNotes as Array<Record<string, any>> | undefined) ?? []).map((note, index) => ({
      id: `${supportCaseId}-note-${index}`,
      note: stringValue(note.note),
      adminName: stringValue(note.adminName, "Admin"),
      createdAt: serializeDate(note.createdAt),
    })),
    history: ((supportCase.history as Array<Record<string, any>> | undefined) ?? []).map((entry, index) => ({
      id: `${supportCaseId}-history-${index}`,
      action: stringValue(entry.action),
      actorName: stringValue(entry.actorName),
      note: stringValue(entry.note),
      previousValue: stringValue(entry.previousValue),
      nextValue: stringValue(entry.nextValue),
      createdAt: serializeDate(entry.createdAt),
    })),
    order: order
      ? {
          id: objectIdString(order._id),
          orderNumber: stringValue(order.orderNumber),
          status: stringValue(order.status),
          total: numberValue((order.pricing as { total?: number } | undefined)?.total),
          paymentMethod: stringValue(order.paymentMethod),
          paymentStatus: stringValue(order.paymentStatus),
          createdAt: serializeDate(order.createdAt),
        }
      : null,
    auditLogs: auditLogs.map((log) => ({
      id: objectIdString(log._id),
      action: stringValue(log.action),
      title: stringValue(log.title),
      description: stringValue(log.description),
      actorName: stringValue(log.actorName, "Admin"),
      createdAt: serializeDate(log.createdAt),
      metadata: log.metadata ?? {},
    })),
  }
}

async function notifyRequester(supportCase: any, replyMessage: string) {
  if (supportCase.source === "owner" && supportCase.ownerId && supportCase.restaurantId) {
    await createOwnerNotification({
      ownerId: supportCase.ownerId.toString(),
      restaurantId: supportCase.restaurantId.toString(),
      type: "support",
      eventType: "support.updated",
      entityType: "support_case",
      entityId: supportCase.id,
      title: "Support reply received",
      titleBn: "সাপোর্ট রিপ্লাই এসেছে",
      description: replyMessage.slice(0, 140),
      actionPath: `/support?caseId=${supportCase.id}`,
    })
  }
  if (supportCase.source === "customer" && supportCase.customerId) {
    const customerChannel = `customer:${supportCase.customerId.toString()}`
    const payload = {
      title: "Support replied",
      body: replyMessage.slice(0, 140),
      data: { type: "support_reply", path: `/support-chat?caseId=${supportCase.id}` },
    }
    emitSocketEvent(customerChannel, "customer.support.updated", await getSupportCaseDetails(supportCase.id))
    if (hasActiveSocketChannel(customerChannel)) {
      await createCustomerNotification({ customerId: supportCase.customerId.toString(), payload })
    } else {
      await sendPushToCustomer({ customerId: supportCase.customerId.toString(), payload })
    }
  }
}

export async function replySupportCase(params: {
  supportCaseId: string
  adminId: string
  message: string
  status?: SupportCaseStatus
}) {
  const supportCase = await SupportCaseModel.findById(params.supportCaseId)
  if (!supportCase) {
    throw new AppError(StatusCodes.NOT_FOUND, "SUPPORT_CASE_NOT_FOUND", "Support case not found")
  }
  const admin = await getAdmin(params.adminId)
  const replyMessage = params.message.trim()
  supportCase.replies.push({
    message: replyMessage,
    senderType: "admin",
    senderId: params.adminId,
    senderName: admin.name,
    attachments: [],
    createdAt: new Date(),
  })
  if (!supportCase.firstResponseAt) supportCase.firstResponseAt = new Date()
  if (params.status) supportCase.status = params.status
  if (!supportCase.assignedAdminId) {
    supportCase.assignedAdminId = params.adminId
    supportCase.assignedAdminName = admin.name
  }
  supportCase.history.push({
    action: "reply",
    actorId: params.adminId,
    actorName: admin.name,
    note: replyMessage.slice(0, 180),
    createdAt: new Date(),
  })
  capSupportCaseActivity(supportCase)
  await supportCase.save()
  await writeSupportAudit({
    adminId: params.adminId,
    supportCaseId: params.supportCaseId,
    action: "support.reply",
    title: "Support reply sent",
    description: replyMessage.slice(0, 180),
  })
  await notifyRequester(supportCase, replyMessage)
  return getSupportCaseDetails(params.supportCaseId)
}

export async function updateSupportCase(params: {
  supportCaseId: string
  adminId: string
  status?: SupportCaseStatus
  priority?: SupportCasePriority
  assignedAdminId?: string
  resolutionNote?: string
  tags?: string[]
}) {
  const supportCase = await SupportCaseModel.findById(params.supportCaseId)
  if (!supportCase) {
    throw new AppError(StatusCodes.NOT_FOUND, "SUPPORT_CASE_NOT_FOUND", "Support case not found")
  }
  const admin = await getAdmin(params.adminId)
  const historyEntries = []
  if (params.status && params.status !== supportCase.status) {
    historyEntries.push({ action: "status", previousValue: supportCase.status, nextValue: params.status })
    supportCase.status = params.status
    if (params.status === "resolved") supportCase.resolvedAt = new Date()
    if (params.status === "closed") supportCase.closedAt = new Date()
  }
  if (params.priority && params.priority !== supportCase.priority) {
    historyEntries.push({ action: "priority", previousValue: supportCase.priority, nextValue: params.priority })
    supportCase.priority = params.priority
    if (!supportCase.slaDueAt || supportCase.status === "open") supportCase.slaDueAt = buildSlaDueAt(params.priority)
  }
  if (params.assignedAdminId !== undefined && params.assignedAdminId !== supportCase.assignedAdminId) {
    const assignee = params.assignedAdminId ? await getAdmin(params.assignedAdminId) : { id: "", name: "" }
    historyEntries.push({ action: "assign", previousValue: supportCase.assignedAdminId, nextValue: params.assignedAdminId })
    supportCase.assignedAdminId = params.assignedAdminId
    supportCase.assignedAdminName = assignee.name
  }
  if (params.resolutionNote !== undefined) supportCase.resolutionNote = params.resolutionNote
  if (params.tags) supportCase.tags = params.tags.map((tag) => tag.trim()).filter(Boolean)
  supportCase.history.push(
    ...historyEntries.map((entry) => ({
      ...entry,
      actorId: params.adminId,
      actorName: admin.name,
      note: params.resolutionNote ?? "",
      createdAt: new Date(),
    }))
  )
  capSupportCaseActivity(supportCase)
  await supportCase.save()
  await writeSupportAudit({
    adminId: params.adminId,
    supportCaseId: params.supportCaseId,
    action: "support.update",
    title: "Support case updated",
    description: historyEntries.map((entry) => entry.action).join(", ") || "Support metadata updated",
    metadata: { status: supportCase.status, priority: supportCase.priority, assignedAdminId: supportCase.assignedAdminId },
  })
  return getSupportCaseDetails(params.supportCaseId)
}

export async function addSupportInternalNote(params: {
  supportCaseId: string
  adminId: string
  note: string
}) {
  const supportCase = await SupportCaseModel.findById(params.supportCaseId)
  if (!supportCase) {
    throw new AppError(StatusCodes.NOT_FOUND, "SUPPORT_CASE_NOT_FOUND", "Support case not found")
  }
  const admin = await getAdmin(params.adminId)
  supportCase.internalNotes.push({
    note: params.note.trim(),
    adminId: params.adminId,
    adminName: admin.name,
    createdAt: new Date(),
  })
  supportCase.history.push({
    action: "internal_note",
    actorId: params.adminId,
    actorName: admin.name,
    note: params.note.trim().slice(0, 180),
    createdAt: new Date(),
  })
  capSupportCaseActivity(supportCase)
  await supportCase.save()
  await writeSupportAudit({
    adminId: params.adminId,
    supportCaseId: params.supportCaseId,
    action: "support.internal_note",
    title: "Internal note added",
    description: params.note.trim().slice(0, 180),
  })
  return getSupportCaseDetails(params.supportCaseId)
}
