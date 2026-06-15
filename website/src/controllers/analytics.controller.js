const { sendWebsiteAnalyticsEvent } = require("../services/website-api.service");

function clean(value, fallback = "") {
  return String(value || fallback).trim();
}

async function createAnalyticsEvent(req, res) {
  const payload = {
    eventName: clean(req.body.eventName, "event"),
    pagePath: clean(req.body.pagePath, "/"),
    visitorId: clean(req.body.visitorId),
    sessionId: clean(req.body.sessionId),
    language: clean(req.body.language, "bn"),
    referrer: clean(req.body.referrer),
    source: "foodbela.com",
    metadata:
      typeof req.body.metadata === "object" && req.body.metadata !== null
        ? req.body.metadata
        : {},
  };

  if (!payload.visitorId || !payload.sessionId) {
    return res.status(202).json({ ok: true, skipped: true });
  }

  try {
    await sendWebsiteAnalyticsEvent({
      ...payload,
      userAgent: req.get("user-agent") || "",
      ipAddress: req.ip,
    });
  } catch {
    return res.status(202).json({ ok: true, queued: false });
  }

  return res.status(201).json({ ok: true });
}

module.exports = {
  createAnalyticsEvent,
};
