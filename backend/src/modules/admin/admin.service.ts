import crypto from "node:crypto"

import { StatusCodes } from "http-status-codes"

import { AppError } from "../../common/utils/app-error"
import { env } from "../../config/env"
import {
  comparePassword,
  hashPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from "../auth/auth.utils"
import { AdminModel, AdminRefreshTokenSessionModel } from "./admin.model"

export const ADMIN_REFRESH_EXPIRY_DAYS = 3650

function buildAdminAuthPayload(params: {
  adminId: string
  fullName: string
  email: string
  role: "admin"
  refreshToken: string
  tokenId: string
}) {
  return {
    accessToken: signAccessToken({
      subject: params.adminId,
      role: params.role,
      tokenId: params.tokenId
    }),
    refreshToken: params.refreshToken,
    admin: {
      id: params.adminId,
      fullName: params.fullName,
      email: params.email,
      role: params.role
    }
  }
}

async function createAdminRefreshSession(params: {
  adminId: string
  userAgent?: string
  ipAddress?: string
}) {
  const tokenId = crypto.randomUUID()
  const refreshToken = signRefreshToken({
    subject: params.adminId,
    role: "admin",
    tokenId
  })

  const tokenHash = await hashPassword(refreshToken)

  await AdminRefreshTokenSessionModel.create({
    adminId: params.adminId,
    tokenId,
    tokenHash,
    userAgent: params.userAgent ?? "",
    ipAddress: params.ipAddress ?? "",
    expiresAt: new Date(Date.now() + ADMIN_REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
  })

  return { refreshToken, tokenId }
}

export async function bootstrapAdminIfMissing() {
  const existingAdmin = await AdminModel.findOne({ email: env.ADMIN_BOOTSTRAP_EMAIL })

  if (existingAdmin) {
    return existingAdmin
  }

  return AdminModel.create({
    fullName: env.ADMIN_BOOTSTRAP_NAME,
    email: env.ADMIN_BOOTSTRAP_EMAIL,
    passwordHash: await hashPassword(env.ADMIN_BOOTSTRAP_PASSWORD),
    role: "admin"
  })
}

export async function signinAdmin(params: {
  email: string
  password: string
  userAgent?: string
  ipAddress?: string
}) {
  if (env.ADMIN_BOOTSTRAP_ENABLED) {
    await bootstrapAdminIfMissing()
  }

  const admin = await AdminModel.findOne({ email: params.email })

  if (!admin) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "INVALID_CREDENTIALS", "Invalid email or password")
  }

  if (admin.status !== "active") {
    throw new AppError(StatusCodes.FORBIDDEN, "ACCOUNT_UNAVAILABLE", "This admin account is unavailable")
  }

  const isPasswordValid = await comparePassword(params.password, admin.passwordHash)

  if (!isPasswordValid) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "INVALID_CREDENTIALS", "Invalid email or password")
  }

  admin.lastLoginAt = new Date()
  await admin.save()

  const refreshSession = await createAdminRefreshSession({
    adminId: admin.id,
    userAgent: params.userAgent,
    ipAddress: params.ipAddress
  })

  return buildAdminAuthPayload({
    adminId: admin.id,
    fullName: admin.fullName,
    email: admin.email,
    role: "admin",
    refreshToken: refreshSession.refreshToken,
    tokenId: refreshSession.tokenId
  })
}

export async function refreshAdminSession(params: {
  refreshToken: string
  userAgent?: string
  ipAddress?: string
}) {
  const payload = verifyRefreshToken(params.refreshToken)

  if (!payload.tokenId) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "INVALID_REFRESH_TOKEN", "Invalid refresh token")
  }

  const session = await AdminRefreshTokenSessionModel.findOne({
    tokenId: payload.tokenId,
    adminId: payload.sub
  })

  if (!session || session.revokedAt) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "SESSION_REVOKED", "Refresh session is not active")
  }

  const isTokenValid = await comparePassword(params.refreshToken, session.tokenHash)

  if (!isTokenValid) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "INVALID_REFRESH_TOKEN", "Invalid refresh token")
  }

  const admin = await AdminModel.findById(payload.sub)

  if (!admin) {
    throw new AppError(StatusCodes.NOT_FOUND, "ADMIN_NOT_FOUND", "Admin not found")
  }

  // Do NOT rotate the admin refresh token. Admins routinely keep several tabs open;
  // rotating (revoke-old + issue-new) revokes the tokenId the moment another tab or
  // an in-flight request still holds it, so that caller's next refresh hits
  // SESSION_REVOKED (401) and the admin is force-logged-out at random. Reusing the
  // long-lived (10y) session keeps every tab valid. The session stays revocable by
  // tokenId on explicit logout / from Session management. (Same fix as customer.)
  return buildAdminAuthPayload({
    adminId: admin.id,
    fullName: admin.fullName,
    email: admin.email,
    role: "admin",
    refreshToken: params.refreshToken,
    tokenId: session.tokenId
  })
}

export async function logoutAdminSession(refreshToken: string) {
  const payload = verifyRefreshToken(refreshToken)

  if (!payload.tokenId) {
    return { revoked: true }
  }

  await AdminRefreshTokenSessionModel.findOneAndUpdate(
    { tokenId: payload.tokenId, adminId: payload.sub, revokedAt: null },
    { revokedAt: new Date() }
  )

  return { revoked: true }
}
