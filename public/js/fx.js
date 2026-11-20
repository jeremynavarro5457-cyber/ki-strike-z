/**
 * Moteur d'effets visuels plein écran (canvas superposé).
 * Salves de Ki, rayon ultime, explosions, ondes de choc, particules,
 * flashs, tremblement d'écran et textes manga flottants.
 */
(function () {
  'use strict';
  const canvas = document.getElementById('fx');
  const ctx = canvas.getContext('2d');
  const app = document.getElementById('app');
  const floatLayer = document.getElementById('float-layer');

  let W = 0, H = 0, DPR = 1;
  const effects = [];
  const particles = [];
  const MAX_PARTICLES = 1400;
  let running = false;
  let last = 0;
  let shake = { amt: 0, decay: 0 };
  let screenFlash = { a: 0, color: '255,255,255', decay: 6 };

  const COLORS = {
    cyan: '62,240,255',
    blue: '30,123,255',
    gold: '255,210,63',
    orange: '255,159,28',
    fire: '255,90,28',
    red: '232,32,42',
    magenta: '224,64,255',
    purple: '140,50,230',
    white: '255,255,255',
  };
  const FIRE = [COLORS.white, COLORS.gold, COLORS.gold, COLORS.orange, COLORS.fire, COLORS.red];

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.ceil(W * DPR); canvas.height = Math.ceil(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ------------------------------------------------------------ sprites
  const glowCache = new Map();
  function glow(color) {
    let c = glowCache.get(color);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.2, `rgba(${color},1)`);
    rg.addColorStop(0.5, `rgba(${color},.35)`);
    rg.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    glowCache.set(color, c);
    return c;
  }

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ------------------------------------------------------------ particules
  function spawn(p) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push(Object.assign({ vx: 0, vy: 0, life: 1, age: 0, size: 10, color: COLORS.white, type: 'glow', drag: 2, gravity: 0, grow: 0, rot: 0, vr: 0 }, p));
    start();
  }

  function burst(x, y, n, opts) {
    for (let i = 0; i < n; i++) {
      const a = opts.angle != null ? opts.angle + rand(-opts.spread, opts.spread) : rand(0, Math.PI * 2);
      const sp = rand(opts.speed[0], opts.speed[1]);
      spawn({
        x: x + rand(-(opts.jitter || 0), opts.jitter || 0),
        y: y + rand(-(opts.jitter || 0), opts.jitter || 0),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp + (opts.lift || 0),
        life: rand(opts.life[0], opts.life[1]),
        size: rand(opts.size[0], opts.size[1]),
        color: Array.isArray(opts.color) ? pick(opts.color) : opts.color,
        type: opts.type || 'glow',
        drag: opts.drag ?? 2,
        gravity: opts.gravity || 0,
        grow: opts.grow || 0,
        vr: rand(-8, 8),
      });
    }
  }

  function drawParticle(p) {
    const k = 1 - p.age / p.life;
    if (p.type === 'glow') {
      const s = p.size * (0.4 + k * 0.6);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, k * 1.4);
      ctx.drawImage(glow(p.color), p.x - s, p.y - s, s * 2, s * 2);
    } else if (p.type === 'spark') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k;
      ctx.strokeStyle = `rgb(${p.color})`;
      ctx.lineWidth = p.size * 0.25;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
      ctx.stroke();
    } else if (p.type === 'smoke') {
      const s = p.size + p.grow * p.age;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = k * 0.55;
      ctx.fillStyle = `rgb(${p.color})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, s), 0, Math.PI * 2); ctx.fill();
    } else if (p.type === 'debris') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = `rgb(${p.color})`;
      ctx.strokeStyle = '#07070f'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-p.size, -p.size * 0.6); ctx.lineTo(p.size * 0.8, -p.size * 0.4); ctx.lineTo(p.size * 0.4, p.size * 0.7); ctx.lineTo(-p.size * 0.7, p.size * 0.5);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  // ------------------------------------------------------------ boucle
  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(loop);
  }

  function loop(now) {
    try {
      step(now);
    } catch (err) {
      // Un effet défaillant ne doit jamais figer la boucle (ni les promesses en attente).
      console.error('[FX]', err);
      effects.splice(0).forEach((e) => e.onEnd && e.onEnd());
      particles.length = 0;
    }
    if (effects.length || particles.length || shake.amt || screenFlash.a) requestAnimationFrame(loop);
    else { running = false; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H); }
  }

  function step(now) {
    // L'horodatage rAF peut précéder performance.now() : on borne dt à [0, 40 ms].
    const dt = Math.max(0, Math.min(0.04, (now - last) / 1000));
    last = Math.max(last, now);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      e.t += dt;
      if (e.t >= e.dur) { effects.splice(i, 1); if (e.onEnd) e.onEnd(); continue; }
    }
    // dessin dans l'ordre d'ajout (les rayons sous les explosions)
    for (const e of effects) {
      ctx.save();
      e.draw(e.t / e.dur, dt, e);
      ctx.restore();
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) { particles.splice(i, 1); continue; }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    ctx.save();
    for (const p of particles) drawParticle(p);
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (screenFlash.a > 0.01) {
      ctx.fillStyle = `rgba(${screenFlash.color},${screenFlash.a})`;
      ctx.fillRect(0, 0, W, H);
      screenFlash.a *= Math.exp(-screenFlash.decay * dt);
    } else screenFlash.a = 0;

    if (shake.amt > 0.3) {
      const sx = rand(-shake.amt, shake.amt), sy = rand(-shake.amt, shake.amt);
      app.style.transform = `translate(${sx}px, ${sy}px) rotate(${rand(-shake.amt, shake.amt) * 0.04}deg)`;
      shake.amt *= Math.exp(-shake.decay * dt);
    } else if (shake.amt) {
      shake.amt = 0;
      app.style.transform = '';
    }
  }

  function addEffect(dur, draw, onEnd) {
    effects.push({ t: 0, dur, draw, onEnd });
    start();
  }

  // ------------------------------------------------------------ primitives
  function ring(x, y, r0, r1, dur, color, width = 6) {
    addEffect(dur, (k) => {
      const e = 1 - Math.pow(1 - k, 3);
      const r = r0 + (r1 - r0) * e;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - k);
      ctx.strokeStyle = `rgb(${color})`;
      ctx.lineWidth = width * (1 - k * 0.7);
      ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = (1 - k) * 0.35;
      ctx.lineWidth = width * 3;
      ctx.stroke();
    });
  }

  function flashBall(x, y, r, dur, color) {
    addEffect(dur, (k) => {
      const s = r * (0.6 + k * 0.8);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1 - k;
      ctx.drawImage(glow(color), x - s * 1.6, y - s * 1.6, s * 3.2, s * 3.2);
      ctx.fillStyle = `rgba(255,255,255,${(1 - k) * 0.9})`;
      ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, s * 0.45 * (1 - k)), 0, Math.PI * 2); ctx.fill();
    });
  }

  function lightning(x0, y0, x1, y1, color, width = 2, jag = 14) {
    const segs = 8;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      ctx.lineTo(x0 + (x1 - x0) * t + rand(-jag, jag), y0 + (y1 - y0) * t + rand(-jag, jag));
    }
    ctx.lineTo(x1, y1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(${color},0.5)`; ctx.lineWidth = width * 3; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = width; ctx.stroke();
  }

  function speedLines(cx, cy, k, color) {
    const n = 70;
    const inner = Math.min(W, H) * (0.32 + 0.05 * Math.sin(k * 30));
    const outer = Math.hypot(W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(${color},${0.22 * Math.sin(Math.PI * k)})`;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.03, 0.03);
      const w = rand(0.004, 0.018);
      const r0 = inner + rand(0, 120);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a - w) * outer, cy + Math.sin(a - w) * outer);
      ctx.lineTo(cx + Math.cos(a + w) * outer, cy + Math.sin(a + w) * outer);
      ctx.closePath(); ctx.fill();
    }
  }

  // ------------------------------------------------------------ API publique
  const FX = {
    COLORS,

    shake(amount = 10, decay = 5) {
      shake.amt = Math.max(shake.amt, amount);
      shake.decay = decay;
      start();
    },

    flash(color = COLORS.white, alpha = 0.6, decay = 6) {
      screenFlash = { a: Math.max(alpha, screenFlash.a), color, decay };
      start();
    },

    /** Salve de Ki : boule d'énergie qui traverse l'écran avec traînée lumineuse. */
    kiBlast(from, to, color = COLORS.cyan, dur = 0.55) {
      return new Promise((resolve) => {
        const dx = to.x - from.x, dy = to.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        const bend = rand(-0.18, 0.18) * len;
        const cx = (from.x + to.x) / 2 + nx * bend, cy = (from.y + to.y) / 2 + ny * bend;
        const pos = (t) => {
          const u = 1 - t;
          return [u * u * from.x + 2 * u * t * cx + t * t * to.x, u * u * from.y + 2 * u * t * cy + t * t * to.y];
        };
        // éclair de départ
        flashBall(from.x, from.y, 26, 0.25, color);
        burst(from.x, from.y, 10, { speed: [60, 200], life: [0.2, 0.4], size: [6, 12], color: [color, COLORS.white] });
        const trail = [];
        addEffect(dur, (k) => {
          const e = k * k * (1.4 - 0.4 * k); // accélération
          const [x, y] = pos(Math.min(1, e));
          trail.push([x, y]);
          if (trail.length > 14) trail.shift();
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineCap = 'round';
          for (let i = 1; i < trail.length; i++) {
            const a = i / trail.length;
            ctx.strokeStyle = `rgba(${color},${a * 0.7})`;
            ctx.lineWidth = 16 * a;
            ctx.beginPath(); ctx.moveTo(trail[i - 1][0], trail[i - 1][1]); ctx.lineTo(trail[i][0], trail[i][1]); ctx.stroke();
            ctx.strokeStyle = `rgba(255,255,255,${a * 0.9})`;
            ctx.lineWidth = 5 * a;
            ctx.stroke();
          }
          const s = 22 + Math.sin(k * 60) * 3;
          ctx.drawImage(glow(color), x - s * 1.8, y - s * 1.8, s * 3.6, s * 3.6);
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(x, y, s * 0.32, 0, Math.PI * 2); ctx.fill();
          spawn({ x: x + rand(-4, 4), y: y + rand(-4, 4), vx: rand(-40, 40), vy: rand(-40, 40), life: rand(0.2, 0.45), size: rand(5, 11), color: Math.random() < 0.3 ? COLORS.white : color, drag: 3 });
        }, resolve);
      });
    },

    /** Explosion façon anime : flash, ondes de choc, flammes, étincelles, fumée, débris. */
    explosion(x, y, scale = 1, opts = {}) {
      const palette = opts.palette || FIRE;
      flashBall(x, y, 46 * scale, 0.35, COLORS.gold);
      ring(x, y, 6, 70 * scale, 0.5, COLORS.gold, 7 * scale);
      ring(x, y, 4, 110 * scale, 0.7, COLORS.white, 3 * scale);
      burst(x, y, Math.round(34 * scale), { speed: [60, 360 * scale], life: [0.35, 0.85], size: [8, 20 * scale], color: palette, drag: 3.2 });
      burst(x, y, Math.round(16 * scale), { type: 'spark', speed: [300, 700 * scale], life: [0.25, 0.55], size: [8, 14], color: [COLORS.white, COLORS.gold], drag: 2.5, gravity: 400 });
      burst(x, y, Math.round(8 * scale), { type: 'smoke', speed: [20, 70], life: [0.9, 1.6], size: [8, 14 * scale], color: ['40,36,44', '60,52,58', '28,26,34'], drag: 1.5, lift: -40, grow: 18, jitter: 8 });
      burst(x, y, Math.round(6 * scale), { type: 'debris', speed: [140, 320], life: [0.6, 1.1], size: [3, 6], color: ['120,130,150', '200,210,220', '255,159,28'], drag: 1, gravity: 700, angle: -Math.PI / 2, spread: 1.2 });
    },

    /** Tir raté : l'énergie se dissipe dans la mer. */
    splash(x, y) {
      ring(x, y, 4, 48, 0.55, COLORS.cyan, 4);
      ring(x, y, 2, 28, 0.4, COLORS.white, 2);
      flashBall(x, y, 18, 0.25, COLORS.cyan);
      burst(x, y, 16, { speed: [40, 180], life: [0.3, 0.6], size: [4, 10], color: [COLORS.cyan, COLORS.white, COLORS.blue], drag: 3 });
      burst(x, y, 10, { type: 'spark', speed: [160, 320], life: [0.35, 0.6], size: [6, 10], color: [COLORS.white, COLORS.cyan], drag: 1, gravity: 900, angle: -Math.PI / 2, spread: 0.7 });
    },

    /**
     * Attaque ultime : concentration du Ki puis rayon massif.
     * Résout la promesse à l'instant de l'impact.
     */
    ultimate(from, to, color = COLORS.cyan, { charge = 1.15, fire = 1.0, width = 70 } = {}) {
      return new Promise((resolve) => {
        const ang = Math.atan2(to.y - from.y, to.x - from.x);
        const len = Math.hypot(to.x - from.x, to.y - from.y);
        // Phase 1 : concentration
        addEffect(charge, (k) => {
          speedLines(from.x, from.y, k, '255,255,255');
          const r = 8 + k * k * 46;
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 1;
          ctx.drawImage(glow(color), from.x - r * 2.4, from.y - r * 2.4, r * 4.8, r * 4.8);
          ctx.drawImage(glow(COLORS.white), from.x - r, from.y - r, r * 2, r * 2);
          for (let i = 0; i < 2 + k * 4; i++) {
            const a = rand(0, Math.PI * 2), d = r * rand(1.3, 2.6);
            lightning(from.x, from.y, from.x + Math.cos(a) * d, from.y + Math.sin(a) * d, color, 1.5, 6);
          }
          if (Math.random() < 0.9) {
            const a = rand(0, Math.PI * 2), d = rand(90, 170);
            spawn({ x: from.x + Math.cos(a) * d, y: from.y + Math.sin(a) * d, vx: -Math.cos(a) * d * 2.6, vy: -Math.sin(a) * d * 2.6, life: 0.38, size: rand(5, 10), color: pick([color, COLORS.white]), drag: 0 });
          }
        }, () => {
          // Phase 2 : le rayon part
          FX.flash(color, 0.5, 5);
          FX.shake(14, 3);
          if (window.Background) Background.pulse(color, 0.35);
          let impacted = false;
          const rings = Array.from({ length: 5 }, (_, i) => i / 5);
          addEffect(fire, (k) => {
            const grow = Math.min(1, k / 0.15);
            const fade = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
            const reach = Math.min(1, k / 0.22);
            const L = len * reach;
            const w = width * grow * fade * (1 + Math.sin(k * 90) * 0.07);
            ctx.translate(from.x, from.y);
            ctx.rotate(ang);
            ctx.globalCompositeOperation = 'lighter';
            ctx.lineCap = 'round';
            const layer = (lw, style) => { ctx.strokeStyle = style; ctx.lineWidth = Math.max(0.5, lw); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L, 0); ctx.stroke(); };
            layer(w * 1.9, `rgba(${color},0.25)`);
            layer(w * 1.2, `rgba(${color},0.6)`);
            layer(w * 0.75, `rgba(${color},0.95)`);
            layer(w * 0.38, 'rgba(255,255,255,1)');
            // anneaux d'énergie qui filent le long du rayon
            ctx.strokeStyle = `rgba(255,255,255,${0.7 * fade})`;
            ctx.lineWidth = 3;
            rings.forEach((r0) => {
              const p = ((r0 + k * 2.2) % 1) * L;
              ctx.beginPath(); ctx.ellipse(p, 0, w * 0.18, w * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
            });
            // tête du rayon
            const hs = w * 1.6;
            ctx.drawImage(glow(color), L - hs, -hs, hs * 2, hs * 2);
            ctx.drawImage(glow(COLORS.white), -w, -w, w * 2, w * 2);
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
            if (reach >= 1) {
              if (!impacted) { impacted = true; resolve(); }
              if (Math.random() < 0.8) burst(to.x, to.y, 3, { speed: [150, 420], life: [0.2, 0.5], size: [8, 16], color: [color, COLORS.white, COLORS.gold], drag: 3 });
            }
          }, () => { if (!impacted) resolve(); });
        });
      });
    },

    /** Gros feu d'artifice de victoire. */
    celebrate() {
      for (let i = 0; i < 7; i++) {
        setTimeout(() => {
          const x = rand(W * 0.15, W * 0.85), y = rand(H * 0.15, H * 0.55);
          const c = pick([COLORS.gold, COLORS.cyan, COLORS.magenta, COLORS.fire]);
          ring(x, y, 4, 120, 0.8, c, 5);
          burst(x, y, 40, { speed: [80, 420], life: [0.6, 1.2], size: [6, 14], color: [c, COLORS.white], drag: 2, gravity: 160 });
        }, i * 260);
      }
    },

    /** Texte manga flottant. */
    text(x, y, str, cls = 'hit') {
      const el = document.createElement('div');
      el.className = 'float-text ' + cls;
      el.textContent = str;
      el.style.left = Math.max(80, Math.min(W - 80, x)) + 'px';
      el.style.top = Math.max(40, y) + 'px';
      floatLayer.appendChild(el);
      setTimeout(() => el.remove(), 1400);
    },

    /** Bandeau d'annonce plein écran (attaque ultime…). */
    announce(str, cls = '') {
      const el = document.createElement('div');
      el.className = 'announce ' + cls;
      el.textContent = str;
      floatLayer.appendChild(el);
      setTimeout(() => el.remove(), 1550);
    },
  };

  window.FX = FX;
})();
