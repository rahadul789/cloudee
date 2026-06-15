import type { NextFunction, Request, Response } from "express"
import { StatusCodes } from "http-status-codes"

import type { AuthRole } from "../constants/auth"
import { AppError } from "../utils/app-error"
import { verifyAccessToken } from "../../modules/auth/auth.utils"
import { isAccessSessionActive } from "../../modules/auth/session-control.service"

export type AuthUser = {
  id: string
  role: AuthRole
  restaurantId?: string
}

export type AuthenticatedRequest = Request & {
  user?: AuthUser
}

export async function attachAuthUser(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const authorizationHeader = req.headers.authorization

  if (!authorizationHeader?.startsWith("Bearer ")) {
    return next()
  }

  const accessToken = authorizationHeader.slice("Bearer ".length).trim()

  try {
    const payload = verifyAccessToken(accessToken)
    const isSessionActive = await isAccessSessionActive(payload)
    if (!isSessionActive) {
      return next(new AppError(StatusCodes.UNAUTHORIZED, "SESSION_REVOKED", "Session is not active"))
    }

    req.user = {
      id: payload.sub,
      role: payload.role,
      restaurantId: payload.restaurantId
    }

    return next()
  } catch {
    return next(new AppError(StatusCodes.UNAUTHORIZED, "INVALID_TOKEN", "Invalid access token"))
  }
}

export function requireAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(
      new AppError(StatusCodes.UNAUTHORIZED, "UNAUTHORIZED", "Authentication required")
    )
  }

  next()
}

export function requireRole(...roles: AuthRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(
        new AppError(StatusCodes.UNAUTHORIZED, "UNAUTHORIZED", "Authentication required")
      )
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(StatusCodes.FORBIDDEN, "FORBIDDEN", "You do not have access to this resource")
      )
    }

    next()
  }
}
