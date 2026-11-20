/**
 * IA adverse — carte de probabilité (heatmap).
 * Elle ne reçoit QUE l'information publique : tirs déjà joués et vaisseaux coulés.
 * Elle ne triche donc pas plus qu'un joueur humain.
 */
const Rules = require('../shared/rules');

const UNKNOWN = 0, MISS = 1, HIT = 2, SUNK = 3;

/**
 * @param {number[][]} shots grille des tirs reçus par la cible (0 inconnu, 1 raté, 2 touché)
 * @param {{cells:number[][]}[]} sunkShips vaisseaux déjà coulés (connus de l'attaquant)
 */
function buildKnowledge(shots, sunkShips) {
  const k = shots.map((row) => row.slice());
  for (const ship of sunkShips) for (const [x, y] of ship.cells) k[y][x] = SUNK;
  return k;
}

function heatmap(k, remainingSizes) {
  const N = Rules.SIZE;
  const heat = Rules.emptyGrid(0);
  for (const size of remainingSizes) {
    for (const dir of ['h', 'v']) {
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const cells = Rules.shipCells(x, y, dir, size);
          let blocked = false, hits = 0;
          for (const [cx, cy] of cells) {
            if (!Rules.inBounds(cx, cy)) { blocked = true; break; }
            const s = k[cy][cx];
            if (s === MISS || s === SUNK) { blocked = true; break; }
            if (s === HIT) hits++;
          }
          if (blocked) continue;
          // Les positions qui expliquent des touches non coulées valent beaucoup plus.
          const weight = hits > 0 ? 40 * hits : 1;
          for (const [cx, cy] of cells) if (k[cy][cx] === UNKNOWN) heat[cy][cx] += weight;
        }
      }
    }
  }
  return heat;
}

/**
 * Choisit la prochaine attaque.
 * @returns {{x:number,y:number,type:'normal'|'ultimate',dir:'h'|'v'}}
 */
function chooseAttack({ shots, sunkShips, remainingSizes, ki }) {
  const N = Rules.SIZE;
  const k = buildKnowledge(shots, sunkShips);
  const heat = heatmap(k, remainingSizes);
  const hunting = !k.some((row) => row.includes(HIT));

  // Attaque ultime dès que la jauge est pleine : on cherche la ligne de 3 la plus « chaude ».
  if (ki >= Rules.KI.MAX) {
    let best = null;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        for (const dir of ['h', 'v']) {
          const cells = Rules.ultimateCells(x, y, dir).filter(([cx, cy]) => k[cy][cx] === UNKNOWN);
          if (!cells.length) continue;
          const score = cells.reduce((s, [cx, cy]) => s + heat[cy][cx], 0) + Math.random() * 0.5;
          if (!best || score > best.score) best = { x, y, dir, score };
        }
      }
    }
    if (best) return { x: best.x, y: best.y, dir: best.dir, type: 'ultimate' };
  }

  // Tir normal : meilleure case. En chasse, un peu d'aléatoire pour rester battable.
  let max = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (k[y][x] === UNKNOWN) max = Math.max(max, heat[y][x]);
  const threshold = hunting ? max * 0.7 : max;
  const candidates = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (k[y][x] === UNKNOWN && heat[y][x] >= threshold && heat[y][x] > 0) candidates.push([x, y]);
    }
  }
  if (!candidates.length) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (k[y][x] === UNKNOWN) candidates.push([x, y]);
  }
  const [x, y] = candidates[Math.floor(Math.random() * candidates.length)];
  return { x, y, type: 'normal', dir: 'h' };
}

const AI_NAMES = ['Commandant Vortex', 'Général Kaizer', 'Amiral Zorbak', 'Capitaine Nebula'];

module.exports = { chooseAttack, AI_NAMES };
