import mongoose from "mongoose"

import { OtpAbuseBlockModel, OtpSecurityEventModel } from "../modules/auth/auth.model"
import {
  BkashPaymentAttemptModel,
  BkashSandboxPaymentSessionModel,
  VoucherRedemptionModel,
} from "../modules/customer/customer.model"
import { AlertDeliveryLogModel } from "../modules/monitoring/alert-delivery-log.model"
import { ReviewModel } from "../modules/owner/experience.model"
import { env } from "./env"
import { logger } from "./logger"

export type DatabaseHealth = {
  error?: string
  latencyMs: number | null
  ok: boolean
  state: "connected" | "connecting" | "disconnecting" | "disconnected"
}

let connectionMonitoringInstalled = false
const DATABASE_HEALTH_CACHE_MS = 2_000
let databaseWatchdogTimer: NodeJS.Timeout | null = null
let disconnectTimer: NodeJS.Timeout | null = null
let cachedDatabaseHealth: { checkedAt: number; value: DatabaseHealth } | null = null
let pingInFlight: Promise<DatabaseHealth> | null = null
let watchdogCheckRunning = false
let consecutiveWatchdogFailures = 0
let wasConnected = false
let restartRequested = false

export function databaseConnectionState(): DatabaseHealth["state"] {
  const state = mongoose.connection.readyState
  if (state === 1) return "connected"
  if (state === 2) return "connecting"
  if (state === 3) return "disconnecting"
  return "disconnected"
}

function clearDisconnectTimer() {
  if (!disconnectTimer) return
  clearTimeout(disconnectTimer)
  disconnectTimer = null
}

function requestDatabaseRecoveryRestart(reason: string, error?: unknown) {
  if (restartRequested) return
  restartRequested = true
  logger.fatal(
    {
      error,
      reason,
      state: databaseConnectionState(),
    },
    "MongoDB did not recover; restarting the process",
  )
  process.kill(process.pid, "SIGTERM")
}

function scheduleDisconnectRecovery() {
  if (!wasConnected || disconnectTimer || restartRequested) return
  cachedDatabaseHealth = null

  logger.warn(
    { graceMs: env.MONGODB_DISCONNECT_GRACE_MS },
    "MongoDB disconnected; waiting for automatic recovery",
  )
  disconnectTimer = setTimeout(() => {
    disconnectTimer = null
    if (databaseConnectionState() !== "connected") {
      requestDatabaseRecoveryRestart("disconnect_grace_expired")
    }
  }, env.MONGODB_DISCONNECT_GRACE_MS)
  disconnectTimer.unref()
}

function markDatabaseConnected() {
  const recovered = wasConnected
  wasConnected = true
  consecutiveWatchdogFailures = 0
  cachedDatabaseHealth = null
  clearDisconnectTimer()
  logger.info(
    recovered ? "MongoDB connection recovered" : "MongoDB connection established",
  )
}

function installConnectionMonitoring() {
  if (connectionMonitoringInstalled) return
  connectionMonitoringInstalled = true

  mongoose.connection.on("connected", markDatabaseConnected)
  mongoose.connection.on("reconnected", markDatabaseConnected)
  mongoose.connection.on("disconnected", scheduleDisconnectRecovery)
  mongoose.connection.on("error", (error) => {
    logger.error({ error }, "MongoDB connection error")
  })
}

