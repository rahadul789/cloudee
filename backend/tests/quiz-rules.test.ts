import {
  QUIZ_SEED_QUESTIONS,
  compareQuizPlays,
  generateQuizCode,
  isValidQuizCode,
  quizTitleFor,
  sanitizeQuizName,
} from "../src/modules/quiz/quiz.rules"

describe("friend quiz rules", () => {
  it("gives a funny title by share of correct answers", () => {
    expect(quizTitleFor(10, 10).key).toBe("soulmate")
    expect(quizTitleFor(9, 10).key).toBe("soulmate")
    expect(quizTitleFor(7, 10).key).toBe("real_friend")
    expect(quizTitleFor(4, 10).key).toBe("facebook_friend")
    expect(quizTitleFor(3, 10).key).toBe("stranger")
    expect(quizTitleFor(0, 0).key).toBe("stranger")
  })

  it("cleans names and blocks links, phone numbers and slurs", () => {
    expect(sanitizeQuizName("  রাকিব   হাসান ")).toBe("রাকিব হাসান")
    expect(sanitizeQuizName("Iqbal")).toBe("Iqbal")
    expect(sanitizeQuizName("বালক")).toBe("বালক")
    expect(sanitizeQuizName("a")).toBeNull()
    expect(sanitizeQuizName("visit www.x.com")).toBeNull()
    expect(sanitizeQuizName("01712345678")).toBeNull()
    expect(sanitizeQuizName("fuck you")).toBeNull()
    expect(sanitizeQuizName("শালা")).toBeNull()
    expect(sanitizeQuizName(42)).toBeNull()
    expect(sanitizeQuizName("x".repeat(40))?.length).toBe(24)
  })

  it("makes valid share codes", () => {
    const code = generateQuizCode()
    expect(code).toHaveLength(8)
    expect(isValidQuizCode(code)).toBe(true)
    expect(isValidQuizCode("../etc")).toBe(false)
    expect(isValidQuizCode("ABC12345")).toBe(false)
  })

  it("orders the leaderboard by score, then who finished first", () => {
    const plays = [
      { id: "late", score: 7, completedAt: "2026-11-16T10:05:00Z" },
      { id: "top", score: 9, completedAt: "2026-11-16T10:10:00Z" },
      { id: "early", score: 7, completedAt: "2026-11-16T10:00:00Z" },
    ]
    expect(plays.sort(compareQuizPlays).map((play) => play.id)).toEqual(["top", "early", "late"])
  })

  it("ships a usable starter bank", () => {
    expect(QUIZ_SEED_QUESTIONS.length).toBeGreaterThanOrEqual(30)
    for (const question of QUIZ_SEED_QUESTIONS) {
      expect(question.options).toHaveLength(4)
      expect(question.text.length).toBeLessThanOrEqual(140)
      for (const option of question.options) expect(option.length).toBeLessThanOrEqual(80)
    }
  })
})

describe("suggested quiz questions", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { validateSuggestedQuestion, hasBlockedWords } = require("../src/modules/quiz/quiz.rules")

  it("accepts a clean question and trims it", () => {
    const result = validateSuggestedQuestion({ text: "  আমার প্রিয়   চা কোনটা? ", options: [" দুধ চা", "রং চা ", ""] })
    expect(result).toEqual({ ok: true, text: "আমার প্রিয় চা কোনটা?", options: ["দুধ চা", "রং চা"] })
  })

  it("rejects short, duplicate, link and slur content", () => {
    expect(validateSuggestedQuestion({ text: "কী?", options: ["a", "b"] }).ok).toBe(false)
    expect(validateSuggestedQuestion({ text: "আমার প্রিয় খাবার?", options: ["ভাত"] }).ok).toBe(false)
    expect(validateSuggestedQuestion({ text: "আমার প্রিয় খাবার?", options: ["ভাত", "ভাত"] }).ok).toBe(false)
    expect(validateSuggestedQuestion({ text: "visit www.spam.com now", options: ["a1", "b1"] }).ok).toBe(false)
    expect(hasBlockedWords("call 01712345678")).toBe(true)
    expect(hasBlockedWords("শালা কী খায়?")).toBe(true)
    expect(hasBlockedWords("বালিশ মিষ্টি")).toBe(false)
  })
})

describe("quiz copy + tiers", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rules = require("../src/modules/quiz/quiz.rules")

  it("fills placeholders with Bangla digits and keeps unknown ones", () => {
    expect(rules.renderQuizTemplate("{player} তোমাকে {score}/{total} চেনে! {oops}", { player: "রাকিব", score: 7, total: 10 }))
      .toBe("রাকিব তোমাকে ৭/১০ চেনে! {oops}")
  })

  it("falls back to defaults for missing or empty copy", () => {
    const copy = rules.resolveQuizCopy({ startButton: "  ", shareMessage: "নতুন {url}", correctReactions: [] })
    expect(copy.shareMessage).toBe("নতুন {url}")
    expect(copy.startButton).toBe(rules.DEFAULT_QUIZ_COPY.startButton)
    expect(copy.correctReactions).toEqual(rules.DEFAULT_QUIZ_COPY.correctReactions)
  })

  it("picks a stable variant per play and always has a 0% tier", () => {
    const tiers = rules.resolveQuizTiers([
      { key: "top", minPercent: 80, emoji: "🔥", labels: ["A", "B"] },
      { key: "low", minPercent: 20, emoji: "🙂", labels: ["C"] },
    ])
    expect(tiers[tiers.length - 1].minPercent).toBe(0)
    const first = rules.quizTitleFor(9, 10, tiers, "play-1")
    expect(rules.quizTitleFor(9, 10, tiers, "play-1")).toEqual(first)
    expect(["A", "B"]).toContain(first.label)
    expect(rules.quizTitleFor(1, 10, tiers, "x").key).toBe("low")
  })
})
