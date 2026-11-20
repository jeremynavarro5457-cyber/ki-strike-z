/**
 * Grille de jeu 10×10 : cases cliquables, couche des vaisseaux (SVG)
 * et couche des impacts (feu, fumée, ondes).
 */
(function () {
  'use strict';
  const N = Rules.SIZE;

  class Board {
    constructor(el, { interactive = false } = {}) {
      this.el = el;
      this.handlers = {};
      this.cells = [];
      this.marks = new Map();
      this.shipEls = new Map();
      this.highlighted = [];

      el.innerHTML = '';
      el.classList.toggle('interactive', interactive);

      const top = document.createElement('div');
      top.className = 'coords-top';
      for (let x = 0; x < N; x++) top.insertAdjacentHTML('beforeend', `<span>${Rules.COLS[x]}</span>`);

      const body = document.createElement('div');
      body.className = 'board-body';
      const left = document.createElement('div');
      left.className = 'coords-left';
      for (let y = 0; y < N; y++) left.insertAdjacentHTML('beforeend', `<span>${y + 1}</span>`);

      const grid = document.createElement('div');
      grid.className = 'grid';
      const cellsEl = document.createElement('div');
      cellsEl.className = 'cells';
      for (let y = 0; y < N; y++) {
        const row = [];
        for (let x = 0; x < N; x++) {
          const c = document.createElement('button');
          c.type = 'button';
          c.className = 'cell';
          c.dataset.x = x; c.dataset.y = y;
          c.setAttribute('aria-label', Rules.coordLabel(x, y));
          if (!interactive) c.tabIndex = -1;
          cellsEl.appendChild(c);
          row.push(c);
        }
        this.cells.push(row);
      }
      this.shipsLayer = document.createElement('div');
      this.shipsLayer.className = 'ships-layer';
      this.marksLayer = document.createElement('div');
      this.marksLayer.className = 'marks-layer';
      grid.append(cellsEl, this.shipsLayer, this.marksLayer);
      body.append(left, grid);
      el.append(top, body);
      this.grid = grid;

      const cellOf = (e) => {
        const c = e.target.closest && e.target.closest('.cell');
        return c ? [Number(c.dataset.x), Number(c.dataset.y)] : null;
      };
      let lastHover = null;
      cellsEl.addEventListener('pointerover', (e) => {
        const p = cellOf(e);
        if (!p) return;
        const key = p.join(',');
        if (key === lastHover) return;
        lastHover = key;
        this.handlers.hover && this.handlers.hover(p[0], p[1], e);
      });
      grid.addEventListener('pointerleave', () => {
        lastHover = null;
        this.handlers.leave && this.handlers.leave();
      });
      cellsEl.addEventListener('click', (e) => {
        const p = cellOf(e);
        if (p && this.handlers.click) this.handlers.click(p[0], p[1], e);
      });
      cellsEl.addEventListener('contextmenu', (e) => {
        if (this.handlers.context) { e.preventDefault(); this.handlers.context(e); }
      });
    }

    on(event, fn) { this.handlers[event] = fn; return this; }

    cellCenter(x, y) {
      const r = this.cells[y][x].getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    cellSize() { return this.cells[0][0].getBoundingClientRect().width; }

    highlight(cells, cls) {
      this.clearHighlight();
      for (const [x, y] of cells) {
        if (!Rules.inBounds(x, y)) continue;
        const c = this.cells[y][x];
        c.classList.add(...cls.split(' '));
        this.highlighted.push([c, cls]);
      }
    }

    clearHighlight() {
      for (const [c, cls] of this.highlighted) c.classList.remove(...cls.split(' '));
      this.highlighted = [];
    }

    /** ship : { id, size, cells } ou { id, size, x, y, dir } */
    renderShip(ship, state = 'intact', extra = '') {
      let { x, y, dir } = ship;
      if (ship.cells) {
        [x, y] = ship.cells[0];
        dir = ship.cells.length > 1 && ship.cells[1][0] === x ? 'v' : 'h';
      }
      this.removeShip(ship.id);
      const el = document.createElement('div');
      el.className = `ship ${state} ${dir === 'v' ? 'vertical' : ''} ${extra}`.trim();
      el.style.left = `calc(var(--cell) * ${x})`;
      el.style.top = `calc(var(--cell) * ${y})`;
      el.style.width = `calc(var(--cell) * ${ship.size})`;
      el.innerHTML = Ships.svg(ship.id, ship.size);
      this.shipsLayer.appendChild(el);
      this.shipEls.set(ship.id, el);
      return el;
    }

    setShipState(id, state) {
      const el = this.shipEls.get(id);
      if (!el) return;
      el.classList.remove('intact', 'damaged', 'destroyed', 'revealed');
      el.classList.add(state);
    }

    removeShip(id) {
      const el = this.shipEls.get(id);
      if (el) el.remove();
      this.shipEls.delete(id);
    }

    clearShips() {
      this.shipsLayer.innerHTML = '';
      this.shipEls.clear();
    }

    addMark(x, y, type, { fresh = false, sunk = false } = {}) {
      const key = x + ',' + y;
      const old = this.marks.get(key);
      if (old) old.remove();
      const el = document.createElement('div');
      el.className = `mark ${type}${fresh ? ' fresh' : ''}${sunk ? ' sunk' : ''}`;
      el.style.left = `calc(var(--cell) * ${x})`;
      el.style.top = `calc(var(--cell) * ${y})`;
      el.dataset.x = x; el.dataset.y = y;
      if (type === 'hit') {
        el.innerHTML = '<div class="core"></div><div class="cross"></div><span class="smoke"></span><span class="smoke"></span><span class="spark"></span>';
      }
      this.marksLayer.appendChild(el);
      this.marks.set(key, el);
    }

    markSunk(cells) {
      for (const [x, y] of cells) {
        const el = this.marks.get(x + ',' + y);
        if (el) el.classList.add('sunk');
      }
    }

    reset() {
      this.clearHighlight();
      this.clearShips();
      this.marksLayer.innerHTML = '';
      this.marks.clear();
    }
  }

  window.Board = Board;
})();
