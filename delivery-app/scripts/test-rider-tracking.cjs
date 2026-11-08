const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness() {
  let now = 100_000;
  const storage = new Map([
    ['delivery-rider-auth', JSON.stringify({ state: { accessToken: 'opaque', refreshToken: 'refresh' } })],
  ]);
  const requests = [];
  const requestDetails = [];
  const warnings = [];
  const storageWrites = [];
  let options;
  let started = false;
  let callback;
  let fetchImpl = async () => ({ ok: true, status: 200 });
  const location = {
    Accuracy: { Balanced: 3, High: 4, Low: 2 },
    hasServicesEnabledAsync: async () => true,
    getCurrentPositionAsync: async () => ({ timestamp: now, coords: { latitude: 23.8, longitude: 90.4, accuracy: 10, speed: 0, heading: 0 } }),
    getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    getBackgroundPermissionsAsync: async () => ({ status: 'granted' }),
    hasStartedLocationUpdatesAsync: async () => started,
    stopLocationUpdatesAsync: async () => { started = false; },
    startLocationUpdatesAsync: async (_task, next) => { options = next; started = true; },
  };
  const modules = {
    'expo-location': location,
    'expo-task-manager': { defineTask: (_name, task) => { callback = task; } },
    'react-native': { AppState: { currentState: 'active' }, Platform: { OS: 'android' } },
    '@/src/config/api': { API_BASE_URL: 'https://example.test/api/v1' },
    '@/src/lib/secure-storage': { secureStateStorage: {
      getItem: async (key) => storage.get(key) ?? null,
      setItem: async (key, value) => { storageWrites.push(key); storage.set(key, value); },
      removeItem: async (key) => storage.delete(key),
    } },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/rider-background-location.ts'), 'utf8');
  const qualitySource = fs.readFileSync(path.join(__dirname, '../src/lib/location-quality.ts'), 'utf8');
  function run(source) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
      exports, require: (name) => modules[name],
      Date: class extends Date { static now() { return now; } },
      fetch: async (url, init) => { requests.push(JSON.parse(init.body)); requestDetails.push({ url, init }); return fetchImpl(url, init); },
      AbortController, setTimeout, clearTimeout, Buffer,
      console: { warn: (...args) => warnings.push(args) },
    });
    return exports;
  }
  modules['@/src/lib/location-quality'] = run(qualitySource);
  modules['@/src/lib/rider-location-payload'] = run(fs.readFileSync(
    path.join(__dirname, '../src/lib/rider-location-payload.ts'), 'utf8'));
  const api = run(source);
  const fix = (latitude = 23.8) => ({ coords: { latitude, longitude: 90.4, accuracy: 10, heading: 0, speed: 0 } });
  return { api, fix, requests, requestDetails, warnings, storage, location, storageWrites,
    appState: modules['react-native'].AppState,
    platform: modules['react-native'].Platform,
    advance: (ms) => { now += ms; },
    setFetch: (fn) => { fetchImpl = fn; },
    options: () => options,
    task: (data) => callback(data),
  };
}

test('native stream samples stationary riders and starts idempotently', async () => {
  const h = harness();
  assert.equal(await h.api.startRiderBackgroundLocationAsync(), true);
  assert.equal(h.options().distanceInterval, 0);
  h.location.stopLocationUpdatesAsync = async () => { throw new Error('must not restart'); };
  assert.equal(await h.api.startRiderBackgroundLocationAsync(), true);
});

test('stationary fixes send again after the heartbeat, not on every callback', async () => {
  const h = harness();
  await h.api.startRiderBackgroundLocationAsync({ heartbeatMs: 25_000 });
  await h.api.publishRiderLocationAsync(h.fix());
  h.advance(4_000);
  await h.api.publishRiderLocationAsync(h.fix());
  assert.equal(h.requests.length, 1);
  h.advance(21_000);
  await h.api.publishRiderLocationAsync(h.fix());
  assert.equal(h.requests.length, 2);
});

