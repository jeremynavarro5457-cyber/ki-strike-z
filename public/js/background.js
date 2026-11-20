/**
 * Arrière-plan vivant : planète alien au ciel vert/turquoise/or,
 * pics rocheux, îles flottantes, nuages cel-shadés, particules de Ki,
 * parallaxe à la souris et dérive lente.
 * Les couches statiques sont pré-rendues hors écran pour rester fluide.
 */
(function () {
  'use strict';
  const canvas = document.getElementById('bg');
  const ctx = canvas.getContext('2d');
  const MARGIN = 70;
  const OUTLINE = '#0b2326';

  let W = 0, H = 0, DPR = 1, horizon = 0;
  let sky, farRidge, midRocks, moteSprites = {};
  let islands = [], clouds = [], motes = [];
  const mouse = { x: 0, y: 0 }, cam = { x: 0, y: 0 };
  let pulse = { a: 0, color: '255,210,63' };

  function rng(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function layer(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * DPR); c.height = Math.ceil(h * DPR);
    const g = c.getContext('2d');
    g.scale(DPR, DPR);
    return { c, g, w, h };
  }

  // ------------------------------------------------------------ dessin
  function drawSky() {
    const L = layer(W + MARGIN * 2, H);
    const g = L.g, w = L.w;
    const grad = g.createLinearGradient(0, 0, 0, horizon);
    grad.addColorStop(0, '#062a33');
    grad.addColorStop(0.3, '#0f6b66');
    grad.addColorStop(0.62, '#4fc49a');
    grad.addColorStop(0.86, '#c9ec98');
    grad.addColorStop(1, '#ffe08a');
    g.fillStyle = grad; g.fillRect(0, 0, w, horizon + 1);

    // Soleil et halo
    const sx = w * 0.7, sy = horizon - 30;
    const sun = g.createRadialGradient(sx, sy, 0, sx, sy, H * 0.55);
    sun.addColorStop(0, 'rgba(255,250,210,1)');
    sun.addColorStop(0.08, 'rgba(255,226,120,.9)');
    sun.addColorStop(0.3, 'rgba(255,190,80,.28)');
    sun.addColorStop(1, 'rgba(255,190,80,0)');
    g.fillStyle = sun; g.fillRect(0, 0, w, horizon + 1);

    // Rayons dramatiques
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI + (i / 14) * Math.PI + 0.1;
      g.beginPath(); g.moveTo(sx, sy);
      g.arc(sx, sy, H * 1.2, a, a + 0.07);
      g.closePath();
      g.fillStyle = 'rgba(255,240,180,0.045)';
      g.fill();
    }
    g.restore();

    // Grande planète pâle dans le ciel (cel-shading)
    const px = w * 0.2, py = H * 0.16, pr = Math.min(W, H) * 0.11;
    g.save();
    g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2);
    g.fillStyle = '#bfe9d6'; g.fill();
    g.clip();
    g.beginPath(); g.arc(px + pr * 0.45, py + pr * 0.3, pr * 1.05, 0, Math.PI * 2);
    g.fillStyle = '#86c9b5'; g.fill();
    const r = rng(7);
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.ellipse(px + (r() - 0.5) * pr * 1.4, py + (r() - 0.5) * pr * 1.4, pr * (0.08 + r() * 0.14), pr * (0.06 + r() * 0.1), 0, 0, Math.PI * 2);
      g.fillStyle = 'rgba(70,140,130,.45)'; g.fill();
    }
    g.restore();
    g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2);
    g.lineWidth = 3; g.strokeStyle = 'rgba(11,35,38,.55)'; g.stroke();
    // anneau
    g.save(); g.translate(px, py); g.rotate(-0.35);
    g.beginPath(); g.ellipse(0, 0, pr * 1.75, pr * 0.32, 0, Math.PI * 0.05, Math.PI * 0.95, true);
    g.lineWidth = 5; g.strokeStyle = 'rgba(255,240,190,.55)'; g.stroke();
    g.restore();

    // Mer au-dessous de l'horizon
    const sea = g.createLinearGradient(0, horizon, 0, H);
    sea.addColorStop(0, '#9fe3c2');
    sea.addColorStop(0.08, '#3fb8a8');
    sea.addColorStop(0.5, '#147a80');
    sea.addColorStop(1, '#073d4a');
    g.fillStyle = sea; g.fillRect(0, horizon, w, H - horizon);
    // reflet du soleil
    g.save(); g.scale(1, 0.25);
    const ref = g.createRadialGradient(sx, horizon * 4, 0, sx, horizon * 4, W * 0.35);
    ref.addColorStop(0, 'rgba(255,240,170,.55)');
    ref.addColorStop(1, 'rgba(255,240,170,0)');
    g.fillStyle = ref; g.fillRect(0, horizon * 4, w, (H - horizon) * 4);
    g.restore();
    return L;
  }

  function spire(g, x, baseY, width, height, light, dark, r) {
    // Pic rocheux abrupt : silhouette irrégulière + face ombrée
    const pts = [];
    const steps = 7;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push([x - width / 2 + (width * 0.25) * t + (r() - 0.5) * width * 0.12, baseY - height * t]);
    }
    const topW = width * (0.18 + r() * 0.2);
    const right = [];
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      right.push([x + width / 2 - (width / 2 - topW / 2) * t + (r() - 0.5) * width * 0.12, baseY - height * t]);
    }
    const poly = pts.concat(right);
    g.beginPath();
    poly.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
    g.closePath();
    g.fillStyle = light; g.fill();
    // face d'ombre (moitié droite)
    g.save(); g.clip();
    g.beginPath();
    g.moveTo(x + (r() - 0.5) * width * 0.1, baseY - height - 5);
    g.lineTo(x + width, baseY - height - 5);
    g.lineTo(x + width, baseY + 5);
    g.lineTo(x + width * 0.05, baseY + 5);
    g.closePath();
    g.fillStyle = dark; g.fill();
    // strates
    g.strokeStyle = 'rgba(11,35,38,.35)'; g.lineWidth = 1.5;
    for (let k = 1; k < 5; k++) {
      const yy = baseY - height * (k / 5) + (r() - 0.5) * 8;
      g.beginPath(); g.moveTo(x - width, yy); g.lineTo(x + width, yy + (r() - 0.5) * 10); g.stroke();
    }
    g.restore();
    g.beginPath();
    poly.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
    g.closePath();
    g.lineWidth = 2.5; g.strokeStyle = OUTLINE; g.stroke();
    return { topX: x, topY: baseY - height, topW };
  }

  function ballTree(g, x, y, size) {
    g.lineWidth = 2; g.strokeStyle = OUTLINE;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - size * 1.6);
    g.lineWidth = Math.max(2, size * 0.18); g.strokeStyle = '#3b5a2a'; g.stroke();
    g.beginPath(); g.arc(x, y - size * 1.9, size, 0, Math.PI * 2);
    g.fillStyle = '#3fbf5a'; g.fill();
    g.beginPath(); g.arc(x - size * 0.3, y - size * 2.15, size * 0.55, 0, Math.PI * 2);
    g.fillStyle = '#8cf07a'; g.fill();
    g.beginPath(); g.arc(x, y - size * 1.9, size, 0, Math.PI * 2);
    g.lineWidth = 2; g.strokeStyle = OUTLINE; g.stroke();
  }

  function drawFarRidge() {
    const L = layer(W + MARGIN * 2, H);
    const g = L.g, w = L.w;
    const r = rng(11);
    // crête lointaine brumeuse
    g.beginPath(); g.moveTo(0, horizon);
    let x = 0;
    while (x < w) {
      x += 20 + r() * 40;
      g.lineTo(x, horizon - 20 - r() * 55);
    }
    g.lineTo(w, horizon); g.closePath();
    g.fillStyle = 'rgba(70,150,135,.75)'; g.fill();
    // fines aiguilles lointaines
    const n = Math.round(w / 140);
    for (let i = 0; i < n; i++) {
      const sx = (i + r()) * (w / n);
      spire(g, sx, horizon + 2, 18 + r() * 26, 60 + r() * 140, 'rgba(98,170,150,.92)', 'rgba(64,128,118,.92)', r);
    }
    return L;
  }

  function drawMidRocks() {
    const L = layer(W + MARGIN * 2, H);
    const g = L.g, w = L.w;
    const r = rng(29);
    const n = Math.max(4, Math.round(w / 230));
    for (let i = 0; i < n; i++) {
      // laisser le centre plus dégagé pour l'interface
      const t = (i + 0.2 + r() * 0.6) / n;
      const sx = t * w;
      const central = Math.abs(t - 0.5) < 0.18;
      const height = (central ? 0.12 : 0.22 + r() * 0.2) * H;
      const width = 40 + r() * 60;
      const base = horizon + 18 + r() * 30;
      const top = spire(g, sx, base, width, height, '#4e9c7d', '#2c6658', r);
      if (r() < 0.75) {
        const trees = 1 + Math.floor(r() * 3);
        for (let k = 0; k < trees; k++) ballTree(g, top.topX + (k - (trees - 1) / 2) * 11, top.topY + 3, 5 + r() * 4);
      }
      // écume à la base
      g.beginPath(); g.ellipse(sx, base, width * 0.65, 5, 0, 0, Math.PI * 2);
      g.fillStyle = 'rgba(230,255,245,.55)'; g.fill();
    }
    return L;
  }

  function makeIsland(seed, size) {
    const r = rng(seed);
    const w = size, h = size * 1.1;
    const L = layer(w + 20, h + 40);
    const g = L.g;
    const cx = (w + 20) / 2, topY = h * 0.28;
    // rocher en cône inversé irrégulier
    g.beginPath();
    g.moveTo(cx - w / 2, topY);
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      g.lineTo(cx - w / 2 + (w / 2) * t + (r() - 0.5) * 10, topY + (h * 0.9) * Math.sin(t * Math.PI / 2) * (i === steps ? 1 : 0.6 + r() * 0.4));
    }
    for (let i = steps - 1; i >= 0; i--) {
      const t = i / steps;
      g.lineTo(cx + w / 2 - (w / 2) * t + (r() - 0.5) * 10, topY + (h * 0.9) * Math.sin(t * Math.PI / 2) * (0.6 + r() * 0.4));
    }
    g.closePath();
    g.fillStyle = '#7a6a8a'; g.fill();
    g.save(); g.clip();
    g.fillStyle = '#4d4163'; g.fillRect(cx + w * 0.02, 0, w, h + 40);
    g.strokeStyle = 'rgba(11,35,38,.4)'; g.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) { const yy = topY + 14 + k * (h * 0.16); g.beginPath(); g.moveTo(0, yy); g.lineTo(w + 20, yy + (r() - 0.5) * 12); g.stroke(); }
    g.restore();
    g.lineWidth = 2.5; g.strokeStyle = OUTLINE; g.stroke();
    // plateau herbeux
    g.beginPath(); g.ellipse(cx, topY, w / 2 + 4, h * 0.08, 0, 0, Math.PI * 2);
    g.fillStyle = '#4fcf6a'; g.fill();
    g.beginPath(); g.ellipse(cx - w * 0.08, topY - 2, w * 0.36, h * 0.045, 0, 0, Math.PI * 2);
    g.fillStyle = '#9bf58a'; g.fill();
    g.beginPath(); g.ellipse(cx, topY, w / 2 + 4, h * 0.08, 0, 0, Math.PI * 2);
    g.lineWidth = 2.5; g.strokeStyle = OUTLINE; g.stroke();
    const trees = 1 + Math.floor(r() * 3);
    for (let k = 0; k < trees; k++) ballTree(g, cx + (r() - 0.5) * w * 0.6, topY + 2, 6 + r() * size * 0.05);
    return L;
  }

  function makeCloud(seed, size, tint) {
    const r = rng(seed);
    const w = size, h = size * 0.5;
    const L = layer(w + 30, h + 30);
    const g = L.g;
    const blobs = [];
    const n = 6 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const rad = h * (0.25 + Math.sin(t * Math.PI) * 0.32 + r() * 0.08);
      blobs.push([15 + rad + t * (w - rad * 2), 15 + h - rad * 0.9 - r() * h * 0.1, rad]);
    }
    const pass = (color, grow, dy) => {
      g.fillStyle = color;
      blobs.forEach(([x, y, rad]) => { g.beginPath(); g.arc(x, y + dy, Math.max(1, rad + grow), 0, Math.PI * 2); g.fill(); });
    };
    pass(tint.outline, 2.5, 0);
    pass(tint.shadow, 0, 0);
    pass(tint.light, -rng(seed + 1)() * 2 - h * 0.08, -h * 0.1);
    return L;
  }

  function makeMote(color) {
    const L = layer(24, 24);
    const g = L.g;
    const rg = g.createRadialGradient(12, 12, 0, 12, 12, 12);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.25, `rgba(${color},.9)`);
    rg.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = rg; g.fillRect(0, 0, 24, 24);
    return L;
  }

  // ------------------------------------------------------------ setup
  function build() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.ceil(W * DPR); canvas.height = Math.ceil(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    horizon = Math.round(H * 0.7);
    sky = drawSky();
    farRidge = drawFarRidge();
    midRocks = drawMidRocks();

    const r = rng(101);
    const base = Math.min(W, 1400);
    islands = [
      { L: makeIsland(3, base * 0.13), x: 0.08, y: 0.3, depth: 0.35, phase: 0 },
      { L: makeIsland(8, base * 0.09), x: 0.86, y: 0.22, depth: 0.28, phase: 1.7 },
      { L: makeIsland(15, base * 0.07), x: 0.62, y: 0.42, depth: 0.22, phase: 3.1 },
      { L: makeIsland(21, base * 0.06), x: 0.32, y: 0.12, depth: 0.18, phase: 4.4 },
    ];
    const far = { outline: 'rgba(40,110,100,.0)', shadow: 'rgba(200,240,215,.55)', light: 'rgba(250,255,240,.6)' };
    const near = { outline: '#0b2326', shadow: '#b9dccd', light: '#fbfff4' };
    const warm = { outline: '#0b2326', shadow: '#f0b878', light: '#fff1c8' };
    clouds = [];
    for (let i = 0; i < 6; i++) clouds.push({ L: makeCloud(200 + i, base * (0.16 + r() * 0.12), far), x: r() * W, y: H * (0.05 + r() * 0.3), speed: 4 + r() * 4, depth: 0.06, far: true });
    for (let i = 0; i < 4; i++) clouds.push({ L: makeCloud(300 + i, base * (0.25 + r() * 0.15), i % 2 ? warm : near), x: r() * W, y: i < 2 ? H * (0.58 + r() * 0.08) : -H * 0.02 + r() * H * 0.08, speed: 9 + r() * 8, depth: 0.55, far: false });
    moteSprites = { cyan: makeMote('62,240,255'), gold: makeMote('255,210,63'), green: makeMote('120,255,180') };
    const keys = Object.keys(moteSprites);
    motes = Array.from({ length: Math.round(Math.min(70, W / 18)) }, () => ({
      x: Math.random() * W, y: Math.random() * H, s: 0.3 + Math.random() * 0.8,
      v: 8 + Math.random() * 26, ph: Math.random() * 6.28, k: keys[Math.floor(Math.random() * keys.length)],
    }));
  }

  function blit(L, x, y) { ctx.drawImage(L.c, x, y, L.w, L.h); }

  let last = performance.now();
  function frame(now) {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = Math.max(last, now);
    const t = now / 1000;
    cam.x += (mouse.x - cam.x) * 0.04;
    cam.y += (mouse.y - cam.y) * 0.04;
    const off = (depth) => [-MARGIN + cam.x * MARGIN * depth * 2.2, cam.y * 18 * depth];

    let [ox, oy] = off(0.02);
    blit(sky, ox, oy);

    clouds.forEach((c) => {
      if (!c.far) return;
      c.x += c.speed * dt;
      if (c.x > W + 50) c.x = -c.L.w - 50;
      const [cx, cy] = off(c.depth);
      blit(c.L, c.x + cx + MARGIN, c.y + cy);
    });

    [ox, oy] = off(0.08);
    blit(farRidge, ox, oy);

    // reflets scintillants sur la mer
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 40; i++) {
      const yy = horizon + 8 + ((i * 37) % Math.max(1, H - horizon));
      const depthT = (yy - horizon) / Math.max(1, H - horizon);
      const xx = ((i * 211 + t * (14 + depthT * 30)) % (W + 120)) - 60;
      const a = 0.1 + 0.18 * Math.abs(Math.sin(t * 1.6 + i));
      ctx.fillStyle = `rgba(220,255,240,${a})`;
      ctx.fillRect(xx, yy, 18 + depthT * 50, 1.5 + depthT * 1.5);
    }
    ctx.restore();

    [ox, oy] = off(0.2);
    blit(midRocks, ox, oy);

    islands.forEach((is) => {
      const [ix, iy] = off(is.depth);
      const bob = Math.sin(t * 0.8 + is.phase) * 9;
      blit(is.L, is.x * W - is.L.w / 2 + ix + MARGIN, is.y * H + bob + iy);
    });

    clouds.forEach((c) => {
      if (c.far) return;
      c.x += c.speed * dt;
      if (c.x > W + 50) c.x = -c.L.w - 50;
      const [cx, cy] = off(c.depth);
      blit(c.L, c.x + cx + MARGIN, c.y + cy);
    });

    // particules d'énergie flottantes
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    motes.forEach((m) => {
      m.y -= m.v * dt;
      m.x += Math.sin(t * 1.2 + m.ph) * 12 * dt;
      if (m.y < -20) { m.y = H + 20; m.x = Math.random() * W; }
      const tw = 0.55 + 0.45 * Math.sin(t * 3 + m.ph);
      const size = 24 * m.s * (0.7 + tw * 0.5);
      ctx.globalAlpha = 0.35 + tw * 0.5;
      ctx.drawImage(moteSprites[m.k].c, m.x + cam.x * 30 * m.s - size / 2, m.y - size / 2, size, size);
    });
    ctx.restore();

    // éclair global (déclenché par les attaques ultimes)
    if (pulse.a > 0.01) {
      ctx.fillStyle = `rgba(${pulse.color},${pulse.a})`;
      ctx.fillRect(0, 0, W, H);
      pulse.a *= Math.pow(0.04, dt);
    }

    requestAnimationFrame(frame);
  }

  window.addEventListener('pointermove', (e) => {
    mouse.x = (e.clientX / W) * 2 - 1;
    mouse.y = (e.clientY / H) * 2 - 1;
  }, { passive: true });

  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(build, 150); });

  build();
  requestAnimationFrame(frame);

  window.Background = {
    pulse(color = '255,210,63', a = 0.6) { pulse = { color, a }; },
  };
})();
