/**
 * Vaisseaux de la flotte, dessinés en SVG façon cel-shading
 * (aplats de couleurs + ombre franche + contours noirs épais).
 * Chaque vaisseau est dessiné horizontalement, nez vers la droite,
 * dans un viewBox de (taille × 100) × 100.
 */
(function () {
  'use strict';
  const INK = '#07070f';

  // Dégradés partagés, injectés une seule fois dans le document.
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  defs.setAttribute('width', '0'); defs.setAttribute('height', '0');
  defs.style.position = 'absolute';
  defs.innerHTML = `
    <defs>
      <linearGradient id="ksz-glass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e9fdff"/><stop offset=".45" stop-color="#3ef0ff"/><stop offset="1" stop-color="#1e5bd0"/>
      </linearGradient>
      <radialGradient id="ksz-engine">
        <stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#9ff7ff"/><stop offset=".7" stop-color="#3ef0ff" stop-opacity=".7"/><stop offset="1" stop-color="#1e7bff" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="ksz-orb" cx=".35" cy=".3">
        <stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff7a1c"/>
      </radialGradient>
    </defs>`;
  document.body.appendChild(defs);

  const STYLE = {
    croiseur: { hull: '#f2f4f8', shade: '#a9b4c8', accent: '#ff7a1c', accent2: '#ffd23f' },
    fregate: { hull: '#e9f0ff', shade: '#97a8d6', accent: '#1e7bff', accent2: '#3ef0ff' },
    capsule: { hull: '#fff6dc', shade: '#d6b98a', accent: '#ffd23f', accent2: '#ff9f1c' },
    navette: { hull: '#f6ecff', shade: '#b79ad6', accent: '#c13cf0', accent2: '#ff7ae0' },
    sonde: { hull: '#eefcf8', shade: '#93cdbf', accent: '#2fd6a0', accent2: '#3ef0ff' },
  };

  function engine(x, y, rx, ry) {
    return `<ellipse class="engine" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#ksz-engine)"/>`;
  }

  function cracks(W) {
    let s = '<g class="cracks" stroke="' + INK + '" stroke-width="3" fill="none" stroke-linejoin="round">';
    for (let x = 60; x < W - 40; x += 90) {
      s += `<polyline points="${x},28 ${x + 10},42 ${x - 4},52 ${x + 12},66 ${x + 2},76"/>`;
    }
    s += `<path d="M20 40 L${W - 30} 58" stroke="#ff5a1c" stroke-width="2" opacity=".7"/></g>`;
    return s;
  }

  function cruiser(W, st, opts) {
    const x0 = 14, x1 = W - 6;
    const turrets = opts.turrets || 0;
    let s = '';
    // ailerons (derrière la coque)
    s += `<polygon points="${x0 + 18},34 ${x0 + 78},30 ${x0 + 46},6 ${x0 + 12},8" fill="${st.accent}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
    s += `<polygon points="${x0 + 18},66 ${x0 + 78},70 ${x0 + 46},94 ${x0 + 12},92" fill="${st.accent}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
    // réacteur
    s += engine(x0 - 4, 50, 22, 14);
    s += `<rect x="${x0 - 8}" y="36" width="18" height="28" rx="4" fill="#3a4052" stroke="${INK}" stroke-width="4"/>`;
    // coque : aplat clair + ombre franche dans la moitié basse
    const hull = `M${x0},30 L${x1 - 70},22 C${x1 - 22},24 ${x1},42 ${x1},50 C${x1},58 ${x1 - 22},76 ${x1 - 70},78 L${x0},70 Q${x0 - 6},50 ${x0},30 Z`;
    s += `<path d="${hull}" fill="${st.hull}"/>`;
    s += `<path d="M${x0 - 3},50 L${x1},50 C${x1},58 ${x1 - 22},76 ${x1 - 70},78 L${x0},70 Q${x0 - 5},60 ${x0 - 3},50 Z" fill="${st.shade}"/>`;
    // séparations de panneaux (une par case)
    for (let x = 100; x < W - 20; x += 100) s += `<line x1="${x}" y1="27" x2="${x}" y2="73" stroke="${INK}" stroke-opacity=".35" stroke-width="2"/>`;
    // bande d'accent + hublots
    s += `<rect x="${x0 + 22}" y="44" width="${Math.max(30, x1 - x0 - 120)}" height="12" fill="${st.accent}" stroke="${INK}" stroke-width="3"/>`;
    for (let x = x0 + 40; x < x1 - 110; x += 26) s += `<circle cx="${x}" cy="50" r="3.2" fill="${st.accent2}" stroke="${INK}" stroke-width="1.5"/>`;
    // tourelles
    for (let i = 0; i < turrets; i++) {
      const tx = x0 + 110 + i * 110;
      s += `<rect x="${tx}" y="24" width="38" height="6" fill="#3a4052" stroke="${INK}" stroke-width="2.5"/>`;
      s += `<circle cx="${tx}" cy="30" r="11" fill="${st.hull}" stroke="${INK}" stroke-width="3.5"/>`;
      s += `<circle cx="${tx}" cy="30" r="4" fill="${st.accent}"/>`;
    }
    // cockpit
    s += `<ellipse cx="${x1 - 52}" cy="42" rx="24" ry="11" fill="url(#ksz-glass)" stroke="${INK}" stroke-width="3.5"/>`;
    s += `<ellipse cx="${x1 - 58}" cy="38" rx="9" ry="3" fill="#fff" opacity=".85"/>`;
    // emblème (orbe énergétique)
    s += `<circle cx="${x0 + 34}" cy="${opts.emblemY || 34}" r="9" fill="url(#ksz-orb)" stroke="${INK}" stroke-width="2.5"/>`;
    s += `<path d="${hull}" fill="none" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
    return s;
  }

  function capsule(W, st) {
    const x0 = 16, x1 = W - 10;
    let s = '';
    s += engine(x0 - 2, 36, 14, 8) + engine(x0 - 2, 64, 14, 8);
    s += `<rect x="${x0 - 6}" y="28" width="14" height="16" rx="3" fill="#3a4052" stroke="${INK}" stroke-width="3"/>`;
    s += `<rect x="${x0 - 6}" y="56" width="14" height="16" rx="3" fill="#3a4052" stroke="${INK}" stroke-width="3"/>`;
    // pieds/stabilisateurs
    s += `<path d="M${x0 + 40},80 L${x0 + 26},96 L${x0 + 64},96 Z M${x1 - 70},80 L${x1 - 84},96 L${x1 - 46},96 Z" fill="${st.accent2}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`;
    const body = `M${x0 + 36},16 L${x1 - 36},16 A36 34 0 0 1 ${x1 - 36},84 L${x0 + 36},84 A36 34 0 0 1 ${x0 + 36},16 Z`;
    s += `<path d="${body}" fill="${st.hull}"/>`;
    s += `<path d="M${x0},52 L${x1},52 A36 34 0 0 1 ${x1 - 36},84 L${x0 + 36},84 A36 34 0 0 1 ${x0},52 Z" fill="${st.shade}"/>`;
    s += `<rect x="${x0 + 30}" y="46" width="${x1 - x0 - 60}" height="10" fill="${st.accent}" stroke="${INK}" stroke-width="3"/>`;
    // dôme vitré
    s += `<path d="M${(x0 + x1) / 2 - 34},30 A34 22 0 0 1 ${(x0 + x1) / 2 + 34},30 Z" fill="url(#ksz-glass)" stroke="${INK}" stroke-width="3.5" transform="translate(0,6)"/>`;
    s += `<circle cx="${x1 - 40}" cy="36" r="7" fill="url(#ksz-orb)" stroke="${INK}" stroke-width="2.5"/>`;
    for (let x = x0 + 46; x < x1 - 46; x += 30) s += `<circle cx="${x}" cy="70" r="3" fill="${INK}" opacity=".5"/>`;
    s += `<path d="${body}" fill="none" stroke="${INK}" stroke-width="5"/>`;
    return s;
  }

  function shuttle(W, st) {
    const x0 = 14, x1 = W - 6;
    let s = '';
    // ailes delta
    s += `<polygon points="${x0 + 20},40 ${x1 - 90},40 ${x0 + 40},3 ${x0 + 8},6" fill="${st.accent}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
    s += `<polygon points="${x0 + 20},60 ${x1 - 90},60 ${x0 + 40},97 ${x0 + 8},94" fill="${st.accent}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
    s += `<polygon points="${x0 + 26},20 ${x0 + 52},20 ${x0 + 40},8" fill="${st.accent2}"/>`;
    s += `<polygon points="${x0 + 26},80 ${x0 + 52},80 ${x0 + 40},92" fill="${st.accent2}"/>`;
    s += engine(x0 - 4, 50, 20, 11);
    const body = `M${x0},36 L${x1 - 60},32 L${x1},50 L${x1 - 60},68 L${x0},64 Q${x0 - 5},50 ${x0},36 Z`;
    s += `<path d="${body}" fill="${st.hull}"/>`;
    s += `<path d="M${x0 - 2},50 L${x1},50 L${x1 - 60},68 L${x0},64 Z" fill="${st.shade}"/>`;
    s += `<polygon points="${x1 - 60},40 ${x1 - 22},48 ${x1 - 60},50" fill="url(#ksz-glass)" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
    s += `<line x1="${x0 + 30}" y1="50" x2="${x1 - 70}" y2="50" stroke="${st.accent}" stroke-width="5"/>`;
    s += `<path d="${body}" fill="none" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
    return s;
  }

  function probe(W, st) {
    let s = '';
    // bras et panneau solaire
    s += `<rect x="96" y="45" width="52" height="10" fill="#3a4052" stroke="${INK}" stroke-width="3"/>`;
    s += `<rect x="140" y="14" width="46" height="72" rx="4" fill="#1e3c8c" stroke="${INK}" stroke-width="4"/>`;
    s += `<path d="M155 14 V86 M171 14 V86 M140 38 H186 M140 62 H186" stroke="${st.accent2}" stroke-width="2" opacity=".8"/>`;
    s += engine(22, 50, 16, 10);
    // sphère
    s += `<circle cx="66" cy="50" r="38" fill="${st.hull}"/>`;
    s += `<path d="M28,50 A38 38 0 0 0 104,50 Z" fill="${st.shade}"/>`;
    s += `<rect x="30" y="45" width="72" height="10" fill="${st.accent}" stroke="${INK}" stroke-width="3"/>`;
    s += `<circle cx="74" cy="34" r="12" fill="url(#ksz-glass)" stroke="${INK}" stroke-width="3"/>`;
    s += `<circle cx="70" cy="30" r="3.5" fill="#fff"/>`;
    s += `<line x1="56" y1="14" x2="46" y2="0" stroke="${INK}" stroke-width="3"/><circle cx="46" cy="2" r="4" fill="#ff5a1c" stroke="${INK}" stroke-width="2"/>`;
    s += `<circle cx="66" cy="50" r="38" fill="none" stroke="${INK}" stroke-width="5"/>`;
    return s;
  }

  function svg(id, size) {
    const W = size * 100;
    const st = STYLE[id] || STYLE.croiseur;
    let body;
    if (id === 'croiseur') body = cruiser(W, st, { turrets: 2 });
    else if (id === 'fregate') body = cruiser(W, st, { turrets: 1, emblemY: 66 });
    else if (id === 'capsule') body = capsule(W, st);
    else if (id === 'navette') body = shuttle(W, st);
    else body = probe(W, st);
    return `<svg viewBox="0 0 ${W} 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${body}${cracks(W)}</svg>`;
  }

  window.Ships = { svg };
})();
