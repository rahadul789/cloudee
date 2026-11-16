const crypto = require("node:crypto");

// Friend quiz: one anonymous player id per browser (httpOnly cookie) → one play per quiz.
const COOKIE = "fb_quiz_player";
const KEY_PATTERN = /^[A-Za-z0-9_-]{16,80}$/;

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return "";
      }
    }
  }
  return "";
}

function readPlayerKey(req) {
  const value = readCookie(req, COOKIE);
  return KEY_PATTERN.test(value) ? value : "";
}

function ensurePlayerKey(req, res) {
  const existing = readPlayerKey(req);
  if (existing) return existing;
  const key = crypto.randomBytes(18).toString("base64url");
  res.cookie(COOKIE, key, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 365 * 24 * 60 * 60 * 1000,
    path: "/",
  });
  return key;
}

module.exports = { ensurePlayerKey, readPlayerKey };
