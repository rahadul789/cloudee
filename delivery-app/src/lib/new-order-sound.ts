import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

export type RiderSoundEvent = {
  type?: unknown;
  orderId?: unknown;
  notificationId?: unknown;
  id?: unknown;
  channelId?: unknown;
};

type Sound = "incoming" | "placed" | "assignment" | "late" | "common";
const players = new Map<Sound, AudioPlayer>();
const sounded = new Map<string, number>();
const pending = new Map<string, Promise<boolean>>();
const DEDUP_MS = 20_000;
let audioModeReady: Promise<void> | undefined;

export function resolveRiderNotificationSound(event: RiderSoundEvent): Sound | null {
  if (event.type === "order.headsup" || event.channelId === "new-order-headsup") return "incoming";
  if (event.type === "order.placed.headsup" || event.channelId === "new-order-placed") return "placed";
  if (event.type === "rider_assignment" || event.channelId === "new-delivery") return "assignment";
  if (event.channelId === "delivery-late" || [
    "rider_response_late", "rider_pickup_late", "delivery_late_after_pickup",
    "delivery_critical_after_pickup", "delivery_eta_exceeded",
  ].includes(String(event.type ?? ""))) return "late";
  return event.type || event.channelId ? "common" : null;
}

function eventKey(event: RiderSoundEvent) {
  // The advisory socket event and persisted notification share type + order.
  if (event.orderId && event.type) return String(event.type) + ":" + String(event.orderId);
  return String(event.notificationId ?? event.id ?? event.type ?? event.channelId ?? "notification");
}

function ensureAudioMode() {
  if (!audioModeReady) {
    audioModeReady = setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
      shouldPlayInBackground: false,
    }).catch((error) => { audioModeReady = undefined; throw error; });
  }
  return audioModeReady;
}

function getPlayer(sound: Sound) {
  const existing = players.get(sound);
  if (existing) return existing;
  const source = sound === "incoming" ? require("../../assets/sounds/new_order.mp3")
    : sound === "placed" ? require("../../assets/sounds/new_order_placed.mp3")
    : sound === "assignment" ? require("../../assets/sounds/new_delivery.mp3")
    : sound === "late" ? require("../../assets/sounds/delivery_hurry.mp3")
    : require("../../assets/sounds/common.mp3");
  const player = createAudioPlayer(source, { updateInterval: 100 });
  player.volume = 1;
  players.set(sound, player);
  return player;
}

async function bounded<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Notification audio timed out")), timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

async function waitFor(check: () => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return true;
}

// Both foreground push and socket use this function. Only suppress the OS sound after
// playback is confirmed; failed loading/playback leaves the push sound available.
export async function playRiderNotificationSound(event: RiderSoundEvent): Promise<boolean> {
  const sound = resolveRiderNotificationSound(event);
  if (!sound) return false;
  const key = eventKey(event);
  if (Date.now() - (sounded.get(key) ?? 0) < DEDUP_MS) return true;
  const existing = pending.get(key);
  if (existing) return existing;
  const work = (async () => {
    try {
      await bounded(ensureAudioMode(), 350);
      const player = getPlayer(sound);
      if (!await waitFor(() => player.isLoaded, 1_200)) return false;
      await bounded(player.seekTo(0), 350);
      player.play();
      if (!await waitFor(() => player.playing, 500)) return false;
      sounded.set(key, Date.now());
      for (const [id, at] of sounded) if (Date.now() - at >= DEDUP_MS) sounded.delete(id);
      return true;
    } catch {
      return false;
    }
  })();
  pending.set(key, work);
  try { return await work; } finally { pending.delete(key); }
}

export function playHeadsUpSound(orderId?: string) {
  return playRiderNotificationSound({ type: "order.headsup", orderId });
}
export function playPlacedHeadsUpSound(orderId?: string) {
  return playRiderNotificationSound({ type: "order.placed.headsup", orderId });
}
