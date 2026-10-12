import { createServer } from "node:http";
import type { Server } from "socket.io";
import { createSocketServer, emitSocketEvent } from "../src/config/socket";
import * as auth from "../src/modules/auth/auth.utils";
import * as sessions from "../src/modules/auth/session-control.service";

// ws is the Socket.IO server's existing transport dependency. Exercise the actual
// Engine.IO/Socket.IO wire protocol without adding a separate client dependency.
const WebSocket = require("ws");

describe("tracking socket delivery", () => {
  let http: ReturnType<typeof createServer>;
  let io: Server;
  let baseUrl: string;
  const clients: any[] = [];

  beforeEach(async () => {
    jest.spyOn(auth, "verifyAccessToken").mockImplementation((token) => ({
      sub: token === "admin-test" ? "admin-1" : "customer-1",
      role: token === "admin-test" ? "admin" : "customer",
    } as any));
    jest.spyOn(sessions, "isAccessSessionActive").mockResolvedValue(true);
    http = createServer();
    io = createSocketServer(http);
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    const address = http.address() as { port: number };
    baseUrl = `ws://127.0.0.1:${address.port}/socket.io/?EIO=4&transport=websocket`;
  });

  afterEach(async () => {
    clients.splice(0).forEach((client) => client.terminate());
    await new Promise<void>((resolve) => io.close(() => resolve()));
    jest.restoreAllMocks();
  });

  async function connect(token: string) {
    const client = new WebSocket(baseUrl);
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      client.on("error", reject);
      client.on("message", (buffer: Buffer) => {
        const packet = buffer.toString();
        if (packet.startsWith("0")) client.send(`40${JSON.stringify({ token })}`);
        if (packet.startsWith("40")) resolve();
      });
    });
    return client;
  }

  async function join(client: any, event: string, room: string, expectedRoom: string) {
    // The connection is real; wait until its requested room is actually joined.
    const serverSocket = [...io.sockets.sockets.values()].find((socket) =>
      socket.data.user?.role === (event.startsWith("admin") ? "admin" : "customer"))!;
    client.send(`42${JSON.stringify([event, room])}`);
    for (let i = 0; i < 40 && !serverSocket.rooms.has(expectedRoom); i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(serverSocket.rooms.has(expectedRoom)).toBe(true);
  }

  function receive(client: any, event: string) {
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Missing ${event}`)), 2_000);
      client.on("message", (buffer: Buffer) => {
        const packet = buffer.toString();
        if (!packet.startsWith("42")) return;
        const [name, payload] = JSON.parse(packet.slice(2));
        if (name === event) { clearTimeout(timer); resolve(payload); }
      });
    });
  }

  it("delivers live-map signals to admins and order locations to the correct customer", async () => {
    const admin = await connect("admin-test");
    const customer = await connect("customer-test");
    await join(admin, "admin:join", "live-map", "admin:live-map");
    await join(customer, "customer:join", "customer-1", "customer:customer-1");
    const adminEvent = receive(admin, "admin.live-map.updated");
    const customerEvent = receive(customer, "customer.order.updated");
    emitSocketEvent("admin:live-map", "admin.live-map.updated", { type: "rider.location", riderId: "rider-1" });
    emitSocketEvent("customer:customer-1", "customer.order.updated", {
      _id: "order-1", riderTracking: { currentLocation: { latitude: 23.8, longitude: 90.4 } },
    });
    expect(await adminEvent).toMatchObject({ riderId: "rider-1" });
    expect(await customerEvent).toMatchObject({ riderTracking: { currentLocation: { latitude: 23.8 } } });
    const customerSocket = [...io.sockets.sockets.values()].find((socket) => socket.data.user?.role === "customer")!;
    customer.send('42["admin:join","live-map"]');
    customer.send('42["customer:join","someone-else"]');
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(customerSocket.rooms.has("admin:live-map")).toBe(false);
    expect(customerSocket.rooms.has("customer:someone-else")).toBe(false);
  });

  it("recovers the legacy customer's own room without an explicit join event", async () => {
    const customer = await connect("customer-test");
    const event = receive(customer, "customer.order.updated");
    emitSocketEvent("customer:customer-1", "customer.order.updated", { _id: "recovered-order" });
    expect(await event).toMatchObject({ _id: "recovered-order" });
  });
});
