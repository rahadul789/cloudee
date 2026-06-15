import bcrypt from "bcryptjs"
import jwt, { type SignOptions } from "jsonwebtoken"

import type { AuthRole } from "../../common/constants/auth"
import { env } from "../../config/env"
import type { JwtPayload } from "./auth.types"

const PASSWORD_SALT_ROUNDS = 12

export async function hashPassword(password: string) {
  return bcrypt.hash(password, PASSWORD_SALT_ROUNDS)
}

export async function comparePassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash)
}

export async function hashOtpCode(otpCode: string) {
  return bcrypt.hash(otpCode, 10)
}

export async function compareOtpCode(otpCode: string, otpCodeHash: string) {
  return bcrypt.compare(otpCode, otpCodeHash)
}

function buildJwtPayload(params: {
  subject: string
  role: AuthRole
  restaurantId?: string
  tokenId?: string
}): JwtPayload {
  return {
    sub: params.subject,
    role: params.role,
    restaurantId: params.restaurantId,
    tokenId: params.tokenId
  }
}

export function signAccessToken(params: {
  subject: string
  role: AuthRole
  restaurantId?: string
  tokenId?: string
}) {
  return jwt.sign(buildJwtPayload(params), env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"]
  })
}

export function signRefreshToken(params: {
  subject: string
  role: AuthRole
  restaurantId?: string
  tokenId: string
}) {
  return jwt.sign(
    {
      ...buildJwtPayload(params),
      tokenId: params.tokenId
    },
    env.JWT_REFRESH_SECRET,
    {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"]
    }
  )
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload
}
