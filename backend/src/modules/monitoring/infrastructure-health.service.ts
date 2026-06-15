import { logger } from "../../config/logger";
import { InfrastructureHealthModel } from "./infrastructure-health.model";

export type InfrastructureComponentStatus = {
  key: string;
  label: string;
  status: "healthy" | "warning" | "critical" | "unknown";
  message: string;
  checkedAt: string;
  value?: number | string | null;
  threshold?: number | string | null;
  details?: Record<string, unknown>;
};

export type InfrastructureHealthSnapshot = {
  status: "healthy" | "warning" | "critical" | "unknown";
  checkedAt: string | null;
  components: InfrastructureComponentStatus[];
};

const EMPTY_SNAPSHOT: InfrastructureHealthSnapshot = {
  status: "unknown",
  checkedAt: null,
  components: [],
};

function overallStatus(components: InfrastructureComponentStatus[]) {
  if (components.some((component) => component.status === "critical")) {
    return "critical" as const;
  }
  if (components.some((component) => component.status === "warning")) {
    return "warning" as const;
  }
  if (components.length) return "healthy" as const;
  return "unknown" as const;
}

export async function saveInfrastructureHealthSnapshot(
  components: InfrastructureComponentStatus[],
) {
  const checkedAt = new Date();
  const snapshot = {
    key: "global",
    status: overallStatus(components),
    checkedAt,
    components,
  };

  await InfrastructureHealthModel.findOneAndUpdate(
    { key: "global" },
    { $set: snapshot },
    { upsert: true, new: true },
  );

  return {
    status: snapshot.status,
    checkedAt: checkedAt.toISOString(),
    components,
  };
}

export async function getInfrastructureHealthSnapshot() {
  try {
    const row = await InfrastructureHealthModel.findOne({ key: "global" }).lean();
    if (!row) return EMPTY_SNAPSHOT;
    return {
      status: String(row.status ?? "unknown") as InfrastructureHealthSnapshot["status"],
      checkedAt: row.checkedAt ? new Date(row.checkedAt).toISOString() : null,
      components: Array.isArray(row.components)
        ? (row.components as InfrastructureComponentStatus[])
        : [],
    };
  } catch (error) {
    logger.warn(error, "Could not read infrastructure health snapshot");
    return EMPTY_SNAPSHOT;
  }
}
