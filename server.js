/**
 * KI STRIKE Z — serveur temps réel.
 * Express sert le client, Socket.io gère les arènes.
 * Toute la logique de jeu est validée ici : le client ne reçoit jamais
 * la position des vaisseaux adverses, seulement le résultat de ses tirs.
 */
const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const Rules = require('./shared/rules');
const AI = require('./server/ai');

const PORT = Number(process.env.PORT) || 3000;
const RECONNECT_GRACE_MS = 20000;
const ROOM_IDLE_MS = 60 * 60 * 1000;
const AI_DELAY_SCALE = Number(process.env.AI_DELAY_SCALE) || 1; // < 1 pour accélérer l'IA (tests)
const RECONNECT_GRACE = Number(process.env.RECONNECT_GRACE_MS) || RECONNECT_GRACE_MS;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

/** @type {Map<string, Room>} */
const rooms = new Map();

const CODE_WORDS = ['NOVA', 'ZETA', 'AURA', 'FLUX', 'OMEGA', 'TITAN', 'ASTRO', 'SOLAR', 'VOLT', 'KIRA', 'RYU', 'BLAZE', 'PULSE', 'ORBIT'];

function genCode() {
  let code;
  do {
    code = CODE_WORDS[crypto.randomInt(CODE_WORDS.length)] + '-' + crypto.randomInt(10, 100);
  } while (rooms.has(code));
  return code;
}

function cleanName(name) {
  const n = typeof name === 'string' ? name.replace(/[<>]/g, '').trim().slice(0, 16) : '';
  return n || 'Guerrier';
}

function makePlayer({ name, socket = null, isAI = false }) {
  return {
    token: crypto.randomBytes(16).toString('hex'),
    socket,
    name: cleanName(name),
    isAI,
    connected: true,
    ready: false,
    ships: [],
    board: Rules.emptyGrid(-1), // index du vaisseau par case, -1 = vide
    shots: Rules.emptyGrid(0), // tirs REÇUS : 0 inconnu, 1 raté, 2 touché
    ki: 0,
    graceTimer: null,
    rematch: false,
  };
}

function resetPlayer(p) {
  p.ready = false;
  p.ships = [];
  p.board = Rules.emptyGrid(-1);
  p.shots = Rules.emptyGrid(0);
  p.ki = 0;
  p.rematch = false;
}

function createRoom(mode) {
  const room = { code: genCode(), mode, phase: 'waiting', players: [], turn: 0, aiTimer: null, lastActivity: Date.now() };
  rooms.set(room.code, room);
  return room;
}

const other = (i) => 1 - i;

function sunkShips(p) {
  return p.ships.filter((s) => s.hits === s.size).map(publicShip);
}

function publicShip(s) {
  return { id: s.id, name: s.name, size: s.size, cells: s.cells };
}

function roomView(room, i) {
  const me = room.players[i];
  const opp = room.players[other(i)];
  return {
    code: room.code,
    mode: room.mode,
    phase: room.phase,
    you: { name: me.name, ready: me.ready, ki: me.ki },
    opp: opp ? { name: opp.name, ready: opp.ready, ki: opp.ki, connected: opp.connected, isAI: opp.isAI, rematch: opp.rematch } : null,
  };
}

function send(p, event, payload) {
  if (p && !p.isAI && p.socket && p.connected) p.socket.emit(event, payload);
}

function broadcastRoom(room) {
  room.players.forEach((p, i) => send(p, 'room:update', roomView(room, i)));
}

/** État complet (reconnexion) — uniquement ce que le joueur a le droit de savoir. */
function fullSync(room, i) {
  const me = room.players[i];
  const opp = room.players[other(i)];
  return {
    room: roomView(room, i),
    myShips: me.ships.map((s) => ({ ...publicShip(s), hits: s.hits })),
    myShotsReceived: me.shots,
    enemyShots: opp ? opp.shots : null,
    enemySunk: opp ? sunkShips(opp) : [],
    yourTurn: room.phase === 'battle' && room.turn === i,
  };
}

function destroyRoom(room) {
  clearTimeout(room.aiTimer);
  room.players.forEach((p) => {
    clearTimeout(p.graceTimer);
    if (p.socket) {
      p.socket.leave(room.code);
      p.socket.data.roomCode = null;
    }
  });
  rooms.delete(room.code);
}

function attach(socket, room, index) {
  socket.join(room.code);
  socket.data.roomCode = room.code;
  socket.data.index = index;
}

function getCtx(socket) {
  const room = rooms.get(socket.data.roomCode);
  if (!room) return null;
  const i = socket.data.index;
  const me = room.players[i];
  if (!me || me.socket !== socket) return null;
  return { room, i, me };
}

// ---------------------------------------------------------------- combat

function startBattle(room) {
  room.phase = 'battle';
  room.turn = crypto.randomInt(2);
  room.lastActivity = Date.now();
  broadcastRoom(room);
  room.players.forEach((p, i) => send(p, 'battle:start', { yourTurn: room.turn === i }));
  maybeScheduleAI(room, 2200);
}

