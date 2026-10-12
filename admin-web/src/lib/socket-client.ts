import { io, type Socket } from "socket.io-client"

import { getApiBaseUrl } from "@/lib/api"
import { getAdminAccessToken } from "@/lib/admin-session"

function resolveSocketUrl() {
  const apiBaseUrl = getApiBaseUrl().replace(/\/$/, "")
  if (apiBaseUrl.includes("/api/v1")) {
    return apiBaseUrl.replace(/\/api\/v1\/?$/, "")
  }
  return apiBaseUrl
}

let adminSocket: Socket | null = null
// Socket.IO rooms are lost on every reconnect, including token refreshes.
const desiredScopes = new Set<string>(["ops"])

function syncSocketAuth(socket: Socket) {
  socket.auth = {
    token: getAdminAccessToken() ?? "",
  }
}

export function getAdminSocket() {
  if (!adminSocket) {
    adminSocket = io(resolveSocketUrl(), {
      autoConnect: false,
      transports: ["websocket"],
      withCredentials: true,
    })
    adminSocket.on("connect", () => {
      for (const scope of desiredScopes) adminSocket?.emit("admin:join", scope)
    })
  }

  return adminSocket
}

export function connectAdminSocket() {
  const socket = getAdminSocket()
  syncSocketAuth(socket)
  if (!getAdminAccessToken()) return socket
  if (!socket.connected) socket.connect()
  socket.emit("admin:join", "ops")
  return socket
}

export function joinAdminSocketScope(scope: string) {
  if (scope) desiredScopes.add(scope)
  const socket = getAdminSocket()
  syncSocketAuth(socket)
  if (!getAdminAccessToken()) return socket
  if (!socket.connected) socket.connect()
  if (scope) socket.emit("admin:join", scope)
  return socket
}

export function leaveAdminSocketScope(scope: string) {
  desiredScopes.delete(scope)
  const socket = getAdminSocket()
  if (scope) socket.emit("admin:leave", scope)
}

export function disconnectAdminSocket() {
  if (adminSocket?.connected) adminSocket.disconnect()
  if (adminSocket) {
    adminSocket.auth = {}
  }
}
