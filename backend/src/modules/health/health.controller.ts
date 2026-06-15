import type { Request, Response } from "express"
import mongoose from "mongoose"

import { sendSuccess } from "../../common/utils/api-response"

let isShuttingDown = false

export function markHealthShuttingDown() {
  isShuttingDown = true
}

function databaseState() {
  const state = mongoose.connection.readyState
  if (state === 1) return "connected"
  if (state === 2) return "connecting"
  if (state === 3) return "disconnecting"
  return "disconnected"
}

export function getHealth(_req: Request, res: Response) {
  return sendSuccess(res, {
    message: "Backend is healthy",
    data: {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      memory: {
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
    }
  })
}

export function getReadiness(_req: Request, res: Response) {
  const dbStatus = databaseState()
  const ready = !isShuttingDown && dbStatus === "connected"

  return sendSuccess(res, {
    statusCode: ready ? 200 : 503,
    message: ready ? "Backend is ready" : "Backend is not ready",
    data: {
      status: ready ? "ready" : "not_ready",
      database: dbStatus,
      shuttingDown: isShuttingDown,
      timestamp: new Date().toISOString(),
    },
  })
}
