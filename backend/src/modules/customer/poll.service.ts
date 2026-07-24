import { StatusCodes } from "http-status-codes"
import { Types } from "mongoose"

import { AppError } from "../../common/utils/app-error"
import { PollModel, PollVoteModel } from "./poll.model"

type PollOption = { id: string; label: string }

// ---- shapes -----------------------------------------------------------------

export type PublicPoll = {
  pollId: string
  question: string
  imageUrl: string
  options: PollOption[]
  allowFeedback: boolean
  feedbackPrompt: string
  showResultsToUser: boolean
  thanksMessage: string
  endsAt: string | null
}

export type PollResults = {
  total: number
  options: { id: string; label: string; count: number }[]
}

export type PollAdminSummary = {
  pollId: string
  question: string
  status: "active" | "closed"
  isEnded: boolean
  optionCount: number
  totalVotes: number
  endsAt: string | null
  createdAt: string
  closedAt: string | null
}

// ---- helpers ----------------------------------------------------------------

type PollLean = {
  _id: Types.ObjectId
  question: string
  imageUrl: string
  imagePublicId: string
  options: PollOption[]
  allowFeedback: boolean
  feedbackPrompt: string
  showResultsToUser: boolean
  thanksMessage: string
  endsAt: Date | null
  status: "active" | "closed"
  closedAt: Date | null
  createdAt: Date
}

function isEnded(endsAt: Date | null | undefined): boolean {
  return Boolean(endsAt && new Date(endsAt).getTime() < Date.now())
}

function toPublicPoll(poll: PollLean): PublicPoll {
  return {
    pollId: String(poll._id),
    question: poll.question ?? "",
    imageUrl: poll.imageUrl ?? "",
    options: (poll.options ?? []).map((option) => ({
      id: option.id,
      label: option.label,
    })),
    allowFeedback: Boolean(poll.allowFeedback),
    feedbackPrompt: poll.feedbackPrompt ?? "",
    showResultsToUser: Boolean(poll.showResultsToUser),
    thanksMessage: poll.thanksMessage ?? "",
    endsAt: poll.endsAt ? new Date(poll.endsAt).toISOString() : null,
  }
}

async function computeResults(poll: {
  _id: Types.ObjectId
  options: PollOption[]
}): Promise<PollResults> {
  const pollId = String(poll._id)
  const grouped = await PollVoteModel.aggregate<{ _id: string; count: number }>([
    { $match: { pollId } },
    { $group: { _id: "$optionId", count: { $sum: 1 } } },
  ])
  const countByOption = new Map(grouped.map((row) => [String(row._id), row.count]))
  const options = (poll.options ?? []).map((option) => ({
    id: option.id,
    label: option.label,
    count: countByOption.get(option.id) ?? 0,
  }))
  const total = options.reduce((sum, option) => sum + option.count, 0)
  return { total, options }
}

// ---- customer-facing --------------------------------------------------------

// The single poll a customer should see right now: active, not past its deadline, and with
// options. Auto-closes an active poll whose endsAt has passed so it stops appearing.
export async function getActivePublicPoll(): Promise<PublicPoll | null> {
  const poll = (await PollModel.findOne({ status: "active" })
    .sort({ createdAt: -1 })
    .lean()) as PollLean | null
  if (!poll) return null
  if (isEnded(poll.endsAt)) {
    await PollModel.updateOne(
      { _id: poll._id, status: "active" },
      { $set: { status: "closed", closedAt: new Date() } },
    )
    return null
  }
  if (!poll.options?.length) return null
  return toPublicPoll(poll)
}

export async function submitPollVote(params: {
  pollId: string
  optionId: string
  feedback?: string
  deviceId?: string | null
}): Promise<{
  ok: boolean
  alreadyVoted: boolean
  thanksMessage: string
  results: PollResults | null
}> {
  if (!Types.ObjectId.isValid(params.pollId)) {
    throw new AppError(StatusCodes.CONFLICT, "POLL_NOT_ACTIVE", "This poll is no longer available.")
  }
  const poll = (await PollModel.findById(params.pollId).lean()) as PollLean | null
  if (!poll || poll.status !== "active") {
    throw new AppError(StatusCodes.CONFLICT, "POLL_NOT_ACTIVE", "This poll is no longer available.")
  }
  if (isEnded(poll.endsAt)) {
    throw new AppError(StatusCodes.CONFLICT, "POLL_ENDED", "Voting for this poll has ended.")
  }
  const chosenOption = poll.options.find((option) => option.id === params.optionId)
  if (!chosenOption) {
    throw new AppError(StatusCodes.BAD_REQUEST, "POLL_OPTION_INVALID", "Please choose a valid option.")
  }

  const voterKey = (params.deviceId ?? "").trim()
  if (!voterKey) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "POLL_VOTER_UNKNOWN",
      "Could not identify this device. Please try again.",
    )
  }

  const feedback = poll.allowFeedback
    ? String(params.feedback ?? "").trim().slice(0, 500)
    : ""

  let alreadyVoted = false
  try {
    await PollVoteModel.create({
      pollId: String(poll._id),
      voterKey,
      customerId: null,
      deviceId: voterKey,
      optionId: params.optionId,
      feedback,
    })
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) {
      alreadyVoted = true
    } else {
      throw error
    }
  }

  const results = poll.showResultsToUser ? await computeResults(poll) : null
  return { ok: true, alreadyVoted, thanksMessage: poll.thanksMessage, results }
}

