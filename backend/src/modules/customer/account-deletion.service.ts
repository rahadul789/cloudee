import { AppError } from "../../common/utils/app-error"
import { getPlatformContent } from "../public/content.service"
import { CustomerModel } from "./customer.model"
import { AccountDeletionRequestModel } from "./account-deletion.model"

export type AccountDeletionStatus =
  | "pending"
  | "reviewing"
  | "completed"
  | "rejected"

function normalizePhone(value: string) {
  return String(value ?? "").replace(/[^\d+]/g, "").trim()
}

export async function getAccountDeletionConfig() {
  const content = await getPlatformContent()
  const config =
    ((content.operations as Record<string, any>)?.accountDeletion as
      | Record<string, any>
      | undefined) ?? {}
  return {
    // Default ON so the Play-compliant path exists unless admins explicitly disable it.
    enabled: config.enabled !== false,
    reviewDays:
      typeof config.reviewDays === "number" && Number.isFinite(config.reviewDays)
        ? config.reviewDays
        : 7,
  }
}

export async function submitAccountDeletionRequest(params: {
  phone: string
  reason?: string
}) {
  const config = await getAccountDeletionConfig()
  if (!config.enabled) {
    throw new AppError(
      403,
      "account_deletion_disabled",
      "Account deletion requests are currently unavailable.",
    )
  }

  const phone = normalizePhone(params.phone)
  if (phone.replace(/\D/g, "").length < 6) {
    throw new AppError(400, "invalid_phone", "Please enter a valid phone number.")
  }

  // Best-effort account match so admins see a name next to the phone. Never required —
  // a request for a non-matching number is still recorded for the admin to review.
  const customer = await CustomerModel.findOne({ phone })
    .select("_id fullName")
    .lean()

  // De-dupe: an open (pending/reviewing) request for the same phone is returned as-is
  // instead of stacking duplicates, so repeated taps don't spam the queue.
  const existing = await AccountDeletionRequestModel.findOne({
    phone,
    status: { $in: ["pending", "reviewing"] },
  }).lean()
  if (existing) {
    return {
      status: "received" as const,
      reviewDays: config.reviewDays,
      alreadyPending: true,
    }
  }

  await AccountDeletionRequestModel.create({
    phone,
    customerId: customer?._id ?? null,
    customerName: customer?.fullName ?? "",
    reason: (params.reason ?? "").trim().slice(0, 500),
    reviewDays: config.reviewDays,
    status: "pending",
    source: "customer_app",
  })

  return {
    status: "received" as const,
    reviewDays: config.reviewDays,
    alreadyPending: false,
  }
}

function mapDeletionRequest(doc: Record<string, any>) {
  return {
    id: String(doc._id ?? ""),
    phone: doc.phone ?? "",
    customerId: doc.customerId ? String(doc.customerId) : null,
    customerName: doc.customerName ?? "",
    reason: doc.reason ?? "",
    status: (doc.status ?? "pending") as AccountDeletionStatus,
    reviewDays: typeof doc.reviewDays === "number" ? doc.reviewDays : 7,
    source: doc.source ?? "",
    adminNote: doc.adminNote ?? "",
    handledByAdminId: doc.handledByAdminId ?? "",
    handledAt: doc.handledAt ? new Date(doc.handledAt).toISOString() : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  }
}

export async function listAccountDeletionRequests(params: {
  status?: string
  page?: number
  pageSize?: number
}) {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))
  const query: Record<string, any> = {}
  if (params.status && params.status !== "all") {
    query.status = params.status
  }

  const [items, total, pendingCount] = await Promise.all([
    AccountDeletionRequestModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    AccountDeletionRequestModel.countDocuments(query),
    AccountDeletionRequestModel.countDocuments({ status: "pending" }),
  ])

  return {
    items: items.map(mapDeletionRequest),
    total,
    page,
    pageSize,
    pendingCount,
  }
}

export async function updateAccountDeletionRequest(params: {
  id: string
  status: AccountDeletionStatus
  adminNote?: string
  adminId?: string
}) {
  const request = await AccountDeletionRequestModel.findById(params.id)
  if (!request) {
    throw new AppError(404, "not_found", "Deletion request not found.")
  }

  request.set("status", params.status)
  if (typeof params.adminNote === "string") {
    request.set("adminNote", params.adminNote.trim().slice(0, 1000))
  }
  request.set("handledByAdminId", params.adminId ?? "")
  request.set("handledAt", params.status === "pending" ? null : new Date())
  await request.save()

  return mapDeletionRequest(request.toObject())
}
