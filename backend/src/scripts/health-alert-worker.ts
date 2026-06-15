import tls from "node:tls";

import { connectDatabase } from "../config/db";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { getSmsProviderBalance } from "../modules/auth/otp-sms.service";
import { getAlertDeliverySettings } from "../modules/monitoring/alert-settings.service";
import { sendOperationalAlert } from "../modules/monitoring/alert-notifier";
import {
  type InfrastructureComponentStatus,
  saveInfrastructureHealthSnapshot,
} from "../modules/monitoring/infrastructure-health.service";

type ActiveState = {
  active: boolean;
  lastValue?: number | string;
};

const states = new Map<string, ActiveState>();
const previous5xxTotalByKey = new Map<string, number>();
let previousCpuTotalSeconds: number | null = null;
let previousCpuCheckedAt: number | null = null;
const components = new Map<string, InfrastructureComponentStatus>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backendHealthUrl() {
  return (
    env.ALERT_BACKEND_HEALTH_URL ||
    `${env.BACKEND_PUBLIC_URL.replace(/\/$/, "")}${env.API_PREFIX}/health/ready`
  );
}

async function fetchText(url: string, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function emitStateAlert(
  key: string,
  active: boolean,
  alert: {
    severity: "critical" | "warning";
    title: string;
    body: string;
    details?: Record<string, unknown>;
  },
) {
  const previous = states.get(key) ?? { active: false };
  states.set(key, { active });

  if (active) {
    await sendOperationalAlert({
      dedupeKey: key,
      severity: alert.severity,
      layer: "system",
      title: alert.title,
      body: alert.body,
      details: alert.details,
    });
    return;
  }

  if (previous.active) {
    await sendOperationalAlert({
      dedupeKey: `${key}:recovery:${Date.now()}`,
      severity: "recovery",
      layer: "system",
      title: `Recovered: ${alert.title}`,
      body: "The condition is healthy again.",
      details: alert.details,
    });
  }
}

async function checkSmsProvider() {
  const balance = await getSmsProviderBalance();

  if (!balance.configured) {
    setComponent("sms", {
      label: "SMS provider",
      status: "warning",
      message: balance.message,
      details: {
        provider: balance.provider,
        senderIdConfigured: balance.senderIdConfigured,
      },
    });
    return;
  }

  if (balance.status !== "ok") {
    setComponent("sms", {
      label: "SMS provider",
      status: "warning",
      message: balance.message,
      details: {
        provider: balance.provider,
        senderIdConfigured: balance.senderIdConfigured,
      },
    });
    await emitStateAlert("sms-provider-health", true, {
      severity: "warning",
      title: "SMS provider check failed",
      body: "Foodbela could not read the SMS provider balance.",
      details: {
        provider: balance.provider,
        message: balance.message,
        checkedAt: balance.checkedAt,
      },
    });
    return;
  }

  await emitStateAlert("sms-provider-health", false, {
    severity: "warning",
    title: "SMS provider check failed",
    body: "SMS provider balance check recovered.",
  });

  const lowBalance =
    typeof balance.balance === "number" && balance.balance <= env.ALERT_SMS_LOW_BALANCE;
  setComponent("sms", {
    label: "SMS provider",
    status: lowBalance ? "warning" : "healthy",
    message:
      typeof balance.balance === "number"
        ? `SMS balance is ${balance.balance}.`
        : "SMS provider is reachable, but balance was not numeric.",
    value: balance.balance ?? balance.rawBalance,
    threshold: env.ALERT_SMS_LOW_BALANCE,
    details: {
      provider: balance.provider,
      senderIdConfigured: balance.senderIdConfigured,
      rawBalance: balance.rawBalance,
    },
  });
  await emitStateAlert("sms-low-balance", lowBalance, {
    severity: "warning",
    title: "SMS balance is low",
    body: `SMS balance is ${balance.balance}.`,
    details: {
      provider: balance.provider,
      balance: balance.balance,
      threshold: env.ALERT_SMS_LOW_BALANCE,
      checkedAt: balance.checkedAt,
    },
  });
}

function setComponent(
  key: string,
  value: Omit<InfrastructureComponentStatus, "key" | "checkedAt">,
) {
  components.set(key, {
    key,
    checkedAt: new Date().toISOString(),
    ...value,
  });
}

function parsePrometheusMetric(text: string, metricName: string) {
  const lines = text.split(/\r?\n/);
  let total = 0;
  for (const line of lines) {
    if (!line.startsWith(metricName)) continue;
    const parts = line.trim().split(/\s+/);
    const value = Number(parts[parts.length - 1]);
    if (Number.isFinite(value)) total += value;
  }
  return total;
}

function parse5xxTotals(text: string) {
  const totals = new Map<string, number>();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith("foodbela_http_requests_total{")) continue;
    if (!/status_code="5\d\d"/.test(line)) continue;
    const route = line.match(/route="([^"]+)"/)?.[1] ?? "unknown";
    const method = line.match(/method="([^"]+)"/)?.[1] ?? "unknown";
    const app = line.match(/app="([^"]+)"/)?.[1] ?? "unknown";
    const value = Number(line.trim().split(/\s+/).pop());
    if (!Number.isFinite(value)) continue;
    const key = `${app}:${method}:${route}`;
    totals.set(key, (totals.get(key) ?? 0) + value);
  }
  return totals;
}