test('native unavailable metadata does not reject valid location uploads', async () => {
  const h = harness();
  const fix = h.fix();
  fix.coords.heading = -1;
  fix.coords.accuracy = -1;
  fix.coords.speed = -1;
  await h.api.publishRiderLocationAsync(fix);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].latitude, 23.8);
  assert.equal('heading' in h.requests[0], false);
  assert.equal('accuracyMeters' in h.requests[0], false);
  assert.equal('speedKmph' in h.requests[0], false);
});

test('old iOS auth is migrated once while unlocked before background tracking', async () => {
  const h = harness();
  h.platform.OS = 'ios';
  assert.equal(await h.api.startRiderBackgroundLocationAsync(), true);
  assert.equal(h.storageWrites.filter((key) => key === 'delivery-rider-auth').length, 1);
  assert.equal(await h.api.startRiderBackgroundLocationAsync(), true);
  assert.equal(h.storageWrites.filter((key) => key === 'delivery-rider-auth').length, 1);
});

test('secure credentials use keychain accessibility supporting locked iOS tasks', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/secure-storage.ts'), 'utf8');
  const writes = [];
  const exports = {};
  const secureStore = {
    AFTER_FIRST_UNLOCK: 3,
    setItemAsync: async (...args) => writes.push(args),
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, require: (name) => ({
    'expo-secure-store': secureStore, 'react-native': { Platform: { OS: 'ios' } },
  })[name] });
  await exports.secureStateStorage.setItem('delivery-rider-auth', 'test-value');
  assert.equal(writes[0][2].keychainAccessible, secureStore.AFTER_FIRST_UNLOCK);
});

test('malformed coordinates never reach the API even after repeated rejected fixes', async () => {
  const h = harness();
  for (let i = 0; i < 8; i++) {
    h.advance(5_000);
    await h.api.publishRiderLocationAsync(h.fix(NaN));
  }
  assert.equal(h.requests.length, 0);
});

test('slow uploads cannot create overlapping network requests', async () => {
  const h = harness();
  let release;
  h.setFetch(() => new Promise((resolve) => { release = resolve; }));
  const first = h.api.publishRiderLocationAsync(h.fix());
  await new Promise(setImmediate);
  h.advance(5_000);
  await h.api.publishRiderLocationAsync(h.fix());
  assert.equal(h.requests.length, 1);
  release({ ok: true, status: 200 });
  await first;
});

test('offline recovery sends only the latest fix and clears the old queue', async () => {
  const h = harness();
  h.setFetch(async () => { throw new Error('offline'); });
  await h.api.publishRiderLocationAsync(h.fix());
  assert.ok(h.storage.has('foodbela-rider-background-pending-location'));
  h.advance(30_000);
  h.setFetch(async () => ({ ok: true, status: 200 }));
  await h.api.publishRiderLocationAsync(h.fix(23.801));
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].latitude, 23.801);
  assert.equal(h.storage.has('foodbela-rider-background-pending-location'), false);
});

test('native startup failure is observable and allows foreground fallback', async () => {
  const h = harness();
  h.location.startLocationUpdatesAsync = async () => { throw new Error('OEM failure'); };
  assert.equal(await h.api.startRiderBackgroundLocationAsync(), false);
  assert.ok(h.warnings.length);
  await h.api.publishRiderLocationAsync(h.fix());
  assert.equal(h.requests.length, 1);
});

test('silent native stream is detected and suspended without losing the delivery', async () => {
  const h = harness();
  await h.api.setRiderBackgroundTrackingOrderId('active-trip');
  await h.api.startRiderBackgroundLocationAsync();
  h.advance(60_000);
  assert.equal(h.api.isRiderNativeLocationStalled(), true);
  assert.equal(await h.api.suspendRiderNativeLocationAsync(), true);
  assert.equal(await h.api.getRiderBackgroundTrackingOrderId(), 'active-trip');
  assert.equal(h.api.isRiderNativeLocationStalled(), false);
  await h.api.publishRiderLocationAsync(h.fix());
  assert.equal(h.requests.length, 1);
});

