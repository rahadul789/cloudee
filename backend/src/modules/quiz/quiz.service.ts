import mongoose from "mongoose"

import { AppError } from "../../common/utils/app-error"
import { env } from "../../config/env"
import { logger } from "../../config/logger"
import { CustomerModel } from "../customer/customer.model"
import { sendPushToCustomer } from "../customer/push.service"
import { creditQuizQuestionCoins } from "../rewards/rewards.service"
import { FriendQuizModel, QuizPlayModel, QuizQuestionModel, QuizSettingsModel, QuizSubmissionModel } from "./quiz.model"
import {
  QUIZ_MAX_QUESTIONS,
  QUIZ_MIN_QUESTIONS,
  QUIZ_PUSH_COOLDOWN_MS,
  QUIZ_SEED_QUESTIONS,
  compareQuizPlays,
  generateQuizCode,
  isValidQuizCode,
  quizTitleFor,
  sanitizeQuizName,
  validateSuggestedQuestion,
} from "./quiz.rules"

const MAX_QUIZZES_PER_DAY = 5
const PUBLIC_LEADERBOARD_SIZE = 30
const OWNER_PLAYS_LIMIT = 100
const MAX_PLAYS_PER_QUIZ = 500

export type QuizSettings = {
  enabled: boolean
  deliveredPrompt: boolean
  questionCount: number
  linkExpiryDays: number
  notifyOnPlay: boolean
  submissionsEnabled: boolean
  showAuthorName: boolean
  approveRewardCoins: number
  trustedAutoApprove: boolean
  trustedThreshold: number
  seeded: boolean
}

const SETTINGS_DEFAULTS: QuizSettings = {
  enabled: false,
  deliveredPrompt: false,
  questionCount: 10,
  linkExpiryDays: 30,
  notifyOnPlay: true,
  submissionsEnabled: false,
  showAuthorName: true,
  approveRewardCoins: 0,
  trustedAutoApprove: false,
  trustedThreshold: 3,
  seeded: false,
}

// Settings are read on every Hype feed load — keep a short in-memory copy.
let settingsCache: { value: QuizSettings; at: number } | null = null
const SETTINGS_TTL_MS = 30_000

export async function getQuizSettings(fresh = false): Promise<QuizSettings> {
  if (!fresh && settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL_MS) return settingsCache.value
  const doc = await QuizSettingsModel.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default" } },
    { upsert: true, new: true },
  ).lean()
  const value: QuizSettings = { ...SETTINGS_DEFAULTS }
  for (const key of Object.keys(SETTINGS_DEFAULTS) as Array<keyof QuizSettings>) {
    const raw = (doc as Record<string, unknown> | null)?.[key]
    if (raw !== undefined && raw !== null) (value as Record<string, unknown>)[key] = raw
  }
  settingsCache = { value, at: Date.now() }
  return value
}

/** Cheap flag for the Hype feed / other screens. Never throws. */
export async function isQuizEnabled() {
  try {
    return (await getQuizSettings()).enabled
  } catch {
    return false
  }
}

export async function saveQuizSettings(patch: Partial<Omit<QuizSettings, "seeded">>) {
  await QuizSettingsModel.updateOne({ key: "default" }, { $set: patch }, { upsert: true })
  settingsCache = null
  return getQuizSettings(true)
}

/** Inserts the starter questions once (only into an empty bank). */
export async function ensureQuizSeeded() {
  const settings = await getQuizSettings()
  if (settings.seeded) return
  const count = await QuizQuestionModel.estimatedDocumentCount()
  if (count === 0) {
    await QuizQuestionModel.insertMany(
      QUIZ_SEED_QUESTIONS.map((question, index) => ({
        text: question.text,
        category: question.category,
        position: index,
        options: question.options.map((label, optionIndex) => ({ id: `o${optionIndex + 1}`, label })),
      })),
    )
  }
  await QuizSettingsModel.updateOne({ key: "default" }, { $set: { seeded: true } }, { upsert: true })
  settingsCache = null
}

function notFound() {
  return new AppError(404, "QUIZ_NOT_FOUND", "এই quiz-টি খুঁজে পাওয়া যায়নি।")
}

function shareUrlFor(code: string) {
  return `${env.WEBSITE_PUBLIC_URL.replace(/\/+$/, "")}/q/${code}`
}

type QuizDoc = {
  _id: mongoose.Types.ObjectId
  code: string
  customerId: mongoose.Types.ObjectId
  ownerName: string
  questions: Array<{ questionId: mongoose.Types.ObjectId; text: string; options: Array<{ id: string; label: string }>; answerId: string; authorName?: string }>
  status: "active" | "closed"
  expiresAt: Date
  viewCount: number
  playCount: number
  makeOwnClicks: number
  lastPushAt: Date | null
  createdAt: Date
}

