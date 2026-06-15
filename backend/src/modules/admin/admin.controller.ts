import type { CookieOptions, Request, Response } from "express"
import { StatusCodes } from "http-status-codes"
import { z } from "zod"

import { AppError } from "../../common/utils/app-error"
import { asyncHandler } from "../../common/utils/async-handler"
import { sendSuccess } from "../../common/utils/api-response"
import { env } from "../../config/env"
import {
  ADMIN_REFRESH_EXPIRY_DAYS,
  bootstrapAdminIfMissing,
  logoutAdminSession,
  refreshAdminSession,
  signinAdmin
} from "./admin.service"

const adminSigninSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
})

const ADMIN_REFRESH_COOKIE_NAME = "foodbela_admin_refresh"

const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional()
})

const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional()
})

function adminRefreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.ADMIN_AUTH_COOKIE_SECURE,
    sameSite: env.ADMIN_AUTH_COOKIE_SAME_SITE,
    path: `${env.API_PREFIX}/admin/auth`,
    maxAge: ADMIN_REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  }
}

function setAdminRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(ADMIN_REFRESH_COOKIE_NAME, refreshToken, adminRefreshCookieOptions())
}

function clearAdminRefreshCookie(res: Response) {
  const { maxAge: _maxAge, ...options } = adminRefreshCookieOptions()
  res.clearCookie(ADMIN_REFRESH_COOKIE_NAME, options)
}

function getAdminRefreshToken(req: Request, refreshToken?: string) {
  const cookieToken = req.cookies?.[ADMIN_REFRESH_COOKIE_NAME]
  return refreshToken ?? (typeof cookieToken === "string" ? cookieToken : undefined)
}

function toAdminAuthResponse(data: Awaited<ReturnType<typeof signinAdmin>>) {
  return {
    accessToken: data.accessToken,
    admin: data.admin
  }
}

export const postAdminBootstrap = asyncHandler(async (_req: Request, res: Response) => {
  if (!env.ADMIN_BOOTSTRAP_ENABLED) {
    throw new AppError(StatusCodes.NOT_FOUND, "BOOTSTRAP_DISABLED", "Admin bootstrap is disabled")
  }

  const admin = await bootstrapAdminIfMissing()

  return sendSuccess(res, {
    message: "Admin bootstrap ensured successfully",
    data: {
      id: admin.id,
      email: admin.email
    }
  })
})

export const postAdminSignin = asyncHandler(async (req: Request, res: Response) => {
  const payload = adminSigninSchema.parse(req.body)
  const data = await signinAdmin({
    ...payload,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })
  setAdminRefreshCookie(res, data.refreshToken)

  return sendSuccess(res, {
    message: "Admin signed in successfully",
    data: toAdminAuthResponse(data)
  })
})

export const postAdminRefresh = asyncHandler(async (req: Request, res: Response) => {
  const payload = refreshSchema.parse(req.body)
  const refreshToken = getAdminRefreshToken(req, payload.refreshToken)

  if (!refreshToken) {
    clearAdminRefreshCookie(res)
    throw new AppError(StatusCodes.UNAUTHORIZED, "INVALID_REFRESH_TOKEN", "Invalid refresh token")
  }

  let data: Awaited<ReturnType<typeof refreshAdminSession>>
  try {
    data = await refreshAdminSession({
      refreshToken,
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip
    })
  } catch (error) {
    clearAdminRefreshCookie(res)
    throw error
  }
  setAdminRefreshCookie(res, data.refreshToken)

  return sendSuccess(res, {
    message: "Admin session refreshed successfully",
    data: toAdminAuthResponse(data)
  })
})

export const postAdminLogout = asyncHandler(async (req: Request, res: Response) => {
  const payload = logoutSchema.parse(req.body)
  const refreshToken = getAdminRefreshToken(req, payload.refreshToken)
  let data = { revoked: true }

  clearAdminRefreshCookie(res)
  if (refreshToken) {
    try {
      data = await logoutAdminSession(refreshToken)
    } catch {
      data = { revoked: true }
    }
  }

  return sendSuccess(res, {
    message: "Admin signed out successfully",
    data
  })
})