// Execute the actual controller with a small hook scheduler and native mocks.
// This exercises async hydration/error transitions without requiring a phone.
function controllerHarness() {
  const state = { rider: { id: 'rider-1', isAvailableForAssignments: false }, isHydrated: true };
  const orders = { data: undefined, isSuccess: false, isFetchedAfterMount: false };
  const calls = { start: 0, stop: 0, watch: 0, remove: 0, suspend: 0 };
  const slots = [];
  let cursor = 0;
  let effects = [];
  let dirty = false;
  let resume;
  let nativeStarted = true;
  let stalled = false;
  const react = {
    useRef: (value) => { const i = cursor++; return slots[i] ??= { current: value }; },
    useState: (value) => {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value };
      return [slots[i].value, (next) => {
        if (slots[i].value !== next) { slots[i].value = next; dirty = true; }
      }];
    },
    useEffect: (effect, deps) => {
      const i = cursor++;
      if (!slots[i] || deps.some((value, j) => value !== slots[i].deps[j])) {
        const previous = slots[i];
        slots[i] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = effect(); });
      }
    },
  };
  const modules = {
    react,
    'react/jsx-runtime': { jsx: () => null, Fragment: 'fragment' },
    'expo-location': {
      Accuracy: { Balanced: 3, High: 4 },
      getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
      watchPositionAsync: async () => {
        calls.watch++;
        return { remove: () => { calls.remove++; } };
      },
    },
    'react-native': { AppState: { currentState: 'active', addEventListener: (_event, cb) => {
      resume = cb; return { remove() {} };
    } } },
    '@/src/store/auth-store': { useRiderAuthStore: (select) => select(state) },
    '@/src/hooks/use-rider-api': {
      useRiderOrdersQuery: () => orders,
      useRiderLiveTrackingPolicyQuery: () => ({ data: {} }),
    },
    '@/src/lib/live-tracking-policy': {
      normalizeRiderLiveTrackingPolicy: () => ({}),
      buildActiveTrackingConfig: () => ({ accuracy: 3, timeIntervalMs: 15_000, distanceIntervalMeters: 30, heartbeatMs: 25_000 }),
    },
    '@/src/lib/rider-background-location': {
      getRiderBackgroundTrackingOrderId: async () => 'order-1',
      isRiderNativeLocationStalled: () => stalled,
      isRiderPickupPreparing: () => Boolean(state.preparing),
      suspendRiderNativeLocationAsync: async () => { calls.suspend++; stalled = false; return true; },
      setRiderBackgroundTrackingOrderId: async () => undefined,
      startRiderBackgroundLocationAsync: async () => { calls.start++; return nativeStarted; },
      stopRiderBackgroundLocationAsync: async () => { calls.stop++; },
      publishRiderLocationAsync: async () => undefined,
      refreshRiderLocationAsync: async () => undefined,
    },
  };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/components/rider-location-controller.tsx'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: (name) => modules[name], console,
    setInterval: () => 1, clearInterval() {},
  });
  async function render() {
    for (let i = 0; i < 8; i++) {
      cursor = 0; dirty = false;
      exports.RiderLocationController({ children: null });
      const pending = effects; effects = [];
      pending.forEach((effect) => effect());
      await new Promise(setImmediate);
      if (!dirty) break;
    }
  }
  return { render, orders, calls, state, resume: () => resume('active'),
    setPreparing: (value) => { state.preparing = value; },
    failNative: () => { nativeStarted = false; },
    stallNative: () => { stalled = true; },
    recoverNative: () => { nativeStarted = true; } };
}

test('reopen and failed order queries preserve tracking until successful completion', async () => {
  const h = controllerHarness();
  await h.render();
  assert.equal(h.calls.stop, 0);
  assert.ok(h.calls.start > 0);
  // Failed initial request: still no confirmed list.
  await h.render();
  assert.equal(h.calls.stop, 0);
  h.orders.data = [];
  h.orders.isSuccess = true;
  // Cached data alone is insufficient to stop a reopened trip.
  await h.render();
  assert.equal(h.calls.stop, 0);
  h.orders.isFetchedAfterMount = true;
  await h.render();
  assert.equal(h.calls.stop, 1);
});

