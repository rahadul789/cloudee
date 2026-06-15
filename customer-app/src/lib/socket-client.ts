import { io, type Socket } from "socket.io-client";

import { API_BASE_URL } from "@/src/config/runtime";

function resolveSocketUrl() {
  if (API_BASE_URL.includes("/api/v1")) {
    return API_BASE_URL.replace(/\/api\/v1\/?$/, "");
  }

  return API_BASE_URL;
}

let customerSocket: Socket | null = null;
let customerSocketAuthToken = "";

export function getCustomerSocket() {
  if (!customerSocket) {
    customerSocket = io(resolveSocketUrl(), {
      autoConnect: false,
      transports: ["websocket"],
      withCredentials: true,
    });
  }

  return customerSocket;
}

export function connectCustomerSocket(customerId: string, accessToken: string) {
  const socket = getCustomerSocket();
  const nextToken = accessToken.trim();

  if (!customerId || !nextToken) {
    disconnectCustomerSocket();
    return socket;
  }

  if (customerSocketAuthToken !== nextToken && socket.connected) {
    socket.disconnect();
  }

  customerSocketAuthToken = nextToken;
  socket.auth = { token: nextToken };

  if (!socket.connected) {
    socket.connect();
  }

  socket.emit("customer:join", customerId);
  return socket;
}

export function disconnectCustomerSocket() {
  if (customerSocket?.connected) {
    customerSocket.disconnect();
  }
  customerSocketAuthToken = "";
  if (customerSocket) {
    customerSocket.auth = {};
  }
}