type PlayDoc = {
  _id: mongoose.Types.ObjectId
  quizId: mongoose.Types.ObjectId
  playerKey: string
  playerName: string
  answers: string[]
  score: number
  completed: boolean
  completedAt: Date | null
  hidden: boolean
}

function isLive(quiz: Pick<QuizDoc, "status" | "expiresAt">, now = Date.now()) {
  return quiz.status === "active" && new Date(quiz.expiresAt).getTime() > now
}

function titleView(score: number, total: number) {
  const title = quizTitleFor(score, total)
  return { titleKey: title.key, title: title.label, titleEmoji: title.emoji }
}

async function leaderboardOf(quiz: QuizDoc, limit: number) {
  const plays = (await QuizPlayModel.find({ quizId: quiz._id, completed: true, hidden: { $ne: true } })
    .sort({ score: -1, completedAt: 1 })
    .limit(limit)
    .lean()) as unknown as PlayDoc[]
  return plays.sort(compareQuizPlays)
}

// ── Customer (app) ──

function ownerQuizView(quiz: QuizDoc, plays: PlayDoc[]) {
  const total = quiz.questions.length
  const labelOf = (questionIndex: number, optionId: string) =>
    quiz.questions[questionIndex]?.options.find((option) => option.id === optionId)?.label ?? ""
  return {
    id: String(quiz._id),
    code: quiz.code,
    shareUrl: shareUrlFor(quiz.code),
    ownerName: quiz.ownerName,
    createdAt: quiz.createdAt,
    expiresAt: quiz.expiresAt,
    live: isLive(quiz),
    viewCount: quiz.viewCount ?? 0,
    playCount: quiz.playCount ?? 0,
    questions: quiz.questions.map((question) => ({
      text: question.text,
      answer: question.options.find((option) => option.id === question.answerId)?.label ?? "",
    })),
    plays: plays.map((play, index) => ({
      id: String(play._id),
      rank: index + 1,
      name: play.playerName,
      score: play.score,
      total,
      completedAt: play.completedAt,
      ...titleView(play.score, total),
      // What they got wrong — the fun part ("রাকিব ভাবে আমি তেহারি পছন্দ করি 😤"). Owner only.
      misses: quiz.questions
        .map((question, questionIndex) => ({ question, questionIndex, given: play.answers[questionIndex] }))
        .filter(({ question, given }) => given && given !== question.answerId)
        .map(({ question, questionIndex, given }) => ({
          question: question.text,
          theirAnswer: labelOf(questionIndex, given),
          correctAnswer: labelOf(questionIndex, question.answerId),
        })),
    })),
  }
}

export async function getCustomerQuizHome(customerId: string) {
  const settings = await getQuizSettings()
  const base = {
    enabled: settings.enabled,
    deliveredPrompt: settings.enabled && settings.deliveredPrompt,
    questionCount: settings.questionCount,
    submissionsEnabled: settings.enabled && settings.submissionsEnabled,
  }
  if (!settings.enabled || !mongoose.Types.ObjectId.isValid(customerId)) return { ...base, quiz: null }
  const quiz = (await FriendQuizModel.findOne({ customerId, status: "active" })
    .sort({ createdAt: -1 })
    .lean()) as unknown as QuizDoc | null
  if (!quiz) return { ...base, quiz: null }
  const plays = await leaderboardOf(quiz, OWNER_PLAYS_LIMIT)
  return { ...base, quiz: ownerQuizView(quiz, plays) }
}

export async function listQuizBank(customerId?: string) {
  const settings = await getQuizSettings()
  if (!settings.enabled) throw new AppError(403, "QUIZ_DISABLED", "Quiz এখন বন্ধ আছে।")
  await ensureQuizSeeded()
  const questions = await QuizQuestionModel.find({ isActive: true }).sort({ position: 1, createdAt: 1 }).lean()
  return {
    questionCount: settings.questionCount,
    questions: questions
      .filter((question) => (question.options?.length ?? 0) >= 2)
      .map((question) => ({
        id: String(question._id),
        text: question.text,
        category: question.category,
        authorName: authorLabel(question, settings),
        // The customer's own approved questions — the app puts these first and labels them.
        mine: Boolean(customerId) && String(question.authorCustomerId ?? "") === customerId,
        options: (question.options ?? []).map((option) => ({ id: option.id, label: option.label })),
      })),
  }
}