test('controller falls back after failed startup and removes watcher when native recovers', async () => {
  const h = controllerHarness();
  h.failNative();
  await h.render();
  assert.ok(h.calls.watch > 0);
  assert.equal(h.calls.stop, 0);
  // App resume retries remove the fallback when the native service recovers.
  h.recoverNative();
  const watchCount = h.calls.watch;
  h.resume();
  await new Promise(setImmediate);
  assert.ok(h.calls.remove > 0);
  assert.equal(h.calls.watch, watchCount);
});

test('controller immediately restarts silent native GPS before the rider backgrounds', async () => {
  const h = controllerHarness();
  await h.render();
  const starts = h.calls.start;
  h.stallNative();
  h.resume();
  await new Promise(setImmediate);
  assert.equal(h.calls.suspend, 1);
  assert.equal(h.calls.watch, 0);
  assert.ok(h.calls.start > starts);
  h.resume();
  await new Promise(setImmediate);
  assert.equal(h.calls.watch, 0);
});


test('online riders publish before pickup; going offline stops idle tracking', async () => {
  const h = controllerHarness();
  h.state.rider.isAvailableForAssignments = true;
  h.orders.data = [];
  h.orders.isSuccess = true;
  h.orders.isFetchedAfterMount = true;
  await h.render();
  assert.equal(h.calls.stop, 0);
  assert.ok(h.calls.start > 0);
  h.state.rider.isAvailableForAssignments = false;
  await h.render();
  assert.equal(h.calls.stop, 1);
});

test('foreground heartbeat acquires a fresh fix when native callbacks are silent', async () => {
  const h = harness();
  await h.api.startRiderBackgroundLocationAsync({ heartbeatMs: 25_000 });
  await h.api.refreshRiderLocationAsync({ force: true });
  assert.equal(h.requests.length, 1);
  h.advance(10_000);
  await h.api.refreshRiderLocationAsync();
  assert.equal(h.requests.length, 1);
  h.advance(15_000);
  await h.api.refreshRiderLocationAsync();
  assert.equal(h.requests.length, 2);
});

test('old cached GPS fixes cannot be relabeled as a live heartbeat', async () => {
  const h = harness();
  const fix = h.fix();
  fix.timestamp = 1;
  await h.api.publishRiderLocationAsync(fix);
  assert.equal(h.requests.length, 0);
  h.location.getCurrentPositionAsync = async () => fix;
  assert.equal(await h.api.getFreshRiderLocationAsync(), null);
});

test('pickup resets idle upload cadence so the first delivery fix is immediate', async () => {
  const h = harness();
  await h.api.setRiderBackgroundTrackingOrderId(null);
  await h.api.publishRiderLocationAsync(h.fix());
  assert.equal(h.requests.length, 1);
  h.advance(1_000);
  await h.api.setRiderBackgroundTrackingOrderId('picked-up-order');
  await h.api.publishRiderLocationAsync(h.fix());
  assert.equal(h.requests.length, 2);
});

test('unchanged watchdog policy does not rewrite encrypted storage each tick', async () => {
  const h = harness();
  await h.api.startRiderBackgroundLocationAsync();
  const before = h.storageWrites.length;
  await h.api.startRiderBackgroundLocationAsync();
  await h.api.startRiderBackgroundLocationAsync();
  assert.equal(h.storageWrites.length, before);
});

test('native startup retries do not continually cancel a working fallback watcher', async () => {
  const h = controllerHarness();
  h.failNative();
  await h.render();
  const initial = h.calls.watch;
  h.resume();
  await new Promise(setImmediate);
  h.resume();
  await new Promise(setImmediate);
  assert.equal(h.calls.watch, initial);
  assert.equal(h.calls.remove, 0);
});

test('old admin heartbeat settings cannot outlast the stale threshold', () => {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/live-tracking-policy.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, require: () => ({ Accuracy: { Balanced: 3, High: 4, Low: 2 } }),
  });
  const policy = exports.normalizeRiderLiveTrackingPolicy({ passiveHeartbeatSeconds: 180 });
  assert.equal(policy.passiveHeartbeatSeconds, 45);
  assert.equal(exports.buildActiveTrackingConfig(policy).accuracy, 4);
  assert.equal(exports.accuracyForMode('battery_saver'), 3);
});

