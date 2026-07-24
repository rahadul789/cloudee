import crypto from "node:crypto"

import { StatusCodes } from "http-status-codes"

import { AppError } from "../../common/utils/app-error"
import { AdminAuditLogModel, AdminModel } from "../admin/admin.model"
import { getPlatformContent } from "../public/content.service"
import {
  ImpersonationHandoffModel,
  OwnerModel,
  RefreshTokenSessionModel,
  RestaurantModel,
} from "./auth.model"
import { signAccessToken } from "./auth.utils"

// Handoff code is valid for 2 minutes (admin opens owner-web immediately). The
// impersonation session itself lasts 2 hours, then dies — it has NO refresh path,
// so it can never silently become a permanent owner session.
const HANDOFF_TTL_MS = 2 * 60 * 1000
const IMPERSONATION_SESSION_TTL_MS = 2 * 60 * 60 * 1000
const IMPERSONATION_ACCESS_EXPIRES_IN = "2h"

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex")
}

function resolveOwnerWebBaseUrl(webDashboardUrl: string | undefined) {
  const fallback = "http://localhost:5173"
  const raw = (webDashboardUrl ?? "").trim() || fallback
  return raw.replace(/\/+$/, "")
}

/**
 * Admin "Login as owner": create a single-use, short-lived handoff code for the
 * restaurant's owner and return the owner-web URL to open. No token is minted or
 * stored here — the session is minted only when owner-web redeems the code.
 */
export async function createOwnerImpersonationHandoff(params: {
  restaurantId: string
  adminId: string
  reason: string
}) {
  const restaurant = await RestaurantModel.findById(params.restaurantId)
    .select({ ownerId: 1, name: 1 })
    .lean<{ _id: unknown; ownerId?: unknown; name?: string } | null>()

  if (!restaurant?.ownerId) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      "RESTAURANT_NOT_FOUND",
      "Restaurant not found",
    )
  }

  const ownerId = String(restaurant.ownerId)
  const [owner, admin] = await Promise.all([
    OwnerModel.findById(ownerId).select({ fullName: 1 }).lean<{ fullName?: string } | null>(),
    AdminModel.findById(params.adminId).select({ fullName: 1 }).lean<{ fullName?: string } | null>(),
  ])

  if (!owner) {
    throw new AppError(StatusCodes.NOT_FOUND, "OWNER_NOT_FOUND", "Owner not found")
  }

  const code = crypto.randomBytes(32).toString("hex")
  const ownerName = owner.fullName ?? ""
  const adminName = admin?.fullName ?? "Admin"

  await ImpersonationHandoffModel.create({
    codeHash: sha256(code),
    ownerId,
    restaurantId: params.restaurantId,
    adminId: params.adminId,
    adminName,
    ownerName,
    reason: params.reason,
    expiresAt: new Date(Date.now() + HANDOFF_TTL_MS),
  })

  await AdminAuditLogModel.create({
    actorAdminId: params.adminId,
    actorName: adminName,
    entityType: "owner",
    entityId: ownerId,
    action: "owner_impersonation_requested",
    title: `Requested login as ${ownerName || "owner"}`,
    description: params.reason,
    metadata: { restaurantId: params.restaurantId, restaurantName: restaurant.name ?? "" },
  })

  const content = await getPlatformContent()
  const baseUrl = resolveOwnerWebBaseUrl(content.operations?.ownerApp?.webDashboardUrl)

  return {
    ownerId,
    ownerName,
    url: `${baseUrl}/impersonate?code=${code}`,
  }
}

/**
 * Owner-web redeems the handoff code for a short-lived impersonation access token.
 * Single-use: the code is consumed here. Mints an access token carrying
 * `impersonatedByAdminId` + a matching (revocable) session record. No refresh token
 * is issued, so the session cannot outlive its 2h window.
 */
export async function redeemOwnerImpersonation(params: {
  code: string
  userAgent?: string
  ipAddress?: string
}) {
  const codeHash = sha256(params.code ?? "")

  // Atomically consume the code so it can never be redeemed twice.
  const handoff = await ImpersonationHandoffModel.findOneAndUpdate(
    { codeHash, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true },
  ).lean<{
    ownerId: unknown
    restaurantId?: string
    adminId: string
    adminName: string
    ownerName?: string
    reason?: string
  } | null>()

  if (!handoff) {
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      "IMPERSONATION_CODE_INVALID",
      "This login-as link has expired or was already used.",
    )
  }

  const ownerId = String(handoff.ownerId)
  const owner = await OwnerModel.findById(ownerId)

  if (!owner) {
    throw new AppError(StatusCodes.NOT_FOUND, "OWNER_NOT_FOUND", "Owner not found")
  }

  const restaurantId = owner.activeRestaurantId?.toString()
  const tokenId = crypto.randomUUID()

  const accessToken = signAccessToken({
    subject: ownerId,
    role: "owner",
    restaurantId,
    tokenId,
    impersonatedByAdminId: handoff.adminId,
    expiresIn: IMPERSONATION_ACCESS_EXPIRES_IN,
  })

  // A session record so the access token passes isAccessSessionActive AND stays
  // revocable. tokenHash is a random throwaway: there is no refresh token to match.
  await RefreshTokenSessionModel.create({
    ownerId,
    tokenId,
    tokenHash: sha256(crypto.randomUUID()),
    userAgent: params.userAgent ?? "",
    ipAddress: params.ipAddress ?? "",
    expiresAt: new Date(Date.now() + IMPERSONATION_SESSION_TTL_MS),
    impersonatedByAdminId: handoff.adminId,
  })

  await AdminAuditLogModel.create({
    actorAdminId: handoff.adminId,
    actorName: handoff.adminName,
    entityType: "owner",
    entityId: ownerId,
    action: "owner_impersonation_started",
    title: `Logged in as ${handoff.ownerName || owner.fullName || "owner"}`,
    description: handoff.reason ?? "",
    metadata: { restaurantId: handoff.restaurantId ?? "", tokenId },
  })

  return {
    accessToken,
    owner: {
      id: ownerId,
      fullName: owner.fullName,
      phone: owner.phone,
      isPhoneVerified: owner.isPhoneVerified,
    },
    restaurantLifecycleStatus: owner.restaurantLifecycleStatus,
    impersonation: {
      adminName: handoff.adminName,
      ownerName: handoff.ownerName || owner.fullName || "",
    },
  }
}

/** Revoke the current impersonation session (called when the admin exits). */
export async function endOwnerImpersonation(params: {
  ownerId: string
  tokenId: string
  adminId: string
}) {
  await RefreshTokenSessionModel.updateOne(
    {
      tokenId: params.tokenId,
      ownerId: params.ownerId,
      impersonatedByAdminId: { $ne: null },
      revokedAt: null,
    },
    { $set: { revokedAt: new Date() } },
  )

  await AdminAuditLogModel.create({
    actorAdminId: params.adminId,
    actorName: "Admin",
    entityType: "owner",
    entityId: params.ownerId,
    action: "owner_impersonation_ended",
    title: "Ended impersonation session",
    description: "",
    metadata: { tokenId: params.tokenId },
  })
}
