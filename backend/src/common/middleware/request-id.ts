import { randomUUID } from "node:crypto"
import type { NextFunction, Request, Response } from "express"

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const requestId = req.headers["x-request-id"]?.toString() || randomUUID()

  req.headers["x-request-id"] = requestId
  res.setHeader("x-request-id", requestId)

  next()
}
