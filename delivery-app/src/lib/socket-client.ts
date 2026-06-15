import { io, type Socket } from "socket.io-client";

import { resolveSocketUrl } from "@/src/config/api";

let riderSocket: Socket | null = null;
let riderSocketAuthToken = "";

export function getRiderSocket() {
  if (!riderSocket) {
    riderSocket = io(resolveSocketUrl(), {
      autoConnect: false,
      transports: ["websocket"],
      withCredentials: true,
    });
  }

  return riderSocket;
}

export function connectRiderSocket(riderId: string, accessToken: string) {
  const socket = getRiderSocket();
  const nextToken = accessToken.trim();

  if (!riderId || !nextToken) {
    disconnectRiderSocket();
    return socket;
  }

  if (riderSocketAuthToken !== nextToken && socket.connected) {
    socket.disconnect();
  }

  riderSocketAuthToken = nextToken;
  socket.auth = { token: nextToken };

  if (!socket.connected) {
    socket.connect();
  }

  socket.emit("rider:join", riderId);
  return socket;
}

export function disconnectRiderSocket() {
  if (riderSocket?.connected) {
    riderSocket.disconnect();
  }
  riderSocketAuthToken = "";
  if (riderSocket) {
    riderSocket.auth = {};
  }
}
