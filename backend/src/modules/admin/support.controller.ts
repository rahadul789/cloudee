import { z } from "zod"
import type { Response } from "express"

import type { AuthenticatedRequest } from "../../common/middleware/auth"
import { asyncHandler } from "../../common/utils/async-handler"
import { sendSuccess } from "../../common/utils/api-response"
import {
  addSupportInternalNote,
  getSupportCaseDetails,
  listSupportCases,
  replySupportCase,
  updateSupportCase,
} from "./support.service"

const listSupportQuerySchema = z.object({
  search: z.string().optional(),
  zoneId: z.string().optional(),
  districtId: z.string().optional(),
  source: z.enum(["all", "customer", "owner", "rider", "admin"]).optional(),
  status: z.enum(["all", "open", "in_progress", "resolved", "closed"]).optional(),
  priority: z.enum(["all", "low", "medium", "high"]).optional(),
  assigned: z.enum(["all", "me", "unassigned"]).optional(),
  categoryId: z.string().optional(),
  sla: z.enum(["all", "overdue", "due_soon", "healthy"]).optional(),
  sortBy: z.enum(["newest", "oldest", "updated", "priority", "sla"]).optional(),
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
})

const supportReplySchema = z.object({
  message: z.string().trim().min(1, "Message is required"),
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
})

const supportUpdateSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  assignedAdminId: z.string().optional(),
  resolutionNote: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

const supportInternalNoteSchema = z.object({
  note: z.string().trim().min(1, "Note is required"),
})

function getStringParam(value: unknown) {
  return typeof value === "string" ? value : ""
}

function getOptionalStringParam(value: unknown) {
  const normalized = getStringParam(value).trim()
  return normalized.length > 0 ? normalized : undefined
}

function getAdminId(req: AuthenticatedRequest) {
  return req.user?.id ?? "system-admin"
}

function getAdminAreaScope(req: AuthenticatedRequest) {
  return listSupportQuerySchema.pick({ zoneId: true, districtId: true }).parse({
    zoneId: getOptionalStringParam(req.query.zoneId),
    districtId: getOptionalStringParam(req.query.districtId),
  })
}

export const getAdminSupportCases = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const query = listSupportQuerySchema.parse({
    search: getOptionalStringParam(req.query.search),
    zoneId: getOptionalStringParam(req.query.zoneId),
    districtId: getOptionalStringParam(req.query.districtId),
    source: getOptionalStringParam(req.query.source),
    status: getOptionalStringParam(req.query.status),
    priority: getOptionalStringParam(req.query.priority),
    assigned: getOptionalStringParam(req.query.assigned),
    categoryId: getOptionalStringParam(req.query.categoryId),
    sla: getOptionalStringParam(req.query.sla),
    sortBy: getOptionalStringParam(req.query.sortBy),
    page: req.query.page,
    pageSize: req.query.pageSize,
  })
  const data = await listSupportCases({ ...query, adminId: getAdminId(req) })
  return sendSuccess(res, { data })
})

export const getAdminSupportCase = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = await getSupportCaseDetails(
    getStringParam(req.params.supportCaseId),
    getAdminAreaScope(req),
  )
  return sendSuccess(res, { data })
})

export const postAdminSupportReply = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const payload = supportReplySchema.parse(req.body)
  const data = await replySupportCase({
    supportCaseId: getStringParam(req.params.supportCaseId),
    adminId: getAdminId(req),
    message: payload.message,
    status: payload.status,
    ...getAdminAreaScope(req),
  })
  return sendSuccess(res, { message: "Support reply sent successfully", data })
})

export const patchAdminSupportCase = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const payload = supportUpdateSchema.parse(req.body)
  const data = await updateSupportCase({
    supportCaseId: getStringParam(req.params.supportCaseId),
    adminId: getAdminId(req),
    ...getAdminAreaScope(req),
    ...payload,
  })
  return sendSuccess(res, { message: "Support case updated", data })
})

export const postAdminSupportInternalNote = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const payload = supportInternalNoteSchema.parse(req.body)
  const data = await addSupportInternalNote({
    supportCaseId: getStringParam(req.params.supportCaseId),
    adminId: getAdminId(req),
    note: payload.note,
    ...getAdminAreaScope(req),
  })
  return sendSuccess(res, { message: "Internal note added", data })
})
