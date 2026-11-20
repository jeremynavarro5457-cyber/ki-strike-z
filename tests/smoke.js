/**
 * Test de bout en bout : lance le serveur, connecte de vrais clients Socket.io
 * et joue des parties complètes (PvP + IA), y compris les cas de triche.
 *   npm test
 */
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');
const Rules = require('../shared/rules');

const PORT = 3999;
const URL = `http://localhost:${PORT}`;
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✔' : '  ✘'} ${msg}`); if (!cond) failures++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function client() {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  s.inbox = [];
  s.onAny((ev, data) => s.inbox.push({ ev, data }));
  return s;
}
const call = (s, ev, data) => new Promise((r) => s.emit(ev, data, r));
function next(s, ev, pred = () => true, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const idx = s.inbox.findIndex((m) => m.ev === ev && pred(m.data));
    if (idx >= 0) return resolve(s.inbox.splice(idx, 1)[0].data);
    const t = setTimeout(() => { s.off(ev, h); reject(new Error('timeout ' + ev)); }, timeout);
    function h(data) {
      if (!pred(data)) return;
      clearTimeout(t); s.off(ev, h);
      const i = s.inbox.findIndex((m) => m.data === data);
      if (i >= 0) s.inbox.splice(i, 1);
      resolve(data);
    }
    s.on(ev, h);
  });
}

/** Joue son tour : ultime si Ki plein, sinon la première case non visée. */
async function playTurn(s, shots, ki) {
  let target = null;
  for (let y = 0; y < 10 && !target; y++) for (let x = 0; x < 10 && !target; x++) if (!shots[y][x]) target = [x, y];
  const type = ki >= 100 ? 'ultimate' : 'normal';
  const ack = await call(s, 'attack', { x: target[0], y: target[1], type, dir: 'h' });
  return { ack, type };
}

async function pvp() {
  console.log('\n— Multijoueur (PvP)');
  const A = client(), B = client();
  const a = await call(A, 'room:create', { name: 'Alpha' });
  ok(a.ok && /^[A-Z]+-\d{2}$/.test(a.code), `arène créée (${a.code})`);
  const bad = await call(B, 'room:join', { name: 'Beta', code: 'NOPE-00' });
  ok(!bad.ok, 'code inconnu refusé');
  const b = await call(B, 'room:join', { name: 'Beta', code: a.code.toLowerCase() });
  ok(b.ok, 'Beta rejoint (code insensible à la casse)');
  const C = client();
  const full = await call(C, 'room:join', { name: 'Gamma', code: a.code });
  ok(!full.ok, 'arène pleine refusée');
  C.close();
  const ua = await next(A, 'room:update', (v) => v.phase === 'placement');
  ok(ua.opp.name === 'Beta', 'Alpha voit Beta en phase de placement');

  const overlap = [{ id: 'croiseur', x: 0, y: 0, dir: 'h' }, { id: 'fregate', x: 0, y: 0, dir: 'v' }, { id: 'capsule', x: 0, y: 5, dir: 'h' }, { id: 'navette', x: 0, y: 7, dir: 'h' }, { id: 'sonde', x: 0, y: 9, dir: 'h' }];
  ok(!(await call(A, 'fleet:ready', { placements: overlap })).ok, 'flotte superposée refusée');
  const oob = Rules.randomFleet(); oob[0] = { ...oob[0], x: 9, y: 9, dir: 'h' };
  ok(!(await call(A, 'fleet:ready', { placements: oob })).ok, 'flotte hors grille refusée');
  ok(!(await call(A, 'attack', { x: 0, y: 0 })).ok, 'attaque avant le combat refusée');

  ok((await call(A, 'fleet:ready', { placements: Rules.randomFleet() })).ok, 'Alpha prêt');
  const ub = await next(B, 'room:update', (v) => v.opp && v.opp.ready);
  ok(ub.opp.ready && !JSON.stringify(ub).includes('cells'), 'Beta voit Alpha prêt, sans aucune position');
  ok((await call(B, 'fleet:ready', { placements: Rules.randomFleet() })).ok, 'Beta prêt');
  const [sa, sb] = await Promise.all([next(A, 'battle:start'), next(B, 'battle:start')]);
  ok(sa.yourTurn !== sb.yourTurn, 'combat lancé, un seul joueur commence');

  const players = { A: { s: A, shots: Rules.emptyGrid(0), ki: 0 }, B: { s: B, shots: Rules.emptyGrid(0), ki: 0 } };
  let turn = sa.yourTurn ? 'A' : 'B';
  const idle = turn === 'A' ? 'B' : 'A';
  ok(!(await call(players[idle].s, 'attack', { x: 0, y: 0 })).ok, 'attaque hors tour refusée');
  ok(!(await call(players[turn].s, 'attack', { x: 0, y: 0, type: 'ultimate', dir: 'h' })).ok, 'ultime sans Ki refusée');
  ok(!(await call(players[turn].s, 'attack', { x: 12, y: -1 })).ok, 'coordonnées invalides refusées');

  let winner = null, ultimates = 0, rounds = 0, leak = false;
  while (!winner && rounds < 220) {
    rounds++;
    const P = players[turn];
    const { ack, type } = await playTurn(P.s, P.shots, P.ki);
    if (!ack.ok) throw new Error('attaque refusée : ' + ack.error);
    if (type === 'ultimate') ultimates++;
    const other = turn === 'A' ? 'B' : 'A';
    const [res, resO] = await Promise.all([next(P.s, 'attack:result'), next(players[other].s, 'attack:result')]);
    if (rounds === 1) ok(res.by === 'you' && resO.by === 'opp', 'résultat diffusé aux deux joueurs');
    for (const c of res.cells) P.shots[c.y][c.x] = 1;
    if (res.reveal && !res.winner) leak = true;
    P.ki = res.ki.you;
    players[other].ki = resO.ki.you;
    if (res.winner) {
      winner = turn;
      ok(res.winner === 'you' && resO.winner === 'opp', `${turn === 'A' ? 'Alpha' : 'Beta'} gagne en ${rounds} attaques`);
      ok(!res.reveal && Array.isArray(resO.reveal), 'seul le perdant découvre la flotte restante');
    } else {
      if (rounds === 1) ok(!res.yourTurn && resO.yourTurn, 'le tour passe à l’adversaire');
      turn = other;
    }
    if (rounds === 1) {
      const again = await call(P.s, 'attack', { x: res.x, y: res.y });
      ok(!again.ok, 'rejouer après son tour refusé');
    }
  }
  ok(!!winner, 'la partie se termine');
  ok(ultimates > 0, `attaques ultimes utilisées (${ultimates})`);
  ok(!leak, 'aucune révélation avant la fin');

  A.emit('rematch');
  await next(B, 'room:update', (v) => v.phase === 'over' && v.opp.rematch);
  ok(true, 'Beta voit la demande de revanche');
  B.emit('rematch');
  await Promise.all([next(A, 'room:update', (v) => v.phase === 'placement'), next(B, 'room:update', (v) => v.phase === 'placement')]);
  ok(true, 'revanche acceptée → retour au placement');

  // Déconnexion + reprise
  B.disconnect();
  const st = await next(A, 'opponent:status', (d) => d.connected === false);
  ok(st.grace > 0, `Alpha est prévenu de la déconnexion (délai ${st.grace}s)`);
  const B2 = client();
  const resume = await call(B2, 'room:resume', { code: a.code, token: b.token });
  ok(resume.ok && resume.sync.room.phase === 'placement', 'Beta se reconnecte et récupère l’état');
  ok(!(await call(client(), 'room:resume', { code: a.code, token: 'faux' })).ok, 'reprise avec un faux jeton refusée');
  await next(A, 'opponent:status', (d) => d.connected === true);
  ok(true, 'Alpha voit Beta revenir');

  B2.emit('room:leave');
  const left = await next(A, 'opponent:left');
  ok(left.reason === 'left', 'Alpha est prévenu du départ de Beta');
  A.close(); B2.close();
}

