// Pure rules for the Hype tab (unit-tested).

/** Accepts a YouTube id or any common YouTube URL; returns the 11-char id or "". */
export function parseYoutubeId(input: string) {
  const value = String(input ?? "").trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtube\.com\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/,
  ]
  for (const pattern of patterns) {
    const match = value.match(pattern)
    if (match) return match[1]
  }
  return ""
}

type Timed = { startsAt?: Date | string | null; endsAt?: Date | string | null }

const time = (value: Date | string | null | undefined) =>
  value ? new Date(value).getTime() : Number.NaN

/** Drops shown: live now, or starting within the next `upcomingHours`. Never after they end. */
export function isDropVisible(drop: Timed, now: number, upcomingHours = 24) {
  const ends = time(drop.endsAt)
  if (!Number.isFinite(ends) || ends <= now) return false
  const starts = time(drop.startsAt)
  if (!Number.isFinite(starts)) return true
  return starts <= now + upcomingHours * 3_600_000
}

/** Events shown until they end (or 6h after start when no end is set). */
export function isEventVisible(event: Timed, now: number) {
  const starts = time(event.startsAt)
  if (!Number.isFinite(starts)) return false
  const ends = Number.isFinite(time(event.endsAt)) ? time(event.endsAt) : starts + 6 * 3_600_000
  return ends > now
}

/** Video ranking: admin position first, then a like-ratio score (dislikes never shown). */
export function videoScore(video: { likeCount?: number; dislikeCount?: number; viewCount?: number }) {
  const likes = Math.max(0, video.likeCount ?? 0)
  const dislikes = Math.max(0, video.dislikeCount ?? 0)
  const views = Math.max(0, video.viewCount ?? 0)
  // Wilson-ish smoothing so 1 like / 0 dislikes doesn't beat 300 / 20.
  const ratio = (likes + 1) / (likes + dislikes + 2)
  return ratio * Math.log10(10 + likes * 3 + views)
}

/** Apply a reaction change to counters. `previous`/`next`: "like" | "dislike" | null. */
export function reactionDelta(previous: string | null, next: string | null) {
  const delta = { likeCount: 0, dislikeCount: 0 }
  if (previous === next) return delta
  if (previous === "like") delta.likeCount -= 1
  if (previous === "dislike") delta.dislikeCount -= 1
  if (next === "like") delta.likeCount += 1
  if (next === "dislike") delta.dislikeCount += 1
  return delta
}

// ── Polls ──

/** 2–6 unique, non-empty options; keeps existing ids (so votes survive an edit), else makes new ones. */
export function sanitizePollOptions(
  input: Array<{ id?: string; label?: string }> | undefined,
  existing: Array<{ id: string; voteCount?: number }> = [],
) {
  const seen = new Set<string>()
  const existingIds = new Set(existing.map((option) => option.id))
  const options: Array<{ id: string; label: string; voteCount: number }> = []
  for (const raw of input ?? []) {
    const label = String(raw?.label ?? "").trim().slice(0, 80)
    if (!label || seen.has(label.toLowerCase())) continue
    seen.add(label.toLowerCase())
    const keep = raw?.id && existingIds.has(raw.id) ? raw.id : ""
    const id = keep || `o${options.length + 1}${Math.random().toString(36).slice(2, 7)}`
    const voteCount = existing.find((option) => option.id === id)?.voteCount ?? 0
    options.push({ id, label, voteCount })
    if (options.length === 6) break
  }
  return options
}

/** A poll accepts votes until its end time (no end = open). */
export function isPollOpen(poll: { endsAt?: Date | string | null }, now: number) {
  if (!poll.endsAt) return true
  const ends = new Date(poll.endsAt).getTime()
  return !Number.isFinite(ends) || ends > now
}

/** Percentages that always add up to 100 (largest-remainder rounding). */
export function pollPercentages(counts: number[]) {
  const total = counts.reduce((sum, value) => sum + Math.max(0, value), 0)
  if (!total) return counts.map(() => 0)
  const raw = counts.map((value) => (Math.max(0, value) / total) * 100)
  const floored = raw.map(Math.floor)
  let remainder = 100 - floored.reduce((sum, value) => sum + value, 0)
  const order = raw.map((value, index) => ({ index, frac: value - Math.floor(value) })).sort((a, b) => b.frac - a.frac)
  for (const { index } of order) {
    if (remainder <= 0) break
    floored[index] += 1
    remainder -= 1
  }
  return floored
}
