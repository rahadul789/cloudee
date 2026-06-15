type SchedulerErrorPolicy = {
  description: string;
  severity: "critical" | "warning";
  shouldRecord: boolean;
};

const transientRecordTimestamps = new Map<string, number>();
const TRANSIENT_RECORD_COOLDOWN_MS = 15 * 60 * 1000;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Scheduler failed");
}

function isTransientDatabaseError(message: string) {
  return [
    "ENOTFOUND",
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "Server selection timed out",
    "server selection timed out",
    "Topology is closed",
    "MongoNetworkError",
    "MongoServerSelectionError",
  ].some((pattern) => message.includes(pattern));
}

export function classifySchedulerError(
  schedulerKey: string,
  error: unknown,
): SchedulerErrorPolicy {
  const description = errorMessage(error);

  if (!isTransientDatabaseError(description)) {
    return {
      description,
      severity: "critical",
      shouldRecord: true,
    };
  }

  const now = Date.now();
  const previous = transientRecordTimestamps.get(schedulerKey) ?? 0;
  const shouldRecord = now - previous >= TRANSIENT_RECORD_COOLDOWN_MS;
  if (shouldRecord) {
    transientRecordTimestamps.set(schedulerKey, now);
  }

  return {
    description,
    severity: "warning",
    shouldRecord,
  };
}
