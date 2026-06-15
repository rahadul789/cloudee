import type { Server as HttpServer } from "node:http"
import type { Socket } from "socket.io"
import { Server } from "socket.io"

import { isAccessSessionActive } from "../modules/auth/session-control.service"
import { verifyAccessToken } from "../modules/auth/auth.utils"
import { env } from "./env"
import { logger } from "./logger"

let ioInstance: Server | null = null

type SocketAuthData = {
  user?: {
    id: string
    role: string
  }
  connectedAt?: string
}

export type SocketConnectionSnapshot = {
  id: string
  userId: string
  role: string
  connectedAt: string | null
  rooms: string[]
  transport: string
  ipAddress: string
  userAgent: string
}

function getSocketAccessToken(socket: Socket) {
  const authToken = socket.handshake.auth?.token
  if (typeof authToken === "string" && authToken.trim()) {
    return authToken.trim()
  }

  const authorizationHeader = socket.handshake.headers.authorization
  if (typeof authorizationHeader === "string" && authorizationHeader.startsWith("Bearer ")) {
    return authorizationHeader.slice("Bearer ".length).trim()
  }

  return ""
}

function isAdminSocket(socket: Socket) {
  return (socket.data as SocketAuthData).user?.role === "admin"
}

function canJoinUserRoom(socket: Socket, role: string, userId: string) {
  const user = (socket.data as SocketAuthData).user
  return Boolean(userId && user?.role === role && user.id === userId)
}

function getHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? ""
  return typeof value === "string" ? value : ""
}

function getSocketIpAddress(socket: Socket) {
  const forwardedFor = getHeaderValue(socket.handshake.headers["x-forwarded-for"])
  const forwardedAddress = forwardedFor.split(",")[0]?.trim()
  return forwardedAddress || socket.handshake.address || ""
}

function getSocketConnectedAt(socket: Socket) {
  const socketData = socket.data as SocketAuthData
  if (socketData.connectedAt) return socketData.connectedAt

  const handshakeTime = socket.handshake.time ? new Date(socket.handshake.time) : null
  if (handshakeTime && !Number.isNaN(handshakeTime.getTime())) {
    return handshakeTime.toISOString()
  }

  return null
}

function serializeSocketConnection(socket: Socket): SocketConnectionSnapshot {
  const socketData = socket.data as SocketAuthData
  const user = socketData.user
  const role = user?.role ?? "anonymous"

  return {
    id: socket.id,
    userId: user?.id ?? "",
    role,
    connectedAt: getSocketConnectedAt(socket),
    rooms: Array.from(socket.rooms).filter((room) => room !== socket.id).sort(),
    transport: socket.conn.transport.name,
    ipAddress: getSocketIpAddress(socket),
    userAgent: getHeaderValue(socket.handshake.headers["user-agent"])
  }
}

export function createSocketServer(server: HttpServer) {
  const io = new Server(server, {
    cors: {
      origin: [
        env.CLIENT_ORIGIN,
        env.ADMIN_PANEL_ORIGIN,
        env.CUSTOMER_APP,
        env.DELIVERY_APP,
        env.RESTAURANT_APP
      ],
      credentials: true
    }
  })

  io.use(async (socket, next) => {
    const accessToken = getSocketAccessToken(socket)

    if (!accessToken) {
      return next(new Error("Socket access token is required"))
    }

    try {
      const payload = verifyAccessToken(accessToken)
      const isSessionActive = await isAccessSessionActive(payload)
      if (!isSessionActive) {
        return next(new Error("Socket session is not active"))
      }

      const socketData = socket.data as SocketAuthData
      socketData.user = {
        id: payload.sub,
        role: payload.role
      }
      return next()
    } catch {
      return next(new Error("Invalid socket access token"))
    }
  })

  io.on("connection", (socket) => {
    const socketData = socket.data as SocketAuthData
    socketData.connectedAt = socketData.connectedAt ?? new Date().toISOString()

    socket.on("admin:join", (scope: string) => {
      if (!isAdminSocket(socket)) return
      if (scope) socket.join(`admin:${scope}`)
    })

    socket.on("admin:leave", (scope: string) => {
      if (!isAdminSocket(socket)) return
      if (scope) socket.leave(`admin:${scope}`)
    })

    socket.on("owner:join", (ownerId: string) => {
      const user = (socket.data as SocketAuthData).user
      if (user?.role !== "owner" || user.id !== ownerId) return
      socket.join(`owner:${ownerId}`)
    })

    socket.on("restaurant:join", (restaurantId: string) => {
      if (isAdminSocket(socket) && restaurantId) {
        socket.join(`restaurant:${restaurantId}`)
      }
    })

    socket.on("customer:join", (customerId: string) => {
      if (canJoinUserRoom(socket, "customer", customerId)) {
        socket.join(`customer:${customerId}`)
      }
    })

    socket.on("rider:join", (riderId: string) => {
      if (canJoinUserRoom(socket, "rider", riderId)) {
        socket.join(`rider:${riderId}`)
      }
    })

    socket.on(
      "admin:support-typing",
      (payload: { customerId?: string; caseId?: string; isTyping?: boolean; adminName?: string }) => {
        if (!isAdminSocket(socket)) {
          return
        }
        if (!payload?.customerId || !payload?.caseId) {
          return
        }

        io.to(`customer:${payload.customerId}`).emit("customer.support.typing", {
          caseId: payload.caseId,
          isTyping: Boolean(payload.isTyping),
          adminName: payload.adminName ?? "Support team"
        })
      }
    )
  })

  ioInstance = io

  return io
}

export function emitSocketEvent(channel: string, eventName: string, payload: unknown) {
  if (!ioInstance) {
    logger.warn(
      {
        channel,
        eventName
      },
      "Socket server not initialized. Event emission skipped."
    )
    return
  }

  ioInstance.to(channel).emit(eventName, payload)
}

export function hasActiveSocketChannel(channel: string) {
  if (!ioInstance) {
    return false
  }

  const room = ioInstance.sockets.adapter.rooms.get(channel)
  return Boolean(room && room.size > 0)
}

export function getSocketConnectionSnapshot() {
  const connections = ioInstance
    ? Array.from(ioInstance.sockets.sockets.values()).map(serializeSocketConnection)
    : []
  const byRole = connections.reduce<Record<string, number>>((summary, connection) => {
    summary[connection.role] = (summary[connection.role] ?? 0) + 1
    return summary
  }, {})
  const roomCounts = connections.reduce<Record<string, number>>((summary, connection) => {
    connection.rooms.forEach((room) => {
      summary[room] = (summary[room] ?? 0) + 1
    })
    return summary
  }, {})

  return {
    initialized: Boolean(ioInstance),
    totalConnections: connections.length,
    authenticatedConnections: connections.filter((connection) => connection.userId).length,
    anonymousConnections: connections.filter((connection) => !connection.userId).length,
    adminConnections: byRole.admin ?? 0,
    ownerConnections: byRole.owner ?? 0,
    customerConnections: byRole.customer ?? 0,
    riderConnections: byRole.rider ?? 0,
    byRole,
    roomCounts,
    connections: connections.sort((left, right) => {
      const leftTime = left.connectedAt ? new Date(left.connectedAt).getTime() : 0
      const rightTime = right.connectedAt ? new Date(right.connectedAt).getTime() : 0
      return rightTime - leftTime
    })
  }
}
