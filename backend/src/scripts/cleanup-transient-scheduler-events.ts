import { connectDatabase } from "../config/db";
import { logger } from "../config/logger";
import { AdminBusinessEventModel } from "../modules/admin/business-event.model";

const TRANSIENT_ERROR_PATTERNS = [
  /ENOTFOUND/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ECONNREFUSED/i,
  /Server selection timed out/i,
  /server selection timed out/i,
  /MongoNetworkError/i,
  /MongoServerSelectionError/i,
  /Topology is closed/i,
];

const SCHEDULER_FAILURE_EVENTS = [
  "scheduler.admin_notifications.failed",
  "scheduler.platform_content.failed",
];

const SCHEDULER_FAILURE_TITLES = [
  "Admin scheduler failed",
  "Platform content scheduler failed",
  "Admin scheduler database retry",
  "Platform content scheduler database retry",
];

function hasApplyFlag() {
  return (
    process.argv.includes("--apply") ||
    process.env.CLEANUP_SCHEDULER_EVENTS_APPLY === "true"
  );
}

function hasAllFlag() {
  return process.argv.includes("--all");
}

function buildQuery() {
  const descriptionRegex = {
    $in: TRANSIENT_ERROR_PATTERNS,
  };

  return {
    category: "scheduler",
    $or: [
      { event: { $in: SCHEDULER_FAILURE_EVENTS } },
      { title: { $in: SCHEDULER_FAILURE_TITLES } },
    ],
    ...(hasAllFlag()
      ? {}
      : {
          description: descriptionRegex,
        }),
  };
}

async function main() {
  await connectDatabase();
  const query = buildQuery();
  const apply = hasApplyFlag();

  const [count, sample] = await Promise.all([
    AdminBusinessEventModel.countDocuments(query),
    AdminBusinessEventModel.find(query)
      .sort({ createdAt: -1 })
      .limit(10)
      .select({ event: 1, title: 1, description: 1, createdAt: 1 })
      .lean(),
  ]);

  logger.info(
    {
      mode: apply ? "apply" : "dry-run",
      matchedEvents: count,
      sample,
    },
    "Transient scheduler event cleanup scan complete",
  );

  if (!apply) {
    console.log(`Dry run: ${count} transient scheduler event(s) matched.`);
    console.log("Run with --apply to delete matched events.");
    return;
  }

  const result = await AdminBusinessEventModel.deleteMany(query);
  console.log(`Deleted ${result.deletedCount ?? 0} transient scheduler event(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(error, "Transient scheduler event cleanup failed");
    process.exit(1);
  });
