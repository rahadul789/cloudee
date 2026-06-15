const express = require("express");
const { createAnalyticsEvent } = require("../controllers/analytics.controller");

const router = express.Router();

router.post("/events", createAnalyticsEvent);

module.exports = router;
