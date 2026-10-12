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
  const warnings = [];
  const storageWrites = [];
  let options;
  let started = false;
  let callback;
  let fetchImpl = async () => ({ ok: true, status: 200 });
  const location = {
    Accuracy: { Balanced: 3 },
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
      fetch: async (_url, init) => { requests.push(JSON.parse(init.body)); return fetchImpl(); },
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
  return { api, fix, requests, warnings, storage, location, storageWrites,
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
  const state = { rider: { id: 'rider-1' }, isHydrated: true };
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
      suspendRiderNativeLocationAsync: async () => { calls.suspend++; stalled = false; return true; },
      setRiderBackgroundTrackingOrderId: async () => undefined,
      startRiderBackgroundLocationAsync: async () => { calls.start++; return nativeStarted; },
      stopRiderBackgroundLocationAsync: async () => { calls.stop++; },
      publishRiderLocationAsync: async () => undefined,
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

test('controller recovers silent native GPS and keeps fallback stable during cooldown', async () => {
  const h = controllerHarness();
  await h.render();
  const starts = h.calls.start;
  h.stallNative();
  h.resume();
  await new Promise(setImmediate);
  assert.equal(h.calls.suspend, 1);
  assert.equal(h.calls.watch, 1);
  assert.equal(h.calls.start, starts);
  h.resume();
  await new Promise(setImmediate);
  assert.equal(h.calls.watch, 1);
});
