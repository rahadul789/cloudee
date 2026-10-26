const crypto = require("node:crypto");
const { getBackendApiBaseUrl } = require("./website-api.service");
const { readSession, writeSession, clearSession } = require("./customer-session.service");
const refreshes = new Map();

async function backendRequest(path, { method = "GET", body, accessToken, userAgent, clientIp } = {}) {
  let response;
  try {
    response = await fetch(`${getBackendApiBaseUrl()}${path}`, {
      method, redirect: "error", signal: AbortSignal.timeout(20000),
      headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...(userAgent ? { "user-agent": userAgent } : {}),
        ...(clientIp ? { "x-forwarded-for": clientIp } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw Object.assign(new Error("সার্ভারের সঙ্গে যোগাযোগ করা যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।"), { statusCode: 503 });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.message || "অনুরোধটি সম্পন্ন হয়নি।"), {
    statusCode: response.status, code: payload.code, errors: payload.errors,
  });
  return payload.data;
}
async function refreshSession(session, req) {
  const id = crypto.createHash("sha256").update(session.refreshToken).digest("hex");
  if (!refreshes.has(id)) {
    const promise = backendRequest("/customer/auth/refresh", { method: "POST", body: { refreshToken: session.refreshToken }, clientIp: req.ip, userAgent: req.headers["user-agent"] });
    refreshes.set(id, promise);
    // Single-flight rotation for concurrent requests from the same browser.
    const timer = setTimeout(() => refreshes.delete(id), 10000);
    timer.unref();
  }
  return refreshes.get(id);
}
async function customerRequest(req, res, path, options = {}) {
  let session = req.customerSession || readSession(req);
  if (session) {
    // Public endpoints silently ignore expired JWTs; renew before sending them too.
    let expires = 0;
    try { expires = JSON.parse(Buffer.from(session.accessToken.split(".")[1], "base64url").toString()).exp * 1000; } catch { /* Backend still verifies. */ }
    if (expires && expires < Date.now() + 30000) {
      try { session = writeSession(res, await refreshSession(session, req)); }
      catch (error) {
        if (error.statusCode === 401 || error.statusCode === 403) { clearSession(res); session = null; }
        else throw error;
      }
    }
  }
  req.customerSession = session;
  if (options.protected && !session) throw Object.assign(new Error("অর্ডার করতে লগইন করুন।"), { statusCode: 401 });
  const requestOptions = { ...options, accessToken: session?.accessToken, userAgent: req.headers["user-agent"], clientIp: req.ip };
  try { return await backendRequest(path, requestOptions); }
  catch (error) {
    if (error.statusCode !== 401 || !session) throw error;
    let next;
    try { next = await refreshSession(session, req); }
    catch (refreshError) {
      if (refreshError.statusCode === 401 || refreshError.statusCode === 403) clearSession(res);
      throw refreshError;
    }
    req.customerSession = writeSession(res, next);
    return backendRequest(path, { ...requestOptions, accessToken: next.accessToken });
  }
}
module.exports = { backendRequest, customerRequest };
