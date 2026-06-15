require("dotenv").config()

const assert = require("node:assert/strict")
const request = require("supertest")

const API_PREFIX = process.env.API_PREFIX || "/api/v1"
const BASE_URL = process.env.SMOKE_BASE_URL?.replace(/\/$/, "")
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || process.env.ADMIN_BOOTSTRAP_EMAIL
const ADMIN_PASSWORD =
  process.env.SMOKE_ADMIN_PASSWORD || process.env.ADMIN_BOOTSTRAP_PASSWORD

async function requestJson(path, options = {}) {
  if (BASE_URL) {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    })
    const payload = await response.json().catch(() => ({}))
    return { status: response.status, body: payload }
  }

  const { createApp } = require("../dist/app.js")
  const app = createApp()
  const method = (options.method || "GET").toLowerCase()
  let agent = request(app)[method](path)

  Object.entries(options.headers || {}).forEach(([key, value]) => {
    agent = agent.set(key, value)
  })
  if (options.body) {
    agent = agent.send(JSON.parse(options.body))
  }
  return agent
}

async function checkHealth() {
  const response = await requestJson(`${API_PREFIX}/health`)

  assert.equal(response.status, 200)
  assert.equal(response.body.success, true)
  assert.equal(response.body.data.status, "ok")
  console.log("✓ health endpoint")
}

async function checkReadiness() {
  const response = await requestJson(`${API_PREFIX}/health/ready`)

  assert.ok([200, 503].includes(response.status))
  assert.equal(response.body.success, true)
  assert.ok(["ready", "not_ready"].includes(response.body.data.status))
  console.log(`✓ readiness endpoint (${response.body.data.status})`)
}

async function signinAdmin() {
  if (!BASE_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log("↷ admin signin skipped (set SMOKE_BASE_URL + admin credentials)")
    return null
  }

  await requestJson(`${API_PREFIX}/admin/auth/bootstrap`, { method: "POST" })

  const response = await requestJson(`${API_PREFIX}/admin/auth/signin`, {
    method: "POST",
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }),
  })

  assert.equal(response.status, 200)
  assert.equal(response.body.success, true)
  assert.ok(response.body.data.accessToken)
  console.log("✓ admin signin")
  return response.body.data.accessToken
}

async function checkOperationsHealth(accessToken) {
  if (!accessToken) {
    console.log("↷ operations health skipped (admin token unavailable)")
    return
  }

  const response = await requestJson(`${API_PREFIX}/admin/operations/health`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  })

  assert.equal(response.status, 200)
  assert.equal(response.body.success, true)
  assert.ok(response.body.data.runtime)
  assert.ok(response.body.data.requestMonitor)
  console.log("✓ admin operations health")
}

async function run() {
  console.log(BASE_URL ? `Smoke target: ${BASE_URL}` : "Smoke target: in-process app")
  await checkHealth()
  await checkReadiness()
  const accessToken = await signinAdmin()
  await checkOperationsHealth(accessToken)
  console.log("smoke tests passed")
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
