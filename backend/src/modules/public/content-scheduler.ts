import { logger } from "../../config/logger"
import {
  markOperationalJobFinished,
  markOperationalJobStarted,
  recordBusinessEvent,
} from "../admin/business-event.service"
import { sendOperationalAlert } from "../monitoring/alert-notifier"
import { classifySchedulerError } from "../monitoring/scheduler-error-policy"
import { processDueCustomerHomeCmsPushCampaigns } from "./content.service"

let intervalHandle: NodeJS.Timeout | null = null
let isProcessing = false
let consecutiveFailures = 0

function runPlatformContentSchedulerCycle() {
  if (isProcessing) return
  isProcessing = true
  const startedAt = Date.now()
  markOperationalJobStarted("platform_content", "Platform content campaigns")
  void processDueCustomerHomeCmsPushCampaigns()
    .then(() => {
      consecutiveFailures = 0
      markOperationalJobFinished("platform_content", "ok", startedAt)
    })
    .catch((error) => {
      consecutiveFailures += 1
      markOperationalJobFinished("platform_content", "failed", startedAt, error)
      logger.error(error, "Scheduled customer home push failed")
      const policy = classifySchedulerError("platform_content", error)
      if (policy.shouldRecord) {
        void recordBusinessEvent({
          event: "scheduler.platform_content.failed",
          category: "scheduler",
          severity: policy.severity,
          title:
            policy.severity === "critical"
              ? "Platform content scheduler failed"
              : "Platform content scheduler database retry",
          description: policy.description,
        })
      }
      if (consecutiveFailures >= 3) {
        const description =
          error instanceof Error ? error.message : String(error ?? "Unknown scheduler error")
        void recordBusinessEvent({
          event: "scheduler.platform_content.repeated_failure",
          category: "scheduler",
          severity: "critical",
          title: "Platform content scheduler repeatedly failing",
          description,
          metadata: { consecutiveFailures },
        })
        void sendOperationalAlert({
          dedupeKey: "scheduler:platform_content:repeated_failure",
          severity: "critical",
          layer: "system",
          title: "Platform content scheduler repeatedly failing",
          body: `Platform content scheduler failed ${consecutiveFailures} consecutive times.`,
          details: { error: description, consecutiveFailures },
        })
      }
    })
    .finally(() => {
      isProcessing = false
    })
}

export function startPlatformContentScheduler() {
  if (intervalHandle) return

  runPlatformContentSchedulerCycle()
  intervalHandle = setInterval(runPlatformContentSchedulerCycle, 60_000)

  logger.info("Platform content scheduler started")
}

export function stopPlatformContentScheduler() {
  if (!intervalHandle) return
  clearInterval(intervalHandle)
  intervalHandle = null
  isProcessing = false
  logger.info("Platform content scheduler stopped")
}