/** Credit line for customer-made questions ("" for admin ones or when the admin turned it off). */
function authorLabel(question: { source?: string | null; authorName?: string | null }, settings: QuizSettings) {
  return settings.showAuthorName && question.source === "customer" ? String(question.authorName ?? "") : ""
}

export async function createCustomerQuiz(
  customerId: string,
  input: { answers: Array<{ questionId: string; optionId: string }>; displayName?: string },
) {
  const settings = await getQuizSettings()
  if (!settings.enabled) throw new AppError(403, "QUIZ_DISABLED", "Quiz এখন বন্ধ আছে।")
  if (!mongoose.Types.ObjectId.isValid(customerId)) throw new AppError(401, "UNAUTHORIZED", "Sign in first")

  const answers = input.answers.filter(
    (answer, index, list) => list.findIndex((other) => other.questionId === answer.questionId) === index,
  )
  if (answers.length < QUIZ_MIN_QUESTIONS || answers.length > QUIZ_MAX_QUESTIONS) {
    throw new AppError(400, "QUIZ_QUESTION_COUNT", `${QUIZ_MIN_QUESTIONS}–${QUIZ_MAX_QUESTIONS}টা প্রশ্নের উত্তর দাও।`)
  }

  const since = new Date(Date.now() - 24 * 60 * 60_000)
  const madeToday = await FriendQuizModel.countDocuments({ customerId, createdAt: { $gte: since } })
  if (madeToday >= MAX_QUIZZES_PER_DAY) {
    throw new AppError(429, "QUIZ_DAILY_LIMIT", "আজ অনেকগুলো quiz বানিয়েছ — কাল আবার চেষ্টা করো।")
  }

  const ids = answers.map((answer) => answer.questionId).filter((id) => mongoose.Types.ObjectId.isValid(id))
  const bank = await QuizQuestionModel.find({ _id: { $in: ids }, isActive: true }).lean()
  const byId = new Map(bank.map((question) => [String(question._id), question]))
  const questions = answers.map((answer) => {
    const question = byId.get(answer.questionId)
    if (!question) throw new AppError(400, "QUIZ_QUESTION_GONE", "একটা প্রশ্ন আর পাওয়া যাচ্ছে না — প্রশ্নটা বদলে নাও।")
    const options = (question.options ?? []).map((option) => ({ id: option.id, label: option.label }))
    if (!options.some((option) => option.id === answer.optionId)) {
      throw new AppError(400, "QUIZ_OPTION_INVALID", "একটা উত্তর ঠিক নেই — আবার বেছে নাও।")
    }
    return { questionId: question._id, text: question.text, options, answerId: answer.optionId, authorName: authorLabel(question, settings) }
  })

  let ownerName = input.displayName !== undefined ? sanitizeQuizName(input.displayName) : null
  if (input.displayName && !ownerName) {
    throw new AppError(400, "QUIZ_NAME_INVALID", "এই নামটা ব্যবহার করা যাবে না।")
  }
  if (!ownerName) {
    const customer = await CustomerModel.findById(customerId).select("fullName").lean()
    const first = String((customer as { fullName?: string } | null)?.fullName ?? "").trim().split(/\s+/)[0] ?? ""
    ownerName = sanitizeQuizName(first) ?? "তোমার বন্ধু"
  }

  // One live quiz per customer — a new one replaces the old link.
  await FriendQuizModel.updateMany({ customerId, status: "active" }, { $set: { status: "closed" } })

  const expiresAt = new Date(Date.now() + settings.linkExpiryDays * 24 * 60 * 60_000)
  let created: QuizDoc | null = null
  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
    try {
      const doc = await FriendQuizModel.create({ code: generateQuizCode(), customerId, ownerName, questions, expiresAt })
      created = doc.toObject() as unknown as QuizDoc
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error
    }
  }
  if (!created) throw new AppError(500, "QUIZ_CODE", "Quiz বানানো যায়নি, আবার চেষ্টা করো।")
  await QuizQuestionModel.updateMany({ _id: { $in: questions.map((question) => question.questionId) } }, { $inc: { useCount: 1 } })
  return ownerQuizView(created, [])
}

export async function closeCustomerQuiz(customerId: string) {
  if (!mongoose.Types.ObjectId.isValid(customerId)) return { closed: 0 }
  const result = await FriendQuizModel.updateMany({ customerId, status: "active" }, { $set: { status: "closed" } })
  return { closed: result.modifiedCount }
}

// ── Public (website, friends — no account) ──

async function findPublicQuiz(code: string) {
  if (!isValidQuizCode(code)) throw notFound()
  const settings = await getQuizSettings()
  if (!settings.enabled) throw notFound()
  const quiz = (await FriendQuizModel.findOne({ code }).lean()) as unknown as QuizDoc | null
  if (!quiz) throw notFound()
  return quiz
}

