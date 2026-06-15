import { logger } from "../../config/logger"

type BackgroundTask = {
  label: string
  task: () => Promise<void>
}

const DEFAULT_BACKGROUND_TASK_CONCURRENCY = 4
const DEFAULT_BACKGROUND_TASK_QUEUE_LIMIT = 2000
const backgroundTaskQueue: BackgroundTask[] = []
let activeBackgroundTasks = 0

function runNextBackgroundTask() {
  while (
    activeBackgroundTasks < DEFAULT_BACKGROUND_TASK_CONCURRENCY &&
    backgroundTaskQueue.length > 0
  ) {
    const nextTask = backgroundTaskQueue.shift()
    if (!nextTask) return

    activeBackgroundTasks += 1
    void nextTask
      .task()
      .catch((error) => {
        logger.warn(
          {
            error,
            task: nextTask.label,
          },
          "Background task failed",
        )
      })
      .finally(() => {
        activeBackgroundTasks -= 1
        runNextBackgroundTask()
      })
  }
}

export function enqueueBackgroundTask(label: string, task: () => Promise<void>) {
  if (backgroundTaskQueue.length >= DEFAULT_BACKGROUND_TASK_QUEUE_LIMIT) {
    logger.warn(
      {
        task: label,
        queued: backgroundTaskQueue.length,
        queueLimit: DEFAULT_BACKGROUND_TASK_QUEUE_LIMIT,
      },
      "Background task queue is full; task skipped",
    )
    return false
  }

  backgroundTaskQueue.push({ label, task })
  runNextBackgroundTask()
  return true
}

export function getBackgroundTaskQueueSnapshot() {
  return {
    active: activeBackgroundTasks,
    queued: backgroundTaskQueue.length,
    queueLimit: DEFAULT_BACKGROUND_TASK_QUEUE_LIMIT,
    concurrency: DEFAULT_BACKGROUND_TASK_CONCURRENCY,
  }
}
