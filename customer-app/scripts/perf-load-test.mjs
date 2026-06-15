import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { io } from "socket.io-client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultDataFile = path.resolve(__dirname, "../../backend/.perf-load-data.json");

function integerFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(baseMs, spread = 0.35) {
  const min = baseMs * (1 - spread);
  const max = baseMs * (1 + spread);
  return Math.round(min + Math.random() * (max - min));
}

function percentile(values, pct) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return Math.round(sorted[index]);
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function inferSocketUrl(apiBaseUrl) {
  const url = new URL(apiBaseUrl);
  url.pathname = url.pathname.replace(/\/api\/v\d+\/?$/, "").replace(/\/api\/?$/, "");
  return url.toString().replace(/\/+$/, "");
}

const AUTH_REFRESH_BUFFER_MS = 2 * 60 * 1000;

function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function getTokenExpiresAtMs(token) {
  const payload = decodeJwtPayload(token);
  const exp = Number(payload?.exp ?? 0);
  return Number.isFinite(exp) && exp > 0 ? exp * 1000 : 0;
}

function getActorAccessToken(actor) {
  return actor.accessToken ?? actor.token ?? "";
}

function setActorAuth(actor, nextAuth) {
  actor.token = nextAuth.accessToken;
  actor.accessToken = nextAuth.accessToken;
  actor.refreshToken = nextAuth.refreshToken ?? actor.refreshToken ?? "";
  actor.accessTokenExpiresAtMs = getTokenExpiresAtMs(nextAuth.accessToken);

  if (actor.socket) {
    actor.socket.auth = { token: nextAuth.accessToken };
  }
}

function hydrateActorAuth(actor, kind) {
  const accessToken = getActorAccessToken(actor);
  return {
    ...actor,
    kind,
    token: accessToken,
    accessToken,
    refreshToken: actor.refreshToken ?? "",
    accessTokenExpiresAtMs: getTokenExpiresAtMs(accessToken),
    refreshInFlight: null,
    socket: null,
  };
}

function getRefreshRoute(kind) {
  if (kind === "customer") return "/customer/auth/refresh";
  if (kind === "rider") return "/rider/auth/refresh";
  if (kind === "owner") return "/auth/owner/refresh";
  if (kind === "admin") return "/admin/auth/refresh";
  throw new Error(`Unsupported auth kind: ${kind}`);
}

function createStats() {
  return {
    startedAt: Date.now(),
    requests: 0,
    failed: 0,
    latencies: [],
    byName: new Map(),
    statuses: new Map(),
    errors: [],
    sockets: {
      attempted: 0,
      connected: 0,
      disconnected: 0,
      connectErrors: 0,
      events: 0,
    },
  };
}

function getNameStats(stats, name) {
  if (!stats.byName.has(name)) {
    stats.byName.set(name, {
      count: 0,
      failed: 0,
      latencies: [],
    });
  }
  return stats.byName.get(name);
}

function recordRequest(stats, name, status, durationMs, error) {
  const ok = status >= 200 && status < 400 && !error;
  stats.requests += 1;
  stats.latencies.push(durationMs);
  stats.statuses.set(status || "ERR", (stats.statuses.get(status || "ERR") ?? 0) + 1);

  const row = getNameStats(stats, name);
  row.count += 1;
  row.latencies.push(durationMs);

  if (!ok) {
    stats.failed += 1;
    row.failed += 1;
    if (stats.errors.length < 12) {
      stats.errors.push({
        name,
        status: status || "ERR",
        error: error ? String(error.message ?? error) : "non-2xx response",
      });
    }
  }
}