function publicBoard(plays: PlayDoc[], total: number, playerKey?: string) {
  return plays.map((play, index) => ({
    rank: index + 1,
    name: play.playerName,
    score: play.score,
    total,
    isMe: Boolean(playerKey) && play.playerKey === playerKey,
    ...titleView(play.score, total),
  }))
}

async function resultFor(quiz: QuizDoc, play: PlayDoc) {
  const total = quiz.questions.length
  const plays = await leaderboardOf(quiz, PUBLIC_LEADERBOARD_SIZE)
  const better = await QuizPlayModel.countDocuments({
    quizId: quiz._id,
    completed: true,
    hidden: { $ne: true },
    $or: [{ score: { $gt: play.score } }, { score: play.score, completedAt: { $lt: play.completedAt ?? new Date() } }],
  })
  return {
    score: play.score,
    total,
    rank: better + 1,
    ...titleView(play.score, total),
    leaderboard: publicBoard(plays, total, play.playerKey),
  }
}

function playState(quiz: QuizDoc, play: PlayDoc | null) {
  if (!play) return null
  return {
    name: play.playerName,
    answered: play.answers.length,
    score: play.score,
    completed: play.completed,
    // Earlier answers + the right ones, so a resumed / finished game can show its review.
    review: play.answers.map((given, index) => ({ given, correct: quiz.questions[index]?.answerId ?? "" })),
  }
}

export async function getPublicQuiz(code: string, playerKey?: string) {
  const quiz = await findPublicQuiz(code)
  const total = quiz.questions.length
  if (!isLive(quiz)) {
    return { code: quiz.code, ownerName: quiz.ownerName, status: "expired" as const, total, questions: [], me: null, result: null, leaderboard: [], playCount: quiz.playCount ?? 0 }
  }
  const play = playerKey
    ? ((await QuizPlayModel.findOne({ quizId: quiz._id, playerKey }).lean()) as unknown as PlayDoc | null)
    : null
  if (!play) await FriendQuizModel.updateOne({ _id: quiz._id }, { $inc: { viewCount: 1 } })
  const plays = await leaderboardOf(quiz, PUBLIC_LEADERBOARD_SIZE)
  return {
    code: quiz.code,
    ownerName: quiz.ownerName,
    status: "active" as const,
    total,
    questions: quiz.questions.map((question, index) => ({
      index,
      text: question.text,
      authorName: question.authorName ?? "",
      options: question.options.map((option) => ({ id: option.id, label: option.label })),
    })),
    me: playState(quiz, play),
    result: play?.completed ? await resultFor(quiz, play) : null,
    leaderboard: publicBoard(plays, total, playerKey),
    playCount: quiz.playCount ?? 0,
  }
}

export async function startPublicQuiz(code: string, playerKey: string, rawName: string) {
  const quiz = await findPublicQuiz(code)
  if (!isLive(quiz)) throw new AppError(410, "QUIZ_EXPIRED", "এই quiz-এর সময় শেষ।")
  const playerName = sanitizeQuizName(rawName)
  if (!playerName) throw new AppError(400, "QUIZ_NAME_INVALID", "একটা সুন্দর নাম লেখো (২–২৪ অক্ষর)।")
  const existing = (await QuizPlayModel.findOne({ quizId: quiz._id, playerKey }).lean()) as unknown as PlayDoc | null
  if (existing) return { me: playState(quiz, existing) }
  const started = await QuizPlayModel.countDocuments({ quizId: quiz._id })
  if (started >= MAX_PLAYS_PER_QUIZ) throw new AppError(429, "QUIZ_FULL", "এই quiz-এ আর খেলা যাবে না।")
  try {
    const play = await QuizPlayModel.create({ quizId: quiz._id, playerKey, playerName })
    return { me: playState(quiz, play.toObject() as unknown as PlayDoc) }
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error
    const again = (await QuizPlayModel.findOne({ quizId: quiz._id, playerKey }).lean()) as unknown as PlayDoc | null
    return { me: playState(quiz, again) }
  }
}

