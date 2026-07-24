import { io, type Socket } from "socket.io-client";

import { getSocketBaseUrl } from "@/src/config/api";

let ownerSocket: Socket | null = null;
let ownerSocketAuthToken = "";

export function getOwnerSocket() {
  if (!ownerSocket) {
    ownerSocket = io(getSocketBaseUrl(), {
      autoConnect: false,
      withCredentials: true,
    });
  }

  return ownerSocket;
}

export function connectOwnerSocket(ownerId: string, accessToken: string) {
  const socket = getOwnerSocket();
  const nextToken = accessToken.trim();

  if (!ownerId || !nextToken) {
    disconnectOwnerSocket();
    return socket;
  }

  if (ownerSocketAuthToken !== nextToken && socket.connected) {
    socket.disconnect();
  }

  ownerSocketAuthToken = nextToken;
  socket.auth = { token: nextToken };

  if (!socket.connected) {
    socket.connect();
  }

  socket.emit("owner:join", ownerId);
  return socket;
}

export function disconnectOwnerSocket() {
  if (ownerSocket?.connected) {
    ownerSocket.disconnect();
  }
  ownerSocketAuthToken = "";
  if (ownerSocket) {
    ownerSocket.auth = {};
  }
}