async function executeRequest(config, method, route, options = {}) {
  const started = performance.now();
  let status = 0;
  let error = null;
  let responseData = null;

  try {
    const headers = {
      "content-type": "application/json",
      "user-agent": "foodbela-perf-test/1.0",
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    };

    const response = await fetch(`${config.apiBaseUrl}${route}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
    status = response.status;
    if (options.responseType === "json") {
      responseData = await response.json();
    } else {
      await response.arrayBuffer();
    }
  } catch (caught) {
    error = caught;
  }

  return {
    status,
    error,
    durationMs: Math.round(performance.now() - started),
    responseData,
  };
}

async function timedFetch(stats, config, name, method, route, options = {}) {
  const result = await executeRequest(config, method, route, options);
  recordRequest(stats, name, result.status, result.durationMs, result.error);
  return result;
}

async function refreshActorAuth(stats, config, actor, kind) {
  if (!actor.refreshToken) {
    return false;
  }

  if (actor.refreshInFlight) {
    return actor.refreshInFlight;
  }

  actor.refreshInFlight = (async () => {
    const result = await executeRequest(config, "POST", getRefreshRoute(kind), {
      body: { refreshToken: actor.refreshToken },
      responseType: "json",
    });

    const payload = result.responseData?.data ?? result.responseData ?? {};
    const nextAccessToken = typeof payload.accessToken === "string" ? payload.accessToken : "";
    const payloadError =
      !result.error &&
      result.status >= 200 &&
      result.status < 300 &&
      !nextAccessToken
        ? new Error(`Refresh response for ${kind} did not include an access token`)
        : null;

    recordRequest(
      stats,
      `auth.${kind}_refresh`,
      result.status,
      result.durationMs,
      result.error ?? payloadError
    );

    if (result.error || payloadError || result.status < 200 || result.status >= 300) {
      return false;
    }

    if (!nextAccessToken) {
      return false;
    }

    setActorAuth(actor, {
      accessToken: nextAccessToken,
      refreshToken:
        typeof payload.refreshToken === "string" && payload.refreshToken
          ? payload.refreshToken
          : actor.refreshToken,
    });

    return true;
  })().finally(() => {
    actor.refreshInFlight = null;
  });

  return actor.refreshInFlight;
}

async function ensureFreshAccessToken(stats, config, actor) {
  if (!actor.refreshToken) {
    return false;
  }

  const expiresAtMs = Number(actor.accessTokenExpiresAtMs ?? 0);
  if (!expiresAtMs || Date.now() >= expiresAtMs - AUTH_REFRESH_BUFFER_MS) {
    return refreshActorAuth(stats, config, actor, actor.kind);
  }

  return true;
}

async function authenticatedFetch(stats, config, actor, name, method, route, options = {}) {
  await ensureFreshAccessToken(stats, config, actor);

  let result = await executeRequest(config, method, route, {
    ...options,
    token: actor.token,
  });

  if (result.status === 401 && actor.refreshToken) {
    const refreshed = await refreshActorAuth(stats, config, actor, actor.kind);
    if (refreshed) {
      result = await executeRequest(config, method, route, {
        ...options,
        token: actor.token,
      });
    }
  }

  recordRequest(stats, name, result.status, result.durationMs, result.error);
  return result;
}

function connectActorSocket(stats, config, actor, onConnect) {
  stats.sockets.attempted += 1;

  const socket = io(config.socketUrl, {
    auth: {
      token: getActorAccessToken(actor),
    },
    transports: config.socketTransports,
    timeout: config.socketTimeoutMs,
    reconnection: true,
    reconnectionAttempts: 3,
  });
  actor.socket = socket;

  socket.on("connect", () => {
    stats.sockets.connected += 1;
    onConnect(socket);
  });
  socket.on("disconnect", () => {
    stats.sockets.disconnected += 1;
  });
  socket.on("connect_error", () => {
    stats.sockets.connectErrors += 1;
  });

  return socket;
}

function attachCustomerSocketEvents(stats, socket) {
  socket.on("customer.order.updated", () => {
    stats.sockets.events += 1;
  });
  socket.on("customer.order.created", () => {
    stats.sockets.events += 1;
  });
  socket.on("customer.notification.created", () => {
    stats.sockets.events += 1;
  });
}

function attachRiderSocketEvents(stats, socket) {
  socket.on("rider.profile.updated", () => {
    stats.sockets.events += 1;
  });
  socket.on("rider.order.updated", () => {
    stats.sockets.events += 1;
  });
  socket.on("rider.assignment.updated", () => {
    stats.sockets.events += 1;
  });
}

function attachOwnerSocketEvents(stats, socket) {
  socket.on("order.updated", () => {
    stats.sockets.events += 1;
  });
  socket.on("notification.created", () => {
    stats.sockets.events += 1;
  });
}

function attachAdminSocketEvents(stats, socket) {
  socket.on("admin.notification.created", () => {
    stats.sockets.events += 1;
  });
  socket.on("admin.order.updated", () => {
    stats.sockets.events += 1;
  });
  socket.on("admin.live-map.updated", () => {
    stats.sockets.events += 1;
  });
}

async function customerJourney(stats, config, data, customer, index, deadline) {
  const sessionId = `perf-session-${Date.now()}-${index}`;
  let iteration = 0;

  while (Date.now() < deadline) {
    const step = iteration % 6;
    const latitude = data.restaurant.latitude + 0.004;
    const longitude = data.restaurant.longitude + 0.004;

    if (step === 0) {
      await timedFetch(
        stats,
        config,
        "customer.discovery_home",
        "GET",
        `/customer/discovery/home?latitude=${latitude}&longitude=${longitude}&radiusKm=8`
      );
    } else if (step === 1) {
      await timedFetch(
        stats,
        config,
        "customer.restaurant_list",
        "GET",
        `/customer/restaurants?latitude=${latitude}&longitude=${longitude}&radiusKm=8`
      );
    } else if (step === 2) {
      await timedFetch(
        stats,
        config,
        "customer.restaurant_details",
        "GET",
        `/customer/restaurants/${data.restaurant.id}?latitude=${latitude}&longitude=${longitude}`
      );
    } else if (step === 3) {
      await timedFetch(stats, config, "customer.cart_quote", "POST", "/customer/cart/quote", {
        body: {
          restaurantId: data.restaurant.id,
          latitude,
          longitude,
          items: [
            {
              itemId: data.restaurant.menuItemId,
              quantity: (index % 3) + 1,
            },
          ],
        },
      });
    } else if (step === 4) {
      await authenticatedFetch(
        stats,
        config,
        customer,
        "customer.live_orders",
        "GET",
        "/customer/orders?statusGroup=live&page=1&pageSize=10",
        {}
      );
    } else {
      await authenticatedFetch(
        stats,
        config,
        customer,
        "customer.analytics_page_view",
        "POST",
        "/customer/analytics/events",
        {
          body: {
            eventType: "page_view",
            anonymousId: `anon-${customer.id}`,
            sessionId,
            sourceApp: "customer-app",
            path: "/restaurants/perf-test-kitchen",
            screenName: "RestaurantDetails",
            entityType: "restaurant",
            entityId: data.restaurant.id,
            occurredAt: new Date().toISOString(),
            metadata: {
              perf: true,
              virtualUser: index,
            },
          },
        }
      );
    }

    iteration += 1;
    await sleep(jitter(config.customerThinkMs));
  }
}

async function riderJourney(stats, config, data, rider, index, deadline) {
  const orderIds = rider.orderIds.filter((orderId) => data.selectedOrderIds.has(orderId));
  let tick = 0;

  while (Date.now() < deadline) {
    const latitude =
      data.restaurant.latitude + 0.001 + Math.sin(tick / 10) * 0.002 + index * 0.00003;
    const longitude =
      data.restaurant.longitude + 0.001 + Math.cos(tick / 10) * 0.002 + index * 0.00003;
    const location = {
      latitude,
      longitude,
      heading: (tick * 18) % 360,
      accuracyMeters: 8,
      speedKmph: 16 + (tick % 5),
    };

    if (orderIds.length) {
      const orderId = orderIds[tick % orderIds.length];
      await authenticatedFetch(
        stats,
        config,
        rider,
        "rider.order_location",
        "POST",
        `/rider/orders/${orderId}/location`,
        { body: location }
      );
    } else {
      await authenticatedFetch(
        stats,
        config,
        rider,
        "rider.profile_location",
        "PATCH",
        "/rider/profile/location",
        { body: location }
      );
    }

    if (tick % 3 === 0) {
      await authenticatedFetch(
        stats,
        config,
        rider,
        "rider.active_orders",
        "GET",
        "/rider/orders?scope=active&page=1&pageSize=10",
        {}
      );
    }

    tick += 1;
    await sleep(jitter(config.riderLocationIntervalMs, 0.2));
  }
}

async function adminJourney(stats, config, data, admin, deadline) {
  let iteration = 0;
  const firstOrderId = data.orders?.[0]?.id;
  const firstCustomerId = data.customers?.[0]?.id;
  const lightSteps = [
    {
      name: "admin.notifications",
      method: "GET",
      route: "/admin/notifications?page=1&pageSize=10",
    },
    {
      name: "admin.operations_health",
      method: "GET",
      route: "/admin/operations/health",
    },
    {
      name: "admin.orders_monitor",
      method: "GET",
      route: "/admin/orders-monitor?scope=live",
    },
    {
      name: "admin.live_map",
      method: "GET",
      route: "/admin/live-map",
    },
    {
      name: "admin.sessions",
      method: "GET",
      route: "/admin/sessions?page=1&pageSize=10",
    },
    {
      name: "admin.support_cases",
      method: "GET",
      route: "/admin/support-cases?page=1&pageSize=10&sortBy=newest",
    },
    {
      name: "admin.settings",
      method: "GET",
      route: "/admin/settings",
    },
  ];
  const heavySteps = [
    {
      name: "admin.customer_analytics_overview",
      method: "GET",
      route: "/admin/customer-analytics/overview?preset=today",
    },
    {
      name: "admin.customer_analytics_funnels",
      method: "GET",
      route: "/admin/customer-analytics/funnels?preset=today",
    },
    {
      name: "admin.customer_analytics_customers",
      method: "GET",
      route: "/admin/customer-analytics/customers?preset=today",
    },
    {
      name: "admin.customer_analytics_payments",
      method: "GET",
      route: "/admin/customer-analytics/payments?preset=today",
    },
    {
      name: "admin.customer_analytics_actor_detail",
      method: "GET",
      route: firstCustomerId
        ? `/admin/customer-analytics/actor-detail?customerId=${firstCustomerId}&preset=today`
        : "/admin/customer-analytics/actor-detail?preset=today",
    },
  ];

  while (Date.now() < deadline) {
    const lightStep = lightSteps[iteration % lightSteps.length];
    await authenticatedFetch(
      stats,
      config,
      admin,
      lightStep.name,
      lightStep.method,
      lightStep.route,
      {}
    );

    if (iteration % 4 === 0) {
      await authenticatedFetch(
        stats,
        config,
        admin,
        "admin.riders_assignment_options",
        "GET",
        "/admin/riders-assignment-options",
        {}
      );
      if (firstOrderId) {
        await authenticatedFetch(
          stats,
          config,
          admin,
          "admin.order_detail",
          "GET",
          `/admin/orders/${firstOrderId}`,
          {}
        );
      }
    }

    if (iteration % 12 === 0) {
      const heavyStep = heavySteps[Math.floor(iteration / 12) % heavySteps.length];
      await authenticatedFetch(
        stats,
        config,
        admin,
        heavyStep.name,
        heavyStep.method,
        heavyStep.route,
        {}
      );
    }

    iteration += 1;
    await sleep(jitter(config.adminThinkMs, 0.2));
  }
}

function printProgress(stats) {
  const elapsedSeconds = Math.max(1, Math.round((Date.now() - stats.startedAt) / 1000));
  const rps = (stats.requests / elapsedSeconds).toFixed(1);
  const p95 = percentile(stats.latencies, 95);
  console.log(
    `[${elapsedSeconds}s] requests=${stats.requests} rps=${rps} failed=${stats.failed} p95=${p95}ms sockets=${stats.sockets.connected}/${stats.sockets.attempted} events=${stats.sockets.events}`
  );
}

function printSummary(stats) {
  const elapsedSeconds = Math.max(1, Math.round((Date.now() - stats.startedAt) / 1000));
  console.log("\nPerf test summary");
  console.log(`duration: ${elapsedSeconds}s`);
  console.log(`requests: ${stats.requests}`);
  console.log(`failed: ${stats.failed}`);
  console.log(`rps: ${(stats.requests / elapsedSeconds).toFixed(1)}`);
  console.log(
    `latency p50/p95/p99: ${percentile(stats.latencies, 50)}ms / ${percentile(stats.latencies, 95)}ms / ${percentile(stats.latencies, 99)}ms`
  );
  console.log(`sockets connected/attempted: ${stats.sockets.connected}/${stats.sockets.attempted}`);
  console.log(`socket events received: ${stats.sockets.events}`);
  console.log("status codes:", Object.fromEntries(stats.statuses));

  const rows = [...stats.byName.entries()].map(([name, row]) => ({
    name,
    count: row.count,
    failed: row.failed,
    p95: `${percentile(row.latencies, 95)}ms`,
  }));
  console.table(rows);

  if (stats.errors.length) {
    console.log("sample errors:");
    console.table(stats.errors);
  }
}

async function main() {
  const dataFile = path.resolve(process.env.PERF_DATA_FILE ?? defaultDataFile);
  const data = JSON.parse(await fs.readFile(dataFile, "utf8"));
  const apiBaseUrl = normalizeBaseUrl(
    process.env.API_BASE_URL ?? data.apiBaseUrl ?? "http://localhost:5000/api/v1"
  );
  const socketUrl = normalizeBaseUrl(
    process.env.SOCKET_URL ?? data.socketUrl ?? inferSocketUrl(apiBaseUrl)
  );
  const selectedCustomers = data.customers
    .slice(0, integerFromEnv("CUSTOMERS", 100))
    .map((customer) => hydrateActorAuth(customer, "customer"));
  const selectedRiders = data.riders
    .slice(0, integerFromEnv("RIDERS", 20))
    .map((rider) => hydrateActorAuth(rider, "rider"));
  const owner = data.owner ? hydrateActorAuth(data.owner, "owner") : null;
  const admin = data.admin ? hydrateActorAuth(data.admin, "admin") : null;
  const selectedOrders = data.orders.slice(0, integerFromEnv("ORDERS", 50));
  const selectedOrderIds = new Set(selectedOrders.map((order) => order.id));

  if (!selectedCustomers.length || !selectedRiders.length || !selectedOrders.length) {
    throw new Error(`Perf data file is incomplete: ${dataFile}`);
  }
  if (!admin) {
    throw new Error(
      `Perf data file is missing admin auth. Run backend npm run perf:seed before long soak tests.`
    );
  }

  const config = {
    apiBaseUrl,
    socketUrl,
    durationSeconds: integerFromEnv("DURATION_SECONDS", 300),
    customerThinkMs: integerFromEnv("CUSTOMER_THINK_MS", 1200),
    riderLocationIntervalMs: integerFromEnv("RIDER_LOCATION_INTERVAL_MS", 3000),
    adminThinkMs: integerFromEnv("ADMIN_THINK_MS", 1800),
    requestTimeoutMs: integerFromEnv("REQUEST_TIMEOUT_MS", 10000),
    socketTimeoutMs: integerFromEnv("SOCKET_TIMEOUT_MS", 10000),
    socketTransports: (process.env.SOCKET_TRANSPORTS ?? "websocket,polling")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  };

  const runtimeData = {
    ...data,
    selectedOrderIds,
  };
  const stats = createStats();
  const sockets = [];
  const authActors = [
    ...selectedCustomers,
    ...selectedRiders,
    ...(owner ? [owner] : []),
    admin,
  ];
  const missingRefreshTokenCount = authActors.filter((actor) => !actor.refreshToken).length;

  console.log("Starting Foodbela perf test");
  console.log(`api: ${config.apiBaseUrl}`);
  console.log(`socket: ${config.socketUrl}`);
  console.log(`customers: ${selectedCustomers.length}`);
  console.log(`riders: ${selectedRiders.length}`);
  console.log(`live orders: ${selectedOrders.length}`);
  console.log(`admin: 1`);
  console.log(`duration: ${config.durationSeconds}s`);
  if (missingRefreshTokenCount > 0) {
    console.warn(
      `warning: ${missingRefreshTokenCount} auth actors are missing refreshToken. Run backend npm run perf:seed before long soak tests.`
    );
  }

  await Promise.all(authActors.map((actor) => ensureFreshAccessToken(stats, config, actor)));

  for (const customer of selectedCustomers) {
    const socket = connectActorSocket(stats, config, customer, (connectedSocket) => {
      connectedSocket.emit("customer:join", customer.id);
    });
    attachCustomerSocketEvents(stats, socket);
    sockets.push(socket);
  }

  for (const rider of selectedRiders) {
    const socket = connectActorSocket(stats, config, rider, (connectedSocket) => {
      connectedSocket.emit("rider:join", rider.id);
    });
    attachRiderSocketEvents(stats, socket);
    sockets.push(socket);
  }

  if (owner?.token) {
    const socket = connectActorSocket(stats, config, owner, (connectedSocket) => {
      connectedSocket.emit("owner:join", owner.id);
    });
    attachOwnerSocketEvents(stats, socket);
    sockets.push(socket);
  }

  if (admin?.token) {
    const socket = connectActorSocket(stats, config, admin, (connectedSocket) => {
      connectedSocket.emit("admin:join", "ops");
      connectedSocket.emit("admin:join", "live-map");
    });
    attachAdminSocketEvents(stats, socket);
    sockets.push(socket);
  }

  const progressTimer = setInterval(() => printProgress(stats), 10_000);
  let authRefreshSweepRunning = false;
  const authRefreshTimer = setInterval(() => {
    if (authRefreshSweepRunning) return;

    authRefreshSweepRunning = true;
    void Promise.all(authActors.map((actor) => ensureFreshAccessToken(stats, config, actor)))
      .catch(() => undefined)
      .finally(() => {
        authRefreshSweepRunning = false;
      });
  }, 60_000);
  const deadline = Date.now() + config.durationSeconds * 1000;

  try {
    await Promise.all([
      ...selectedCustomers.map((customer, index) =>
        customerJourney(stats, config, runtimeData, customer, index, deadline)
      ),
      ...selectedRiders.map((rider, index) =>
        riderJourney(stats, config, runtimeData, rider, index, deadline)
      ),
      adminJourney(stats, config, runtimeData, admin, deadline),
    ]);
  } finally {
    clearInterval(progressTimer);
    clearInterval(authRefreshTimer);
    sockets.forEach((socket) => socket.close());
  }

  printSummary(stats);

  if (process.env.FAIL_ON_ERROR === "true" && stats.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
