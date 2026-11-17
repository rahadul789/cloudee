import type { Request, Response } from "express"
import { z } from "zod"

import { sendSuccess } from "../../common/utils/api-response"
import { asyncHandler } from "../../common/utils/async-handler"
import { QUIZ_MAX_QUESTIONS } from "./quiz.rules"
import {
  answerPublicQuiz,
  approveQuizSubmission,
  listAdminQuizSubmissions,
  listMyQuizSubmissions,
  rejectQuizSubmission,
  submitQuizQuestion,
  closeCustomerQuiz,
  createAdminQuizQuestion,
  createCustomerQuiz,
  deleteAdminQuizQuestion,
  getAdminQuizStats,
  getCustomerQuizHome,
  getPublicQuiz,
  getQuizSettings,
  listAdminQuizQuestions,
  listQuizBank,
  recordQuizMakeOwnClick,
  saveQuizSettings,
  setAdminQuizPlayHidden,
  startPublicQuiz,
  updateAdminQuizQuestion,
} from "./quiz.service"

const param = (value: unknown) => (Array.isArray(value) ? String(value[0] ?? "") : String(value ?? ""))
const playerKeySchema = z.string().trim().regex(/^[A-Za-z0-9_-]{16,80}$/)

// ── Customer (app, signed in) ──
export const getCustomerQuiz = asyncHandler(async (req: Request, res: Response) => {
  const data = await getCustomerQuizHome(req.user?.id ?? "")
  return sendSuccess(res, { data })
})

export const getCustomerQuizBank = asyncHandler(async (req: Request, res: Response) => {
  const data = await listQuizBank(req.user?.id)
  return sendSuccess(res, { data })
})

const createSchema = z.object({
  answers: z
    .array(z.object({ questionId: z.string().trim().max(40), optionId: z.string().trim().min(1).max(20) }))
    .min(1)
    .max(QUIZ_MAX_QUESTIONS),
  displayName: z.string().trim().max(40).optional(),
})

export const postCustomerQuiz = asyncHandler(async (req: Request, res: Response) => {
  const body = createSchema.parse(req.body)
  const data = await createCustomerQuiz(req.user?.id ?? "", body)
  return sendSuccess(res, { message: "Quiz ready", data })
})

export const deleteCustomerQuiz = asyncHandler(async (req: Request, res: Response) => {
  const data = await closeCustomerQuiz(req.user?.id ?? "")
  return sendSuccess(res, { data })
})

// Customer-suggested questions
export const getCustomerQuizSubmissions = asyncHandler(async (req: Request, res: Response) => {
  const data = await listMyQuizSubmissions(req.user?.id ?? "")
  return sendSuccess(res, { data })
})

const submissionSchema = z.object({
  text: z.string().max(200),
  options: z.array(z.string().max(120)).min(2).max(4),
  category: z.string().trim().max(30).optional(),
})

export const postCustomerQuizSubmission = asyncHandler(async (req: Request, res: Response) => {
  const data = await submitQuizQuestion(req.user?.id ?? "", submissionSchema.parse(req.body))
  return sendSuccess(res, { message: "Question submitted", data })
})

// ── Public (website proxy; friends play without an account) ──
export const getPublicQuizController = asyncHandler(async (req: Request, res: Response) => {
  const key = playerKeySchema.safeParse(req.query.playerKey)
  const data = await getPublicQuiz(param(req.params.code), key.success ? key.data : undefined)
  return sendSuccess(res, { data })
})

const startSchema = z.object({ anonymousId: playerKeySchema, name: z.string().max(60) })

export const postPublicQuizStart = asyncHandler(async (req: Request, res: Response) => {
  const body = startSchema.parse(req.body)
  const data = await startPublicQuiz(param(req.params.code), body.anonymousId, body.name)
  return sendSuccess(res, { data })
})

const answerSchema = z.object({
  anonymousId: playerKeySchema,
  index: z.coerce.number().int().min(0).max(QUIZ_MAX_QUESTIONS - 1),
  optionId: z.string().trim().min(1).max(20),
})

export const postPublicQuizAnswer = asyncHandler(async (req: Request, res: Response) => {
  const body = answerSchema.parse(req.body)
  const data = await answerPublicQuiz(param(req.params.code), body.anonymousId, body.index, body.optionId)
  return sendSuccess(res, { data })
})

export const postPublicQuizMakeOwn = asyncHandler(async (req: Request, res: Response) => {
  const data = await recordQuizMakeOwnClick(param(req.params.code))
  return sendSuccess(res, { data })
})

