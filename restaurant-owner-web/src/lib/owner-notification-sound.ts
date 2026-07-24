import orderPlacedSoundUrl from "@/assets/order_placed.mp3"

let preloadedOrderPlacedAudio: HTMLAudioElement | null = null
let unlockListenersRegistered = false
let warningAudioContext: AudioContext | null = null

type WebkitAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

function getOrderPlacedAudio() {
  if (typeof Audio === "undefined") return null
  if (preloadedOrderPlacedAudio) return preloadedOrderPlacedAudio

  preloadedOrderPlacedAudio = new Audio(orderPlacedSoundUrl)
  preloadedOrderPlacedAudio.preload = "auto"
  preloadedOrderPlacedAudio.volume = 0.9
  return preloadedOrderPlacedAudio
}

function removeUnlockListeners(listener: () => void) {
  window.removeEventListener("pointerdown", listener, true)
  window.removeEventListener("keydown", listener, true)
  unlockListenersRegistered = false
}

function getWarningAudioContext() {
  if (typeof window === "undefined") return null
  const AudioContextClass =
    window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext
  if (!AudioContextClass) return null

  warningAudioContext ??= new AudioContextClass()
  return warningAudioContext
}

function playTone(
  audioContext: AudioContext,
  startTime: number,
  frequency: number,
  duration: number
) {
  const oscillator = audioContext.createOscillator()
  const gain = audioContext.createGain()

  oscillator.type = "sine"
  oscillator.frequency.setValueAtTime(frequency, startTime)
  gain.gain.setValueAtTime(0.0001, startTime)
  gain.gain.exponentialRampToValueAtTime(0.045, startTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)

  oscillator.connect(gain)
  gain.connect(audioContext.destination)
  oscillator.start(startTime)
  oscillator.stop(startTime + duration + 0.02)
}

export function registerOwnerNotificationSoundUnlock() {
  if (typeof window === "undefined" || unlockListenersRegistered) {
    return () => undefined
  }

  const unlock = () => {
    const audio = getOrderPlacedAudio()
    if (!audio) return

    audio.muted = true
    void audio
      .play()
      .then(() => {
        audio.pause()
        audio.currentTime = 0
        audio.muted = false
      })
      .catch(() => {
        audio.muted = false
      })
    const warningAudio = getWarningAudioContext()
    if (warningAudio?.state === "suspended") {
      void warningAudio.resume().catch(() => undefined)
    }
    removeUnlockListeners(unlock)
  }

  unlockListenersRegistered = true
  window.addEventListener("pointerdown", unlock, {
    capture: true,
    once: true,
  })
  window.addEventListener("keydown", unlock, {
    capture: true,
    once: true,
  })

  return () => removeUnlockListeners(unlock)
}

export async function playOwnerNewOrderSound() {
  const audio = getOrderPlacedAudio()
  if (!audio) return

  try {
    audio.pause()
    audio.currentTime = 0
    audio.volume = 0.9
    await audio.play()
  } catch {
    // Browsers can block audio before the owner interacts with the page.
  }
}

export async function playOwnerWarningSound() {
  const audioContext = getWarningAudioContext()
  if (!audioContext) return

  try {
    if (audioContext.state === "suspended") {
      await audioContext.resume()
    }

    const now = audioContext.currentTime + 0.02
    playTone(audioContext, now, 740, 0.11)
    playTone(audioContext, now + 0.16, 520, 0.13)
  } catch {
    // Browsers can block audio before the owner interacts with the page.
  }
}
