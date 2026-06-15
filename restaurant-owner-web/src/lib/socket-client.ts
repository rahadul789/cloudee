import { io, type Socket } from "socket.io-client"

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:5000/api/v1"

function resolveSocketUrl() {
  if (API_BASE_URL.includes("/api/v1")) {
    return API_BASE_URL.replace(/\/api\/v1\/?$/, "")
  }
  return API_BASE_URL
}

let ownerSocket: Socket | null = null
let ownerSocketAuthToken = ""

export function getOwnerSocket() {
  if (!ownerSocket) {
    ownerSocket = io(resolveSocketUrl(), {
      autoConnect: false,
      transports: ["websocket"],
      withCredentials: true,
    })
  }

  return ownerSocket
}

export function connectOwnerSocket(ownerId: string, accessToken: string) {
  const socket = getOwnerSocket()
  const nextToken = accessToken.trim()

  if (!ownerId || !nextToken) {
    disconnectOwnerSocket()
    return socket
  }

  if (ownerSocketAuthToken !== nextToken && socket.connected) {
    socket.disconnect()
  }

  ownerSocketAuthToken = nextToken
  socket.auth = { token: nextToken }

  if (!socket.connected) {
    socket.connect()
  }

  socket.emit("owner:join", ownerId)
  return socket
}

export function disconnectOwnerSocket() {
  if (ownerSocket?.connected) {
    ownerSocket.disconnect()
  }
  ownerSocketAuthToken = ""
  if (ownerSocket) {
    ownerSocket.auth = {}
  }
}
