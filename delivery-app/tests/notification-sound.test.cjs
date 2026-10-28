const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadSound(options = {}) {
  const players = [];
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/new-order-sound.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, Map, Date, Promise, setTimeout, clearTimeout,
    require: (name) => {
      if (name.endsWith('.mp3')) return name;
      assert.equal(name, 'expo-audio');
      return {
        setAudioModeAsync: async () => {},
        createAudioPlayer: (asset) => {
          const player = { asset, isLoaded: true, playing: false, plays: 0,
            seekTo: async () => {},
            play() { this.plays++; if (!options.failPlayback) this.playing = true; },
          };
          options.configure?.(player);
          players.push(player);
          return player;
        },
      };
    },
  });
  return { api: exports, players };
}

test('foreground assignment and each late type use the bundled voice files', async () => {
  for (const [type, file] of [
    ['order.headsup', 'new_order.mp3'], ['order.placed.headsup', 'new_order_placed.mp3'],
    ['rider_assignment', 'new_delivery.mp3'], ['rider_response_late', 'delivery_hurry.mp3'],
    ['rider_pickup_late', 'delivery_hurry.mp3'], ['delivery_late_after_pickup', 'delivery_hurry.mp3'],
    ['delivery_critical_after_pickup', 'delivery_hurry.mp3'], ['delivery_eta_exceeded', 'delivery_hurry.mp3'],
    ['rider_tracking_stale', 'common.mp3'],
  ]) {
    const { api, players } = loadSound();
    assert.equal(await api.playRiderNotificationSound({ type, orderId: 'order-1' }), true);
    assert.ok(players[0].asset.endsWith(file));
    assert.ok(fs.existsSync(path.join(__dirname, '../assets/sounds', file)));
  }
});

test('concurrent socket and foreground push play once', async () => {
  const { api, players } = loadSound();
  const event = { type: 'rider_assignment', orderId: 'order-1' };
  assert.deepEqual(await Promise.all([api.playRiderNotificationSound(event), api.playRiderNotificationSound(event)]), [true, true]);
  assert.equal(await api.playRiderNotificationSound(event), true);
  assert.equal(players[0].plays, 1);
});

test('placement does not silence acceptance, and late alerts remain distinct', async () => {
  const { api, players } = loadSound();
  for (const type of ['order.placed.headsup', 'order.headsup', 'rider_pickup_late', 'delivery_late_after_pickup']) {
    assert.equal(await api.playRiderNotificationSound({ type, orderId: 'order-1' }), true);
  }
  assert.equal(players.reduce((sum, player) => sum + player.plays, 0), 4);
});

test('waits for the native player to load before seeking or playing', async () => {
  const { api, players } = loadSound({ configure(player) {
    player.isLoaded = false;
    player.seekTo = async () => assert.equal(player.isLoaded, true);
    setTimeout(() => { player.isLoaded = true; }, 30);
  } });
  assert.equal(await api.playRiderNotificationSound({ type: 'rider_assignment', orderId: 'order-1' }), true);
  assert.equal(players[0].plays, 1);
});

test('failed playback leaves OS fallback enabled and allows the next attempt', async () => {
  const options = { failPlayback: true };
  const { api, players } = loadSound(options);
  const event = { type: 'rider_pickup_late', orderId: 'order-1' };
  assert.equal(await api.playRiderNotificationSound(event), false);
  options.failPlayback = false;
  assert.equal(await api.playRiderNotificationSound(event), true);
  assert.equal(players[0].plays, 2);
});

test('all custom notification sounds are packaged in the APK', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../app.json'), 'utf8'));
  const notificationPlugin = config.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-notifications');
  for (const name of ['new_order.mp3', 'new_order_placed.mp3', 'new_delivery.mp3', 'delivery_hurry.mp3', 'common.mp3']) {
    assert.ok(notificationPlugin[1].sounds.some((file) => file.endsWith('/' + name)));
  }
});