export async function answerPublicQuiz(code: string, playerKey: string, index: number, optionId: string) {
  const quiz = await findPublicQuiz(code)
  if (!isLive(quiz)) throw new AppError(410, "QUIZ_EXPIRED", "এই quiz-এর সময় শেষ।")
  const total = quiz.questions.length
  const question = quiz.questions[index]
  if (!question || !question.options.some((option) => option.id === optionId)) {
    throw new AppError(400, "QUIZ_OPTION_INVALID", "উত্তরটা ঠিক নেই।")
  }
  const correct = question.answerId === optionId
  const isLast = index === total - 1
  // Atomic + in order: only accepts the answer for the next unanswered question.
  const updated = (await QuizPlayModel.findOneAndUpdate(
    { quizId: quiz._id, playerKey, completed: false, answers: { $size: index } },
    {
      $push: { answers: optionId },
      $inc: { score: correct ? 1 : 0 },
      ...(isLast ? { $set: { completed: true, completedAt: new Date() } } : {}),
    },
    { new: true },
  ).lean()) as unknown as PlayDoc | null

  if (!updated) {
    // Double tap / out of order / already finished → return the current state instead of failing.
    const play = (await QuizPlayModel.findOne({ quizId: quiz._id, playerKey }).lean()) as unknown as PlayDoc | null
    if (!play) throw new AppError(400, "QUIZ_NOT_STARTED", "আগে নাম লিখে খেলা শুরু করো।")
    return {
      correct: play.answers[index] === question.answerId,
      correctOptionId: question.answerId,
      me: playState(quiz, play),
      result: play.completed ? await resultFor(quiz, play) : null,
    }
  }

  let result = null
  if (updated.completed) {
    await FriendQuizModel.updateOne({ _id: quiz._id }, { $inc: { playCount: 1 } })
    result = await resultFor(quiz, updated)
    void notifyQuizOwner(quiz, updated).catch((error) =>
      logger.warn({ err: error, quizId: String(quiz._id) }, "quiz.owner_push_failed"),
    )
  }
  return { correct, correctOptionId: question.answerId, me: playState(quiz, updated), result }
}

export async function recordQuizMakeOwnClick(code: string) {
  if (!isValidQuizCode(code)) return { ok: true }
  await FriendQuizModel.updateOne({ code }, { $inc: { makeOwnClicks: 1 } })
  return { ok: true }
}

async function notifyQuizOwner(quiz: QuizDoc, play: PlayDoc) {
  const settings = await getQuizSettings()
  if (!settings.notifyOnPlay) return
  // Claim the push slot atomically so a group chat playing at once sends one buzz, not ten.
  const cutoff = new Date(Date.now() - QUIZ_PUSH_COOLDOWN_MS)
  const claimed = await FriendQuizModel.updateOne(
    { _id: quiz._id, $or: [{ lastPushAt: null }, { lastPushAt: { $lt: cutoff } }] },
    { $set: { lastPushAt: new Date() } },
  )
  if (!claimed.modifiedCount) return
  const total = quiz.questions.length
  const title = quizTitleFor(play.score, total)
  const tease = play.score / Math.max(1, total) < 0.4 ? " 😏" : play.score === total ? " 👑" : ""
  await sendPushToCustomer({
    customerId: String(quiz.customerId),
    payload: {
      title: `${play.playerName} তোমাকে ${play.score}/${total} চেনে!${tease}`,
      body: `${title.emoji} "${title.label}" — কে কোথায় ভুল করেছে দেখো`,
      data: { type: "quiz_play", path: "/quiz" },
    },
  })
}

// ── Admin ──

export async function listAdminQuizQuestions() {
  await ensureQuizSeeded()
  const questions = await QuizQuestionModel.find({}).sort({ position: 1, createdAt: 1 }).lean()
  return questions.map((question) => ({
    id: String(question._id),
    text: question.text,
    category: question.category,
    isActive: question.isActive,
    position: question.position,
    useCount: question.useCount ?? 0,
    source: question.source ?? "admin",
    authorName: question.authorName ?? "",
    options: (question.options ?? []).map((option) => ({ id: option.id, label: option.label })),
  }))
}

type QuestionInput = { text: string; category?: string; isActive?: boolean; position?: number; options: string[] }

function normaliseOptions(labels: string[], existing: Array<{ id: string; label: string }> = []) {
  const clean = labels.map((label) => label.trim()).filter(Boolean)
  if (clean.length < 2 || clean.length > 4) throw new AppError(400, "QUIZ_OPTIONS", "২ থেকে ৪টা উত্তর দিন।")
  // Keep option ids by position so quizzes already made stay valid (they hold a snapshot anyway).
  return clean.map((label, index) => ({ id: existing[index]?.id ?? `o${index + 1}`, label }))
}

export async function createAdminQuizQuestion(input: QuestionInput) {
  const doc = await QuizQuestionModel.create({
    text: input.text,
    category: input.category ?? "fun",
    isActive: input.isActive ?? true,
    position: input.position ?? (await QuizQuestionModel.estimatedDocumentCount()),
    options: normaliseOptions(input.options),
  })
  return { id: String(doc._id) }
}

