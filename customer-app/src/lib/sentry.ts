import * as Sentry from "@sentry/react-native";

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
  });
}

export { Sentry };
