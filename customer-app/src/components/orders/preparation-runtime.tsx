import { memo, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  formatDurationMinutes,
  formatDurationRangeMinutes,
  formatTimeAmPm,
} from "@/src/lib/date-time";

type PreparationOrder = {
  status: string;
  createdAt?: string;
  preparationTiming?: {
    phase?: string;
    baseMinutes?: number;
    extraMinutes?: number;
    totalMinutes?: number;
    targetStartAt?: string | null;
    targetReadyAt?: string | null;
    remainingSeconds?: number | null;
    lateBySeconds?: number | null;
  } | null;
  timestamps?: {
    acceptedAt?: string | null;
    preparingAt?: string | null;
    placedAt?: string | null;
  } | null;
};

export type PreparationEstimate = {
  state: "countdown" | "almost_ready" | "delayed" | "ready";
  rangeLabel: string;
  supportingText: string;
  targetTimeLabel: string;
  lateByMinutes: number;
  averagePrepMinutes: number;
  remainingSeconds?: number | null;
};

const PREPARATION_LIVE_STATUSES = new Set(["Accepted", "Preparing"]);
const PREPARATION_TICK_MS = 15000;
const PREPARATION_PRECISE_TICK_MS = 1000;
const PREP_START_PRECISE_WINDOW_SECONDS = 3 * 60;

// Turns an exact "minutes remaining" countdown into a forward-padded range so the
// preparing state reads like a professional estimate ("10–15 min left") instead of a
// single ticking number ("5 min left"). The lower bound stays honest; the upper bound
// adds a buffer that scales with how much time is left.
function buildPreparationRangeMinutes(remainingMinutes: number) {
  const low = Math.max(1, remainingMinutes);
  const pad =
    low <= 5
      ? 2
      : low <= 20
        ? 5
        : Math.min(10, Math.max(5, Math.round(low * 0.25)));
  return { low, high: low + pad };
}

function getPreparationAnchor(order: PreparationOrder) {
  return (
    order.timestamps?.acceptedAt ??
    order.timestamps?.preparingAt ??
    order.timestamps?.placedAt ??
    order.createdAt ??
    null
  );
}