// ---- admin ------------------------------------------------------------------

export async function createPoll(
  input: {
    question: string
    imageUrl: string
    imagePublicId: string
    options: PollOption[]
    allowFeedback: boolean
    feedbackPrompt: string
    showResultsToUser: boolean
    thanksMessage: string
    endsAt: string | null
  },
  adminId: string,
): Promise<PollAdminSummary> {
  // Enforce "one active poll": close whatever is currently active first.
  await PollModel.updateMany(
    { status: "active" },
    { $set: { status: "closed", closedAt: new Date() } },
  )
  const poll = await PollModel.create({
    question: input.question,
    imageUrl: input.imageUrl,
    imagePublicId: input.imagePublicId,
    options: input.options,
    allowFeedback: input.allowFeedback,
    feedbackPrompt: input.feedbackPrompt,
    showResultsToUser: input.showResultsToUser,
    thanksMessage: input.thanksMessage,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    status: "active",
    createdByAdminId: adminId,
  })
  return {
    pollId: String(poll._id),
    question: poll.question,
    status: "active",
    isEnded: false,
    optionCount: poll.options.length,
    totalVotes: 0,
    endsAt: poll.endsAt ? poll.endsAt.toISOString() : null,
    createdAt: poll.createdAt.toISOString(),
    closedAt: null,
  }
}

export async function closePoll(pollId: string): Promise<void> {
  if (!Types.ObjectId.isValid(pollId)) {
    throw new AppError(StatusCodes.NOT_FOUND, "POLL_NOT_FOUND", "Poll not found.")
  }
  const result = await PollModel.updateOne(
    { _id: pollId },
    { $set: { status: "closed", closedAt: new Date() } },
  )
  if (result.matchedCount === 0) {
    throw new AppError(StatusCodes.NOT_FOUND, "POLL_NOT_FOUND", "Poll not found.")
  }
}

// History: every poll, newest first, with its vote totals.
export async function listPollsAdmin(): Promise<PollAdminSummary[]> {
  const polls = (await PollModel.find()
    .sort({ createdAt: -1 })
    .limit(100)
    .lean()) as PollLean[]
  const counts = await PollVoteModel.aggregate<{ _id: string; count: number }>([
    { $group: { _id: "$pollId", count: { $sum: 1 } } },
  ])
  const totalByPoll = new Map(counts.map((row) => [String(row._id), row.count]))
  return polls.map((poll) => ({
    pollId: String(poll._id),
    question: poll.question,
    status: poll.status,
    isEnded: isEnded(poll.endsAt),
    optionCount: poll.options?.length ?? 0,
    totalVotes: totalByPoll.get(String(poll._id)) ?? 0,
    endsAt: poll.endsAt ? new Date(poll.endsAt).toISOString() : null,
    createdAt: poll.createdAt.toISOString(),
    closedAt: poll.closedAt ? new Date(poll.closedAt).toISOString() : null,
  }))
}

// Full detail for one poll: option counts + the free-text comments.
export async function getPollAdminDetail(pollId: string): Promise<{
  pollId: string
  question: string
  status: "active" | "closed"
  isEnded: boolean
  endsAt: string | null
  createdAt: string
  closedAt: string | null
  showResultsToUser: boolean
  allowFeedback: boolean
  total: number
  options: { id: string; label: string; count: number }[]
  feedback: { feedback: string; optionLabel: string; createdAt: string }[]
} | null> {
  if (!Types.ObjectId.isValid(pollId)) return null
  const poll = (await PollModel.findById(pollId).lean()) as PollLean | null
  if (!poll) return null

  const results = await computeResults(poll)
  const labelByOption = new Map(poll.options.map((option) => [option.id, option.label]))
  const feedbackDocs = await PollVoteModel.find({
    pollId: String(poll._id),
    feedback: { $ne: "" },
  })
    .select("feedback optionId createdAt")
    .sort({ createdAt: -1 })
    .limit(500)
    .lean()

  return {
    pollId: String(poll._id),
    question: poll.question,
    status: poll.status,
    isEnded: isEnded(poll.endsAt),
    endsAt: poll.endsAt ? new Date(poll.endsAt).toISOString() : null,
    createdAt: poll.createdAt.toISOString(),
    closedAt: poll.closedAt ? new Date(poll.closedAt).toISOString() : null,
    showResultsToUser: Boolean(poll.showResultsToUser),
    allowFeedback: Boolean(poll.allowFeedback),
    total: results.total,
    options: results.options,
    feedback: feedbackDocs.map((doc) => ({
      feedback: String(doc.feedback ?? ""),
      optionLabel: labelByOption.get(String(doc.optionId ?? "")) ?? "",
      createdAt: (doc.createdAt as Date).toISOString(),
    })),
  }
}
