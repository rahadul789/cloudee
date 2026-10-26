const crypto = require("node:crypto");
const secret = process.env.WEBSITE_SESSION_SECRET;
if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32)) {
  throw new Error("Set WEBSITE_SESSION_SECRET to a stable random secret of at least 32 characters.");
}
const key = crypto.createHash("sha256").update(secret || crypto.randomBytes(32)).digest();
const cookieName = "foodbela_customer";
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" };

function seal(session) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(session)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
function readSession(req) {
  try {
    const cookie = String(req.headers.cookie || "").split(";").map((s) => s.trim()).find((s) => s.startsWith(`${cookieName}=`));
    if (!cookie) return null;
    const value = Buffer.from(cookie.slice(cookieName.length + 1), "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, value.subarray(0, 12));
    decipher.setAuthTag(value.subarray(12, 28));
    const session = JSON.parse(Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString());
    return session.expiresAt > Date.now() && session.accessToken && session.refreshToken ? session : null;
  } catch { return null; }
}
function writeSession(res, data) {
  // Store only credentials, never profile data, in the authenticated encrypted cookie.
  const session = { accessToken: data.accessToken, refreshToken: data.refreshToken, expiresAt: Date.now() + 30 * 86400_000 };
  res.cookie(cookieName, seal(session), { ...cookieOptions, maxAge: 30 * 86400_000 });
  return session;
}
function clearSession(res) { res.clearCookie(cookieName, cookieOptions); }
module.exports = { seal, readSession, writeSession, clearSession };
