/**
 * Règles partagées (serveur Node + navigateur).
 * Le serveur reste l'unique autorité : le client ne s'en sert que pour
 * la prévisualisation du placement et des zones d'attaque.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SIZE = 10;

  const FLEET = [
    { id: 'croiseur', name: 'Croiseur Astral', size: 5 },
    { id: 'fregate', name: 'Frégate Nova', size: 4 },
    { id: 'capsule', name: 'Capsule Orbitale', size: 3 },
    { id: 'navette', name: 'Navette Plasma', size: 3 },
    { id: 'sonde', name: 'Sonde Ki', size: 2 },
  ];

  /** Gains de Ki (sur 100). */
  const KI = { MAX: 100, HIT: 25, MISS: 5, DAMAGE_TAKEN: 12 };

  const COLS = 'ABCDEFGHIJ';

  function coordLabel(x, y) {
    return COLS[x] + (y + 1);
  }

  function inBounds(x, y) {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < SIZE && y < SIZE;
  }

  function shipCells(x, y, dir, size) {
    const cells = [];
    for (let i = 0; i < size; i++) cells.push(dir === 'h' ? [x + i, y] : [x, y + i]);
    return cells;
  }

  /** occupied : Set de "x,y" */
  function canPlace(occupied, x, y, dir, size) {
    return shipCells(x, y, dir, size).every(([cx, cy]) => inBounds(cx, cy) && !occupied.has(cx + ',' + cy));
  }

  /**
   * Valide une flotte envoyée par un client.
   * placements : [{ id, x, y, dir }]
   * @returns {{ok: true, ships: Array} | {ok: false, error: string}}
   */
  function validateFleet(placements) {
    if (!Array.isArray(placements) || placements.length !== FLEET.length) {
      return { ok: false, error: 'Flotte incomplète.' };
    }
    const seen = new Set();
    const occupied = new Set();
    const ships = [];
    for (const p of placements) {
      if (!p || typeof p !== 'object') return { ok: false, error: 'Placement invalide.' };
      const def = FLEET.find((f) => f.id === p.id);
      if (!def || seen.has(p.id)) return { ok: false, error: 'Vaisseau inconnu ou en double.' };
      if (p.dir !== 'h' && p.dir !== 'v') return { ok: false, error: 'Orientation invalide.' };
      if (!canPlace(occupied, p.x, p.y, p.dir, def.size)) {
        return { ok: false, error: 'Vaisseaux hors grille ou superposés.' };
      }
      const cells = shipCells(p.x, p.y, p.dir, def.size);
      cells.forEach(([cx, cy]) => occupied.add(cx + ',' + cy));
      seen.add(p.id);
      ships.push({ id: def.id, name: def.name, size: def.size, cells });
    }
    return { ok: true, ships };
  }

  function randomFleet() {
    for (;;) {
      const occupied = new Set();
      const placements = [];
      let ok = true;
      for (const def of FLEET) {
        let placed = false;
        for (let tries = 0; tries < 300 && !placed; tries++) {
          const dir = Math.random() < 0.5 ? 'h' : 'v';
          const x = Math.floor(Math.random() * SIZE);
          const y = Math.floor(Math.random() * SIZE);
          if (canPlace(occupied, x, y, dir, def.size)) {
            shipCells(x, y, dir, def.size).forEach(([cx, cy]) => occupied.add(cx + ',' + cy));
            placements.push({ id: def.id, x, y, dir });
            placed = true;
          }
        }
        if (!placed) { ok = false; break; }
      }
      if (ok) return placements;
    }
  }

  /** Zone de l'attaque ultime : ligne de 3 cases centrée, coupée aux bords. */
  function ultimateCells(x, y, dir) {
    const cells = [];
    for (let d = -1; d <= 1; d++) {
      const cx = dir === 'h' ? x + d : x;
      const cy = dir === 'h' ? y : y + d;
      if (inBounds(cx, cy)) cells.push([cx, cy]);
    }
    return cells;
  }

  function emptyGrid(fill) {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(fill));
  }

  return { SIZE, FLEET, KI, COLS, coordLabel, inBounds, shipCells, canPlace, validateFleet, randomFleet, ultimateCells, emptyGrid };
});
