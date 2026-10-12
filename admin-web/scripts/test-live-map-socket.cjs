const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness() {
  const events = new Map();
  const sent = [];
  let token = 'access-token';
  const socket = {
    connected: false, auth: {},
    on: (event, listener) => events.set(event, listener),
    emit: (...args) => sent.push(args),
    connect: () => {},
    disconnect: () => { socket.connected = false; },
  };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/socket-client.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, require: (name) => ({
    'socket.io-client': { io: () => socket },
    '@/lib/api': { getApiBaseUrl: () => '/api/v1' },
    '@/lib/admin-session': { getAdminAccessToken: () => token },
  })[name] });
  return { api: exports, sent, socket,
    token: (value) => { token = value; },
    connect: () => { socket.connected = true; events.get('connect')(); },
  };
}

test('live-map room is rejoined after network reconnect and token refresh', () => {
  const h = harness();
  h.api.joinAdminSocketScope('live-map');
  h.connect();
  assert.ok(h.sent.some(([event, scope]) => event === 'admin:join' && scope === 'live-map'));
  h.sent.length = 0;
  h.api.disconnectAdminSocket();
  h.token('fresh-token');
  h.api.connectAdminSocket();
  h.connect();
  assert.equal(h.socket.auth.token, 'fresh-token');
  assert.ok(h.sent.some(([event, scope]) => event === 'admin:join' && scope === 'live-map'));
});

test('leaving the page does not rejoin its scope on a later reconnect', () => {
  const h = harness();
  h.api.joinAdminSocketScope('live-map');
  h.api.leaveAdminSocketScope('live-map');
  h.sent.length = 0;
  h.connect();
  assert.equal(h.sent.some(([, scope]) => scope === 'live-map'), false);
  assert.ok(h.sent.some(([, scope]) => scope === 'ops'));
});