/**
 * Résout une attaque. Renvoie une erreur (string) ou null.
 */
function resolveAttack(room, ai, attack) {
  if (room.phase !== 'battle') return 'Le combat n’a pas commencé.';
  if (room.turn !== ai) return 'Ce n’est pas ton tour !';
  const att = room.players[ai];
  const di = other(ai);
  const def = room.players[di];
  const { x, y } = attack || {};
  const type = attack && attack.type === 'ultimate' ? 'ultimate' : 'normal';
  const dir = attack && attack.dir === 'v' ? 'v' : 'h';
  if (!Rules.inBounds(x, y)) return 'Cible invalide.';

  let targets;
  if (type === 'ultimate') {
    if (att.ki < Rules.KI.MAX) return 'Ki insuffisant !';
    targets = Rules.ultimateCells(x, y, dir).filter(([cx, cy]) => def.shots[cy][cx] === 0);
    if (!targets.length) return 'Cette zone est déjà ravagée.';
  } else {
    if (def.shots[y][x] !== 0) return 'Case déjà visée.';
    targets = [[x, y]];
  }

  const cells = [];
  const sunk = [];
  for (const [cx, cy] of targets) {
    const idx = def.board[cy][cx];
    const hit = idx >= 0;
    def.shots[cy][cx] = hit ? 2 : 1;
    if (hit) {
      const ship = def.ships[idx];
      ship.hits++;
      if (ship.hits === ship.size) sunk.push(publicShip(ship));
    }
    cells.push({ x: cx, y: cy, hit });
  }
  const hits = cells.filter((c) => c.hit).length;

  if (type === 'ultimate') att.ki = 0;
  else att.ki = Math.min(Rules.KI.MAX, att.ki + (hits ? Rules.KI.HIT : Rules.KI.MISS));
  def.ki = Math.min(Rules.KI.MAX, def.ki + hits * Rules.KI.DAMAGE_TAKEN);

  const won = def.ships.every((s) => s.hits === s.size);
  if (won) room.phase = 'over';
  else room.turn = di;
  room.lastActivity = Date.now();

  room.players.forEach((p, i) => {
    const o = room.players[other(i)];
    send(p, 'attack:result', {
      by: i === ai ? 'you' : 'opp',
      type, dir, x, y, cells, sunk,
      ki: { you: p.ki, opp: o.ki },
      yourTurn: room.phase === 'battle' && room.turn === i,
      winner: won ? (i === ai ? 'you' : 'opp') : null,
      // En fin de partie, le perdant découvre la flotte restante du vainqueur.
      reveal: won && i === di ? o.ships.filter((s) => s.hits < s.size).map(publicShip) : null,
    });
  });
  if (won) broadcastRoom(room);
  else maybeScheduleAI(room, type === 'ultimate' ? 3400 : 2300);
  return null;
}

function maybeScheduleAI(room, delay) {
  const ai = room.players.findIndex((p) => p.isAI);
  if (ai < 0 || room.phase !== 'battle' || room.turn !== ai) return;
  clearTimeout(room.aiTimer);
  room.aiTimer = setTimeout(() => {
    if (!rooms.has(room.code) || room.phase !== 'battle' || room.turn !== ai) return;
    const target = room.players[other(ai)];
    const sunk = sunkShips(target);
    const remainingSizes = target.ships.filter((s) => s.hits < s.size).map((s) => s.size);
    const attack = AI.chooseAttack({ shots: target.shots, sunkShips: sunk, remainingSizes, ki: room.players[ai].ki });
    resolveAttack(room, ai, attack);
  }, delay * AI_DELAY_SCALE);
}

// ---------------------------------------------------------------- départs

function playerLeft(room, i, reason) {
  const opp = room.players[other(i)];
  send(opp, 'opponent:left', { reason, phase: room.phase });
  destroyRoom(room);
}

// ---------------------------------------------------------------- sockets

