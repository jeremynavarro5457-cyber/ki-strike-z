/**
 * KI STRIKE Z — contrôleur client.
 * Réseau (Socket.io), écrans, placement de la flotte, combat et
 * file d'animations (chaque résultat serveur est joué dans l'ordre).
 */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Filet de sécurité : une animation ne peut jamais bloquer la partie.
  const within = (promise, ms) => Promise.race([promise, wait(ms)]);
  const SESSION_KEY = 'ksz-session';

  const socket = io({ reconnectionDelay: 600 });

  const S = {
    phase: null,
    room: null,
    code: null,
    place: null,
    battle: null,
  };

  // ============================================================ utilitaires UI
  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
    document.body.classList.toggle('on-home', id === 'screen-home');
  }

  let toastTimer;
  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  function saveSession(code, token) {
    S.code = code;
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code, token })); } catch (_) { /* ignore */ }
    const chip = $('#room-chip');
    chip.textContent = 'ARÈNE ' + code;
    chip.classList.remove('hidden');
  }

  function loadSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (_) { return null; }
  }

  function clearSession() {
    S.code = null;
    try { sessionStorage.removeItem(SESSION_KEY); } catch (_) { /* ignore */ }
    $('#room-chip').classList.add('hidden');
  }

  function goHome(error = '') {
    clearSession();
    S.phase = null; S.room = null; S.battle = null; S.place = null;
    $('#overlay-end').classList.add('hidden');
    $('#conn-banner').classList.add('hidden');
    $('#home-error').textContent = error;
    setHomeBusy(false);
    show('screen-home');
  }

  function playerName() {
    const n = $('#input-name').value.trim().slice(0, 16) || 'Guerrier';
    try { localStorage.setItem('ksz-name', n); } catch (_) { /* ignore */ }
    return n;
  }

  // ============================================================ accueil
  try { $('#input-name').value = localStorage.getItem('ksz-name') || ''; } catch (_) { /* ignore */ }
  const urlRoom = new URLSearchParams(location.search).get('room');
  if (urlRoom) $('#input-code').value = urlRoom.toUpperCase();

  function setHomeBusy(b) {
    ['#btn-create', '#btn-join', '#btn-ai'].forEach((s) => { $(s).disabled = b; });
  }

  function handleJoinAck(ack) {
    setHomeBusy(false);
    if (!ack || !ack.ok) {
      $('#home-error').textContent = (ack && ack.error) || 'Impossible de rejoindre.';
      Sound.play('error');
      return;
    }
    $('#home-error').textContent = '';
    saveSession(ack.code, ack.token);
    if (urlRoom) history.replaceState(null, '', location.pathname);
  }

  $('#btn-create').addEventListener('click', () => {
    Sound.play('click');
    setHomeBusy(true);
    socket.emit('room:create', { name: playerName() }, handleJoinAck);
  });

  function join() {
    const code = $('#input-code').value.trim().toUpperCase();
    if (!code) { $('#home-error').textContent = 'Entre le code de l’arène.'; Sound.play('error'); return; }
    Sound.play('click');
    setHomeBusy(true);
    socket.emit('room:join', { name: playerName(), code }, handleJoinAck);
  }
  $('#btn-join').addEventListener('click', join);
  $('#input-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

  $('#btn-ai').addEventListener('click', () => {
    Sound.play('click');
    setHomeBusy(true);
    socket.emit('room:ai', { name: playerName() }, handleJoinAck);
  });

  // ============================================================ lobby
  $('#btn-copy').addEventListener('click', async () => {
    const link = `${location.origin}/?room=${encodeURIComponent(S.code)}`;
    try { await navigator.clipboard.writeText(link); toast('Lien copié ! Envoie-le à ton adversaire.'); }
    catch (_) { toast(link, 5000); }
    Sound.play('click');
  });
  $('#btn-lobby-cancel').addEventListener('click', () => { socket.emit('room:leave'); goHome(); });

  // ============================================================ placement
  const placeBoard = new Board($('#place-board'), { interactive: true });

  function enterPlacement() {
    $('#overlay-end').classList.add('hidden');
    S.battle = null;
    S.place = { placements: {}, selected: Rules.FLEET[0].id, dir: 'h', locked: false, hover: null };
    placeBoard.reset();
    $('#place-you').textContent = S.room.you.name;
    $('#place-opp').textContent = S.room.opp ? S.room.opp.name : '???';
    renderShipList();
    renderPlacement();
    updatePlacementStatus();
    show('screen-placement');
  }

  function renderShipList() {
    const list = $('#ship-list');
    list.innerHTML = '';
    for (const def of Rules.FLEET) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ship-item';
      b.dataset.id = def.id;
      b.innerHTML = `<span class="mini-ship" style="width:${def.size * 22}px">${Ships.svg(def.id, def.size)}</span><span class="ship-name">${def.name}</span><span class="ship-size">${def.size}</span>`;
      b.addEventListener('click', () => {
        if (S.place.locked) return;
        if (S.place.placements[def.id]) {
          S.place.dir = S.place.placements[def.id].dir;
          delete S.place.placements[def.id];
        }
        S.place.selected = def.id;
        Sound.play('click');
        renderPlacement();
      });
      list.appendChild(b);
    }
  }

  function occupied(exceptId) {
    const occ = new Set();
    for (const [id, p] of Object.entries(S.place.placements)) {
      if (id === exceptId) continue;
      const def = Rules.FLEET.find((f) => f.id === id);
      Rules.shipCells(p.x, p.y, p.dir, def.size).forEach(([x, y]) => occ.add(x + ',' + y));
    }
    return occ;
  }

  function shipAt(x, y) {
    for (const [id, p] of Object.entries(S.place.placements)) {
      const def = Rules.FLEET.find((f) => f.id === id);
      if (Rules.shipCells(p.x, p.y, p.dir, def.size).some(([cx, cy]) => cx === x && cy === y)) return id;
    }
    return null;
  }

  function renderPlacement(justPlaced) {
    const P = S.place;
    placeBoard.clearShips();
    for (const [id, p] of Object.entries(P.placements)) {
      const def = Rules.FLEET.find((f) => f.id === id);
      placeBoard.renderShip({ id, size: def.size, ...p }, 'intact', justPlaced === id || justPlaced === '*' ? 'placing' : '');
    }
    document.querySelectorAll('.ship-item').forEach((el) => {
      el.classList.toggle('placed', !!P.placements[el.dataset.id]);
      el.classList.toggle('selected', P.selected === el.dataset.id);
      el.disabled = P.locked;
    });
    const complete = Object.keys(P.placements).length === Rules.FLEET.length;
    $('#btn-ready').disabled = !complete || P.locked;
    ['#btn-rotate', '#btn-random', '#btn-clear'].forEach((s) => { $(s).disabled = P.locked; });
    previewPlacement();
  }

  function previewPlacement() {
    const P = S.place;
    if (!P || P.locked || !P.selected || !P.hover) { placeBoard.clearHighlight(); return; }
    const def = Rules.FLEET.find((f) => f.id === P.selected);
    const [x, y] = P.hover;
    const ok = Rules.canPlace(occupied(P.selected), x, y, P.dir, def.size);
    placeBoard.highlight(Rules.shipCells(x, y, P.dir, def.size), ok ? 'preview-ok' : 'preview-bad');
  }

  function rotatePlacement() {
    if (!S.place || S.place.locked) return;
    S.place.dir = S.place.dir === 'h' ? 'v' : 'h';
    Sound.play('rotate');
    previewPlacement();
  }

  placeBoard
    .on('hover', (x, y) => { if (S.place) { S.place.hover = [x, y]; previewPlacement(); } })
    .on('leave', () => { if (S.place) { S.place.hover = null; placeBoard.clearHighlight(); } })
    .on('context', rotatePlacement)
    .on('click', (x, y) => {
      const P = S.place;
      if (!P || P.locked) return;
      P.hover = [x, y];
      if (P.selected) {
        const def = Rules.FLEET.find((f) => f.id === P.selected);
        if (Rules.canPlace(occupied(P.selected), x, y, P.dir, def.size)) {
          P.placements[P.selected] = { x, y, dir: P.dir };
          const placed = P.selected;
          const next = Rules.FLEET.find((f) => !P.placements[f.id]);
          P.selected = next ? next.id : null;
          Sound.play('place');
          renderPlacement(placed);
          const end = Rules.shipCells(x, y, P.dir, def.size).pop();
          const a = placeBoard.cellCenter(x, y), b = placeBoard.cellCenter(end[0], end[1]);
          FX.splash((a.x + b.x) / 2, (a.y + b.y) / 2);
          return;
        }
      }
      const hit = shipAt(x, y);
      if (hit) {
        P.dir = P.placements[hit].dir;
        delete P.placements[hit];
        P.selected = hit;
        Sound.play('rotate');
        renderPlacement();
      } else {
        Sound.play('error');
      }
    });

  $('#btn-rotate').addEventListener('click', rotatePlacement);
  $('#btn-random').addEventListener('click', () => {
    if (!S.place || S.place.locked) return;
    S.place.placements = {};
    Rules.randomFleet().forEach((p) => { S.place.placements[p.id] = { x: p.x, y: p.y, dir: p.dir }; });
    S.place.selected = null;
    Sound.play('place');
    renderPlacement('*');
  });
  $('#btn-clear').addEventListener('click', () => {
    if (!S.place || S.place.locked) return;
    S.place.placements = {};
    S.place.selected = Rules.FLEET[0].id;
    Sound.play('click');
    renderPlacement();
  });
  $('#btn-ready').addEventListener('click', () => {
    const P = S.place;
    if (!P || P.locked) return;
    const placements = Object.entries(P.placements).map(([id, p]) => ({ id, ...p }));
    $('#btn-ready').disabled = true;
    socket.emit('fleet:ready', { placements }, (ack) => {
      if (!ack || !ack.ok) {
        toast((ack && ack.error) || 'Flotte refusée.');
        Sound.play('error');
        renderPlacement();
        return;
      }
      P.locked = true;
      P.selected = null;
      Sound.play('ready');
      FX.flash(FX.COLORS.gold, 0.25);
      renderPlacement();
      updatePlacementStatus();
    });
  });

  function updatePlacementStatus() {
    if (!S.place || !S.room) return;
    const el = $('#ready-status');
    const opp = S.room.opp;
    $('#place-opp').textContent = opp ? opp.name : '???';
    if (S.place.locked && opp && !opp.ready) {
      el.textContent = `Flotte verrouillée ! ${opp.name} prépare encore sa flotte…`;
      el.className = 'status-line wait';
    } else if (opp && opp.ready) {
      el.textContent = `${opp.name} est PRÊT AU COMBAT !`;
      el.className = 'status-line ok';
    } else {
      el.textContent = `${opp ? opp.name : 'L’adversaire'} place sa flotte…`;
      el.className = 'status-line';
    }
  }

  // ============================================================ combat
  const myBoard = new Board($('#my-board'));
  const enemyBoard = new Board($('#enemy-board'), { interactive: true });
  let queue = Promise.resolve();
  const enqueue = (fn) => { queue = queue.then(fn).catch((e) => console.error(e)); };

  function shipsFromPlacements() {
    return Rules.FLEET.map((def) => {
      const p = S.place.placements[def.id];
      return { ...def, cells: Rules.shipCells(p.x, p.y, p.dir, def.size), hits: 0 };
    });
  }

  function initBattle(yourTurn, sync) {
    const ships = sync ? sync.myShips.map((s) => ({ ...s })) : shipsFromPlacements();
    S.battle = {
      myShips: ships,
      myShots: Rules.emptyGrid(0),
      enemyShots: Rules.emptyGrid(0),
      enemySunk: [],
      ki: { you: S.room.you.ki || 0, opp: (S.room.opp && S.room.opp.ki) || 0 },
      yourTurn,
      ultimate: false,
      ultDir: 'h',
      busy: false,
      pending: false,
      over: false,
      hover: null,
    };
    const B = S.battle;
    $('#overlay-end').classList.add('hidden');
    $('#log').innerHTML = '';
    myBoard.reset();
    enemyBoard.reset();
    B.myShips.forEach((s) => myBoard.renderShip(s, 'intact'));

    if (sync) {
      for (let y = 0; y < Rules.SIZE; y++) {
        for (let x = 0; x < Rules.SIZE; x++) {
          const m = sync.myShotsReceived[y][x], e = sync.enemyShots ? sync.enemyShots[y][x] : 0;
          B.myShots[y][x] = m; B.enemyShots[y][x] = e;
          if (m) myBoard.addMark(x, y, m === 2 ? 'hit' : 'miss');
          if (e) enemyBoard.addMark(x, y, e === 2 ? 'hit' : 'miss');
        }
      }
      B.myShips.forEach((s) => {
        if (s.hits >= s.size) { myBoard.setShipState(s.id, 'destroyed'); myBoard.markSunk(s.cells); }
        else if (s.hits > 0) myBoard.setShipState(s.id, 'damaged');
      });
      sync.enemySunk.forEach((s) => { B.enemySunk.push(s); enemyBoard.renderShip(s, 'destroyed'); enemyBoard.markSunk(s.cells); });
    }

    $('#badge-you .badge-name').textContent = S.room.you.name;
    $('#badge-you .avatar span').textContent = S.room.you.name[0].toUpperCase();
    const oppName = S.room.opp ? S.room.opp.name : 'Adversaire';
    $('#badge-opp .badge-name').textContent = oppName;
    $('#badge-opp .avatar span').textContent = oppName[0].toUpperCase();
    updateBadges();
    show('screen-battle');

    if (sync) {
      log('Reconnecté à l’arène ! Le combat reprend.', 'sys');
    } else {
      log(`${S.room.you.name} VS ${oppName} — le combat commence !`, 'sys');
      FX.announce('COMBAT !');
      FX.flash(FX.COLORS.white, 0.5);
      FX.shake(10);
      Sound.play('hit');
    }
    setTurn(yourTurn, !sync);
  }

  function log(text, cls = 'sys') {
    const p = document.createElement('p');
    p.className = cls;
    p.textContent = text;
    const el = $('#log');
    el.prepend(p);
    while (el.children.length > 40) el.lastChild.remove();
  }

  function oppName() { return (S.room && S.room.opp && S.room.opp.name) || 'L’adversaire'; }

  function setTurn(yourTurn, announce = true) {
    const B = S.battle;
    if (!B) return;
    B.yourTurn = yourTurn;
    const banner = $('#turn-banner');
    if (B.over) {
      banner.textContent = 'FIN DU COMBAT';
      banner.className = 'turn-banner';
    } else if (yourTurn) {
      banner.textContent = 'À TON TOUR D’ATTAQUER !';
      banner.className = 'turn-banner mine';
      if (announce) Sound.play('turn');
    } else {
      banner.textContent = `${oppName().toUpperCase()} CONCENTRE SON KI…`;
      banner.className = 'turn-banner theirs';
    }
    $('#badge-you').classList.toggle('active', !B.over && yourTurn);
    $('#badge-opp').classList.toggle('active', !B.over && !yourTurn);
    updateUltButton();
    renderAim();
  }

  function canAct() {
    const B = S.battle;
    return !!B && B.yourTurn && !B.busy && !B.pending && !B.over;
  }

  function updateKi(ki) {
    const B = S.battle;
    const before = B.ki.you;
    B.ki = ki;
    if (before < Rules.KI.MAX && ki.you >= Rules.KI.MAX) {
      const r = $('#badge-you .avatar').getBoundingClientRect();
      FX.text(r.left + r.width / 2 + 60, r.bottom + 30, 'SUPER KI !', 'ki');
      Sound.play('kiFull');
      log('Ton Ki est au maximum ! ATTAQUE ULTIME disponible.', 'big');
    }
  }

  function updateBadges() {
    const B = S.battle;
    if (!B) return;
    const set = (sel, value, ships, deadIds) => {
      const badge = $(sel);
      badge.querySelector('.ki-fill').style.width = value + '%';
      badge.querySelector('.ki-text').textContent = value >= 100 ? 'KI MAX !' : `KI ${value}%`;
      badge.classList.toggle('full-ki', value >= 100);
      badge.querySelector('.fleet-pips').innerHTML = ships
        .map((s) => `<span class="pip${deadIds.has(s.id) ? ' dead' : ''}" style="width:${s.size * 7}px" title="${s.name}"></span>`)
        .join('');
    };
    set('#badge-you', B.ki.you, B.myShips, new Set(B.myShips.filter((s) => s.hits >= s.size).map((s) => s.id)));
    set('#badge-opp', B.ki.opp, Rules.FLEET, new Set(B.enemySunk.map((s) => s.id)));
    updateUltButton();
  }

  function updateUltButton() {
    const B = S.battle;
    const btn = $('#btn-ultimate');
    const ready = !!B && B.ki.you >= Rules.KI.MAX;
    btn.disabled = !ready || !canAct();
    btn.classList.toggle('ready', ready);
    if (B && (!ready || !canAct())) B.ultimate = false;
    btn.classList.toggle('armed', !!B && B.ultimate);
    $('#btn-ult-rotate').classList.toggle('hidden', !(B && B.ultimate));
    $('#ult-hint').textContent = B && B.ultimate
      ? `Vise une ligne de 3 cases (${B.ultDir === 'h' ? '↔ horizontal' : '↕ vertical'}) — R pour pivoter, Échap pour annuler`
      : ready && B && !B.over ? 'Ton Ki est chargé !' : '';
  }

  function renderAim() {
    const B = S.battle;
    if (!B || !B.hover || !canAct()) { enemyBoard.clearHighlight(); return; }
    const [x, y] = B.hover;
    if (B.ultimate) {
      enemyBoard.highlight(Rules.ultimateCells(x, y, B.ultDir), 'aim-ult');
    } else if (B.enemyShots[y][x] === 0) {
      enemyBoard.highlight([[x, y]], 'aim');
    } else {
      enemyBoard.clearHighlight();
    }
  }

  function toggleUltimate(force) {
    const B = S.battle;
    if (!B) return;
    const want = force !== undefined ? force : !B.ultimate;
    if (want && (B.ki.you < Rules.KI.MAX || !canAct())) return;
    B.ultimate = want;
    Sound.play(want ? 'kiFull' : 'click');
    updateUltButton();
    renderAim();
  }

  function rotateUltimate() {
    const B = S.battle;
    if (!B || !B.ultimate) return;
    B.ultDir = B.ultDir === 'h' ? 'v' : 'h';
    Sound.play('rotate');
    updateUltButton();
    renderAim();
  }

  $('#btn-ultimate').addEventListener('click', () => toggleUltimate());
  $('#btn-ult-rotate').addEventListener('click', rotateUltimate);

  enemyBoard
    .on('hover', (x, y) => {
      if (!S.battle) return;
      S.battle.hover = [x, y];
      renderAim();
      if (canAct()) Sound.play('hover');
    })
    .on('leave', () => { if (S.battle) { S.battle.hover = null; enemyBoard.clearHighlight(); } })
    .on('context', () => rotateUltimate())
    .on('click', (x, y) => fire(x, y));

  function fire(x, y) {
    const B = S.battle;
    if (!B) return;
    if (!canAct()) {
      if (!B.over && !B.yourTurn) toast('Patience… ce n’est pas ton tour !', 1500);
      return;
    }
    const type = B.ultimate ? 'ultimate' : 'normal';
    if (type === 'normal' && B.enemyShots[y][x] !== 0) { Sound.play('error'); toast('Case déjà visée !', 1400); return; }
    if (type === 'ultimate' && !Rules.ultimateCells(x, y, B.ultDir).some(([cx, cy]) => B.enemyShots[cy][cx] === 0)) {
      Sound.play('error'); toast('Cette zone est déjà ravagée !', 1400); return;
    }
    B.pending = true;
    B.hover = [x, y];
    enemyBoard.clearHighlight();
    updateUltButton();
    const banner = $('#turn-banner');
    banner.textContent = type === 'ultimate' ? 'ATTAQUE ULTIME !' : 'DÉCHARGE DE KI !';
    banner.className = 'turn-banner firing';
    socket.emit('attack', { x, y, type, dir: B.ultDir }, (ack) => {
      if (!ack || !ack.ok) {
        B.pending = false;
        Sound.play('error');
        toast((ack && ack.error) || 'Attaque refusée.');
        setTurn(B.yourTurn, false);
      }
    });
  }

  function avatarCenter(sel) {
    const r = $(sel + ' .avatar').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function impact(board, c, mine, opts = {}) {
    const B = S.battle;
    const p = board.cellCenter(c.x, c.y);
    if (c.hit) {
      FX.explosion(p.x, p.y, opts.big ? 1.25 : 1);
      Sound.play('hit');
      FX.shake(mine ? 7 : 13);
      if (opts.text !== false) FX.text(p.x, p.y - 20, 'TOUCHÉ !', 'hit');
      board.addMark(c.x, c.y, 'hit', { fresh: true });
    } else {
      FX.splash(p.x, p.y);
      Sound.play('miss');
      if (opts.text !== false) FX.text(p.x, p.y - 20, 'RATÉ !', 'miss');
      board.addMark(c.x, c.y, 'miss', { fresh: true });
    }
    if (mine) B.enemyShots[c.y][c.x] = c.hit ? 2 : 1;
    else {
      B.myShots[c.y][c.x] = c.hit ? 2 : 1;
      if (c.hit) {
        const ship = B.myShips.find((s) => s.cells.some(([sx, sy]) => sx === c.x && sy === c.y));
        if (ship) { ship.hits++; if (ship.hits < ship.size) myBoard.setShipState(ship.id, 'damaged'); }
      }
    }
  }

  async function sinkShip(s, mine) {
    const B = S.battle;
    const board = mine ? enemyBoard : myBoard;
    if (mine) { B.enemySunk.push(s); board.renderShip(s, 'destroyed', 'placing'); }
    else board.setShipState(s.id, 'destroyed');
    board.markSunk(s.cells);
    Sound.play('sunk');
    FX.flash(FX.COLORS.fire, 0.35, 4);
    FX.shake(20, 3.5);
    const a = board.cellCenter(...s.cells[0]);
    const b = board.cellCenter(...s.cells[s.cells.length - 1]);
    FX.text((a.x + b.x) / 2, (a.y + b.y) / 2 - 10, 'VAISSEAU DÉTRUIT !', 'sunk');
    for (const [x, y] of s.cells) {
      const p = board.cellCenter(x, y);
      FX.explosion(p.x, p.y, 1.35);
      await wait(110);
    }
    log(mine ? `💥 Tu as détruit le ${s.name} ennemi !` : `💥 ${oppName()} a détruit ton ${s.name} !`, 'big');
    await wait(650);
  }

  async function playAttack(res) {
    const B = S.battle;
    if (!B) return;
    B.pending = false;
    B.busy = true;
    B.ultimate = false;
    updateUltButton();
    renderAim();

    const mine = res.by === 'you';
    const board = mine ? enemyBoard : myBoard;
    const src = avatarCenter(mine ? '#badge-you' : '#badge-opp');
    const who = mine ? 'Tu' : oppName();
    const hits = res.cells.filter((c) => c.hit).length;

    if (res.type === 'ultimate') {
      FX.announce('ATTAQUE ULTIME !', mine ? '' : 'opp');
      Sound.play('charge', 1.15);
      setTimeout(() => Sound.play('beam', 1.1), 1150);
      const centers = res.cells.map((c) => board.cellCenter(c.x, c.y));
      const target = { x: centers.reduce((s, p) => s + p.x, 0) / centers.length, y: centers.reduce((s, p) => s + p.y, 0) / centers.length };
      await within(FX.ultimate(src, target, mine ? FX.COLORS.gold : FX.COLORS.magenta, { width: board.cellSize() * 1.5 }), 3500);
      for (const c of res.cells) { impact(board, c, mine, { big: true, text: false }); await wait(130); }
      FX.shake(24, 2.5);
      FX.flash(FX.COLORS.white, 0.55, 4);
      FX.text(target.x, target.y - 30, hits ? `${hits} IMPACT${hits > 1 ? 'S' : ''} !` : 'ESQUIVÉ !', hits ? 'sunk' : 'miss');
      const zone = res.cells.map((c) => Rules.coordLabel(c.x, c.y)).join('-');
      log(`⚡ ${mine ? 'Tu déchaînes' : who + ' déchaîne'} une ATTAQUE ULTIME sur ${zone} : ${hits} touché${hits > 1 ? 's' : ''} !`, mine ? 'you' : 'opp');
      await wait(600);
    } else {
      Sound.play('shoot');
      await within(FX.kiBlast(src, board.cellCenter(res.x, res.y), mine ? FX.COLORS.cyan : FX.COLORS.magenta, 0.55), 1500);
      const c = res.cells[0];
      impact(board, c, mine);
      log(`${mine ? 'Tu tires' : who + ' tire'} en ${Rules.coordLabel(c.x, c.y)} — ${c.hit ? 'TOUCHÉ !' : 'raté.'}`, mine ? 'you' : 'opp');
      await wait(380);
    }

    for (const s of res.sunk) await sinkShip(s, mine);
    updateKi(res.ki);
    updateBadges();

    if (res.winner) {
      await wait(500);
      endGame(res.winner === 'you', res.reveal);
      return;
    }
    B.busy = false;
    setTurn(res.yourTurn);
  }

  function endGame(won, reveal, sub) {
    const B = S.battle;
    if (B) {
      B.over = true;
      B.busy = false;
      setTurn(false, false);
      (reveal || []).forEach((s) => enemyBoard.renderShip(s, 'revealed'));
    }
    const card = $('#overlay-end .end-card');
    card.classList.toggle('lose', !won);
    $('#end-title').textContent = won ? 'VICTOIRE !' : 'DÉFAITE…';
    $('#end-sub').textContent = sub || (won
      ? `Tu as pulvérisé la flotte de ${oppName()} !`
      : `${oppName()} a anéanti ta flotte. Ses vaisseaux restants sont révélés sur le radar.`);
    $('#btn-rematch').classList.remove('hidden');
    $('#btn-rematch').disabled = false;
    $('#rematch-status').textContent = '';
    $('#overlay-end').classList.remove('hidden');
    log(won ? '🏆 VICTOIRE !' : '☠ DÉFAITE…', 'big');
    if (won) { Sound.play('victory'); FX.celebrate(); FX.flash(FX.COLORS.gold, 0.5); }
    else { Sound.play('defeat'); FX.flash(FX.COLORS.red, 0.45, 2); }
  }

  $('#btn-rematch').addEventListener('click', () => {
    socket.emit('rematch');
    Sound.play('click');
    $('#btn-rematch').disabled = true;
    $('#rematch-status').textContent = `Revanche demandée… en attente de ${oppName()}.`;
  });
  $('#btn-menu').addEventListener('click', () => { socket.emit('room:leave'); goHome(); });

  // ============================================================ clavier
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'r' || e.key === 'R') {
      if ($('#screen-placement').classList.contains('active')) rotatePlacement();
      else rotateUltimate();
    } else if (e.key === 'Escape') {
      toggleUltimate(false);
    } else if ((e.key === 'u' || e.key === 'U') && S.battle) {
      toggleUltimate();
    }
  });

  $('#btn-mute').textContent = Sound.muted ? '🔇' : '🔊';
  $('#btn-mute').addEventListener('click', () => {
    const m = Sound.toggle();
    $('#btn-mute').textContent = m ? '🔇' : '🔊';
    if (!m) Sound.play('click');
  });

  // ============================================================ réseau
  socket.on('room:update', (v) => {
    const prev = S.phase;
    S.room = v;
    S.phase = v.phase;
    if (v.phase === 'waiting') {
      $('#lobby-code').textContent = v.code;
      show('screen-lobby');
    } else if (v.phase === 'placement') {
      if (prev !== 'placement' || !S.place) {
        if (prev === 'waiting') { Sound.play('ready'); FX.flash(FX.COLORS.cyan, 0.3); toast(`${v.opp.name} a rejoint l’arène !`); }
        enterPlacement();
      }
      updatePlacementStatus();
    } else if (v.phase === 'over') {
      if (v.opp && v.opp.rematch && $('#btn-rematch').disabled === false) {
        $('#rematch-status').textContent = `${v.opp.name} veut une revanche !`;
      }
    }
  });

  socket.on('battle:start', ({ yourTurn }) => enqueue(() => initBattle(yourTurn)));
  socket.on('attack:result', (res) => enqueue(() => playAttack(res)));

  socket.on('opponent:status', ({ connected, grace }) => {
    const banner = $('#conn-banner');
    clearInterval(banner._timer);
    if (connected) {
      banner.classList.add('hidden');
      toast(`${oppName()} est de retour !`);
      return;
    }
    let left = grace || 20;
    banner.textContent = `⚠ ${oppName()} a perdu la connexion… attente (${left} s)`;
    banner.classList.remove('hidden');
    banner._timer = setInterval(() => {
      left--;
      banner.textContent = `⚠ ${oppName()} a perdu la connexion… attente (${Math.max(0, left)} s)`;
      if (left <= 0) clearInterval(banner._timer);
    }, 1000);
  });

  socket.on('opponent:left', ({ phase }) => {
    const banner = $('#conn-banner');
    clearInterval(banner._timer);
    banner.classList.add('hidden');
    clearSession();
    const name = oppName();
    enqueue(() => {
      if (phase === 'over') {
        $('#btn-rematch').disabled = true;
        $('#rematch-status').textContent = `${name} a quitté l’arène.`;
        return;
      }
      if (S.battle) {
        endGame(true, null, `${name} a quitté l’arène. Victoire par forfait !`);
      } else {
        $('#overlay-end .end-card').classList.remove('lose');
        $('#end-title').textContent = 'ARÈNE FERMÉE';
        $('#end-sub').textContent = `${name} a quitté l’arène.`;
        $('#rematch-status').textContent = '';
        $('#overlay-end').classList.remove('hidden');
      }
      $('#btn-rematch').classList.add('hidden');
    });
  });

  function applySync(sync) {
    S.room = sync.room;
    S.phase = sync.room.phase;
    saveSession(sync.room.code, loadSession().token);
    if (S.phase === 'waiting') {
      $('#lobby-code').textContent = sync.room.code;
      show('screen-lobby');
    } else if (S.phase === 'placement') {
      enterPlacement();
      if (sync.myShips.length) {
        sync.myShips.forEach((s) => {
          const [x, y] = s.cells[0];
          S.place.placements[s.id] = { x, y, dir: s.cells[1][0] === x ? 'v' : 'h' };
        });
        S.place.locked = true;
        S.place.selected = null;
        renderPlacement();
        updatePlacementStatus();
      }
    } else {
      initBattle(sync.yourTurn, sync);
      if (S.phase === 'over') {
        const lost = sync.myShips.every((s) => s.hits >= s.size);
        endGame(!lost);
      }
    }
  }

  let everConnected = false;
  socket.on('connect', () => {
    $('#conn-banner').classList.add('hidden');
    const saved = loadSession();
    if (saved && saved.code && saved.token) {
      socket.emit('room:resume', saved, (ack) => {
        if (!ack || !ack.ok) {
          const wasPlaying = !!S.phase;
          clearSession();
          if (wasPlaying) goHome('La connexion à l’arène a été perdue.');
          return;
        }
        // Si on était déjà dans cette arène, un simple rafraîchissement suffit.
        queue = Promise.resolve();
        applySync(ack.sync);
        if (everConnected) toast('Reconnecté !');
      });
    }
    everConnected = true;
  });

  socket.on('disconnect', () => {
    if (!S.phase) return;
    const banner = $('#conn-banner');
    clearInterval(banner._timer);
    banner.textContent = '⚠ Connexion au serveur perdue… reconnexion en cours';
    banner.classList.remove('hidden');
  });

  show('screen-home');
})();