test('a fresh tracking timestamp clears an obsolete cached stale flag', () => {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/rider-delay-display.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
  const now = Date.now();
  const order = { status: 'PickedUp', timestamps: { PickedUp: new Date(now).toISOString() },
    riderTracking: { lastUpdatedAt: new Date(now).toISOString(), freshness: { state: 'stale', isStale: true, ageSeconds: 600 } },
  };
  assert.equal(exports.getRiderDelaySignal(order, undefined, now), null);
  assert.equal(exports.getRiderDelaySignal(order, undefined, now + 121_000).label, 'Tracking stale');
});


test('locked-screen native tasks upload without a socket or foreground watcher', async () => {
  const h = harness();
  await h.api.startRiderBackgroundLocationAsync({ timeIntervalMs: 15_000, heartbeatMs: 15_000, accuracy: 4 });
  assert.equal(h.options().foregroundService.killServiceOnDestroy, false);
  assert.equal(h.options().deferredUpdatesInterval, 0);
  h.appState.currentState = 'background';
  h.location.getForegroundPermissionsAsync = async () => { throw new Error('must not prompt/check foreground while task runs'); };
  await h.task({ data: { locations: [h.fix()] } });
  h.advance(15_000);
  await h.task({ data: { locations: [h.fix()] } });
  assert.equal(h.requests.length, 2);
});

test('locking the screen preserves an existing native service without restarting it', async () => {
  const h = harness();
  await h.api.startRiderBackgroundLocationAsync();
  h.appState.currentState = 'background';
  h.location.stopLocationUpdatesAsync = async () => { throw new Error('must not stop while locked'); };
  assert.equal(await h.api.startRiderBackgroundLocationAsync({ accuracy: 4 }), true);
});

test('background startup without a service waits until the app is visible', async () => {
  const h = harness();
  h.appState.currentState = 'background';
  assert.equal(await h.api.startRiderBackgroundLocationAsync(), false);
  assert.equal(h.options(), undefined);
});

test('slow network sends the newest coalesced location after the first upload', async () => {
  const h = harness();
  let release;
  h.setFetch(async () => h.requests.length === 1 ? new Promise((resolve) => { release = resolve; }) : { ok: true, status: 200 });
  const first = h.api.publishRiderLocationAsync(h.fix());
  await new Promise(setImmediate);
  h.advance(10_000);
  await h.api.publishRiderLocationAsync(h.fix(23.801));
  release({ ok: true, status: 200 });
  await first;
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].latitude, 23.801);
});

test('failed proactive token refresh still permits uploads with an unexpired token', async () => {
  const h = harness();
  const accessToken = 'x.' + Buffer.from(JSON.stringify({ exp: 150 })).toString('base64url') + '.x';
  h.storage.set('delivery-rider-auth', JSON.stringify({ state: { accessToken, refreshToken: 'refresh' } }));
  h.setFetch(async (url) => url.endsWith('/auth/refresh') ? { ok: false, status: 503 } : { ok: true, status: 200 });
  await h.api.publishRiderLocationAsync(h.fix());
  assert.equal(h.requestDetails.filter((request) => request.url.endsWith('/profile/location')).length, 1);
  h.advance(10_000);
  await h.api.publishRiderLocationAsync(h.fix(23.801));
  assert.equal(h.requestDetails.filter((request) => request.url.endsWith('/auth/refresh')).length, 1);
  assert.equal(h.requestDetails.filter((request) => request.url.endsWith('/profile/location')).length, 2);
});

test('locked-screen 401 performs one token refresh then retries the location', async () => {
  const h = harness();
  h.appState.currentState = 'background';
  let uploads = 0;
  h.setFetch(async (url) => {
    if (url.endsWith('/auth/refresh')) return { ok: true, status: 200, json: async () => ({ data: { accessToken: 'new-token', refreshToken: 'refresh' } }) };
    uploads++;
    return { ok: uploads > 1, status: uploads > 1 ? 200 : 401 };
  });
  await h.task({ data: { locations: [h.fix()] } });
  assert.equal(uploads, 2);
  assert.equal(h.requestDetails.filter((request) => request.url.endsWith('/auth/refresh')).length, 1);
  assert.equal(JSON.parse(h.storage.get('delivery-rider-auth')).state.accessToken, 'new-token');
});