async function checkBackendReady() {
  const url = backendHealthUrl();
  try {
    const response = await fetchText(url);
    setComponent("backend", {
      label: "Backend readiness",
      status: response.ok ? "healthy" : "critical",
      message: response.ok
        ? "Backend readiness endpoint is healthy."
        : `Backend readiness returned HTTP ${response.status}.`,
      value: response.status,
      details: { url },
    });
    await emitStateAlert("backend-ready", !response.ok, {
      severity: "critical",
      title: "Backend readiness check failed",
      body: `Backend readiness endpoint returned HTTP ${response.status}.`,
      details: { url, status: response.status, response: response.text.slice(0, 500) },
    });
  } catch (error) {
    setComponent("backend", {
      label: "Backend readiness",
      status: "critical",
      message: "Backend readiness endpoint is unreachable.",
      details: { url, error: error instanceof Error ? error.message : String(error) },
    });
    await emitStateAlert("backend-ready", true, {
      severity: "critical",
      title: "Backend is unreachable",
      body: "The health-alert worker could not reach the backend readiness endpoint.",
      details: { url, error: error instanceof Error ? error.message : String(error) },
    });
  }
}

async function checkMetrics() {
  const settings = await getAlertDeliverySettings();
  let metrics = "";
  try {
    const response = await fetchText(env.ALERT_METRICS_URL);
    if (!response.ok) throw new Error(`Metrics returned HTTP ${response.status}`);
    metrics = response.text;
  } catch (error) {
    setComponent("metrics", {
      label: "Backend metrics",
      status: "warning",
      message: "Backend metrics endpoint is unreachable.",
      details: {
        url: env.ALERT_METRICS_URL,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    await emitStateAlert("metrics-reachable", true, {
      severity: "warning",
      title: "Backend metrics are unreachable",
      body: "The health-alert worker could not read backend metrics.",
      details: {
        url: env.ALERT_METRICS_URL,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return;
  }

  await emitStateAlert("metrics-reachable", false, {
    severity: "warning",
    title: "Backend metrics are unreachable",
    body: "Backend metrics are available again.",
  });
  setComponent("metrics", {
    label: "Backend metrics",
    status: "healthy",
    message: "Backend metrics endpoint is reachable.",
    details: { url: env.ALERT_METRICS_URL },
  });

  const mongodbConnected = parsePrometheusMetric(metrics, "foodbela_mongodb_connected");
  setComponent("database", {
    label: "Database",
    status: mongodbConnected >= 1 ? "healthy" : "critical",
    message:
      mongodbConnected >= 1
        ? "MongoDB connection metric is healthy."
        : "MongoDB connection metric is disconnected.",
    value: mongodbConnected,
    threshold: 1,
  });
  await emitStateAlert("mongodb-connected", mongodbConnected < 1, {
    severity: "critical",
    title: "Database is disconnected",
    body: "MongoDB connection metric is not healthy.",
    details: { value: mongodbConnected },
  });

  const rssBytes =
    parsePrometheusMetric(metrics, "foodbela_process_resident_memory_bytes") ||
    parsePrometheusMetric(metrics, "process_resident_memory_bytes");
  const rssMb = Math.round(rssBytes / 1024 / 1024);
  setComponent("memory", {
    label: "Backend memory",
    status: rssMb >= settings.memoryRssMb ? "warning" : "healthy",
    message: `Backend RSS memory is ${rssMb} MB.`,
    value: rssMb,
    threshold: settings.memoryRssMb,
  });
  await emitStateAlert("backend-memory-rss", rssMb >= settings.memoryRssMb, {
    severity: "warning",
    title: "Backend memory usage is high",
    body: `Backend RSS memory is ${rssMb} MB.`,
    details: { rssMb, thresholdMb: settings.memoryRssMb },
  });

  const cpuTotal =
    parsePrometheusMetric(metrics, "foodbela_process_cpu_seconds_total") ||
    parsePrometheusMetric(metrics, "process_cpu_seconds_total");
  const now = Date.now();
  let cpuPercent = 0;
  if (
    previousCpuTotalSeconds !== null &&
    previousCpuCheckedAt !== null &&
    cpuTotal >= previousCpuTotalSeconds
  ) {
    const elapsedSeconds = Math.max(1, (now - previousCpuCheckedAt) / 1000);
    cpuPercent =
      Math.round(((cpuTotal - previousCpuTotalSeconds) / elapsedSeconds) * 1000) / 10;
  }
  previousCpuTotalSeconds = cpuTotal;
  previousCpuCheckedAt = now;
  setComponent("cpu", {
    label: "Backend CPU",
    status: cpuPercent >= settings.cpuPercent ? "warning" : "healthy",
    message: `Backend process CPU is ${cpuPercent}%.`,
    value: cpuPercent,
    threshold: settings.cpuPercent,
  });
  await emitStateAlert("backend-cpu", cpuPercent >= settings.cpuPercent, {
    severity: "warning",
    title: "Backend CPU usage is high",
    body: `Backend process CPU is ${cpuPercent}%.`,
    details: { cpuPercent, thresholdPercent: settings.cpuPercent },
  });

  const current5xxTotals = parse5xxTotals(metrics);
  let interval5xxTotal = 0;
  const changedRoutes: string[] = [];
  for (const [key, value] of current5xxTotals) {
    const previous = previous5xxTotalByKey.get(key) ?? value;
    const delta = Math.max(0, value - previous);
    if (delta > 0) {
      interval5xxTotal += delta;
      changedRoutes.push(`${key} +${delta}`);
    }
    previous5xxTotalByKey.set(key, value);
  }

  await emitStateAlert("backend-5xx-rate", interval5xxTotal >= settings.fivexxThreshold, {
    severity: "critical",
    title: "Backend 5xx errors are high",
    body: `${interval5xxTotal} backend 5xx responses were observed in the latest check interval.`,
    details: {
      threshold: settings.fivexxThreshold,
      routes: changedRoutes.slice(0, 10).join(", "),
    },
  });
  setComponent("5xx", {
    label: "Backend 5xx",
    status: interval5xxTotal >= settings.fivexxThreshold ? "critical" : "healthy",
    message: `${interval5xxTotal} backend 5xx responses in the latest check interval.`,
    value: interval5xxTotal,
    threshold: settings.fivexxThreshold,
    details: { routes: changedRoutes.slice(0, 10) },
  });
}

function getCertificate(host: string) {
  return new Promise<tls.PeerCertificate>((resolve, reject) => {
    const socket = tls.connect(
      {
        host,
        port: 443,
        servername: host,
        rejectUnauthorized: false,
      },
      () => {
        const certificate = socket.getPeerCertificate();
        socket.end();
        resolve(certificate);
      },
    );
    socket.setTimeout(10_000, () => {
      socket.destroy();
      reject(new Error("TLS certificate check timed out"));
    });
    socket.once("error", reject);
  });
}

async function checkSslCertificates() {
  const settings = await getAlertDeliverySettings();
  const hosts = env.ALERT_SSL_HOSTS.split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  for (const host of hosts) {
    try {
      const certificate = await getCertificate(host);
      const expiresAt = new Date(certificate.valid_to).getTime();
      const daysLeft = Math.ceil((expiresAt - Date.now()) / 86_400_000);
      setComponent(`ssl:${host}`, {
        label: `SSL ${host}`,
        status:
          daysLeft <= 3
            ? "critical"
            : daysLeft <= settings.sslExpiryDays
              ? "warning"
              : "healthy",
        message: `${host} SSL certificate has ${daysLeft} day(s) left.`,
        value: daysLeft,
        threshold: settings.sslExpiryDays,
        details: { host, validTo: certificate.valid_to },
      });
      await emitStateAlert(`ssl-expiry:${host}`, daysLeft <= settings.sslExpiryDays, {
        severity: daysLeft <= 3 ? "critical" : "warning",
        title: `SSL certificate is expiring soon for ${host}`,
        body: `${host} SSL certificate has ${daysLeft} day(s) left.`,
        details: {
          host,
          validTo: certificate.valid_to,
          thresholdDays: settings.sslExpiryDays,
        },
      });
    } catch (error) {
      setComponent(`ssl:${host}`, {
        label: `SSL ${host}`,
        status: "critical",
        message: "Could not inspect the TLS certificate.",
        details: { host, error: error instanceof Error ? error.message : String(error) },
      });
      await emitStateAlert(`ssl-check:${host}`, true, {
        severity: "critical",
        title: `SSL certificate check failed for ${host}`,
        body: "Could not inspect the TLS certificate.",
        details: { host, error: error instanceof Error ? error.message : String(error) },
      });
    }
  }
}

async function runChecks() {
  await checkBackendReady();
  await checkMetrics();
  await checkSmsProvider();
  await checkSslCertificates();
  await saveInfrastructureHealthSnapshot(Array.from(components.values()));
}

async function main() {
  connectDatabase().catch((error) => {
    logger.warn(error, "Health alert worker could not connect to MongoDB; using env alert settings fallback");
  });
  logger.info("Health alert worker started");
  while (true) {
    try {
      if (env.ALERTS_ENABLED) {
        await runChecks();
      }
    } catch (error) {
      logger.error(error, "Health alert worker check failed");
    }
    await sleep(env.ALERT_CHECK_INTERVAL_SECONDS * 1000);
  }
}

void main();
