import type { Request, Response } from "express"

import { sendSuccess } from "../../common/utils/api-response"
import { checkDatabaseHealth } from "../../config/db"

let isShuttingDown = false

export function markHealthShuttingDown() {
  isShuttingDown = true
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

export async function getReadiness(_req: Request, res: Response) {
  const database = await checkDatabaseHealth()
  const ready = !isShuttingDown && database.ok

  return sendSuccess(res, {
    statusCode: ready ? 200 : 503,
    message: ready ? "Backend is ready" : "Backend is not ready",
    data: {
      status: ready ? "ready" : "not_ready",
      database: database.state,
      databasePing: database.ok ? "ok" : "failed",
      databaseLatencyMs: database.latencyMs,
      shuttingDown: isShuttingDown,
      timestamp: new Date().toISOString(),
    },
  })
}
