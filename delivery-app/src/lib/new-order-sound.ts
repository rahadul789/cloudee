import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

// In-app "new order heads-up" alert sound for riders. FOREGROUND path: when the app is open,
// the socket delivers the heads-up instantly and we play this ourselves — deterministic, and
// independent of whether the OS sounds the push. (Background/killed is covered by the
// "new-order-headsup" notification channel.) Nothing here may throw.

let player: AudioPlayer | null = null;
let audioModeReady = false;

// orderId -> timestamp we played the in-app sound. The push handler reads this so it silences
// the foreground push ONLY when the socket already chimed that order — if the socket was down
// (no in-app sound), the push is allowed to sound instead. Never miss, never double.
const recentlySounded = new Map<string, number>();
const SOUNDED_WINDOW_MS = 20000;

export function markHeadsUpSounded(orderId: string) {
  const now = Date.now();
  recentlySounded.set(orderId, now);
  for (const [id, ts] of recentlySounded) {
    if (now - ts > SOUNDED_WINDOW_MS) recentlySounded.delete(id);
  }
}

export function wasHeadsUpSoundedRecently(orderId?: string) {
  if (!orderId) return false;
  const ts = recentlySounded.get(orderId);
  return typeof ts === "number" && Date.now() - ts < SOUNDED_WINDOW_MS;
}

async function ensureAudioMode() {
  if (audioModeReady) return;
  try {
    await setAudioModeAsync({
      // Play even when the phone is on silent — a missed order heads-up defeats the point.
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
      shouldPlayInBackground: false,
    });
    audioModeReady = true;
  } catch {
    // retry configuring next time
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

// Plays the heads-up sound from the start. Safe to call repeatedly. Pass the orderId so the
// push handler can tell this order was already sounded in-app.
export async function playHeadsUpSound(orderId?: string) {
  if (orderId) markHeadsUpSounded(orderId);
  try {
    await ensureAudioMode();
    const activePlayer = ensurePlayer();
    try {
      await activePlayer.seekTo(0);
    } catch {
      // player not ready yet — play from wherever it is
    }
    activePlayer.play();
  } catch {
    // never surface a sound failure
  }
}
