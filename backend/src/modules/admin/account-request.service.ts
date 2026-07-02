import { StatusCodes } from "http-status-codes"

import { AppError } from "../../common/utils/app-error"
import { CustomerModel } from "../customer/customer.model"
import { sendPushToCustomer } from "../customer/push.service"
import { buildCustomerServiceAreaScopeFilter } from "../service-area/service-area.service"
import { AdminAuditLogModel, AdminModel } from "./admin.model"

export async function listCustomerAccountRequests(
  params?: {
    status?: "pending" | "cancelled" | "reviewed" | "completed"
    type?: "deactivate" | "delete"
    zoneId?: string
    districtId?: string
  }
) {
  const query: Record<string, unknown> = {
    ...buildCustomerServiceAreaScopeFilter(params),
    "accountRequest.type": { $ne: null }
  }

  if (params?.status) {
    query["accountRequest.status"] = params.status
  }

  if (params?.type) {
    query["accountRequest.type"] = params.type
  }

  return CustomerModel.find(query)
    .select("fullName phone email profileImage status accountRequest createdAt updatedAt")
    .sort({ "accountRequest.requestedAt": -1, updatedAt: -1 })
}

export async function reviewCustomerAccountRequest(params: {
  customerId: string
  adminId: string
  decision: "approve" | "reject"
  reviewNote?: string
  zoneId?: string
  districtId?: string
}) {
  const customer = await CustomerModel.findById(params.customerId)

  if (!customer) {
    throw new AppError(StatusCodes.NOT_FOUND, "CUSTOMER_NOT_FOUND", "Customer not found")
  }
  const scopeFilter = buildCustomerServiceAreaScopeFilter(params)
  if (
    Object.keys(scopeFilter).length > 0 &&
    !(await CustomerModel.exists({ _id: customer._id, ...scopeFilter }))
  ) {
    throw new AppError(StatusCodes.NOT_FOUND, "CUSTOMER_NOT_FOUND", "Customer not found")
  }

  if (
    !customer.accountRequest?.type ||
    customer.accountRequest.status !== "pending" ||
    !customer.accountRequest.requestedAt
  ) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "ACCOUNT_REQUEST_NOT_PENDING",
      "There is no pending account request to review"
    )
  }

  const admin = await AdminModel.findById(params.adminId)
  const adminName = admin?.fullName ?? "Admin Team"
  const requestType = customer.accountRequest.type

  if (params.decision === "approve") {
    customer.status = requestType === "delete" ? "locked" : "suspended"
    customer.accountRequest.status = "completed"
  } else {
    customer.status = "active"
    customer.accountRequest.status = "reviewed"
  }

  customer.accountRequest.reviewNote = params.reviewNote?.trim() ?? ""
  customer.accountRequest.reviewedByAdminId = params.adminId
  customer.accountRequest.reviewedByAdminName = adminName
  customer.accountRequest.reviewedAt = new Date()
  customer.set("accountRequest.history", [
    ...((customer.accountRequest.history ?? []).map((entry) => ({
      action: entry.action,
      note: entry.note,
      actorId: entry.actorId,
      actorName: entry.actorName,
      createdAt: entry.createdAt
    })) as Array<Record<string, unknown>>),
    {
      action: params.decision === "approve" ? "approved" : "rejected",
      note: params.reviewNote?.trim() ?? "",
      actorId: params.adminId,
      actorName: adminName,
      createdAt: new Date()
    }
  ].slice(-10))
  await customer.save()

  await AdminAuditLogModel.create({
    actorAdminId: params.adminId,
    actorName: adminName,
    actorRole: admin?.role ?? "admin",
    entityType: "customer",
    entityId: customer.id,
    action: params.decision === "approve" ? "account_request.approved" : "account_request.rejected",
    title: params.decision === "approve" ? "Account request approved" : "Account request rejected",
    description: `${customer.fullName || customer.phone || "Customer"} ${requestType} request was ${params.decision === "approve" ? "approved" : "rejected"}.`,
    metadata: {
      requestType,
      decision: params.decision,
      status: customer.status,
      reviewNote: params.reviewNote?.trim() ?? ""
    }
  })

  try {
    await sendPushToCustomer({
      customerId: customer.id,
      payload: {
        title:
          params.decision === "approve"
            ? requestType === "delete"
              ? "Account deletion approved"
              : "Account deactivation approved"
            : "Account request reviewed",
        body:
          params.decision === "approve"
            ? requestType === "delete"
              ? "Your delete request has been approved. Contact support if you need anything else."
              : "Your account deactivation request has been approved."
            : params.reviewNote?.trim()
              ? params.reviewNote.trim()
              : `Your ${requestType} request was reviewed and was not applied.`,
        data: {
          type: "account_request",
          path: "/account-request"
        }
      }
    })
  } catch {
    // Account moderation must stay saved even if external push delivery is unavailable.
  }

  return {
    customer,
    reviewedByAdminName: adminName
  }
}