async function vsAI() {
  console.log('\n— Contre l’IA');
  const A = client();
  const r = await call(A, 'room:ai', { name: 'Solo' });
  ok(r.ok, 'arène IA créée');
  const u = await next(A, 'room:update', (v) => v.phase === 'placement');
  ok(u.opp && u.opp.isAI && u.opp.ready, `IA prête (${u.opp.name})`);
  await call(A, 'fleet:ready', { placements: Rules.randomFleet() });
  const start = await next(A, 'battle:start');
  const me = { shots: Rules.emptyGrid(0), ki: 0 };
  let yourTurn = start.yourTurn, aiShots = 0, aiUlt = 0, winner = null, guard = 0;
  while (!winner && guard++ < 300) {
    if (yourTurn) {
      const { ack } = await playTurn(A, me.shots, me.ki);
      if (!ack.ok) throw new Error(ack.error);
    }
    const res = await next(A, 'attack:result');
    if (res.by === 'you') for (const c of res.cells) me.shots[c.y][c.x] = 1;
    else { aiShots++; if (res.type === 'ultimate') aiUlt++; }
    me.ki = res.ki.you;
    yourTurn = res.yourTurn;
    winner = res.winner;
  }
  ok(aiShots > 5, `l’IA attaque d’elle-même (${aiShots} attaques, dont ${aiUlt} ultimes)`);
  ok(!!winner, `partie terminée — gagnant : ${winner === 'you' ? 'joueur' : 'IA'}`);
  A.emit('rematch');
  const back = await next(A, 'room:update', (v) => v.phase === 'placement');
  ok(back.opp.ready, 'revanche contre l’IA immédiate');
  A.close();
}

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), AI_DELAY_SCALE: '0.01' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((r) => srv.stdout.once('data', r));
  try {
    await pvp();
    await vsAI();
  } catch (e) {
    failures++;
    console.error('  ✘ ERREUR :', e.message);
  }
  srv.kill();
  console.log(failures ? `\n${failures} échec(s)` : '\nTous les tests passent ⚡');
  process.exit(failures ? 1 : 0);
})();