async function runDatabasePing(): Promise<DatabaseHealth> {
  const state = databaseConnectionState()
  const database = mongoose.connection.db
  if (state !== "connected" || !database) {
    return {
      ok: false,
      state,
      latencyMs: null,
      error: `MongoDB is ${state}`,
    }
  }

  const startedAt = Date.now()
  try {
    await database.admin().ping({ timeoutMS: env.MONGODB_HEALTHCHECK_TIMEOUT_MS })
    return {
      ok: true,
      state,
      latencyMs: Date.now() - startedAt,
    }
  } catch (error) {
    return {
      ok: false,
      state: databaseConnectionState(),
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function checkDatabaseHealth(options: { force?: boolean } = {}) {
  const now = Date.now()
  if (
    !options.force &&
    cachedDatabaseHealth &&
    now - cachedDatabaseHealth.checkedAt < DATABASE_HEALTH_CACHE_MS
  ) {
    return Promise.resolve(cachedDatabaseHealth.value)
  }

  if (!pingInFlight) {
    pingInFlight = runDatabasePing()
      .then((health) => {
        cachedDatabaseHealth = { checkedAt: Date.now(), value: health }
        return health
      })
      .finally(() => {
        pingInFlight = null
      })
  }
  return pingInFlight
}

async function runDatabaseWatchdogCheck() {
  if (watchdogCheckRunning || restartRequested) return
  watchdogCheckRunning = true

  try {
    const health = await checkDatabaseHealth({ force: true })
    if (health.ok) {
      if (consecutiveWatchdogFailures > 0) {
        logger.info(
          { latencyMs: health.latencyMs },
          "MongoDB watchdog check recovered",
        )
      }
      consecutiveWatchdogFailures = 0
      return
    }

    consecutiveWatchdogFailures += 1
    logger.warn(
      {
        error: health.error,
        failure: consecutiveWatchdogFailures,
        threshold: env.MONGODB_WATCHDOG_FAILURE_THRESHOLD,
        state: health.state,
      },
      "MongoDB watchdog check failed",
    )
    if (
      consecutiveWatchdogFailures >= env.MONGODB_WATCHDOG_FAILURE_THRESHOLD
    ) {
      requestDatabaseRecoveryRestart("watchdog_failure_threshold", health.error)
    }
  } finally {
    watchdogCheckRunning = false
  }
}

export function startDatabaseWatchdog() {
  if (databaseWatchdogTimer) return
  void runDatabaseWatchdogCheck()
  databaseWatchdogTimer = setInterval(
    () => void runDatabaseWatchdogCheck(),
    env.MONGODB_WATCHDOG_INTERVAL_MS,
  )
  databaseWatchdogTimer.unref()
  logger.info(
    {
      failureThreshold: env.MONGODB_WATCHDOG_FAILURE_THRESHOLD,
      intervalMs: env.MONGODB_WATCHDOG_INTERVAL_MS,
      pingTimeoutMs: env.MONGODB_HEALTHCHECK_TIMEOUT_MS,
    },
    "MongoDB watchdog started",
  )
}

export function stopDatabaseWatchdog() {
  if (databaseWatchdogTimer) {
    clearInterval(databaseWatchdogTimer)
    databaseWatchdogTimer = null
  }
  clearDisconnectTimer()
}

export async function connectDatabase() {
  mongoose.set("strictQuery", true)
  installConnectionMonitoring()

  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
    minPoolSize: Math.min(env.MONGODB_MIN_POOL_SIZE, env.MONGODB_MAX_POOL_SIZE),
    connectTimeoutMS: env.MONGODB_CONNECT_TIMEOUT_MS,
    serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    socketTimeoutMS: env.MONGODB_SOCKET_TIMEOUT_MS,
    waitQueueTimeoutMS: env.MONGODB_WAIT_QUEUE_TIMEOUT_MS,
    maxIdleTimeMS: env.MONGODB_MAX_IDLE_TIME_MS,
  })

  startDatabaseWatchdog()

  if (env.DB_STARTUP_MAINTENANCE_ENABLED) {
    await BkashSandboxPaymentSessionModel.updateMany(
      {
        $or: [{ sandboxPaymentId: "" }, { otpCodeHash: "" }]
      },
      {
        $unset: {
          sandboxPaymentId: 1,
          otpCodeHash: 1
        }
      }
    )

    // Reviews are now one-per-order (partial unique index below). Drop any legacy
    // duplicates FIRST — keeping the most recent per order (matches the order's stamped
    // reviewRequest) — so the unique index can build. Idempotent: a no-op once clean.
    const duplicateReviewGroups = await ReviewModel.aggregate<{
      _id: mongoose.Types.ObjectId
      ids: mongoose.Types.ObjectId[]
    }>([
      { $match: { orderId: { $type: "objectId" } } },
      { $sort: { createdAt: 1 } },
      { $group: { _id: "$orderId", ids: { $push: "$_id" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])
    const staleReviewIds = duplicateReviewGroups.flatMap((group) =>
      group.ids.slice(0, -1),
    )
    if (staleReviewIds.length) {
      await ReviewModel.deleteMany({ _id: { $in: staleReviewIds } })
      logger.warn(
        { removed: staleReviewIds.length },
        "Removed duplicate per-order reviews before unique index sync",
      )
    }

    await BkashSandboxPaymentSessionModel.syncIndexes()
    await BkashPaymentAttemptModel.syncIndexes()
    await VoucherRedemptionModel.syncIndexes()
    await OtpSecurityEventModel.syncIndexes()
    await OtpAbuseBlockModel.syncIndexes()
    await AlertDeliveryLogModel.syncIndexes()
    await ReviewModel.syncIndexes()
  }

  logger.info("MongoDB connected successfully")
}
