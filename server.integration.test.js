'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const WebSocket = require('ws');

async function availablePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise(resolve => probe.close(resolve));
  return port;
}

function waitForMessage(socket, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('message', onMessage); reject(new Error('Timed out waiting for server message')); }, timeoutMs);
    function onMessage(raw) {
      let packet;
      try { packet = JSON.parse(raw.toString()); } catch { return; }
      if (!predicate(packet)) return;
      clearTimeout(timer); socket.off('message', onMessage); resolve(packet);
    }
    socket.on('message', onMessage);
  });
}

function send(socket, packet) { socket.send(JSON.stringify(packet)); }
function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

test('authoritative rooms start, accept bounded input, and bot-replace disconnects', { timeout: 20000 }, async t => {
  const port = await availablePort();
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(port) }, stdio: 'ignore'
  });
  const sockets = [];
  t.after(() => { sockets.forEach(socket => socket.readyState < WebSocket.CLOSING && socket.close()); child.kill(); });

  let host;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { host = await connect(`ws://127.0.0.1:${port}`); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.ok(host, 'server should accept WebSocket connections');
  sockets.push(host);
  const hostJoined = waitForMessage(host, m => m.type === 'joined');
  send(host, { type: 'create', name: 'HOST', config: { mode: 'teams', kind: 'koth', length: 'score', teamSize: 4 } });
  const { id: hostId, code } = await hostJoined;

  const guest = await connect(`ws://127.0.0.1:${port}`); sockets.push(guest);
  const guestJoined = waitForMessage(guest, m => m.type === 'joined');
  send(guest, { type: 'join', name: 'GUEST', code });
  const { id: guestId } = await guestJoined;
  const readyUpdate = waitForMessage(host, m => m.type === 'lobby' && m.players.length === 2 && m.players.every(p => p.ready));
  send(guest, { type: 'ready', ready: true });
  await readyUpdate;

  const hostStart = waitForMessage(host, m => m.type === 'start');
  const guestStart = waitForMessage(guest, m => m.type === 'start');
  send(host, { type: 'start' });
  const [hostPacket, guestPacket] = await Promise.all([hostStart, guestStart]);
  assert.equal(hostPacket.game.config.kind, 'koth');
  assert.equal(hostPacket.game.config.energyEnabled, true);
  assert.equal(hostPacket.game.config.shipScale, 1.7);
  assert.equal(guestPacket.game.players.length, 8, 'bots should fill empty game slots');
  assert.deepEqual(guestPacket.game.players.reduce((counts, player) => {
    counts[player.team]++;
    return counts;
  }, [0, 0]), [4, 4], 'bots should fill both selected team rosters');
  for (const team of [0, 1]) {
    const classes = guestPacket.game.players.filter(player => player.team === team).map(player => player.classId);
    for (const classId of new Set(classes)) assert.ok(classes.filter(value => value === classId).length <= 2);
  }
  assert.deepEqual(
    [hostPacket.game.players.find(p => p.id === hostId).team, hostPacket.game.players.find(p => p.id === guestId).team].sort(),
    [0, 1],
    'online pilots should be placed on balanced teams'
  );
  assert.equal(guestPacket.game.players.find(p => p.id === hostId).isBot, false);
  assert.equal('dronePulseTargetId' in hostPacket.game.players.find(p => p.id === hostId), true, 'a player receives private drone data about their own kite');
  assert.equal('dronePulseTargetId' in guestPacket.game.players.find(p => p.id === hostId), false, 'other players do not receive that kite’s private drone target');

  const hostEnergyUpdate = waitForMessage(host, m => m.type === 'energy');
  const guestEnergyUpdate = waitForMessage(guest, m => m.type === 'energy');
  send(host, { type: 'energy', enabled: false });
  assert.equal((await hostEnergyUpdate).energyEnabled, false);
  assert.equal((await guestEnergyUpdate).energyEnabled, false);
  const guestEnergyError = waitForMessage(guest, m => m.type === 'error' && m.message.includes('Only the host'));
  send(guest, { type: 'energy', enabled: true });
  await guestEnergyError;

  const hostScaleSnapshot = waitForMessage(host, m => m.type === 'snapshot' && m.game.config.shipScale === 2.2);
  const guestScaleSnapshot = waitForMessage(guest, m => m.type === 'snapshot' && m.game.config.shipScale === 2.2);
  send(host, { type: 'ship-scale', scale: 2.2 });
  assert.equal((await hostScaleSnapshot).game.config.shipScale, 2.2);
  assert.equal((await guestScaleSnapshot).game.config.shipScale, 2.2);
  const guestScaleError = waitForMessage(guest, m => m.type === 'error' && m.message.includes('Only the host'));
  send(guest, { type: 'ship-scale', scale: 1.4 });
  await guestScaleError;

  const startX = hostPacket.game.players.find(p => p.id === hostId).x;
  const moved = waitForMessage(host, m => m.type === 'snapshot' && Math.abs(m.game.players.find(p => p.id === hostId).x - startX) > 10);
  const seenByGuest = waitForMessage(guest, m => m.type === 'snapshot' && Math.abs(m.game.players.find(p => p.id === hostId).x - startX) > 10 && m.game.players.find(p => p.id === hostId).shots > 0);
  for (let i = 0; i < 12; i++) {
    send(host, { type: 'input', input: { moveX: 1, moveY: 0, aim: 0, shoot: true, dash: false } });
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const movedPacket = await moved;
  assert.ok(Math.abs(movedPacket.game.players.find(p => p.id === hostId).x - startX) > 10);
  assert.ok(movedPacket.game.players.find(p => p.id === hostId).shots > 0);
  const guestView = await seenByGuest;
  assert.ok(Math.abs(guestView.game.players.find(p => p.id === hostId).x - startX) > 10, 'guest should receive the host position in snapshots');
  assert.ok(guestView.game.players.find(p => p.id === hostId).shots > 0, 'guest should receive the host firing state');

  const guestStartX = guestView.game.players.find(p => p.id === guestId).x;
  const seenByHost = waitForMessage(host, m => m.type === 'snapshot' && Math.abs(m.game.players.find(p => p.id === guestId).x - guestStartX) > 10 && m.game.players.find(p => p.id === guestId).shots > 0);
  for (let i = 0; i < 12; i++) {
    send(guest, { type: 'input', input: { moveX: -1, moveY: 0, aim: Math.PI, shoot: true, dash: false } });
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const hostView = await seenByHost;
  assert.ok(Math.abs(hostView.game.players.find(p => p.id === guestId).x - guestStartX) > 10, 'host should receive the guest position in snapshots');
  assert.ok(hostView.game.players.find(p => p.id === guestId).shots > 0, 'host should receive the guest firing state');

  const replaced = waitForMessage(host, m => m.type === 'snapshot' && m.game.players.find(p => p.id === guestId)?.isBot === true);
  guest.close();
  await replaced;
});

test('host bot toggle leaves the online roster without bots', { timeout: 12000 }, async t => {
  const port = await availablePort();
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  const sockets = [];
  t.after(() => { sockets.forEach(socket => socket.readyState < WebSocket.CLOSING && socket.close()); child.kill(); });
  let host;
  for (let attempt = 0; attempt < 40; attempt++) { try { host = await connect(`ws://127.0.0.1:${port}`); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); } }
  assert.ok(host); sockets.push(host);
  const joined = waitForMessage(host, m => m.type === 'joined');
  send(host, { type: 'create', name: 'HOST', config: { mode: 'teams', teamSize: 4, botsEnabled: false } });
  const { code } = await joined;
  
  const a = await connect(`ws://127.0.0.1:${port}`); sockets.push(a);
  const j=waitForMessage(a,m=>m.type==='joined');send(a,{type:'join',name:'PILOT',code});await j;
  send(a,{type:'ready',ready:true});
  const startHost=waitForMessage(host,m=>m.type==='start');send(host,{type:'start'});
  const packet=await startHost;
  assert.equal(packet.game.players.length,2,'bots are disabled, so only human room members should start');
});

