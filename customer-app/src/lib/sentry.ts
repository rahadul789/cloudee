import * as Sentry from "@sentry/react-native";
import * as Updates from "expo-updates";

import { APP_ENV } from "@/src/config/runtime";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();

/**
 * Sentry is only wired when a real DSN is configured (set as EXPO_PUBLIC_SENTRY_DSN in the
 * preview/production EAS profiles). With no DSN — local dev, or before the DSN is filled in —
 * everything below is a no-op: init is skipped, `Sentry.wrap` just passes children through,
 * and `Sentry.captureException` does nothing. So this is completely safe to ship un-configured.
 */
export const isSentryEnabled = Boolean(
  dsn && dsn.startsWith("https://") && dsn.includes("@"),
);

/**
 * Expected, user-facing conditions that the app already handles gracefully — a closed restaurant,
 * location turned off, being offline, an aborted request. They are NOT crashes/bugs, so they must
 * never reach the crash dashboard. Sentry auto-captures unhandled promise rejections, which is how
 * these leak in even though the UI shows the user a proper message. A single beforeSend gate here
 * covers every path (auto-capture, the error boundary, any explicit captureException).
 */
function isHandledExpectedError(
  error: unknown,
  fallbackType: string,
  fallbackValue: string,
): boolean {
  const name = (error instanceof Error && error.name) || fallbackType || "";
  const message = (
    (error instanceof Error && error.message) ||
    fallbackValue ||
    ""
  ).toLowerCase();

  // Handled API / domain errors (already surfaced to the user; server-side faults are covered by
  // the backend's own monitoring — pino + Prometheus).
  if (name === "ApiRequestError") return true;
  // Requests aborted by navigating away or timing out.
  if (name === "AbortError" || message.includes("aborted")) return true;
  // Location off / permission denied / services disabled — an expected user state.
  if (
    message.includes("location") &&
    (message.includes("unavailable") ||
      message.includes("permission") ||
      message.includes("services"))
  ) {
    return true;
  }
  // Offline / transient network failures.
  if (
    message.includes("network request failed") ||
    message.includes("no internet") ||
    message.includes("offline")
  ) {
    return true;
  }
  return false;
}

export function initSentry() {
  if (!isSentryEnabled) return;

  Sentry.init({
    dsn,
    environment: APP_ENV,
    // Crash reporting only: no performance tracing, no session replay — runtime overhead
    // stays negligible. Bump `tracesSampleRate` (e.g. 0.1) later if you want perf data.
    tracesSampleRate: 0,
    // Don't report from local `expo start` dev builds; preview/production (where __DEV__ is
    // false) report normally.
    enabled: !__DEV__,
    sendDefaultPii: false,
    // Drop expected/handled conditions so the dashboard stays real crashes only.
    beforeSend(event, hint) {
      const firstException = event.exception?.values?.[0];
      if (
        isHandledExpectedError(
          hint?.originalException,
          firstException?.type ?? "",
          firstException?.value ?? "",
        )
      ) {
        return null;
      }
      return event;
    },
  });

  // Tag which OTA update the crash came from. The native release/dist (and sourcemaps) are set by
  // the Sentry Expo plugin at build time; an OTA update keeps the same native release, so this tag
  // is what disambiguates which JS bundle was actually running. Not set as `release` on purpose —
  // overriding it would break symbolication against the plugin-uploaded sourcemaps.
  Sentry.setTag("expo_update_id", Updates.updateId ?? "embedded");
  if (Updates.channel) {
    Sentry.setTag("expo_channel", Updates.channel);
  }
}

/**
 * Attaches (or clears) the signed-in customer on crash reports so issues are attributable. Only the
 * id is sent — no phone/email — keeping it free of PII (sendDefaultPii stays false).
 */
export function setSentryUser(userId: string | null) {
  if (!isSentryEnabled) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

export { Sentry };
