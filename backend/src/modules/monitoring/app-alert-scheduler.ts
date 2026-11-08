import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { getRequestTrafficSnapshot } from "../../common/middleware/request-monitor";
import { getAdminOperationalHealthSnapshot } from "../admin/business-event.service";
import { sendOperationalAlert } from "./alert-notifier";
import { getAlertDeliverySettings } from "./alert-settings.service";

// Fire a "high rate-limit rejections" alert when the number of 429s in the recent
// window reaches the admin-configured threshold. Cooldown/dedupe in the notifier
// keeps a sustained spike from re-alerting every cycle.
async function checkRateLimitPressure() {
  const settings = await getAlertDeliverySettings();
  const traffic = getRequestTrafficSnapshot({ range: "5m" });
  const rateLimited = traffic.summary.rateLimitedRequests;
  if (rateLimited < settings.rateLimitThreshold) return;

  const topEndpoints = traffic.endpoints
    .filter((endpoint) => endpoint.rateLimitedRequests > 0)
    .slice(0, 3)
    .map(
      (endpoint) =>
        `${endpoint.method} ${endpoint.route} (${endpoint.rateLimitedRequests})`,
    )
    .join(", ");

  await sendOperationalAlert({
    dedupeKey: "rate-limit-high",
    severity: "warning",
    layer: "operations",
    title: "High rate-limit rejections",
    body: `${rateLimited} requests were rate-limited (429) in the last 5 minutes, at or above the alert threshold of ${settings.rateLimitThreshold}.`,
    details: {
      rateLimitedRequests: rateLimited,
      threshold: settings.rateLimitThreshold,
      windowMinutes: 5,
      topEndpoints: topEndpoints || "n/a",
    },
  });
}

let schedulerTimer: NodeJS.Timeout | null = null;
let isRunning = false;

// Order-monitoring alerts are useful in the admin action centre while an order
// is live, but forwarding the still-open list on every scheduler restart can
// produce old delivery messages the next morning. They are sent when created;
// the scheduler must not replay them.
export function shouldForwardCriticalAlertToTelegram(alert: {
  severity: string;
  entityType?: string;
  source?: string;
  alertType?: string;
}) {
  if (alert.severity !== "critical") return false;
  const orderDeliveryAlert =
    alert.entityType === "order" &&
    (alert.source === "Delivery" ||
      alert.alertType?.startsWith("delivery_") ||
      alert.alertType?.startsWith("rider_"));
  return !orderDeliveryAlert;
}

async function runAppAlertCheck() {
  if (!env.ALERTS_ENABLED || isRunning) return;
  isRunning = true;

  try {
    const snapshot = await getAdminOperationalHealthSnapshot();
    const criticalAlerts = snapshot.activeAlerts.filter(
      (alert: { severity: string; entityType?: string; source?: string; alertType?: string }) =>
        shouldForwardCriticalAlertToTelegram(alert),
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

    await checkRateLimitPressure();
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
