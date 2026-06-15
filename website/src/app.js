require("dotenv").config();

const compression = require("compression");
const express = require("express");
const helmet = require("helmet");
const path = require("path");

const pageRoutes = require("./routes/page.routes");
const leadRoutes = require("./routes/lead.routes");
const analyticsRoutes = require("./routes/analytics.routes");
const { site } = require("./data/site");
const { buildPageSeo } = require("./services/seo.service");
const { getWebsiteSettings } = require("./services/website-api.service");

const app = express();
const isProduction = process.env.NODE_ENV === "production";

app.set("trust proxy", 1);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("view cache", isProduction);

app.use(
  helmet({
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: [
          "'self'",
          "data:",
          "https://res.cloudinary.com",
          "https://cdn-icons-png.flaticon.com",
          "https://images.unsplash.com",
          "https://api.qrserver.com",
        ],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        frameSrc: ["'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com"],
      },
    },
  }),
);
app.use(compression());
app.use(express.urlencoded({ extended: false, limit: "30kb" }));
app.use(express.json({ limit: "30kb" }));

app.use(
  express.static(path.join(__dirname, "..", "public"), {
    etag: true,
    immutable: isProduction,
    maxAge: isProduction ? "30d" : 0,
  }),
);

app.use(async (req, res, next) => {
  res.locals.site = site;
  res.locals.websiteSettings = await getWebsiteSettings();
  res.locals.currentYear = new Date().getFullYear();
  res.locals.activePath = req.path;
  next();
});

app.use("/", pageRoutes);
app.use("/leads", leadRoutes);
app.use("/analytics", analyticsRoutes);

app.use((req, res) => {
  const seo = buildPageSeo(req, res.locals.websiteSettings, "home", {
    title: "Page not found | Foodbela",
    description: "The page you are looking for could not be found.",
    canonicalPath: req.path,
    noindex: true,
  });
  res.status(404).render("pages/not-found", {
    title: seo.title,
    description: seo.description,
    seo,
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  console.error(err);
  if (req.accepts("json") && !req.accepts("html")) {
    return res.status(err.statusCode || 500).json({
      ok: false,
      code: err.code || "SERVER_ERROR",
      message: err.message || "Foodbela could not complete this request.",
      ...(err.errors ? { errors: err.errors } : {}),
    });
  }

  const seo = buildPageSeo(req, res.locals.websiteSettings, "home", {
    title: "Something went wrong | Foodbela",
    description: "Foodbela could not complete this request.",
    canonicalPath: req.path,
    noindex: true,
  });

  res.status(err.statusCode || 500).render("pages/error", {
    title: seo.title,
    description: seo.description,
    seo,
  });
});

module.exports = app;
