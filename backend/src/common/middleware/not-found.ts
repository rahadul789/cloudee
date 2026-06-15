import type { Request, Response, NextFunction } from "express"
import { StatusCodes } from "http-status-codes"

import { AppError } from "../utils/app-error"

export function notFoundMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  next(
    new AppError(
      StatusCodes.NOT_FOUND,
      "ROUTE_NOT_FOUND",
      `Route not found: ${req.method} ${req.originalUrl}`
    )
  )
}
