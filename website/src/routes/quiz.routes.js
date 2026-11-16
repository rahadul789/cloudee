const express = require("express");
const { backendRequest } = require("../services/customer-api.service");
const { ensurePlayerKey } = require("../services/quiz-player.service");

// Friend quiz page: foodbela.com/q/:code — friends play here without installing the app.
// The link preview (Messenger / Facebook) is personalised: "রাকিবকে তুমি কতটা চেনো? 😏".
const router = express.Router();

function siteBase(res) {
  return String(res.locals.websiteSettings?.siteUrl || process.env.WEBSITE_PUBLIC_URL || "https://foodbela.com").replace(/\/+$/, "");
}

router.get("/q/:code", async (req, res, next) => {
  const code = String(req.params.code || "").toLowerCase();
  if (!/^[a-z0-9]{6,12}$/.test(code)) return next();
  try {
    const playerKey = ensurePlayerKey(req, res);
    let quiz = null;
    try {
      quiz = await backendRequest(`/website/quiz/${encodeURIComponent(code)}?playerKey=${encodeURIComponent(playerKey)}`, {
        clientIp: req.ip,
        userAgent: req.headers["user-agent"],
      });
    } catch (error) {
      if (error.statusCode !== 404) throw error;
    }
    const base = siteBase(res);
    const name = quiz?.ownerName || "";
    const title = quiz
      ? `${name}-কে তুমি কতটা চেনো? 😏`
      : "Quiz পাওয়া যায়নি | Foodbela";
    const description = quiz
      ? `${quiz.total}টা মজার খাবারের প্রশ্ন। খেলো, স্কোর দেখো — তুমি কি আসল দোস্ত? 🍕`
      : "এই quiz-এর লিংকটি আর নেই।";
    const settings = res.locals.websiteSettings || {};
    res.set("Cache-Control", "private, no-store");
    res.status(quiz ? 200 : 404).render("pages/quiz", {
      title,
      description,
      quiz,
      code,
      canonicalUrl: `${base}/q/${code}`,
      ogImageUrl: `${base}/images/quiz-og.png`,
      playStoreUrl: settings.playStoreUrl || settings.appDownloadUrl || "/download",
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