test('host disconnect reassigns ownership to the remaining player', { timeout: 15000 }, async t => {
  const port = await availablePort();
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  const sockets = [];
  t.after(() => { sockets.forEach(socket => socket.readyState < WebSocket.CLOSING && socket.close()); child.kill(); });

  let host;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { host = await connect(`ws://127.0.0.1:${port}`); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.ok(host); sockets.push(host);
  const hostJoined = waitForMessage(host, m => m.type === 'joined');
  send(host, { type: 'create', name: 'HOST', config: { mode: 'ffa', length: 'score' } });
  const { code, id: hostId } = await hostJoined;

  const guest = await connect(`ws://127.0.0.1:${port}`); sockets.push(guest);
  const guestJoined = waitForMessage(guest, m => m.type === 'joined');
  send(guest, { type: 'join', name: 'GUEST', code });
  const { id: guestId } = await guestJoined;

  const readyUpdate = waitForMessage(host, m => m.type === 'lobby' && m.players.length === 2 && m.players.every(p => p.ready));
  send(guest, { type: 'ready', ready: true });
  await readyUpdate;

  const startMessage = waitForMessage(guest, m => m.type === 'start');
  send(host, { type: 'start' });
  await startMessage;

  const hostDeparture = waitForMessage(guest, m => m.type === 'lobby' && m.hostId === guestId && m.players.some(p => p.id === guestId));
  host.close();
  const lobby = await hostDeparture;
  assert.equal(lobby.hostId, guestId);
  assert.notEqual(lobby.hostId, hostId);
});