test('location 429 respects server retry hints while preserving the newest fix', async () => {
  const h = harness();
  h.setFetch(async () => ({ ok: false, status: 429, headers: { get: (key) => key === 'retry-after' ? '5' : null } }));
  await h.api.publishRiderLocationAsync(h.fix());
  h.advance(3_000);
  await h.api.publishRiderLocationAsync(h.fix());
  assert.equal(h.requests.length, 1);
  h.advance(4_000);
  h.setFetch(async () => ({ ok: true, status: 200 }));
  await h.api.publishRiderLocationAsync(h.fix(23.801));
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].latitude, 23.801);
});

test('cold locked-screen tasks clamp old persisted heartbeat settings', async () => {
  const h = harness();
  h.storage.set('foodbela-rider-background-send-policy', JSON.stringify({ moveThresholdMeters: 30, heartbeatMs: 180_000 }));
  h.appState.currentState = 'background';
  await h.task({ data: { locations: [h.fix()] } });
  h.advance(45_000);
  await h.task({ data: { locations: [h.fix()] } });
  assert.equal(h.requests.length, 2);
});

test('pickup refuses missing background permission before committing the order', async () => {
  const h = harness();
  let pickups = 0;
  h.location.getBackgroundPermissionsAsync = async () => ({ status: 'denied' });
  await assert.rejects(h.api.withRiderPickupTrackingAsync({}, async () => { pickups++; }), /all the time/);
  assert.equal(pickups, 0);
  assert.equal(h.api.isRiderPickupPreparing(), false);
});

test('pickup refuses approximate-only GPS before committing the order', async () => {
  const h = harness();
  h.location.getForegroundPermissionsAsync = async () => ({ status: 'granted', android: { accuracy: 'coarse' } });
  await assert.rejects(h.api.withRiderPickupTrackingAsync({}, async () => {}), /precise/);
});

test('pickup preparation cannot be downgraded by a simultaneous idle GPS reconcile', async () => {
  const h = harness();
  let finish;
  const operation = h.api.withRiderPickupTrackingAsync({ accuracy: 4, timeIntervalMs: 15_000 },
    async () => new Promise((resolve) => { finish = resolve; }));
  await new Promise(setImmediate);
  assert.equal(h.api.isRiderPickupPreparing(), true);
  await h.api.startRiderBackgroundLocationAsync({ accuracy: 3, timeIntervalMs: 30_000 });
  assert.equal(h.options().accuracy, 4);
  finish();
  await operation;
  assert.equal(h.api.isRiderPickupPreparing(), false);
});

test('an offline rider pending pickup does not lose the prepared native service', async () => {
  const h = controllerHarness();
  h.setPreparing(true);
  h.orders.data = [];
  h.orders.isSuccess = true;
  h.orders.isFetchedAfterMount = true;
  await h.render();
  assert.equal(h.calls.stop, 0);
});

test('GPS capture time survives the wire payload for honest freshness', async () => {
  const h = harness();
  const fix = h.fix();
  fix.timestamp = 80_000;
  await h.api.publishRiderLocationAsync(fix);
  assert.equal(h.requests[0].recordedAt, new Date(80_000).toISOString());
});


test('pickup does not commit while phone location services are disabled', async () => {
  const h = harness();
  h.location.hasServicesEnabledAsync = async () => false;
  let committed = false;
  await assert.rejects(h.api.withRiderPickupTrackingAsync({}, async () => { committed = true; }), /Turn on/);
  assert.equal(committed, false);
});

test('the first pickup GPS fix must have usable accuracy', async () => {
  const h = harness();
  h.location.getCurrentPositionAsync = async () => ({ timestamp: 100_000,
    coords: { latitude: 23.8, longitude: 90.4, accuracy: 900, speed: 0, heading: 0 } });
  assert.equal(await h.api.getFreshRiderLocationAsync(), null);
});
