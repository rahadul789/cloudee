const crypto = require("crypto");
const { getBackendApiBaseUrl, postBackend } = require("./website-api.service");

async function forwardLead(lead) {
  const endpoint = process.env.BACKEND_LEADS_API_URL;

  if (!endpoint) {
    const payload = await postBackend("/website/leads", lead);
    return { forwarded: true, remoteId: payload.data?.id };
  }

  const headers = {
    "content-type": "application/json",
  };

  if (process.env.BACKEND_API_TOKEN) {
    headers.authorization = `Bearer ${process.env.BACKEND_API_TOKEN}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(lead),
  });

  if (!response.ok) {
    throw new Error(`Lead forwarding failed with status ${response.status}`);
  }

  const payload = await response.json().catch(() => ({}));
  return { forwarded: true, remoteId: payload.data?.id };
}

async function saveLead(payload) {
  const lead = {
    id: crypto.randomUUID(),
    status: "new",
    createdAt: new Date().toISOString(),
    ...payload,
  };

  try {
    const result = await forwardLead(lead);

    if (result.forwarded) {
      return { ...lead, id: result.remoteId || lead.id };
    }
  } catch (error) {
    if (error.statusCode && error.statusCode < 500) {
      throw error;
    }

    const submitError = new Error(
      "Foodbela server connection is unavailable. Please try again in a moment.",
    );
    submitError.statusCode = 503;
    submitError.code = "BACKEND_UNAVAILABLE";
    submitError.cause = error;
    throw submitError;
  }

  const submitError = new Error(
    "Foodbela server connection is unavailable. Please try again in a moment.",
  );
  submitError.statusCode = 503;
  submitError.code = "BACKEND_UNAVAILABLE";
  throw submitError;
}

module.exports = {
  saveLead,
};