function getPreparationEstimate(
  order: PreparationOrder,
  preparationTimeMinutes: number | null | undefined,
  now: number,
): PreparationEstimate | null {
  if (!PREPARATION_LIVE_STATUSES.has(order.status)) {
    return null;
  }

  const timing = order.preparationTiming;
  const timingTarget =
    order.status === "Accepted" ? timing?.targetStartAt : timing?.targetReadyAt;
  const timingTargetAt = timingTarget ? new Date(timingTarget).getTime() : NaN;
  const timingTotalMinutes =
    typeof timing?.totalMinutes === "number" &&
    Number.isFinite(timing.totalMinutes)
      ? timing.totalMinutes
      : null;

  if (timing && !Number.isNaN(timingTargetAt)) {
    const remainingSeconds = Math.max(
      0,
      Math.ceil((timingTargetAt - now) / 1000),
    );
    const remainingMinutes = Math.ceil(remainingSeconds / 60);

    if (order.status === "Accepted") {
      return {
        state: "countdown",
        rangeLabel: remainingMinutes > 1 ? `` : "Kitchen starts soon",
        supportingText: "The restaurant accepted your order.",
        targetTimeLabel: formatTimeAmPm(new Date(timingTargetAt)),
        lateByMinutes: 0,
        averagePrepMinutes: timingTotalMinutes ?? preparationTimeMinutes ?? 0,
        remainingSeconds,
      };
    }

    if (remainingSeconds > 60) {
      const prepRange = buildPreparationRangeMinutes(remainingMinutes);
      return {
        state: "countdown",
        rangeLabel: `${formatDurationRangeMinutes(
          prepRange.low,
          prepRange.high,
        )} left`,
        supportingText:
          timing?.extraMinutes && timing.extraMinutes > 0
            ? `Restaurant added ${formatDurationMinutes(
                timing.extraMinutes,
              )} to prepare it properly.`
            : "",
        targetTimeLabel: formatTimeAmPm(new Date(timingTargetAt)),
        lateByMinutes: 0,
        averagePrepMinutes: timingTotalMinutes ?? preparationTimeMinutes ?? 0,
        remainingSeconds,
      };
    }

    if (remainingSeconds > 0) {
      return {
        state: "almost_ready",
        rangeLabel: "Almost ready",
        supportingText: "The kitchen is finishing your order now.",
        targetTimeLabel: formatTimeAmPm(new Date(timingTargetAt)),
        lateByMinutes: 0,
        averagePrepMinutes: timingTotalMinutes ?? preparationTimeMinutes ?? 0,
        remainingSeconds,
      };
    }

    const lateByMinutes = Math.max(
      1,
      Math.ceil(Math.max(0, now - timingTargetAt) / 60_000),
    );

    return {
      state: "delayed",
      rangeLabel: `Running ${formatDurationMinutes(lateByMinutes)} late`,
      supportingText:
        "The kitchen is taking a little longer than expected, but your order is still being prepared.",
      targetTimeLabel: formatTimeAmPm(new Date(timingTargetAt)),
      lateByMinutes,
      averagePrepMinutes: timingTotalMinutes ?? preparationTimeMinutes ?? 0,
      remainingSeconds: 0,
    };
  }

  if (
    typeof preparationTimeMinutes !== "number" ||
    !Number.isFinite(preparationTimeMinutes) ||
    preparationTimeMinutes <= 0
  ) {
    return null;
  }

  const anchorValue = getPreparationAnchor(order);
  if (!anchorValue) {
    return null;
  }

  const anchor = new Date(anchorValue).getTime();
  if (Number.isNaN(anchor)) {
    return null;
  }

  const targetReadyAt =
    anchor + Math.max(1, Math.round(preparationTimeMinutes)) * 60_000;
  const remainingMinutes = Math.ceil((targetReadyAt - now) / 60_000);
  const prepRange = buildPreparationRangeMinutes(remainingMinutes);
  const latestReadyAt =
    targetReadyAt + (prepRange.high - prepRange.low) * 60_000;

  if (remainingMinutes > 1) {
    return {
      state: "countdown",
      rangeLabel: `${formatDurationRangeMinutes(
        prepRange.low,
        prepRange.high,
      )} left`,
      supportingText: "",
      targetTimeLabel: formatTimeAmPm(new Date(latestReadyAt)),
      lateByMinutes: 0,
      averagePrepMinutes: preparationTimeMinutes,
      remainingSeconds: Math.max(0, Math.ceil((latestReadyAt - now) / 1000)),
    };
  }

  if (latestReadyAt >= now) {
    return {
      state: "almost_ready",
      rangeLabel: "Almost ready",
      supportingText:
        "The kitchen is finishing your order now. Pickup should start shortly.",
      targetTimeLabel: formatTimeAmPm(new Date(latestReadyAt)),
      lateByMinutes: 0,
      averagePrepMinutes: preparationTimeMinutes,
      remainingSeconds: Math.max(0, Math.ceil((latestReadyAt - now) / 1000)),
    };
  }

  const lateByMinutes = Math.max(1, Math.ceil((now - latestReadyAt) / 60_000));

  return {
    state: "delayed",
    rangeLabel: `Running ${formatDurationMinutes(lateByMinutes)} late`,
    supportingText:
      lateByMinutes >= 10
        ? "This order is taking longer than the restaurant's usual prep window. Support can help if you need an update."
        : "The kitchen is taking a little longer than usual, but your order is still being finished.",
    targetTimeLabel: formatTimeAmPm(new Date(latestReadyAt)),
    lateByMinutes,
    averagePrepMinutes: preparationTimeMinutes,
    remainingSeconds: 0,
  };
}

function getPreparationTickMs(
  order: PreparationOrder,
  now: number,
  preciseUpdates: boolean,
) {
  if (!preciseUpdates) {
    return PREPARATION_TICK_MS;
  }

  if (order.status !== "Accepted") {
    return PREPARATION_TICK_MS;
  }

  const targetStartAt = order.preparationTiming?.targetStartAt;
  if (!targetStartAt) {
    return PREPARATION_TICK_MS;
  }

  const targetTime = new Date(targetStartAt).getTime();
  if (Number.isNaN(targetTime)) {
    return PREPARATION_TICK_MS;
  }

  const remainingSeconds = Math.ceil((targetTime - now) / 1000);
  return remainingSeconds > 0 &&
    remainingSeconds <= PREP_START_PRECISE_WINDOW_SECONDS
    ? PREPARATION_PRECISE_TICK_MS
    : PREPARATION_TICK_MS;
}

export const PreparationRuntime = memo(function PreparationRuntime({
  order,
  preparationTimeMinutes,
  preciseUpdates = true,
  children,
}: {
  order: PreparationOrder;
  preparationTimeMinutes?: number | null;
  preciseUpdates?: boolean;
  children: (estimate: PreparationEstimate | null) => ReactNode;
}) {
  const shouldTrack = PREPARATION_LIVE_STATUSES.has(order.status);
  const [now, setNow] = useState(() => Date.now());
  const tickMs = useMemo(
    () => getPreparationTickMs(order, now, preciseUpdates),
    [now, order, preciseUpdates],
  );

  useEffect(() => {
    if (!shouldTrack) {
      return;
    }

    const timer = setInterval(() => {
      setNow(Date.now());
    }, tickMs);

    return () => {
      clearInterval(timer);
    };
  }, [shouldTrack, tickMs]);

  const estimate = useMemo(
    () => getPreparationEstimate(order, preparationTimeMinutes, now),
    [now, order, preparationTimeMinutes],
  );

  return <>{children(estimate)}</>;
});
