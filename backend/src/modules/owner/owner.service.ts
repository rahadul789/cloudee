import { StatusCodes } from "http-status-codes"

import { AppError } from "../../common/utils/app-error"
import { OwnerModel } from "../auth/auth.model"
import { createOtpSession, getOtpSessionTiming } from "../auth/auth.service"
import { getMockOtpCode } from "../auth/mock-otp"
import { comparePassword, hashPassword } from "../auth/auth.utils"

export async function getOwnerProfile(ownerId: string) {
  const owner = await OwnerModel.findById(ownerId)

  if (!owner) {
    throw new AppError(StatusCodes.NOT_FOUND, "OWNER_NOT_FOUND", "Owner not found")
  }

  return owner
}

export async function updateOwnerProfile(params: {
  ownerId: string
  fullName?: string
  email?: string
  phone?: string
}) {
  const owner = await getOwnerProfile(params.ownerId)

  if (params.fullName !== undefined) {
    owner.fullName = params.fullName
  }

  if (params.email !== undefined) {
    owner.email = params.email
  }

  let verificationSessionId: string | null = null
  let otpTiming: ReturnType<typeof getOtpSessionTiming> | null = null
  let mockCode: string | undefined

  if (params.phone && params.phone !== owner.phone) {
    const conflict = await OwnerModel.findOne({
      _id: { $ne: owner._id },
      $or: [{ phone: params.phone }, { pendingPhone: params.phone }]
    })

    if (conflict) {
      throw new AppError(
        StatusCodes.CONFLICT,
        "PHONE_ALREADY_IN_USE",
        "An account already exists with this phone number"
      )
    }

    owner.pendingPhone = params.phone

    const otpSession = await createOtpSession({
      ownerId: owner.id,
      phone: params.phone,
      purpose: "owner_phone_change",
      referenceId: owner.id
    })

    verificationSessionId = otpSession.id
    otpTiming = getOtpSessionTiming(otpSession)
    mockCode = getMockOtpCode()
  }

  await owner.save()

  return {
    owner,
    verificationSessionId,
    ...(otpTiming ?? {}),
    mockCode
  }
}

export async function updateOwnerPassword(params: {
  ownerId: string
  currentPassword: string
  newPassword: string
}) {
  const owner = await getOwnerProfile(params.ownerId)

  const isCurrentPasswordValid = await comparePassword(params.currentPassword, owner.passwordHash)

  if (!isCurrentPasswordValid) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "INVALID_CURRENT_PASSWORD",
      "Current password is incorrect"
    )
  }

  owner.passwordHash = await hashPassword(params.newPassword)
  await owner.save()

  return { updated: true }
}
