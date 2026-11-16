import { randomInt } from "node:crypto"

// "তুমি আমাকে কতটা চেনো?" — friend quiz. Pure helpers (unit-tested): titles, names, codes.

export const QUIZ_MIN_QUESTIONS = 5
export const QUIZ_MAX_QUESTIONS = 15
export const QUIZ_NAME_MAX = 24

/** Funny title for a friend's score (by share of correct answers, so it works for any length). */
export function quizTitleFor(score: number, total: number) {
  const ratio = total > 0 ? score / total : 0
  if (ratio >= 0.9) return { key: "soulmate", emoji: "👑", label: "আত্মার আত্মীয়" }
  if (ratio >= 0.7) return { key: "real_friend", emoji: "🤝", label: "আসল দোস্ত" }
  if (ratio >= 0.4) return { key: "facebook_friend", emoji: "📱", label: "শুধু ফেসবুক ফ্রেন্ড" }
  return { key: "stranger", emoji: "🚶", label: "রাস্তার অচেনা মানুষ" }
}

// Small blocklist for names shown on a public leaderboard (admin can still delete any play).
// Whole words only (so "Iqbal" or "বালক" are fine) …
const BLOCKED_NAME_WORDS = new Set([
  "sex", "dick", "shit", "bal", "baal", "magi", "shala", "harami", "kuttar",
  "বাল", "মাগি", "শালা", "হারামি",
])
// … and fragments that never appear inside a normal name.
const BLOCKED_NAME_FRAGMENTS = [
  "fuck", "bitch", "porn", "pussy", "bastard", "khanki", "chudi", "choda", "haramjada", "kuttarbaccha",
  "খানকি", "চুদ", "চোদ", "হারামজাদা", "কুত্তার বাচ্চা",
]

/** Cleans a display name; returns null when it's empty, a link, or contains a blocked word. */
export function sanitizeQuizName(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const name = raw
    .replace(/[<>{}[\]\\`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, QUIZ_NAME_MAX)
    .trim()
  if (name.length < 2) return null
  if (/https?:|www\.|\.com|@/i.test(name)) return null
  if (/\d{6,}/.test(name)) return null // phone numbers
  const lower = name.toLowerCase()
  if (BLOCKED_NAME_FRAGMENTS.some((part) => lower.includes(part))) return null
  if (lower.split(/[\s.,!?_-]+/).some((word) => BLOCKED_NAME_WORDS.has(word))) return null
  return name
}

/** True when free text (a suggested question / option) contains a blocked word or a link. */
export function hasBlockedWords(raw: string) {
  const lower = raw.toLowerCase()
  if (/https?:|www\.|\.com\b|@/i.test(lower)) return true
  if (/\d{8,}/.test(lower)) return true // phone numbers
  if (BLOCKED_NAME_FRAGMENTS.some((part) => lower.includes(part))) return true
  return lower.split(/[\s.,!?_()"'।-]+/).some((word) => BLOCKED_NAME_WORDS.has(word))
}

/** Validates a customer-suggested question; returns cleaned values or an error message (Bangla). */
export function validateSuggestedQuestion(input: { text: string; options: string[] }):
  | { ok: true; text: string; options: string[] }
  | { ok: false; message: string } {
  const clean = (value: string) => value.replace(/[<>{}[\]\\`]/g, "").replace(/\s+/g, " ").trim()
  const text = clean(input.text)
  const options = input.options.map(clean).filter(Boolean)
  if (text.length < 6) return { ok: false, message: "প্রশ্নটা একটু বড় করে লেখো।" }
  if (text.length > 140) return { ok: false, message: "প্রশ্নটা ১৪০ অক্ষরের মধ্যে রাখো।" }
  if (options.length < 2 || options.length > 4) return { ok: false, message: "২ থেকে ৪টা উত্তর দাও।" }
  if (options.some((option) => option.length > 80)) return { ok: false, message: "প্রতিটা উত্তর ৮০ অক্ষরের মধ্যে রাখো।" }
  if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
    return { ok: false, message: "দুইটা উত্তর একই হয়ে গেছে।" }
  }
  if ([text, ...options].some(hasBlockedWords)) return { ok: false, message: "এই লেখাটা জমা দেওয়া যাবে না।" }
  return { ok: true, text, options }
}

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"

