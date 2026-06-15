const { saveLead } = require("../services/lead.service");

const allowedLeadTypes = new Set(["restaurant", "rider", "contact"]);

function clean(value) {
  return String(value || "").trim();
}

function buildLead(body) {
  const type = clean(body.type).toLowerCase();

  return {
    type,
    name: clean(body.name),
    phone: clean(body.phone),
    email: "",
    area: clean(body.area),
    businessName: clean(body.businessName),
    cuisineType: clean(body.cuisineType),
    vehicleType: clean(body.vehicleType),
    message: clean(body.message),
    source: "foodbela.com",
    landingPage: clean(body.landingPage),
    referrer: clean(body.referrer),
    language: clean(body.language) || "bn",
    visitorId: clean(body.visitorId),
    sessionId: clean(body.sessionId),
  };
}

function validateLead(lead) {
  const errors = {};

  if (!allowedLeadTypes.has(lead.type)) {
    errors.type = "Choose a valid request type.";
  }

  if (!lead.name || lead.name.length < 2) {
    errors.name = "Enter your name.";
  }

  if (!/^(\+?88)?01[3-9]\d{8}$/.test(lead.phone.replace(/\s+/g, ""))) {
    errors.phone = "Enter a valid Bangladesh phone number.";
  }

  if (lead.type !== "contact" && !lead.area) {
    errors.area = "Enter your city or area.";
  }

  if (lead.type === "restaurant" && !lead.businessName) {
    errors.businessName = "Enter the restaurant name.";
  }

  if (lead.type === "rider" && !lead.vehicleType) {
    errors.vehicleType = "Choose a vehicle type.";
  }

  return errors;
}

async function createLead(req, res, next) {
  try {
    const lead = buildLead(req.body);
    const errors = validateLead(lead);

    if (Object.keys(errors).length > 0) {
      return res.status(422).json({
        ok: false,
        message: "Please check the highlighted fields.",
        errors,
      });
    }

    const savedLead = await saveLead({
      ...lead,
      userAgent: req.get("user-agent") || "",
      ipAddress: req.ip,
    });

    return res.status(201).json({
      ok: true,
      leadId: savedLead.id,
      message: "Thanks. The Foodbela team will contact you soon.",
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createLead,
};
