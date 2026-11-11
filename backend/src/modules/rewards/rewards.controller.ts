import type { Request, Response } from "express"
import { z } from "zod"

import { sendSuccess } from "../../common/utils/api-response"
import { asyncHandler } from "../../common/utils/async-handler"
import { PRIZE_TYPES } from "./rewards.model"
import {
  buyStampWithCoins,
  decideAdminMysteryBox,
  getAdminRewardSettings,
  getAdminRewardsOverview,
  getCustomerRewards,
  grantAdminRewardTest,
  listAdminMysteryBoxes,
  listAdminRewardTesters,
  setAdminRewardTesters,
  openCustomerMysteryBox,
  spinCustomerCard,
  unlockSpinWithCoins,
  updateAdminRewardSettings,
} from "./rewards.service"

const param = (value: unknown) => (Array.isArray(value) ? String(value[0] ?? "") : String(value ?? ""))

// ── Customer ──
export const getCustomerRewardsController = asyncHandler(async (req: Request, res: Response) => {
  const data = await getCustomerRewards(req.user?.id ?? "")
  return sendSuccess(res, { data })
})

const spinSchema = z.object({ useCoins: z.boolean().optional() })

export const postCustomerSpin = asyncHandler(async (req: Request, res: Response) => {
  const body = spinSchema.parse(req.body ?? {})
  const data = await spinCustomerCard(req.user?.id ?? "", param(req.params.spinId), body.useCoins === true)
  return sendSuccess(res, { data })
})

export const postCustomerUnlockSpin = asyncHandler(async (req: Request, res: Response) => {
  const data = await unlockSpinWithCoins(req.user?.id ?? "", param(req.params.spinId))
  return sendSuccess(res, { data })
})

export const postCustomerBuyStamp = asyncHandler(async (req: Request, res: Response) => {
  const data = await buyStampWithCoins(req.user?.id ?? "")
  return sendSuccess(res, { data })
})

export const postCustomerOpenBox = asyncHandler(async (req: Request, res: Response) => {
  const data = await openCustomerMysteryBox(req.user?.id ?? "", param(req.params.boxId))
  return sendSuccess(res, { data })
})

// ── Admin ──
export const getAdminRewardSettingsController = asyncHandler(async (_req: Request, res: Response) => {
  const data = await getAdminRewardSettings()
  return sendSuccess(res, { data })
})

const settingsSchema = z.object({
  scratchEnabled: z.boolean().optional(),
  minOrderAmount: z.coerce.number().min(0).max(100000).optional(),
  spinUnlockHours: z.coerce.number().min(0).max(168).optional(),
  skipCoinCost: z.coerce.number().int().min(0).max(100000).optional(),
  cardExpiryDays: z.coerce.number().int().min(1).max(60).optional(),
  prizeVoucherValidityDays: z.coerce.number().int().min(1).max(60).optional(),
  prizeVoucherMinOrder: z.coerce.number().min(0).max(100000).optional(),
  freeDeliveryCostEstimate: z.coerce.number().min(0).max(1000).optional(),
  monthlyBudget: z.coerce.number().min(0).max(10_000_000).optional(),
  prizes: z
    .array(
      z.object({
        id: z.string().trim().max(40).optional(),
        type: z.enum(PRIZE_TYPES),
        label: z.string().trim().min(1).max(40),
        weight: z.coerce.number().min(0).max(100000),
        amount: z.coerce.number().min(0).max(100000).optional(),
      }),
    )
    .max(10)
    .optional(),
  stampCoinPrice: z.coerce.number().int().min(1).max(100000).optional(),
  maxCoinStampsPerCycle: z.coerce.number().int().min(0).max(10).optional(),
  coinExpiryDays: z.coerce.number().int().min(1).max(365).optional(),
  boxPrizes: z
    .array(z.object({ amount: z.coerce.number().min(1).max(10000), weight: z.coerce.number().min(0).max(100000) }))
    .max(8)
    .optional(),
  claimMode: z.enum(["auto", "approval"]).optional(),
  claimMinOrder: z.coerce.number().min(0).max(100000).optional(),
  claimValidityDays: z.coerce.number().int().min(1).max(180).optional(),
  claimReminderEnabled: z.boolean().optional(),
  claimReminderAfterDays: z.coerce.number().int().min(1).max(30).optional(),
  claimReminderTitle: z.string().trim().min(1).max(80).optional(),
  claimReminderBody: z.string().trim().min(1).max(200).optional(),
  spinReadyLocalNotify: z.boolean().optional(),
  testModeEnabled: z.boolean().optional(),
  testSpinUnlockMinutes: z.coerce.number().min(0).max(1440).optional(),
})

export const putAdminRewardSettingsController = asyncHandler(async (req: Request, res: Response) => {
  const data = await updateAdminRewardSettings(settingsSchema.parse(req.body))
  return sendSuccess(res, { message: "Reward settings saved", data })
})

export const getAdminRewardsOverviewController = asyncHandler(async (req: Request, res: Response) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30))
  const page = Math.max(1, Number(req.query.page) || 1)
  const prizeType = typeof req.query.prizeType === "string" ? req.query.prizeType : undefined
  const data = await getAdminRewardsOverview({ days, page, prizeType })
  return sendSuccess(res, { data })
})

export const getAdminMysteryBoxesController = asyncHandler(async (req: Request, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status : "requested"
  const data = await listAdminMysteryBoxes(["requested", "ready", "opened", "rejected", "all"].includes(status) ? status : "requested")
  return sendSuccess(res, { data })
})

const decideSchema = z.object({ action: z.enum(["approve", "reject"]), reason: z.string().trim().max(200).optional() })

export const postAdminMysteryBoxDecision = asyncHandler(async (req: Request, res: Response) => {
  const body = decideSchema.parse(req.body)
  const data = await decideAdminMysteryBox(param(req.params.boxId), body.action, req.user?.id ?? "admin", body.reason)
  return sendSuccess(res, { data })
})

// ── Admin: test mode ──
const testersSchema = z.object({ phones: z.array(z.string().trim().max(20)).max(20) })

export const getAdminRewardTestersController = asyncHandler(async (_req: Request, res: Response) => {
  const data = await listAdminRewardTesters()
  return sendSuccess(res, { data })
})

export const putAdminRewardTestersController = asyncHandler(async (req: Request, res: Response) => {
  const body = testersSchema.parse(req.body)
  const data = await setAdminRewardTesters(body.phones)
  return sendSuccess(res, { data })
})

const grantSchema = z.object({ action: z.enum(["spin", "coins", "stamp", "fill_card", "reset"]) })

export const postAdminRewardTestGrant = asyncHandler(async (req: Request, res: Response) => {
  const body = grantSchema.parse(req.body)
  const data = await grantAdminRewardTest(param(req.params.customerId), body.action)
  return sendSuccess(res, { data })
})
