import type { CookieOptions, Request, Response } from "express"
import { StatusCodes } from "http-status-codes"
import { z } from "zod"

import { AppError } from "../../common/utils/app-error"
import { sendSuccess } from "../../common/utils/api-response"
import { asyncHandler } from "../../common/utils/async-handler"
import { env } from "../../config/env"
import {
  OWNER_REFRESH_SESSION_EXPIRY_DAYS,
  logoutOwnerSession,
  requestOwnerMobilePasswordReset,
  requestOwnerOtpSignin,
  requestPasswordReset,
  refreshOwnerSession,
  resetPassword,
  sendOtpForPurpose,
  signinOwner,
  signupOwner,
  verifyOwnerOtpSignin,
  verifyOtpSession
} from "./auth.service"

const ownerSignupSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().regex(/^01\d{9}$/),
  password: z.string().min(6)
})

const ownerSigninSchema = z.object({
  phone: z.string().regex(/^01\d{9}$/),
  password: z.string().min(6)
})

const otpSendSchema = z.object({
  channel: z.literal("phone"),
  phone: z.string().regex(/^01\d{9}$/),
  purpose: z.enum([
    "owner_signup_verify",
    "owner_phone_change",
    "owner_payout_verify",
    "password_reset"
  ]),
  referenceId: z.string().min(1)
})

const otpVerifySchema = z.object({
  verificationSessionId: z.string().min(1),
  otpCode: z.string().regex(/^\d{4,6}$/)
})

const ownerOtpSigninStartSchema = z.object({
  phone: z.string().regex(/^01\d{9}$/)
})

const ownerOtpSigninVerifySchema = z.object({
  verificationSessionId: z.string().min(1),
  otpCode: z.string().regex(/^\d{4}$/)
})

const forgotPasswordSchema = z.object({
  phone: z.string().regex(/^01\d{9}$/)
})

const resetPasswordSchema = z.object({
  verificationSessionId: z.string().min(1),
  newPassword: z.string().min(6)
})

const refreshSessionSchema = z.object({
  refreshToken: z.string().min(1).optional()
})

const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional()
})

const OWNER_REFRESH_COOKIE_NAME = "foodbela_owner_refresh"

function ownerRefreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.OWNER_AUTH_COOKIE_SECURE,
    sameSite: env.OWNER_AUTH_COOKIE_SAME_SITE,
    path: `${env.API_PREFIX}/auth/owner`,
    maxAge: OWNER_REFRESH_SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  }
}

function setOwnerRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(OWNER_REFRESH_COOKIE_NAME, refreshToken, ownerRefreshCookieOptions())
}

function clearOwnerRefreshCookie(res: Response) {
  const { maxAge: _maxAge, ...options } = ownerRefreshCookieOptions()
  res.clearCookie(OWNER_REFRESH_COOKIE_NAME, options)
}

function getOwnerRefreshToken(req: Request, refreshToken?: string) {
  const cookieToken = req.cookies?.[OWNER_REFRESH_COOKIE_NAME]
  return refreshToken ?? (typeof cookieToken === "string" ? cookieToken : undefined)
}

function toOwnerAuthResponse(data: Awaited<ReturnType<typeof signinOwner>>) {
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    owner: data.owner,
    restaurantLifecycleStatus: data.restaurantLifecycleStatus
  }
}

export const ownerSignup = asyncHandler(async (req: Request, res: Response) => {
  const payload = ownerSignupSchema.parse(req.body)
  const result = await signupOwner({
    ...payload,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: "Owner account created. OTP sent.",
    data: result
  })
})

export const ownerSignin = asyncHandler(async (req: Request, res: Response) => {
  const payload = ownerSigninSchema.parse(req.body)
  const result = await signinOwner({
    ...payload,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })
  setOwnerRefreshCookie(res, result.refreshToken)

  return sendSuccess(res, {
    message: "Signed in successfully",
    data: toOwnerAuthResponse(result)
  })
})

export const ownerOtpSigninStart = asyncHandler(async (req: Request, res: Response) => {
  const payload = ownerOtpSigninStartSchema.parse(req.body)
  const result = await requestOwnerOtpSignin({
    phone: payload.phone,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })

  return sendSuccess(res, {
    message: "OTP sent",
    data: result
  })
})

export const ownerOtpSigninVerify = asyncHandler(async (req: Request, res: Response) => {
  const payload = ownerOtpSigninVerifySchema.parse(req.body)
  const result = await verifyOwnerOtpSignin({
    ...payload,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })
  setOwnerRefreshCookie(res, result.refreshToken)

  return sendSuccess(res, {
    message: "Signed in successfully",
    data: toOwnerAuthResponse(result)
  })
})

export const sendOtp = asyncHandler(async (req: Request, res: Response) => {
  const payload = otpSendSchema.parse(req.body)
  const result = await sendOtpForPurpose({
    phone: payload.phone,
    purpose: payload.purpose,
    referenceId: payload.referenceId,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })

  return sendSuccess(res, {
    message: "OTP sent",
    data: result
  })
})

export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const payload = otpVerifySchema.parse(req.body)
  const result = await verifyOtpSession({
    ...payload,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })

  return sendSuccess(res, {
    message: "OTP verified",
    data: result
  })
})

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const payload = forgotPasswordSchema.parse(req.body)
  const result = await requestPasswordReset({
    phone: payload.phone,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })

  return sendSuccess(res, {
    message: "Password reset OTP sent",
    data: result
  })
})

export const ownerMobileForgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const payload = forgotPasswordSchema.parse(req.body)
  const result = await requestOwnerMobilePasswordReset({
    phone: payload.phone,
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip
  })

  return sendSuccess(res, {
    message: "Password reset OTP sent",
    data: result
  })
})

export const resetOwnerPassword = asyncHandler(async (req: Request, res: Response) => {
  const payload = resetPasswordSchema.parse(req.body)
  const result = await resetPassword(payload)

  return sendSuccess(res, {
    message: "Password reset successfully",
    data: result
  })
})

export const refreshOwnerAuthSession = asyncHandler(async (req: Request, res: Response) => {
  const payload = refreshSessionSchema.parse(req.body ?? {})
  const refreshToken = getOwnerRefreshToken(req, payload.refreshToken)

  if (!refreshToken) {
    clearOwnerRefreshCookie(res)
    throw new AppError(StatusCodes.UNAUTHORIZED, "INVALID_REFRESH_TOKEN", "Invalid refresh token")
  }

  let result: Awaited<ReturnType<typeof refreshOwnerSession>>
  try {
    result = await refreshOwnerSession({
      refreshToken,
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip
    })
  } catch (error) {
    clearOwnerRefreshCookie(res)
    throw error
  }
  setOwnerRefreshCookie(res, result.refreshToken)

  return sendSuccess(res, {
    message: "Session refreshed successfully",
    data: toOwnerAuthResponse(result)
  })
})

export const ownerLogout = asyncHandler(async (req: Request, res: Response) => {
  const payload = logoutSchema.parse(req.body ?? {})
  const refreshToken = getOwnerRefreshToken(req, payload.refreshToken)
  let result = { revoked: true }

  clearOwnerRefreshCookie(res)
  if (refreshToken) {
    try {
      result = await logoutOwnerSession(refreshToken)
    } catch {
      result = { revoked: true }
    }
  }

  return sendSuccess(res, {
    message: "Signed out successfully",
    data: result
  })
})
