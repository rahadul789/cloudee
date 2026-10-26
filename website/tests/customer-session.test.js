const { test } = require("node:test");
const assert = require("node:assert/strict");
const { seal, readSession, writeSession, shouldRenewCookie } = require("../src/services/customer-session.service");
const day = 86400_000;
const jwt = exp => `test.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.test`;
const cookieRequest = session => ({ headers: { cookie: `foodbela_customer=${seal(session)}` } });

test("persistent cookie follows the backend refresh expiry instead of a 30-day cutoff", () => {
  const exp = Math.floor((Date.now() + 3650 * day)/1000);
  let options;
  const session = writeSession({ cookie(_name, _value, opts) { options = opts; } }, { accessToken: jwt(exp), refreshToken: jwt(exp) });
  assert.equal(session.expiresAt, exp * 1000);
  assert.ok(options.maxAge > 399 * day && options.maxAge <= 400 * day);
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, "lax");
  const olderSession = { ...session, cookieRenewedAt: Date.now() - 60 * day };
  assert.ok(readSession(cookieRequest(olderSession)));
  assert.equal(shouldRenewCookie(olderSession), true);
  assert.equal(shouldRenewCookie(session), false);
});
test("a shorter backend expiry is respected and expired sessions are rejected", () => {
  const exp = Math.floor((Date.now() + 2 * day)/1000);
  let options;
  const session = writeSession({ cookie(_name, _value, opts) { options = opts; } }, { accessToken: jwt(exp), refreshToken: jwt(exp) });
  assert.ok(options.maxAge <= 2 * day);
  assert.equal(readSession(cookieRequest({ ...session, expiresAt: Date.now() - 1 })), null);
  assert.equal(shouldRenewCookie({ ...session, cookieRenewedAt: undefined }), true);
});
