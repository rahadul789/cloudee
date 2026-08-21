import http from "node:http"
import mongoose from "mongoose"

import { createApp } from "./app"
import { connectDatabaseWithRetry, stopDatabaseWatchdog } from "./config/db"
import { env } from "./config/env"
import { logger } from "./config/logger"
import { createSocketServer } from "./config/socket"
import { markHealthShuttingDown } from "./modules/health/health.controller"
import {
  startAdminNotificationScheduler,
  stopAdminNotificationScheduler,
} from "./modules/admin/notifications-scheduler"
import {
  startPlatformContentScheduler,
  stopPlatformContentScheduler,
} from "./modules/public/content-scheduler"
import {
  startAppAlertScheduler,
  stopAppAlertScheduler,
} from "./modules/monitoring/app-alert-scheduler"

async function bootstrap() {
  const app = createApp()
  const server = http.createServer(app)

  const socketServer = createSocketServer(server)

  // Start listening IMMEDIATELY — the HTTP server (health endpoints + routes) comes up even
  // while MongoDB is momentarily unreachable, so a transient DNS/network blip to Atlas can
  // never crash-loop the process. Mongoose connects in the background (retrying on failure)
  // and auto-reconnects on later drops.
  server.listen(env.PORT, () => {
    logger.info(`Backend running on port ${env.PORT}`)
  })

  // Background schedulers query the DB, so start them only after the first successful connect.
  void connectDatabaseWithRetry().then(() => {
    startPlatformContentScheduler()
    startAdminNotificationScheduler()
    startAppAlertScheduler()
  })

  let isShuttingDown = false
  const shutdown = (signal: NodeJS.Signals) => {
    if (isShuttingDown) return
    isShuttingDown = true
    markHealthShuttingDown()
    logger.info({ signal }, "Backend shutdown started")
    stopDatabaseWatchdog()
    stopPlatformContentScheduler()
    stopAdminNotificationScheduler()
    stopAppAlertScheduler()

    const forceExitTimer = setTimeout(() => {
      logger.error("Backend shutdown timed out")
      process.exit(1)
    }, 10_000)
    forceExitTimer.unref()

    socketServer
      .close()
      .catch((error) => {
        logger.error(error, "Socket.IO server close failed")
      })
      .finally(() => {
        mongoose
          .disconnect()
          .then(() => {
            clearTimeout(forceExitTimer)
            logger.info("Backend shutdown completed")
            process.exit(0)
          })
          .catch((disconnectError) => {
            clearTimeout(forceExitTimer)
            logger.error(disconnectError, "MongoDB disconnect failed")
            process.exit(1)
          })
      })
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}

bootstrap().catch((error) => {
  logger.error(error)
  process.exit(1)
})
