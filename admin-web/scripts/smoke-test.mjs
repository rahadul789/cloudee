import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()

function read(path) {
  return readFileSync(join(root, path), "utf8")
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const app = read("src/App.tsx")
const api = read("src/lib/api.ts")
const session = read("src/lib/admin-session.ts")
const socket = read("src/lib/socket-client.ts")
const socketHook = read("src/hooks/use-admin-socket.ts")
const packageJson = JSON.parse(read("package.json"))

assert(
  app.includes("VITE_ENABLE_ADMIN_BOOTSTRAP"),
  "Bootstrap button must be protected by a Vite env flag."
)
assert(
  app.includes("ADMIN_SESSION_EXPIRED_EVENT"),
  "Admin auth provider must listen for session-expired events."
)
assert(
  api.includes("refreshSessionPromise"),
  "API client must single-flight concurrent refresh attempts."
)
assert(
  api.includes('credentials: "include"'),
  "API client must include httpOnly auth cookies."
)
assert(
  !session.includes("localStorage.setItem(REFRESH_TOKEN_KEY"),
  "Refresh token must not be stored in localStorage."
)
assert(
  socket.includes("getAdminAccessToken") && socket.includes("socket.auth"),
  "Admin socket must send the access token in the handshake auth payload."
)
assert(
  socketHook.includes("ADMIN_ACCESS_TOKEN_UPDATED_EVENT"),
  "Socket bridge must reconnect after access-token refresh."
)
assert(
  !packageJson.dependencies?.shadcn,
  "shadcn CLI must not be a production dependency."
)

console.log("admin-web smoke checks passed")
