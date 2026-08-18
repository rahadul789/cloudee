import { logger } from "../../config/logger";
import { processAdminOperationalAlerts } from "./orders-monitor.service";
import {
  markOperationalJobFinished,
  markOperationalJobStarted,
  recordBusinessEvent,
} from "./business-event.service";
import { pruneAdminOperationalAlerts } from "./admin-alert.service";
import { processDueAdminNotificationSchedules } from "./notifications.service";
import { processPendingBkashPaymentAttemptReconciliation } from "../customer/customer.service";
import { processDueReviewRequests } from "../customer/push.service";
import { sendOperationalAlert } from "../monitoring/alert-notifier";
import { classifySchedulerError } from "../monitoring/scheduler-error-policy";

let intervalHandle: NodeJS.Timeout | null = null;
let isProcessing = false;
let consecutiveFailures = 0;
const ADMIN_SCHEDULER_INTERVAL_MS = 10_000;
const BKASH_RECONCILIATION_INTERVAL_MS = 30_000;
const REVIEW_REQUEST_INTERVAL_MS = 60_000;
const ALERT_PRUNE_INTERVAL_MS = 5 * 60_000;
let lastBkashReconciliationRunAt = 0;
let lastReviewRequestRunAt = 0;
let lastAlertPruneRunAt = 0;

function runAtCadence(
  lastRunAt: number,
  intervalMs: number,
  updateLastRunAt: (value: number) => void,
  task: () => Promise<unknown>,
) {
  const now = Date.now();
  if (now - lastRunAt < intervalMs) return Promise.resolve();
  updateLastRunAt(now);
  return task().then(() => undefined);
}

function runDueBkashReconciliation() {
  return runAtCadence(
    lastBkashReconciliationRunAt,
    BKASH_RECONCILIATION_INTERVAL_MS,
    (value) => {
      lastBkashReconciliationRunAt = value;
    },
    processPendingBkashPaymentAttemptReconciliation,
  );
}

function runDueReviewRequests() {
  return runAtCadence(
    lastReviewRequestRunAt,
    REVIEW_REQUEST_INTERVAL_MS,
    (value) => {
      lastReviewRequestRunAt = value;
    },
    processDueReviewRequests,
  );
}

function runDueAlertPrune() {
  return runAtCadence(
    lastAlertPruneRunAt,
    ALERT_PRUNE_INTERVAL_MS,
    (value) => {
      lastAlertPruneRunAt = value;
    },
    pruneAdminOperationalAlerts,
  );
}

function runAdminSchedulerCycle() {
  if (isProcessing) return;
  isProcessing = true;
  const startedAt = Date.now();
  markOperationalJobStarted("admin_notifications", "Admin notifications and operations");
  void Promise.all([
    processDueAdminNotificationSchedules(),
    processAdminOperationalAlerts(),
    runDueAlertPrune(),
    runDueBkashReconciliation(),
    runDueReviewRequests(),
  ])
    .then(() => {
      consecutiveFailures = 0;
      markOperationalJobFinished("admin_notifications", "ok", startedAt);
    })
    .catch((error) => {
      consecutiveFailures += 1;
      markOperationalJobFinished("admin_notifications", "failed", startedAt, error);
      logger.error(error, "Scheduled admin notifications failed");
      const policy = classifySchedulerError("admin_notifications", error);
      if (policy.shouldRecord) {
        void recordBusinessEvent({
          event: "scheduler.admin_notifications.failed",
          category: "scheduler",
          severity: policy.severity,
          title:
            policy.severity === "critical"
              ? "Admin scheduler failed"
              : "Admin scheduler database retry",
          description: policy.description,
        });
      }
      if (consecutiveFailures >= 3) {
        const description =
          error instanceof Error ? error.message : String(error ?? "Unknown scheduler error");
        void recordBusinessEvent({
          event: "scheduler.admin_notifications.repeated_failure",
          category: "scheduler",
          severity: "critical",
          title: "Admin scheduler repeatedly failing",
          description,
          metadata: { consecutiveFailures },
        });
        void sendOperationalAlert({
          dedupeKey: "scheduler:admin_notifications:repeated_failure",
          severity: "critical",
          layer: "system",
          title: "Admin scheduler repeatedly failing",
          body: `Admin scheduler failed ${consecutiveFailures} consecutive times.`,
          details: { error: description, consecutiveFailures },
        });
      }
    })
    .finally(() => {
      isProcessing = false;
    });
}

export function startAdminNotificationScheduler() {
  if (intervalHandle) return;

  runAdminSchedulerCycle();
  intervalHandle = setInterval(runAdminSchedulerCycle, ADMIN_SCHEDULER_INTERVAL_MS);

  logger.info("Admin notification scheduler started");
}

export function stopAdminNotificationScheduler() {
  if (!intervalHandle) return;
  clearInterval(intervalHandle);
  intervalHandle = null;
  isProcessing = false;
  lastBkashReconciliationRunAt = 0;
  lastReviewRequestRunAt = 0;
  lastAlertPruneRunAt = 0;
  logger.info("Admin notification scheduler stopped");
}
