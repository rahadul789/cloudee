import type { Response } from "express"

type ApiMeta = Record<string, unknown> | undefined

export function sendSuccess<T>(
  res: Response,
  params: {
    statusCode?: number
    message?: string
    data?: T
    meta?: ApiMeta
  } = {}
) {
  const { statusCode = 200, message, data, meta } = params

  return res.status(statusCode).json({
    success: true,
    message,
    data,
    meta
  })
}