export async function updateAdminQuizQuestion(id: string, input: Partial<QuestionInput>) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw notFound()
  const current = await QuizQuestionModel.findById(id).lean()
  if (!current) throw notFound()
  const set: Record<string, unknown> = {}
  if (input.text !== undefined) set.text = input.text
  if (input.category !== undefined) set.category = input.category
  if (input.isActive !== undefined) set.isActive = input.isActive
  if (input.position !== undefined) set.position = input.position
  if (input.options !== undefined) set.options = normaliseOptions(input.options, current.options ?? [])
  await QuizQuestionModel.updateOne({ _id: id }, { $set: set })
  return { id }
}

export async function deleteAdminQuizQuestion(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw notFound()
  await QuizQuestionModel.deleteOne({ _id: id })
  return { id }
}

export async function getAdminQuizStats(days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60_000)
  const [quizzesTotal, quizzesRecent, liveQuizzes, playsStarted, playsCompleted, creators, agg, top, recent] = await Promise.all([
    FriendQuizModel.estimatedDocumentCount(),
    FriendQuizModel.countDocuments({ createdAt: { $gte: since } }),
    FriendQuizModel.countDocuments({ status: "active", expiresAt: { $gt: new Date() } }),
    QuizPlayModel.countDocuments({ createdAt: { $gte: since } }),
    QuizPlayModel.countDocuments({ completed: true, completedAt: { $gte: since } }),
    FriendQuizModel.distinct("customerId", { createdAt: { $gte: since } }),
    FriendQuizModel.aggregate<{ views: number; clicks: number }>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: null, views: { $sum: "$viewCount" }, clicks: { $sum: "$makeOwnClicks" } } },
    ]),
    FriendQuizModel.find({ createdAt: { $gte: since } })
      .sort({ playCount: -1 })
      .limit(10)
      .select("code ownerName playCount viewCount makeOwnClicks createdAt status expiresAt")
      .lean(),
    QuizPlayModel.find({ completed: true }).sort({ completedAt: -1 }).limit(40).lean(),
  ])

  const quizIds = [...new Set(recent.map((play) => String(play.quizId)))]
  const quizzes = await FriendQuizModel.find({ _id: { $in: quizIds } }).select("code ownerName questions").lean()
  const quizById = new Map(quizzes.map((quiz) => [String(quiz._id), quiz]))

  return {
    days,
    quizzesTotal,
    quizzesRecent,
    liveQuizzes,
    creators: creators.length,
    linkViews: agg[0]?.views ?? 0,
    playsStarted,
    playsCompleted,
    completionRate: playsStarted ? Math.round((playsCompleted / playsStarted) * 100) : 0,
    playsPerQuiz: quizzesRecent ? Math.round((playsCompleted / quizzesRecent) * 10) / 10 : 0,
    makeOwnClicks: agg[0]?.clicks ?? 0,
    topQuizzes: top.map((quiz) => ({
      code: quiz.code,
      shareUrl: shareUrlFor(quiz.code),
      ownerName: quiz.ownerName,
      playCount: quiz.playCount ?? 0,
      viewCount: quiz.viewCount ?? 0,
      makeOwnClicks: quiz.makeOwnClicks ?? 0,
      createdAt: quiz.createdAt,
      live: isLive(quiz as unknown as QuizDoc),
    })),
    recentPlays: recent.map((play) => {
      const quiz = quizById.get(String(play.quizId))
      return {
        id: String(play._id),
        quizCode: quiz?.code ?? "",
        ownerName: quiz?.ownerName ?? "",
        playerName: play.playerName,
        score: play.score,
        total: quiz?.questions?.length ?? 0,
        completedAt: play.completedAt,
        hidden: Boolean(play.hidden),
      }
    }),
  }
}

/** Moderation: hide a bad name from every leaderboard (or show it again). */
export async function setAdminQuizPlayHidden(playId: string, hidden: boolean) {
  if (!mongoose.Types.ObjectId.isValid(playId)) throw notFound()
  const play = await QuizPlayModel.findByIdAndUpdate(playId, { $set: { hidden } }, { new: true }).lean()
  if (!play) throw notFound()
  return { id: playId, hidden }
}

// ── Customer-suggested questions (admin approves → joins everyone's bank, with credit) ──

const MAX_PENDING_SUBMISSIONS = 3
const MAX_SUBMISSIONS_PER_DAY = 5

