import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

// "Remind me" / "Notify me" on the Hype tab = a LOCAL notification on this phone, scheduled a
// little before the event or drop starts. No server push, no extra push budget, works offline.
// Stored as { [itemId]: notificationId } so the button can toggle it off again.

const STORAGE_KEY = "foodbela.hype.reminders.v1";
const LEAD_MS = 15 * 60_000; // 15 minutes before

type ReminderMap = Record<string, string>;

async function load(): Promise<ReminderMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ReminderMap) : {};
  } catch {
    return {};
  }
}

async function save(map: ReminderMap) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // best effort
  }
}

export async function getHypeReminderIds() {
  return new Set(Object.keys(await load()));
}

/** Returns "scheduled" | "removed" | "denied" | "too_late". */
export async function toggleHypeReminder(item: {
  id: string;
  title: string;
  startsAt: string | null;
  kind: "drop" | "event" | "video" | "poll";
}): Promise<"scheduled" | "removed" | "denied" | "too_late"> {
  const map = await load();
  const existing = map[item.id];
  if (existing) {
    await Notifications.cancelScheduledNotificationAsync(existing).catch(() => undefined);
    delete map[item.id];
    await save(map);
    return "removed";
  }

  const startsAt = item.startsAt ? new Date(item.startsAt).getTime() : Number.NaN;
  if (!Number.isFinite(startsAt)) return "too_late";
  const fireAt = Math.max(Date.now() + 5_000, startsAt - LEAD_MS);
  if (startsAt <= Date.now()) return "too_late";

  let permission = await Notifications.getPermissionsAsync().catch(() => null);
  if (permission?.status !== "granted" && permission?.canAskAgain !== false) {
    permission = await Notifications.requestPermissionsAsync().catch(() => null);
  }
  if (permission?.status !== "granted") return "denied";

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: item.kind === "drop" ? "⚡ Drop starting soon" : "📍 Starting soon",
      body: item.title,
      data: { type: "hype_reminder", path: "/(tabs)/hype" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(fireAt),
      channelId: "default",
    },
  }).catch(() => null);
  if (!id) return "denied";
  map[item.id] = id;
  await save(map);
  return "scheduled";
}
