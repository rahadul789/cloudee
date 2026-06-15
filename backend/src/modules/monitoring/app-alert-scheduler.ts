import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { getAdminOperationalHealthSnapshot } from "../admin/business-event.service";
import { sendOperationalAlert } from "./alert-notifier";

let schedulerTimer: NodeJS.Timeout | null = null;
let isRunning = false;

async function runAppAlertCheck() {
  if (!env.ALERTS_ENABLED || isRunning) return;
  isRunning = true;

  try {
    const snapshot = await getAdminOperationalHealthSnapshot();
    const criticalAlerts = snapshot.activeAlerts.filter(
      (alert: { severity: string }) => alert.severity === "critical",
    );

    for (const alert of criticalAlerts) {
      await sendOperationalAlert({
        dedupeKey: `admin-critical:${alert.id}`,
        severity: "critical",
        layer: "operations",
        title: alert.title || "Critical operational alert",
        body:
          alert.description ||
          "A critical operational alert is active in Foodbela admin.",
        details: {
          source: alert.source,
          alertType: alert.alertType,
          entityType: alert.entityType,
          entityId: alert.entityId,
          path: alert.path,
          lastSeenAt: alert.lastSeenAt,
        },
      });
    }
  } catch (error) {
    logger.error(error, "App alert check failed");
  } finally {
    isRunning = false;
  }
}

export function startAppAlertScheduler() {
  if (schedulerTimer || !env.ALERTS_ENABLED) return;
  logger.info("App alert scheduler started");
  void runAppAlertCheck();
  schedulerTimer = setInterval(
    () => void runAppAlertCheck(),
    env.ALERT_CHECK_INTERVAL_SECONDS * 1000,
  );
  schedulerTimer.unref();
}

export function stopAppAlertScheduler() {
  if (!schedulerTimer) return;
  clearInterval(schedulerTimer);
  schedulerTimer = null;
  logger.info("App alert scheduler stopped");
}