/** Short, unambiguous share code (e.g. foodbela.com/q/k7m2xp9a). */
export function generateQuizCode(length = 8) {
  let code = ""
  for (let i = 0; i < length; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return code
}

export function isValidQuizCode(code: unknown): code is string {
  return typeof code === "string" && /^[a-z0-9]{6,12}$/.test(code)
}

/** Leaderboard order: higher score first, then whoever finished earlier. */
export function compareQuizPlays(
  a: { score: number; completedAt?: Date | string | null },
  b: { score: number; completedAt?: Date | string | null },
) {
  if (b.score !== a.score) return b.score - a.score
  const at = a.completedAt ? new Date(a.completedAt).getTime() : Number.MAX_SAFE_INTEGER
  const bt = b.completedAt ? new Date(b.completedAt).getTime() : Number.MAX_SAFE_INTEGER
  return at - bt
}

/** At most one "X played your quiz" push per quiz in this window (a group chat can play at once). */
export const QUIZ_PUSH_COOLDOWN_MS = 3 * 60_000

export type SeedQuestion = { category: string; text: string; options: string[] }

// Starter bank (admin can edit / disable / add). Food-first, light and funny, nothing personal.
export const QUIZ_SEED_QUESTIONS: SeedQuestion[] = [
  // 🍗 প্রিয় খাবার
  { category: "favourite", text: "আমার প্রিয় বিরিয়ানি কোনটা?", options: ["কাচ্চি", "তেহারি", "চিকেন বিরিয়ানি", "মোরগ পোলাও"] },
  { category: "favourite", text: "বিকেলের নাস্তায় আমি কী বেছে নেব?", options: ["ফুচকা", "চটপটি", "সিঙ্গারা-সমুচা", "পিঁয়াজু-বেগুনি"] },
  { category: "favourite", text: "আমার প্রিয় ফাস্টফুড কোনটা?", options: ["বার্গার", "পিৎজা", "ফ্রাইড চিকেন", "শর্মা"] },
  { category: "favourite", text: "মিষ্টির মধ্যে আমার দুর্বলতা কোনটা?", options: ["রসগোল্লা", "বালিশ মিষ্টি", "দই", "চমচম"] },
  { category: "favourite", text: "আমি কোন চা পছন্দ করি?", options: ["দুধ চা", "রং চা", "মালাই চা", "চা-ই খাই না"] },
  { category: "favourite", text: "আমার প্রিয় ঠান্ডা পানীয়?", options: ["কোক/পেপসি", "লাচ্ছি", "লেবুর শরবত", "কোল্ড কফি"] },
  { category: "favourite", text: "চিকেন হলে আমি কোনটা নেব?", options: ["ফ্রাইড চিকেন", "চিকেন কারি", "গ্রিল/তান্দুরি", "চিকেন ফ্রাই রাইস"] },
  { category: "favourite", text: "ভাতের সাথে আমার প্রিয় জিনিস?", options: ["গরুর মাংস", "ইলিশ মাছ", "ডাল-আলু ভর্তা", "ডিম ভুনা"] },
  { category: "favourite", text: "শীতকালে আমার প্রিয় খাবার?", options: ["ভাপা পিঠা", "চিতই পিঠা + ভর্তা", "হাঁসের মাংস", "খেজুরের রস"] },
  { category: "favourite", text: "রেস্টুরেন্টে গেলে আমি সাধারণত কী অর্ডার করি?", options: ["সেট মেনু", "বিরিয়ানি", "চাইনিজ", "যা সবাই নেয় তাই 😅"] },

  // 🌶️ খাওয়ার অভ্যাস
  { category: "habit", text: "ফুচকায় আমার ঝাল লেভেল কত?", options: ["একদম হালকা", "মাঝারি", "চোখে পানি আসা পর্যন্ত", "আগুন 🔥"] },
  { category: "habit", text: "খাবার আসার পর আমি প্রথমে কী করি?", options: ["ছবি তুলি 📸", "সাথে সাথে খাই", "আগে অন্যদেরটা দেখি", "সস খুঁজি"] },
  { category: "habit", text: "বিরিয়ানিতে আলু নিয়ে আমার মত?", options: ["আলু ছাড়া বিরিয়ানি হয় না", "থাকলে খাই", "আলু সরিয়ে রাখি", "সবার আলু আমি খাই"] },
  { category: "habit", text: "আমি খেতে কত সময় নিই?", options: ["৫ মিনিটে শেষ", "স্বাভাবিক", "সবার শেষে উঠি", "গল্প করতে করতে ঠান্ডা করে ফেলি"] },
  { category: "habit", text: "খাওয়ার সময় আমার হাতে থাকে…", options: ["ফোন", "রিমোট", "কিছুই না, শুধু খাবার", "অন্যের প্লেটের দিকে নজর 👀"] },
  { category: "habit", text: "সস/কেচাপ নিয়ে আমি…", options: ["সব কিছুতে দিই", "মাঝে মাঝে", "একদম না", "মেয়োনিজ লাগবেই"] },
  { category: "habit", text: "মেনু দেখে অর্ডার দিতে আমার কত সময় লাগে?", options: ["১০ সেকেন্ড", "৫ মিনিট", "সবার পরে, তবুও কনফিউজড", "অন্যকে বলি দিয়ে দিতে"] },
  { category: "habit", text: "ডায়েটের ব্যাপারে আমি…", options: ["কাল থেকে শুরু করব 😅", "সত্যিই মেনে চলি", "ডায়েট কী জিনিস?", "শুধু ছবিতে ডায়েট"] },

  // 🌙 খিদের সময়
  { category: "hunger", text: "রাত ২টায় খিদে পেলে আমি কী করি?", options: ["অনলাইনে অর্ডার", "ম্যাগি বানাই", "ফ্রিজ খুলে হতাশ হই", "ঘুমিয়ে পড়ি"] },
  { category: "hunger", text: "খিদে পেলে আমার মেজাজ কেমন হয়?", options: ["একদম ঠিক থাকে", "একটু খিটখিটে", "কেউ কথা বলবে না 😤", "চুপচাপ হয়ে যাই"] },
  { category: "hunger", text: "পরীক্ষার আগের রাতে আমি কী খাই?", options: ["চা আর বিস্কুট", "চিপস-চানাচুর", "কিছুই না, টেনশনে", "পুরো ভাত-মাংস"] },
  { category: "hunger", text: "বৃষ্টির দিনে আমি কী খেতে চাই?", options: ["খিচুড়ি-ডিম ভাজা", "পিঁয়াজু-চা", "নুডলস", "ভুনা খিচুড়ি + গরুর মাংস"] },
  { category: "hunger", text: "সকালের নাস্তায় আমি সাধারণত…", options: ["পরোটা-ডিম", "রুটি-ভাজি", "নাস্তাই করি না", "দুপুরে একসাথে খাই 😅"] },
  { category: "hunger", text: "মন খারাপ হলে আমি কী খাই?", options: ["আইসক্রিম", "চকলেট", "বিরিয়ানি", "কিছুই খাই না"] },
  { category: "hunger", text: "খুশির খবর পেলে আমি কী খেতে চাই?", options: ["কাচ্চি", "পিৎজা পার্টি", "মিষ্টি", "বন্ধুদের নিয়ে বাইরে খাওয়া"] },

  // 🧾 ট্রিট ও বন্ধুত্ব
  { category: "treat", text: "বিল আসলে আমি কী করি?", options: ["সবার আগে ওয়ালেট বের করি", "হঠাৎ ফোন আসে 📞", "বাথরুমে যাই 🚶", "ভাগ করে দিতে বলি"] },
  { category: "treat", text: "কেউ আমার খাবার ভাগ চাইলে…", options: ["খুশি হয়ে দিই", "একটু দিই, মন খারাপ করে", "না বলি 😤", "আগেই সব খেয়ে ফেলি"] },
  { category: "treat", text: "আমি ট্রিট দেওয়ার সময়…", options: ["বড় রেস্টুরেন্টে নিয়ে যাই", "ফুচকা পর্যন্ত", "পরে দেব বলি", "ট্রিট আমি নিই, দিই না 😅"] },
  { category: "treat", text: "বন্ধুদের সাথে খেতে গেলে জায়গা কে ঠিক করে?", options: ["আমি", "অন্য কেউ", "সবাই মিলে ঝগড়া করে", "শেষে একই জায়গায় যাই"] },
  { category: "treat", text: "আমার জন্মদিনে আমি কী চাই?", options: ["কেক", "বিরিয়ানি পার্টি", "সারপ্রাইজ", "কিছুই না, শুধু উইশ"] },
  { category: "treat", text: "গ্রুপে খাওয়ার সময় আমি কোন জন?", options: ["ছবি তোলার দায়িত্বে", "সবার আগে শেষ করি", "সবার প্লেট থেকে একটু নিই", "শুধু গল্প করি"] },
  { category: "treat", text: "শেষ পিসটা কে নেয়?", options: ["আমি, কোনো সন্দেহ নেই", "সবাইকে জিজ্ঞেস করে আমি", "কেউ না, পড়ে থাকে", "ভাগ করে নিই"] },

  // 😂 মজার
  { category: "fun", text: "আমি যদি একটা খাবার হতাম, কোনটা হতাম?", options: ["ঝাল ফুচকা 🌶️", "মিষ্টি রসগোল্লা", "গরম বিরিয়ানি", "ঠান্ডা আইসক্রিম"] },
  { category: "fun", text: "খাবারের সবচেয়ে বড় কষ্ট আমার কাছে কী?", options: ["বিরিয়ানিতে আলু না পাওয়া", "ঠান্ডা খাবার", "কম ঝাল", "খাবার দেরিতে আসা"] },
  { category: "fun", text: "জীবনে শুধু একটা খাবার খেতে পারলে আমি বেছে নেব…", options: ["বিরিয়ানি", "ভাত-মাছ", "পিৎজা", "ফুচকা"] },
  { category: "fun", text: "আমার রান্নার দক্ষতা কেমন?", options: ["মাস্টারশেফ 👨‍🍳", "ডিম ভাজা পর্যন্ত", "পানি গরম করতে পারি", "রান্নাঘরে ঢুকি না"] },
  { category: "fun", text: "ফ্রি খাবার পেলে আমি…", options: ["সবার আগে লাইনে", "দুবার নিই 😅", "লজ্জা পাই, পরে নিই", "বাসায় নিয়ে যাই"] },
  { category: "fun", text: "আমার খাবারের ছবি দেখে মানুষ বলে…", options: ["ওয়াও!", "আবার খাচ্ছিস?", "আমাকে ডাকলি না কেন?", "ছবি তুলি না"] },
  { category: "fun", text: "কোন জিনিস ছাড়া আমার খাওয়া অসম্পূর্ণ?", options: ["কাঁচা মরিচ", "লেবু", "সালাদ", "ঠান্ডা পানীয়"] },
  { category: "fun", text: "একদিন ফ্রি খাওয়ার সুযোগ পেলে আমি কোথায় যাব?", options: ["সবচেয়ে দামি রেস্টুরেন্টে", "প্রিয় ফুচকার দোকানে", "বুফেতে 🍽️", "বাসায় অর্ডার দিয়ে ঘুম"] },
]
