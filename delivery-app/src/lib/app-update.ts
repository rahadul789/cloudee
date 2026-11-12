// "Update required" rules (pure, unit-tested). Admin sets, in Settings → App update:
//   latestVersion  → older installs get a SOFT prompt ("Later" allowed)
//   minimumVersion → older installs get a FORCE prompt (app blocked until updated)
// Versions are plain "1.2.3" (missing parts = 0). Empty / invalid = not set.

export type AppUpdateConfig = {
  enabled?: boolean;
  latestVersion?: string;
  minimumVersion?: string;
  message?: string;
  storeUrl?: string;
};

export type AppUpdateDecision = "force" | "soft" | "none";

/** How long "Later" hides the soft prompt for the same latest version. */
export const SOFT_PROMPT_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

export function parseVersion(value?: string | null): number[] | null {
  const text = (value ?? "").trim();
  if (!/^\d+(\.\d+){0,3}$/.test(text)) return null;
  return text.split(".").map((part) => Number(part));
}

/** -1 if a < b, 0 if equal, 1 if a > b. null if either is not a version. */
export function compareVersions(a?: string | null, b?: string | null): -1 | 0 | 1 | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const x = left[i] ?? 0;
    const y = right[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export function decideAppUpdate(currentVersion: string | null | undefined, config?: AppUpdateConfig | null): AppUpdateDecision {
  if (!config || config.enabled === false) return "none";
  // Unknown installed version (web / dev quirks) → never block anyone.
  if (!parseVersion(currentVersion)) return "none";
  if (compareVersions(currentVersion, config.minimumVersion) === -1) return "force";
  if (compareVersions(currentVersion, config.latestVersion) === -1) return "soft";
  return "none";
}

/** Should a soft prompt show, given the last "Later" (version + time)? */
export function shouldShowSoftPrompt(
  latestVersion: string | undefined,
  snoozed: { version?: string; at?: number } | null,
  now = Date.now(),
) {
  if (!snoozed || snoozed.version !== (latestVersion ?? "").trim()) return true;
  return typeof snoozed.at !== "number" || now - snoozed.at >= SOFT_PROMPT_SNOOZE_MS;
}
