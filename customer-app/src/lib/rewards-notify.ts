import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

import type { SpinItem } from "@/src/hooks/use-rewards-api";

// Optional (admin switch, OFF by default): a LOCAL notification on this phone when a locked
// spin unlocks. No server push. Never asks for permission here — only uses it if already granted.

const KEY = "foodbela.rewards.spin-notify.v1";

async function load(): Promise<Record<string, string>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? "{}");
  } catch {
    return {};
  }
}

export async function syncSpinReadyNotifications(spins: SpinItem[], enabled: boolean) {
  const map = await load();
  const keep: Record<string, string> = {};
  const lockedIds = new Set(
    spins
      .filter((spin) => spin.status === "unscratched" && spin.unlocksAt && new Date(spin.unlocksAt).getTime() > Date.now())
      .map((spin) => spin.id),
  );
  // Cancel anything no longer needed (spun, opened early, expired, or the feature turned off).
  for (const [spinId, notificationId] of Object.entries(map)) {
    if (!enabled || !lockedIds.has(spinId)) {
      await Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => undefined);
    } else {
      keep[spinId] = notificationId;
    }
  }
  if (enabled) {
    const permission = await Notifications.getPermissionsAsync().catch(() => null);
    if (permission?.status === "granted") {
      for (const spin of spins) {
        if (!lockedIds.has(spin.id) || keep[spin.id]) continue;
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: "🎡 Your spin is ready",
            body: "Spin now — coins, stamps or a surprise are waiting.",
            data: { type: "rewards_spin_ready", path: "/rewards" },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(spin.unlocksAt as string),
            channelId: "default",
          },
        }).catch(() => null);
        if (id) keep[spin.id] = id;
      }
    }
  }
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(keep));
  } catch {
    // best effort
  }
}
