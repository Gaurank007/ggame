'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const WebSocket = require('ws');
const Core = require('./game-core.js');

const PORT = Math.max(1, Number(process.env.PORT) || 3000);
const ROOT = __dirname;
const TICK_RATE = 30;
const SNAPSHOT_RATE = 20;
const MAX_INPUT_RATE_MS = 20;
const MAX_MESSAGE_BYTES = 4096;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rooms = new Map();
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };

function send(ws, packet) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(packet));
}
function roomCode() {
  let code;
  do { code = Array.from({ length: 5 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join(''); } while (rooms.has(code));
  return code;
}
function playerList(room) {
  return [...room.players.values()].map(p => ({ id: p.id, name: p.name, team: p.team, classId: p.classId, ready: p.ready, host: p.id === room.hostId }));
}
function lobbyState(room) {
  return { type: 'lobby', code: room.code, hostId: room.hostId, players: playerList(room), config: room.config, started: Boolean(room.game) };
}
function broadcastRoom(room, packet) { for (const p of room.players.values()) send(p.ws, packet); }
function broadcastLobby(room) { broadcastRoom(room, lobbyState(room)); }
function safeName(value) { return String(value || 'PILOT').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 16) || 'PILOT'; }
function enterRoom(ws, room, name) {
  const slotLimit = room.config.mode === 'teams' ? room.config.teamSize * 2 : 8;
  if (room.players.size >= slotLimit) return send(ws, { type: 'error', message: `This room is full (${slotLimit} player limit).` });
  const id = crypto.randomUUID();
  let team = room.players.size;
  let classId = 'specter';
  if (room.config.mode === 'teams') {
    const counts = [0, 0];
    for (const p of room.players.values()) counts[p.team]++;
    team = counts[0] <= counts[1] && counts[0] < room.config.teamSize ? 0 : 1;
    if ([...room.players.values()].filter(p => p.team === team && p.classId === classId).length >= Core.SETTINGS.maxSameClassPerTeam) {
      classId = Object.keys(Core.CLASSES).find(candidate =>
        [...room.players.values()].filter(p => p.team === team && p.classId === candidate).length < Core.SETTINGS.maxSameClassPerTeam);
    }
  }
  const player = { id, name: safeName(name), team, classId, ready: id === room.hostId, ws, lastInputAt: 0, input: { moveX: 0, moveY: 0, aim: 0, shoot: false, dash: false } };
  room.players.set(id, player); ws.roomCode = room.code; ws.playerId = id;
  send(ws, { type: 'joined', id, code: room.code });
  broadcastLobby(room);
}
function createRoom(ws, packet) {
  const code = roomCode(), id = crypto.randomUUID();
  const config = Core.normalizeConfig(packet.config || {});
  const room = { code, hostId: id, players: new Map(), config, nextTeam: 0, game: null, tick: 0, inputs: {} };
  rooms.set(code, room);
  const team = config.mode === 'teams' ? room.nextTeam++ % 2 : 0;
  room.players.set(id, { id, name: safeName(packet.name), team, classId: 'specter', ready: true, ws, lastInputAt: 0, input: { moveX: 0, moveY: 0, aim: 0, shoot: false, dash: false } });
  ws.roomCode = code; ws.playerId = id;
  send(ws, { type: 'joined', id, code }); broadcastLobby(room);
}
function joinRoom(ws, packet) {
  const code = String(packet.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  const room = rooms.get(code);
  if (!room) return send(ws, { type: 'error', message: 'Room code not found.' });
  if (room.game) return send(ws, { type: 'error', message: 'That match has already started.' });
  enterRoom(ws, room, packet.name);
}
function startRoom(room, ws) {
  if (room.hostId !== ws.playerId) return send(ws, { type: 'error', message: 'Only the host can start the match.' });
  if ([...room.players.values()].some(p => !p.ready)) return send(ws, { type: 'error', message: 'Every player must be ready.' });
  const slotLimit = room.config.mode === 'teams' ? room.config.teamSize * 2 : 8;
  if (room.players.size > slotLimit) return send(ws, { type: 'error', message: `This setup has ${slotLimit} player slots. Increase team size or remove players.` });
  if (room.config.mode === 'teams') {
    const counts = [0, 0], classCounts = [new Map(), new Map()];
    for (const p of room.players.values()) {
      if (p.team !== 0 && p.team !== 1) return send(ws, { type: 'error', message: 'Every pilot must be assigned to Cyan or Magenta.' });
      counts[p.team]++;
      const count = (classCounts[p.team].get(p.classId) || 0) + 1;
      if (count > Core.SETTINGS.maxSameClassPerTeam) return send(ws, { type: 'error', message: 'A team can have at most two pilots of the same class.' });
      classCounts[p.team].set(p.classId, count);
    }
    if (counts.some(count => count > room.config.teamSize)) return send(ws, { type: 'error', message: 'A team exceeds the selected team size.' });
  }
  const humans = [...room.players.values()].map(p => ({ id: p.id, name: p.name, team: p.team, classId: p.classId }));
  room.game = Core.createGame(room.config, humans); room.inputs = {};
  for (const p of room.players.values()) {
    send(p.ws, { type: 'start', game: Core.serialize(room.game, p.id), you: null });
    send(p.ws, { type: 'assignment', id: p.id });
  }
}
function handleInput(room, player, packet) {
  const now = Date.now();
  if (now - player.lastInputAt < MAX_INPUT_RATE_MS) return;
  player.lastInputAt = now;
  const input = packet.input && typeof packet.input === 'object' ? packet.input : {};
  player.input = {
    moveX: Core.clamp(Number(input.moveX) || 0, -1, 1),
    moveY: Core.clamp(Number(input.moveY) || 0, -1, 1),
    aim: Number.isFinite(Number(input.aim)) ? Core.wrapAngle(Number(input.aim)) : player.input.aim,
    shoot: input.shoot === true,
    dash: input.dash === true,
    skill: input.skill === true
  };
  room.inputs[player.id] = player.input;
}
function onMessage(ws, raw) {
  if (raw.length > MAX_MESSAGE_BYTES) return ws.close(1009, 'Message too large');
  let packet;
  try { packet = JSON.parse(raw.toString()); } catch { return send(ws, { type: 'error', message: 'Invalid JSON.' }); }
  if (!packet || typeof packet.type !== 'string') return;
  if (packet.type === 'create') return createRoom(ws, packet);
  if (packet.type === 'join') return joinRoom(ws, packet);
  const room = rooms.get(ws.roomCode), player = room?.players.get(ws.playerId);
  if (!room || !player) return send(ws, { type: 'error', message: 'Join or create a room first.' });
  if (packet.type === 'ready' && !room.game) { player.ready = packet.ready === true; return broadcastLobby(room); }
  if (packet.type === 'team' && !room.game && room.config.mode === 'teams') {
    const counts = [0, 0]; for (const p of room.players.values()) if (p.id !== player.id) counts[p.team]++;
    const team = Number(packet.team) === 1 ? 1 : 0;
    if (counts[team] >= room.config.teamSize) return send(ws, { type: 'error', message: 'That team is full.' });
    if ([...room.players.values()].filter(p => p.id !== player.id && p.team === team && p.classId === player.classId).length >= Core.SETTINGS.maxSameClassPerTeam) return send(ws, { type: 'error', message: 'That team already has two pilots of your class.' });
    player.team = team; player.ready = false; return broadcastLobby(room);
  }
  if (packet.type === 'class' && !room.game && Core.CLASSES[packet.classId]) {
    if (room.config.mode === 'teams' && [...room.players.values()].filter(p => p.id !== player.id && p.team === player.team && p.classId === packet.classId).length >= Core.SETTINGS.maxSameClassPerTeam) return send(ws, { type: 'error', message: 'Your team already has two pilots of that class.' });
    player.classId = packet.classId; player.ready = false; return broadcastLobby(room);
  }
  if (packet.type === 'config' && !room.game && room.hostId === player.id) {
    const nextConfig = Core.normalizeConfig(packet.config || room.config);
    const slotLimit = nextConfig.mode === 'teams' ? nextConfig.teamSize * 2 : 8;
    if (room.players.size > slotLimit) return send(ws, { type: 'error', message: `This setup has ${slotLimit} player slots. Remove players before reducing team size.` });
    if (nextConfig.mode === 'teams') {
      const counts = [0, 0], classCounts = [new Map(), new Map()];
      for (const p of room.players.values()) {
        const team = p.team > 1 ? p.team % 2 : p.team;
        const classCount = (classCounts[team].get(p.classId) || 0) + 1;
        if (counts[team] >= nextConfig.teamSize || classCount > Core.SETTINGS.maxSameClassPerTeam) {
          return send(ws, { type: 'error', message: 'The current lobby cannot fit this team size or class limit. Reassign teams or classes first.' });
        }
        counts[team]++;
        classCounts[team].set(p.classId, classCount);
      }
      for (const p of room.players.values()) if (p.team > 1) p.team %= 2;
    }
    room.config = nextConfig;
    return broadcastLobby(room);
  }
  if (packet.type === 'energy' && room.game) {
    if (room.hostId !== player.id) return send(ws, { type: 'error', message: 'Only the host can change energy rules.' });
    room.game.config.energyEnabled = packet.enabled === true;
    return broadcastRoom(room, { type: 'energy', energyEnabled: room.game.config.energyEnabled });
  }
  if (packet.type === 'ship-scale' && room.game) {
    if (room.hostId !== player.id) return send(ws, { type: 'error', message: 'Only the host can change ship scale.' });
    const scale = Number(packet.scale);
    if (!Number.isFinite(scale)) return send(ws, { type: 'error', message: 'Ship scale must be a finite number.' });
    room.game.config.shipScale = Core.clamp(scale, 1, 2.4);
    room.config.shipScale = room.game.config.shipScale;
    return;
  }
  if (packet.type === 'start' && !room.game) return startRoom(room, ws);
  if (packet.type === 'input' && room.game && player) return handleInput(room, player, packet);
  if (packet.type === 'leave') return removePlayer(ws);
}
function removePlayer(ws) {
  const room = rooms.get(ws.roomCode); if (!room) return;
  const player = room.players.get(ws.playerId); if (!player) return;
  const reassignHost = () => {
    if (room.hostId !== player.id) return;
    const nextHostId = room.players.keys().next().value;
    if (nextHostId != null) {
      room.hostId = nextHostId;
      const nextHost = room.players.get(nextHostId);
      if (nextHost) nextHost.ready = true;
    }
  };
  if (room.game) {
    const simPlayer = room.game.players.find(p => p.id === player.id);
    if (simPlayer) { simPlayer.isBot = true; simPlayer.name = `BOT (${player.name})`; }
    delete room.inputs[player.id];
    room.players.delete(player.id);
    if (!room.players.size) rooms.delete(room.code);
    else {
      reassignHost();
      broadcastLobby(room);
    }
  } else {
    room.players.delete(player.id);
    if (!room.players.size) rooms.delete(room.code);
    else {
      reassignHost();
      broadcastLobby(room);
    }
  }
  delete ws.roomCode; delete ws.playerId;
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  if (pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('ok'); return; }
  const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const target = path.resolve(ROOT, `.${relative}`);
  if (!target.startsWith(ROOT + path.sep) && target !== path.join(ROOT, 'index.html')) { res.writeHead(403).end('Forbidden'); return; }
  fs.readFile(target, (error, content) => {
    if (error) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(content);
  });
});
const wss = new WebSocket.Server({ server, maxPayload: MAX_MESSAGE_BYTES });
wss.on('connection', ws => { ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; }); ws.on('message', raw => onMessage(ws, raw)); ws.on('close', () => removePlayer(ws)); ws.on('error', () => removePlayer(ws)); });

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 25000);
heartbeat.unref();

setInterval(() => {
  for (const [code, room] of rooms) {
    if (!room.game || room.game.over) continue;
    const now = Date.now();
    for (const p of room.players.values()) {
      if (now - p.lastInputAt > 250) room.inputs[p.id] = { moveX: 0, moveY: 0, aim: p.input.aim, shoot: false, dash: false };
    }
    room.tick++;
    Core.step(room.game, room.inputs, 1 / TICK_RATE);
    if (room.tick % Math.max(1, Math.round(TICK_RATE / SNAPSHOT_RATE)) === 0 || room.game.over) {
      const type = room.game.over ? 'end' : 'snapshot';
      for (const p of room.players.values()) send(p.ws, { type, game: Core.serialize(room.game, p.id) });
    }
    if (room.game.over) setTimeout(() => { if (rooms.get(code) === room) { room.game = null; room.inputs = {}; broadcastLobby(room); } }, 9000).unref();
  }
}, 1000 / TICK_RATE);

server.listen(PORT, '0.0.0.0', () => process.stdout.write(`${Core.SETTINGS.gameTitle} HTTP/WebSocket server listening on 0.0.0.0:${PORT}\n`));
