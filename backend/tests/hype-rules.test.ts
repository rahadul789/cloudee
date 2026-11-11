import {
  isDropVisible,
  isEventVisible,
  parseYoutubeId,
  reactionDelta,
  videoScore,
} from "../src/modules/hype/hype.rules"

const H = 3_600_000

describe("parseYoutubeId", () => {
  it("accepts raw ids and common URL shapes", () => {
    expect(parseYoutubeId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(parseYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ")
    expect(parseYoutubeId("https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe("dQw4w9WgXcQ")
    expect(parseYoutubeId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(parseYoutubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })
  it("rejects junk", () => {
    expect(parseYoutubeId("https://example.com/video")).toBe("")
    expect(parseYoutubeId("")).toBe("")
  })
})

describe("drop / event visibility", () => {
  const now = Date.UTC(2026, 10, 10, 12)
  it("shows a live drop and hides an ended one", () => {
    expect(isDropVisible({ startsAt: new Date(now - H), endsAt: new Date(now + H) }, now)).toBe(true)
    expect(isDropVisible({ startsAt: new Date(now - 2 * H), endsAt: new Date(now - 1) }, now)).toBe(false)
  })
  it("shows an upcoming drop only within 24h", () => {
    expect(isDropVisible({ startsAt: new Date(now + 5 * H), endsAt: new Date(now + 6 * H) }, now)).toBe(true)
    expect(isDropVisible({ startsAt: new Date(now + 30 * H), endsAt: new Date(now + 31 * H) }, now)).toBe(false)
  })
  it("keeps an event until it ends (or 6h after start)", () => {
    expect(isEventVisible({ startsAt: new Date(now - 5 * H) }, now)).toBe(true)
    expect(isEventVisible({ startsAt: new Date(now - 7 * H) }, now)).toBe(false)
    expect(isEventVisible({ startsAt: new Date(now - 7 * H), endsAt: new Date(now + H) }, now)).toBe(true)
  })
})

describe("reactions", () => {
  it("moves counters correctly", () => {
    expect(reactionDelta(null, "like")).toEqual({ likeCount: 1, dislikeCount: 0 })
    expect(reactionDelta("like", "dislike")).toEqual({ likeCount: -1, dislikeCount: 1 })
    expect(reactionDelta("dislike", null)).toEqual({ likeCount: 0, dislikeCount: -1 })
    expect(reactionDelta("like", "like")).toEqual({ likeCount: 0, dislikeCount: 0 })
  })
  it("ranks a well-liked video above a single lucky like", () => {
    expect(videoScore({ likeCount: 300, dislikeCount: 20 })).toBeGreaterThan(videoScore({ likeCount: 1 }))
  })
})

import { isPollOpen, pollPercentages, sanitizePollOptions } from "../src/modules/hype/hype.rules"

describe("polls", () => {
  it("keeps 2–6 unique options and preserves ids/votes on edit", () => {
    const first = sanitizePollOptions([{ label: "Biryani" }, { label: "biryani" }, { label: " " }, { label: "Burger" }])
    expect(first.map((o) => o.label)).toEqual(["Biryani", "Burger"])
    const edited = sanitizePollOptions(
      [{ id: first[0].id, label: "Kacchi biryani" }, { label: "Pizza" }],
      [{ id: first[0].id, voteCount: 12 }],
    )
    expect(edited[0]).toMatchObject({ id: first[0].id, label: "Kacchi biryani", voteCount: 12 })
    expect(edited[1].voteCount).toBe(0)
    expect(sanitizePollOptions(Array.from({ length: 9 }, (_, i) => ({ label: `O${i}` })))).toHaveLength(6)
  })
  it("closes at endsAt", () => {
    expect(isPollOpen({ endsAt: null }, 10)).toBe(true)
    expect(isPollOpen({ endsAt: new Date(5) }, 10)).toBe(false)
  })
  it("percentages always sum to 100", () => {
    expect(pollPercentages([1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100)
    expect(pollPercentages([0, 0])).toEqual([0, 0])
    expect(pollPercentages([3, 1])).toEqual([75, 25])
  })
})
