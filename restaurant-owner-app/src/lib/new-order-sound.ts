import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

// In-app "new order" alert sound. This is the FOREGROUND path: when the app is open, the
// socket delivers `order.created` instantly and we play this ourselves — deterministic, and
// independent of whether the OS decides to sound the push. (Background/killed is covered by
// the push notification's "new-orders" channel.) Nothing here is allowed to throw: a failed
// sound must never break order handling.

let player: AudioPlayer | null = null;
let audioModeReady = false;

// orderId -> timestamp we played the in-app sound. The push handler reads this so it silences
// the foreground push ONLY when the socket actually chimed that order — if the socket was down
// and no in-app sound fired, the push is allowed to sound instead. Never miss, never double.
const recentlySounded = new Map<string, number>();
const SOUNDED_WINDOW_MS = 20000;

export function markNewOrderSounded(orderId: string) {
  const now = Date.now();
  recentlySounded.set(orderId, now);
  // Keep the map tiny — drop anything outside the window.
  for (const [id, ts] of recentlySounded) {
    if (now - ts > SOUNDED_WINDOW_MS) recentlySounded.delete(id);
  }
}

export function wasNewOrderSoundedRecently(orderId?: string) {
  if (!orderId) return false;
  const ts = recentlySounded.get(orderId);
  return typeof ts === "number" && Date.now() - ts < SOUNDED_WINDOW_MS;
}

async function ensureAudioMode() {
  if (audioModeReady) return;
  try {
    await setAudioModeAsync({
      // Play even when the phone's ringer is on silent (iOS) — a missed order is worse than
      // a sound in a silent room; owners rely on hearing it.
      playsInSilentMode: true,
      // Duck/mix rather than stopping the owner's music or a call ringtone.
      interruptionMode: "mixWithOthers",
      shouldPlayInBackground: false,
    });
    audioModeReady = true;
  } catch {
    // Leave audioModeReady false so we retry configuring next time.
  }
}

function ensurePlayer(): AudioPlayer {
  if (!player) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    player = createAudioPlayer(require("../../assets/sounds/new_order.mp3"));
    player.volume = 1;
  }
  return player;
}

// Plays the new-order voice from the start. Safe to call repeatedly (restarts on each order).
// Pass the orderId so the push handler can tell this order was already sounded in-app.
export async function playNewOrderSound(orderId?: string) {
  if (orderId) markNewOrderSounded(orderId);
  try {
    await ensureAudioMode();
    const activePlayer = ensurePlayer();
    try {
      await activePlayer.seekTo(0);
    } catch {
      // seek can reject if the player isn't ready yet; play from wherever it is.
    }
    activePlayer.play();
  } catch {
    // Never surface a sound failure to the caller.
  }
}