function submissionView(doc: {
  _id: unknown
  text: string
  options: string[]
  category?: string | null
  status: string
  rejectReason?: string | null
  autoApproved?: boolean | null
  rewardCoins?: number | null
  createdAt?: Date
  reviewedAt?: Date | null
}, useCount = 0) {
  return {
    id: String(doc._id),
    text: doc.text,
    options: doc.options ?? [],
    category: doc.category ?? "fun",
    status: doc.status as "pending" | "approved" | "rejected",
    rejectReason: doc.rejectReason ?? "",
    autoApproved: Boolean(doc.autoApproved),
    rewardCoins: doc.rewardCoins ?? 0,
    createdAt: doc.createdAt ?? null,
    reviewedAt: doc.reviewedAt ?? null,
    /** How many quizzes picked it (approved only): "৫২টা quiz-এ তোমার প্রশ্ন". */
    useCount,
  }
}

export async function listMyQuizSubmissions(customerId: string) {
  const settings = await getQuizSettings()
  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    return { enabled: false, items: [], pendingLimit: MAX_PENDING_SUBMISSIONS, rewardCoins: 0 }
  }
  const items = await QuizSubmissionModel.find({ customerId }).sort({ createdAt: -1 }).limit(30).lean()
  const questionIds = items.map((item) => item.questionId).filter(Boolean)
  const questions = questionIds.length
    ? await QuizQuestionModel.find({ _id: { $in: questionIds } }).select("useCount").lean()
    : []
  const useById = new Map(questions.map((question) => [String(question._id), question.useCount ?? 0]))
  return {
    enabled: settings.enabled && settings.submissionsEnabled,
    pendingLimit: MAX_PENDING_SUBMISSIONS,
    rewardCoins: settings.approveRewardCoins,
    items: items.map((item) => submissionView(item, item.questionId ? useById.get(String(item.questionId)) ?? 0 : 0)),
  }
}

export async function submitQuizQuestion(
  customerId: string,
  input: { text: string; options: string[]; category?: string },
) {
  const settings = await getQuizSettings()
  if (!settings.enabled || !settings.submissionsEnabled) {
    throw new AppError(403, "QUIZ_SUBMISSIONS_DISABLED", "প্রশ্ন জমা দেওয়া এখন বন্ধ আছে।")
  }
  if (!mongoose.Types.ObjectId.isValid(customerId)) throw new AppError(401, "UNAUTHORIZED", "Sign in first")
  const checked = validateSuggestedQuestion(input)
  if (!checked.ok) throw new AppError(400, "QUIZ_SUBMISSION_INVALID", checked.message)

  const [pending, today, duplicate] = await Promise.all([
    QuizSubmissionModel.countDocuments({ customerId, status: "pending" }),
    QuizSubmissionModel.countDocuments({ customerId, createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60_000) } }),
    QuizQuestionModel.exists({ text: checked.text }),
  ])
  if (pending >= MAX_PENDING_SUBMISSIONS) {
    throw new AppError(429, "QUIZ_SUBMISSION_PENDING_LIMIT", `একসাথে ${MAX_PENDING_SUBMISSIONS}টার বেশি প্রশ্ন অপেক্ষায় রাখা যাবে না, আগেরগুলো দেখা হোক।`)
  }
  if (today >= MAX_SUBMISSIONS_PER_DAY) {
    throw new AppError(429, "QUIZ_SUBMISSION_DAILY_LIMIT", "আজ অনেক প্রশ্ন দিয়েছ, কাল আবার দাও!")
  }
  if (duplicate) throw new AppError(409, "QUIZ_SUBMISSION_DUPLICATE", "এই প্রশ্নটা ভাণ্ডারে আগেই আছে।")

  const customer = await CustomerModel.findById(customerId).select("fullName").lean()
  const first = String((customer as { fullName?: string } | null)?.fullName ?? "").trim().split(/\s+/)[0] ?? ""
  const authorName = sanitizeQuizName(first) ?? "Foodbela বন্ধু"

  const submission = await QuizSubmissionModel.create({
    customerId,
    authorName,
    text: checked.text,
    options: checked.options,
    category: input.category && input.category.length <= 30 ? input.category : "fun",
  })

  // Trusted authors (N approved already) go live straight away; the admin can still remove them.
  if (settings.trustedAutoApprove) {
    const approved = await QuizSubmissionModel.countDocuments({ customerId, status: "approved" })
    if (approved >= settings.trustedThreshold) {
      await approveQuizSubmission(String(submission._id), { reviewedBy: "auto", autoApproved: true })
      const fresh = await QuizSubmissionModel.findById(submission._id).lean()
      return submissionView(fresh ?? submission.toObject())
    }
  }
  return submissionView(submission.toObject())
}