io.on('connection', (socket) => {
  socket.data.roomCode = null;

  const leaveCurrent = () => {
    const ctx = getCtx(socket);
    if (ctx) playerLeft(ctx.room, ctx.i, 'left');
  };

  socket.on('room:create', (data, ack) => {
    if (typeof ack !== 'function') return;
    leaveCurrent();
    const room = createRoom('pvp');
    const p = makePlayer({ name: data && data.name, socket });
    room.players.push(p);
    attach(socket, room, 0);
    ack({ ok: true, code: room.code, token: p.token });
    broadcastRoom(room);
  });

  socket.on('room:join', (data, ack) => {
    if (typeof ack !== 'function') return;
    const code = String((data && data.code) || '').toUpperCase().replace(/\s+/g, '').slice(0, 12);
    const room = rooms.get(code);
    if (!room) return ack({ ok: false, error: 'Arène introuvable. Vérifie le code !' });
    if (room.players.length >= 2 || room.phase !== 'waiting') return ack({ ok: false, error: 'Cette arène est déjà pleine.' });
    leaveCurrent();
    const p = makePlayer({ name: data && data.name, socket });
    room.players.push(p);
    attach(socket, room, 1);
    room.phase = 'placement';
    room.lastActivity = Date.now();
    ack({ ok: true, code: room.code, token: p.token });
    broadcastRoom(room);
  });

  socket.on('room:ai', (data, ack) => {
    if (typeof ack !== 'function') return;
    leaveCurrent();
    const room = createRoom('ai');
    const p = makePlayer({ name: data && data.name, socket });
    const bot = makePlayer({ name: AI.AI_NAMES[crypto.randomInt(AI.AI_NAMES.length)], isAI: true });
    room.players.push(p, bot);
    attach(socket, room, 0);
    placeAIFleet(bot);
    room.phase = 'placement';
    ack({ ok: true, code: room.code, token: p.token });
    broadcastRoom(room);
  });

  socket.on('room:resume', (data, ack) => {
    if (typeof ack !== 'function') return;
    const room = rooms.get(String((data && data.code) || ''));
    const i = room ? room.players.findIndex((p) => !p.isAI && p.token === (data && data.token)) : -1;
    if (!room || i < 0) return ack({ ok: false });
    const me = room.players[i];
    if (me.socket && me.socket !== socket) me.socket.data.roomCode = null;
    clearTimeout(me.graceTimer);
    me.socket = socket;
    me.connected = true;
    attach(socket, room, i);
    ack({ ok: true, sync: fullSync(room, i) });
    send(room.players[other(i)], 'opponent:status', { connected: true });
    broadcastRoom(room);
    maybeScheduleAI(room, 1500);
  });

  socket.on('fleet:ready', (data, ack) => {
    if (typeof ack !== 'function') return;
    const ctx = getCtx(socket);
    if (!ctx) return ack({ ok: false, error: 'Pas d’arène active.' });
    const { room, me } = ctx;
    if (room.phase !== 'placement') return ack({ ok: false, error: 'Le placement est terminé.' });
    if (me.ready) return ack({ ok: false, error: 'Flotte déjà verrouillée.' });
    const result = Rules.validateFleet(data && data.placements);
    if (!result.ok) return ack(result);
    installFleet(me, result.ships);
    me.ready = true;
    ack({ ok: true });
    broadcastRoom(room);
    if (room.players.length === 2 && room.players.every((p) => p.ready)) startBattle(room);
  });

  socket.on('attack', (data, ack) => {
    const ctx = getCtx(socket);
    const error = ctx ? resolveAttack(ctx.room, ctx.i, data) : 'Pas d’arène active.';
    if (typeof ack === 'function') ack(error ? { ok: false, error } : { ok: true });
  });

  socket.on('rematch', () => {
    const ctx = getCtx(socket);
    if (!ctx || ctx.room.phase !== 'over') return;
    const { room, me } = ctx;
    me.rematch = true;
    room.players.forEach((p) => { if (p.isAI) p.rematch = true; });
    if (room.players.every((p) => p.rematch)) {
      room.players.forEach(resetPlayer);
      room.players.forEach((p) => { if (p.isAI) placeAIFleet(p); });
      room.phase = 'placement';
    }
    broadcastRoom(room);
  });

  socket.on('room:leave', leaveCurrent);

  socket.on('disconnect', () => {
    const ctx = getCtx(socket);
    if (!ctx) return;
    const { room, i, me } = ctx;
    if (room.phase === 'waiting') return destroyRoom(room);
    me.connected = false;
    clearTimeout(room.aiTimer);
    const opp = room.players[other(i)];
    const humanOnline = opp && !opp.isAI && opp.connected;
    send(opp, 'opponent:status', { connected: false, grace: RECONNECT_GRACE / 1000 });
    // On laisse un délai pour se reconnecter (rechargement de page, coupure réseau…)
    me.graceTimer = setTimeout(() => {
      if (!rooms.has(room.code) || me.connected) return;
      if (humanOnline || (opp && !opp.isAI && opp.connected)) playerLeft(room, i, 'disconnected');
      else destroyRoom(room);
    }, RECONNECT_GRACE);
  });
});

function installFleet(p, ships) {
  p.ships = ships.map((s) => ({ ...s, hits: 0 }));
  p.board = Rules.emptyGrid(-1);
  p.ships.forEach((s, idx) => s.cells.forEach(([x, y]) => { p.board[y][x] = idx; }));
}

function placeAIFleet(bot) {
  installFleet(bot, Rules.validateFleet(Rules.randomFleet()).ships);
  bot.ready = true;
}

// Ménage des arènes abandonnées
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) if (now - room.lastActivity > ROOM_IDLE_MS) destroyRoom(room);
}, 5 * 60 * 1000).unref();

server.listen(PORT, () => {
  console.log('\n  ⚡ KI STRIKE Z — serveur prêt !\n');
  console.log(`  Local   : http://localhost:${PORT}`);
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const a of ifaces || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  Réseau  : http://${a.address}:${PORT}   (autres appareils du même Wi-Fi)`);
    }
  }
  console.log('');
});

module.exports = { server, rooms };
