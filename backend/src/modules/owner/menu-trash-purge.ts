import { logger } from "../../config/logger";
import { CategoryModel, MenuItemModel } from "./operational.model";

// How long a soft-deleted category/item stays recoverable before it is hard-deleted for good.
const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day

let intervalHandle: NodeJS.Timeout | null = null;
let isProcessing = false;

export async function purgeExpiredMenuTrash() {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_MS);
  const [items, categories] = await Promise.all([
    MenuItemModel.deleteMany({ isDeleted: true, deletedAt: { $lte: cutoff } }),
    CategoryModel.deleteMany({ isDeleted: true, deletedAt: { $lte: cutoff } }),
  ]);
  const purgedItems = items.deletedCount ?? 0;
  const purgedCategories = categories.deletedCount ?? 0;
  if (purgedItems || purgedCategories) {
    logger.info(
      { purgedItems, purgedCategories },
      "Purged expired menu trash (older than 30 days)",
    );
  }
  return { purgedItems, purgedCategories };
}

function runPurgeCycle() {
  if (isProcessing) return;
  isProcessing = true;
  purgeExpiredMenuTrash()
    .catch((error) => {
      logger.error(error, "Menu trash purge cycle failed");
    })
    .finally(() => {
      isProcessing = false;
    });
}

export function startMenuTrashPurgeScheduler() {
  if (intervalHandle) return;
  runPurgeCycle();
  intervalHandle = setInterval(runPurgeCycle, PURGE_INTERVAL_MS);
  logger.info("Menu trash purge scheduler started");
}

export function stopMenuTrashPurgeScheduler() {
  if (!intervalHandle) return;
  clearInterval(intervalHandle);
  intervalHandle = null;
  isProcessing = false;
  logger.info("Menu trash purge scheduler stopped");
}