export async function listAdminQuizSubmissions(status: "pending" | "approved" | "rejected" = "pending") {
  const items = await QuizSubmissionModel.find({ status })
    .sort({ createdAt: status === "pending" ? 1 : -1 })
    .limit(100)
    .lean()
  const customerIds = [...new Set(items.map((item) => String(item.customerId)))]
  const approvedCounts = customerIds.length
    ? await QuizSubmissionModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
        { $match: { customerId: { $in: customerIds.map((id) => new mongoose.Types.ObjectId(id)) }, status: "approved" } },
        { $group: { _id: "$customerId", count: { $sum: 1 } } },
      ])
    : []
  const approvedBy = new Map(approvedCounts.map((row) => [String(row._id), row.count]))
  const pendingCount = status === "pending" ? items.length : await QuizSubmissionModel.countDocuments({ status: "pending" })
  return {
    pendingCount,
    items: items.map((item) => ({
      ...submissionView(item),
      customerId: String(item.customerId),
      authorName: item.authorName,
      authorApprovedCount: approvedBy.get(String(item.customerId)) ?? 0,
      reviewedBy: item.reviewedBy ?? "",
    })),
  }
}

export async function approveQuizSubmission(
  submissionId: string,
  params: { reviewedBy: string; autoApproved?: boolean; edits?: { text?: string; options?: string[]; category?: string } },
) {
  if (!mongoose.Types.ObjectId.isValid(submissionId)) throw notFound()
  const current = await QuizSubmissionModel.findById(submissionId).lean()
  if (!current) throw notFound()
  if (current.status !== "pending") throw new AppError(409, "QUIZ_SUBMISSION_DONE", "এটা আগেই দেখা হয়ে গেছে।")

  const text = (params.edits?.text ?? current.text).trim()
  if (text.length < 4) throw new AppError(400, "QUIZ_SUBMISSION_INVALID", "প্রশ্নটা খালি রাখা যাবে না।")
  const options = normaliseOptions(params.edits?.options ?? current.options)
  const category = params.edits?.category ?? current.category ?? "fun"
  // Claim first (atomic) so a double click can't create two questions.
  const claimed = await QuizSubmissionModel.findOneAndUpdate(
    { _id: submissionId, status: "pending" },
    {
      $set: {
        status: "approved",
        reviewedAt: new Date(),
        reviewedBy: params.reviewedBy,
        autoApproved: Boolean(params.autoApproved),
        text,
        options: options.map((option) => option.label),
        category,
      },
    },
    { new: true },
  ).lean()
  if (!claimed) throw new AppError(409, "QUIZ_SUBMISSION_DONE", "এটা আগেই দেখা হয়ে গেছে।")

  const question = await QuizQuestionModel.create({
    text,
    options,
    category,
    isActive: true,
    position: await QuizQuestionModel.estimatedDocumentCount(),
    source: "customer",
    authorCustomerId: claimed.customerId,
    authorName: claimed.authorName,
  })

  const settings = await getQuizSettings()
  const coins = Math.max(0, Math.round(settings.approveRewardCoins || 0))
  await QuizSubmissionModel.updateOne({ _id: submissionId }, { $set: { questionId: question._id, rewardCoins: coins } })
  if (coins > 0) {
    try {
      await creditQuizQuestionCoins(String(claimed.customerId), coins, submissionId)
    } catch (error) {
      logger.warn({ err: error, submissionId }, "quiz.submission_coins_failed")
    }
  }
  void sendPushToCustomer({
    customerId: String(claimed.customerId),
    payload: {
      title: "🎉 তোমার প্রশ্ন approve হয়েছে!",
      body: `"${text.slice(0, 60)}" এখন সবার quiz-এ আসবে${coins > 0 ? ` · ${coins} coin পেয়েছ 🪙` : ""}`,
      data: { type: "quiz_question_approved", path: "/quiz/questions" },
    },
  }).catch((error) => logger.warn({ err: error, submissionId }, "quiz.submission_push_failed"))

  return { id: submissionId, questionId: String(question._id), rewardCoins: coins }
}

export async function rejectQuizSubmission(submissionId: string, params: { reviewedBy: string; reason?: string }) {
  if (!mongoose.Types.ObjectId.isValid(submissionId)) throw notFound()
  const updated = await QuizSubmissionModel.findOneAndUpdate(
    { _id: submissionId, status: "pending" },
    {
      $set: {
        status: "rejected",
        reviewedAt: new Date(),
        reviewedBy: params.reviewedBy,
        rejectReason: (params.reason ?? "").slice(0, 160),
      },
    },
    { new: true },
  ).lean()
  if (!updated) throw new AppError(409, "QUIZ_SUBMISSION_DONE", "এটা আগেই দেখা হয়ে গেছে।")
  // No push on reject: the app shows it quietly under "আমার প্রশ্ন".
  return { id: submissionId }
}