// ── Admin ──
export const getAdminQuizSettingsController = asyncHandler(async (_req: Request, res: Response) => {
  const data = await getQuizSettings(true)
  return sendSuccess(res, { data })
})

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  deliveredPrompt: z.boolean().optional(),
  questionCount: z.coerce.number().int().min(5).max(15).optional(),
  linkExpiryDays: z.coerce.number().int().min(1).max(365).optional(),
  notifyOnPlay: z.boolean().optional(),
  submissionsEnabled: z.boolean().optional(),
  showAuthorName: z.boolean().optional(),
  approveRewardCoins: z.coerce.number().int().min(0).max(500).optional(),
  trustedAutoApprove: z.boolean().optional(),
  trustedThreshold: z.coerce.number().int().min(1).max(50).optional(),
  // Texts (templates). Unknown keys are ignored when merged over the defaults.
  copy: z.record(z.string(), z.union([z.string().max(400), z.array(z.string().max(120)).max(12)])).optional(),
  tiers: z
    .array(
      z.object({
        key: z.string().trim().max(30).optional(),
        minPercent: z.coerce.number().min(0).max(100),
        emoji: z.string().max(8).optional(),
        labels: z.array(z.string().trim().max(60)).min(1).max(8),
      }),
    )
    .min(1)
    .max(6)
    .optional(),
})

export const putAdminQuizSettingsController = asyncHandler(async (req: Request, res: Response) => {
  const data = await saveQuizSettings(settingsSchema.parse(req.body))
  return sendSuccess(res, { message: "Quiz settings saved", data })
})

export const getAdminQuizQuestionsController = asyncHandler(async (_req: Request, res: Response) => {
  const data = await listAdminQuizQuestions()
  return sendSuccess(res, { data })
})

const questionSchema = z.object({
  text: z.string().trim().min(4).max(140),
  category: z.string().trim().max(30).optional(),
  isActive: z.boolean().optional(),
  position: z.coerce.number().int().min(-1000).max(10000).optional(),
  options: z.array(z.string().trim().max(80)).min(2).max(4),
})

export const postAdminQuizQuestionController = asyncHandler(async (req: Request, res: Response) => {
  const data = await createAdminQuizQuestion(questionSchema.parse(req.body))
  return sendSuccess(res, { message: "Question added", data })
})

export const putAdminQuizQuestionController = asyncHandler(async (req: Request, res: Response) => {
  const data = await updateAdminQuizQuestion(param(req.params.questionId), questionSchema.partial().parse(req.body))
  return sendSuccess(res, { message: "Question updated", data })
})

export const deleteAdminQuizQuestionController = asyncHandler(async (req: Request, res: Response) => {
  const data = await deleteAdminQuizQuestion(param(req.params.questionId))
  return sendSuccess(res, { message: "Question deleted", data })
})

export const getAdminQuizStatsController = asyncHandler(async (req: Request, res: Response) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30))
  const data = await getAdminQuizStats(days)
  return sendSuccess(res, { data })
})

const hideSchema = z.object({ hidden: z.boolean() })

export const postAdminQuizPlayVisibility = asyncHandler(async (req: Request, res: Response) => {
  const body = hideSchema.parse(req.body)
  const data = await setAdminQuizPlayHidden(param(req.params.playId), body.hidden)
  return sendSuccess(res, { data })
})

// ── Admin: review customer-suggested questions ──
export const getAdminQuizSubmissionsController = asyncHandler(async (req: Request, res: Response) => {
  const raw = typeof req.query.status === "string" ? req.query.status : "pending"
  const status = raw === "approved" || raw === "rejected" ? raw : "pending"
  const data = await listAdminQuizSubmissions(status)
  return sendSuccess(res, { data })
})

const approveSchema = z.object({
  text: z.string().trim().min(4).max(140).optional(),
  options: z.array(z.string().trim().max(80)).min(2).max(4).optional(),
  category: z.string().trim().max(30).optional(),
})

export const postAdminQuizSubmissionApprove = asyncHandler(async (req: Request, res: Response) => {
  const edits = approveSchema.parse(req.body ?? {})
  const data = await approveQuizSubmission(param(req.params.submissionId), { reviewedBy: req.user?.id ?? "admin", edits })
  return sendSuccess(res, { message: "Question approved", data })
})

const rejectSchema = z.object({ reason: z.string().trim().max(160).optional() })

export const postAdminQuizSubmissionReject = asyncHandler(async (req: Request, res: Response) => {
  const body = rejectSchema.parse(req.body ?? {})
  const data = await rejectQuizSubmission(param(req.params.submissionId), { reviewedBy: req.user?.id ?? "admin", reason: body.reason })
  return sendSuccess(res, { message: "Question rejected", data })
})
