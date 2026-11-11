import * as Haptics from "expo-haptics";

// Reward sound effects (synthesized WAVs in assets/sounds) + haptic patterns.
// expo-audio is loaded lazily inside try/catch: on a build that doesn't include the native
// module yet, sounds are simply skipped (haptics still work) instead of crashing.
// Sounds follow the phone's silent switch (we never force playback in silent mode).

type Player = { play: () => void; seekTo: (seconds: number) => void; volume: number; remove?: () => void };

let audio: { createAudioPlayer: (source: number) => Player } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  audio = require("expo-audio");
} catch {
  audio = null;
}

const SOURCES = {
  tick: require("../../assets/sounds/spin_tick.wav"),
  win: require("../../assets/sounds/spin_win.wav"),
  lose: require("../../assets/sounds/spin_lose.wav"),
  shake: require("../../assets/sounds/box_shake.wav"),
  open: require("../../assets/sounds/box_open.wav"),
} as const;

type SoundName = keyof typeof SOURCES;
const players: Partial<Record<SoundName, Player[]>> = {};
const cursor: Partial<Record<SoundName, number>> = {};
const POOL: Record<SoundName, number> = { tick: 4, win: 1, lose: 1, shake: 2, open: 1 };

function player(name: SoundName) {
  if (!audio) return null;
  try {
    if (!players[name]) {
      players[name] = Array.from({ length: POOL[name] }, () => audio!.createAudioPlayer(SOURCES[name]));
    }
    const pool = players[name]!;
    const index = (cursor[name] ?? 0) % pool.length;
    cursor[name] = index + 1;
    return pool[index];
  } catch {
    return null;
  }
}

export function playRewardSound(name: SoundName, volume = 1) {
  const p = player(name);
  if (!p) return;
  try {
    p.volume = volume;
    p.seekTo(0);
    p.play();
  } catch {
    // never let a sound break the flow
  }
}

/** Warm up the players so the first tick/win isn't delayed. */
export function preloadRewardSounds() {
  (Object.keys(SOURCES) as SoundName[]).forEach((name) => player(name));
}

// ── Haptic patterns ──
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const safe = (fn: () => Promise<void>) => void fn().catch(() => undefined);

export const rewardHaptics = {
  tick: () => safe(() => Haptics.selectionAsync()),
  knock: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  win: () =>
    safe(async () => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await wait(120);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }),
  lose: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Box opening: a building rumble, then a burst — longer for a big prize. */
  boxOpen: (big: boolean) =>
    safe(async () => {
      for (let i = 0; i < (big ? 5 : 3); i++) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        await wait(70);
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (big) {
        await wait(180);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        await wait(90);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
    }),
};
