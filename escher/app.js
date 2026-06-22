// =========================================================================
// Escher World — interactive elements for Khoren
// =========================================================================

(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ---------- GoatCounter tracking ----------
  // Path namespace: /escher/<slug>. Single dashboard at usjoh.goatcounter.com,
  // segmented by URL path. See HLD-013 + HLD-017 in personal/home-lab.
  function track(slug) {
    if (window.goatcounter && typeof window.goatcounter.count === 'function') {
      window.goatcounter.count({ path: '/escher/' + slug, event: true });
    }
  }
  const sectionSeen = new Set();
  function trackSection(id) {
    if (id && !sectionSeen.has(id)) {
      sectionSeen.add(id);
      track('section/' + id);
    }
  }
  const sectionInteracted = new Set();
  function ancestorSectionId(node) {
    while (node && node !== document.body) {
      if (node.tagName === 'SECTION' && node.id) return node.id;
      node = node.parentNode;
    }
    return null;
  }
  function trackInteraction(target) {
    const sid = ancestorSectionId(target);
    if (sid && !sectionInteracted.has(sid)) {
      sectionInteracted.add(sid);
      track('interact/' + sid + '/first');
    }
  }
  // Manual pageview after settle (we set no_onload=true in HTML)
  setTimeout(() => track('pageview'), 400);
  // Engagement heartbeats — calibrated for kid attention span
  [15000, 60000, 180000].forEach(ms => {
    setTimeout(() => track('heartbeat/' + (ms / 1000) + 's'), ms);
  });
  // Hashchange — explicit section navigation via top nav
  window.addEventListener('hashchange', () => {
    const id = (location.hash || '').replace(/^#/, '');
    trackSection(id);
  });
  if (location.hash) {
    setTimeout(() => trackSection(location.hash.replace(/^#/, '')), 500);
  }
  // IntersectionObserver — section visibility (first time only, dedup with hash)
  if ('IntersectionObserver' in window) {
    const sectionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.target.id) {
          trackSection(entry.target.id);
        }
      });
    }, { threshold: 0.5 });
    document.querySelectorAll('section[id]').forEach(s => sectionObserver.observe(s));
  }
  // Delegated click — data-track-event + interaction-per-section
  document.addEventListener('click', (e) => {
    const el = e.target && e.target.closest && e.target.closest('[data-track-event]');
    if (el) {
      const evt = el.getAttribute('data-track-event');
      if (evt) track(evt);
    }
    if (e.target) trackInteraction(e.target);
  }, true);
  // Delegated change — counts as interaction (dropdowns, toggles, color pickers)
  document.addEventListener('change', (e) => { if (e.target) trackInteraction(e.target); }, true);

  // ---------- Helpers ----------
  function el(tag, attrs, children) {
    const node = document.createElementNS(SVG_NS, tag);
    if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (children) for (const c of children) node.appendChild(c);
    return node;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // =======================================================================
  // 1. TESSELLATION LAB
  // =======================================================================
  const tessSvg = document.getElementById('tessSvg');
  const tessColorInput = document.getElementById('tessColor');
  const paletteEl = document.getElementById('palette');
  const tessPattern = document.getElementById('tessPattern');
  const tessRandom = document.getElementById('tessRandom');
  const tessClear = document.getElementById('tessClear');

  const PALETTE = ['#ff5577', '#ffcb47', '#6cb4ff', '#4ade80', '#c084fc', '#fb923c', '#f3efe6', '#0b0f24'];
  PALETTE.forEach((color, i) => {
    const b = document.createElement('button');
    b.style.background = color;
    b.title = color;
    b.type = 'button';
    if (i === 0) b.classList.add('active');
    b.addEventListener('click', () => {
      tessColorInput.value = color;
      [...paletteEl.children].forEach(c => c.classList.remove('active'));
      b.classList.add('active');
    });
    paletteEl.appendChild(b);
  });

  let isPainting = false;
  function colorTile(elem) {
    if (!elem || !elem.classList.contains('tile')) return;
    elem.setAttribute('fill', tessColorInput.value);
  }

  // -----------------------------------------------------------------------
  // TRUE TILINGS
  // -----------------------------------------------------------------------
  // The creature tilings (bird, fish, lizard) use Method A: a SQUARE cell of
  // side S whose OPPOSITE edges are exact translates of each other. A bump
  // pushed OUT of the top edge is exactly the notch the tile above needs;
  // a bump pushed OUT of the left edge is exactly the notch on the right.
  // Because opposite edges are identical translates, copies placed at every
  // (m*S, n*S) interlock with zero gaps and zero overlaps — guaranteed.
  //
  // Edges are stored as RELATIVE segment lists (SVG path commands without the
  // leading move) walking one edge. The opposite edge is the SAME list,
  // re-emitted; the closed path is built by walking
  //   top  (TL->TR)  then  right (TR->BR)  then  reversed bottom (BR->BL)
  //   then reversed left (BL->TL).
  // "Reversed" just plays the relative segments backwards with negated deltas,
  // so bottom is literally top + (0,S) and right is literally left + (S,0).
  // We only ever author TWO edge profiles (top and left); the other two are
  // derived, which is what makes the translate-equality exact by construction.

  const TILE = 64; // cell side S for creature tilings (divides evenly into overscan)

  // Reverse a list of relative [dx,dy] segments (so a walked edge can be
  // re-walked from the far end). Reversing preserves the shape exactly.
  function reverseSegs(segs) {
    return segs.slice().reverse().map(s => [-s[0], -s[1]]);
  }

  // Emit relative cubic-ish polyline as an SVG 'l' (line) command string.
  // We use straight segments for the deformed edges — they read as creature
  // outlines and keep the translate-equality trivially exact.
  function segsToPath(segs) {
    return segs.map(s => `l ${s[0]} ${s[1]}`).join(' ');
  }

  // Build a closed tile path string for a creature whose top & left edge
  // profiles are given as relative-segment lists that each sum to (S,0) and
  // (0,S) respectively. Drawn starting at the cell's top-left corner (tlx,tly).
  function creatureTilePath(tlx, tly, topSegs, leftSegs) {
    const top = topSegs;                 // TL -> TR, sums to (S,0)
    const right = leftSegs;              // TR -> BR  == left edge translated +S in x
    const bottom = reverseSegs(topSegs); // BR -> BL  == top edge translated +S in y, reversed
    const left = reverseSegs(leftSegs);  // BL -> TL  == left edge, reversed
    return `M ${tlx} ${tly} ${segsToPath(top)} ${segsToPath(right)} ${segsToPath(bottom)} ${segsToPath(left)} Z`;
  }

  // ---- Edge profiles (each authored ONCE; opposite edge is the translate) ----
  // S = TILE = 64. Segment deltas must sum to (S,0) for top, (0,S) for left.

  // BIRD: top edge = head + beak bump up, then wing dip; left edge = body curve.
  function birdEdges() {
    const S = TILE;
    // top: TL(0,0) -> TR(S,0). A beak/head pokes UP (negative y), tail dips down.
    const top = [
      [12, -10],  // up to head
      [10, 12],   // down behind head (notch)
      [10, -8],   // wing bump up
      [12, 8],    // back down
      [S - 44, -2] // glide to TR (remaining x, sums to S)
    ];
    // left: TL(0,0) -> BL(0,S). Belly pokes LEFT (negative x), then tucks in.
    const left = [
      [-10, 14],  // chest out (left)
      [12, 10],   // tuck in
      [-8, 14],   // leg out
      [6, S - 38] // to BL (remaining y, sums to S)
    ];
    return { top, left };
  }

  // FISH: top edge = back with a fin bump; left edge = head + tail notch.
  function fishEdges() {
    const S = TILE;
    const top = [
      [16, -6],   // back rises
      [10, -10],  // dorsal fin pokes up
      [12, 14],   // fin trailing edge dips (notch)
      [S - 38, 2] // glide to TR
    ];
    const left = [
      [-12, 16],  // nose/head pokes left
      [14, 12],   // gill tuck in
      [-10, 18],  // belly fin out
      [8, S - 46] // to BL
    ];
    return { top, left };
  }

  // LIZARD: translation tiling (Method A fallback per spec — a truly-tiling
  // translated lizard beats a gappy rotated one). Top edge = head + snout;
  // left edge = front leg out / haunch.
  function lizardEdges() {
    const S = TILE;
    const top = [
      [10, -12],  // snout pokes up
      [8, 14],    // notch behind snout
      [12, -10],  // shoulder hump up
      [10, 10],   // down
      [S - 40, -2]// glide to TR
    ];
    const left = [
      [-12, 12],  // front leg pokes left
      [10, 10],   // tuck
      [-10, 16],  // back leg pokes left
      [12, 8],    // tuck
      [0, S - 46] // straight to BL
    ];
    return { top, left };
  }

  const CREATURE_EDGES = { bird: birdEdges, fish: fishEdges, lizard: lizardEdges };

  // Two-color Escher scheme: alternate by (row+col) parity.
  const TESS_DARK = '#1a1f48';
  const TESS_LIGHT = '#2c3470';
  function baseFill(row, col) {
    return ((row + col) & 1) ? TESS_LIGHT : TESS_DARK;
  }

  // Add a small eye dot + (for some) a defining mark so the creature reads.
  // The eye is decorative, not a tile, so painting still targets the tile path.
  function addCreatureFeatures(kind, tlx, tly) {
    const S = TILE;
    // Eye position chosen near the "head" region of each profile.
    let ex, ey;
    if (kind === 'bird') { ex = tlx + S * 0.30; ey = tly + S * 0.20; }
    else if (kind === 'fish') { ex = tlx + S * 0.18; ey = tly + S * 0.30; }
    else { ex = tlx + S * 0.26; ey = tly + S * 0.18; } // lizard
    tessSvg.appendChild(el('circle', {
      cx: ex.toFixed(1), cy: ey.toFixed(1), r: 2.4,
      fill: '#0b0f24', 'pointer-events': 'none', class: 'tess-eye'
    }));
  }

  function buildCreatureTiling(kind) {
    const W = 600, H = 400, S = TILE;
    const edges = CREATURE_EDGES[kind]();
    // Overscan: start one cell before 0 and run one past the far edge so the
    // 600x400 viewBox is filled edge-to-edge with no blank margins.
    let row = 0;
    for (let y = -S; y < H + S; y += S, row++) {
      let col = 0;
      for (let x = -S; x < W + S; x += S, col++) {
        const d = creatureTilePath(x, y, edges.top, edges.left);
        const bf = baseFill(row, col);
        tessSvg.appendChild(el('path', {
          d,
          class: 'tile',
          fill: bf,
          'data-base': bf,
          stroke: '#0b0f24',
          'stroke-width': '1.5',
          'stroke-linejoin': 'round'
        }));
        addCreatureFeatures(kind, x, y);
      }
    }
  }

  function buildGeometricTiling(kind) {
    const W = 600, H = 400;
    if (kind === 'hex') {
      const r = 30;
      const w = Math.sqrt(3) * r;
      const h = 1.5 * r;
      for (let row = 0, y = 0; y < H + h; y += h, row++) {
        const xOffset = (row % 2) * (w / 2);
        for (let col = 0, x = -w; x < W + w; x += w, col++) {
          const cx = x + xOffset, cy = y;
          const pts = [];
          for (let i = 0; i < 6; i++) {
            const a = Math.PI / 3 * i + Math.PI / 6;
            pts.push((cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1));
          }
          const bf = baseFill(row, col);
          tessSvg.appendChild(el('polygon', {
            points: pts.join(' '),
            class: 'tile',
            fill: bf,
            'data-base': bf,
            stroke: '#0b0f24',
            'stroke-width': '1.5'
          }));
        }
      }
    } else { // 'tri'
      const s = 50;
      const h = (Math.sqrt(3) / 2) * s;
      for (let row = 0, y = 0; y < H + h; y += h, row++) {
        for (let col = 0, x = 0; x < W + s; x += s / 2, col++) {
          const up = (row + col) % 2 === 0;
          const x1 = x, y1 = y;
          const points = up
            ? [x1, y1 + h, x1 + s / 2, y1, x1 + s, y1 + h]
            : [x1, y1, x1 + s / 2, y1 + h, x1 + s, y1];
          // Alternate the two triangle orientations as the 2-color scheme so
          // the interlock reads even before tapping.
          const bf = up ? TESS_DARK : TESS_LIGHT;
          tessSvg.appendChild(el('polygon', {
            points: points.join(' '),
            class: 'tile',
            fill: bf,
            'data-base': bf,
            stroke: '#0b0f24',
            'stroke-width': '1.5'
          }));
        }
      }
    }
  }

  function buildTessellation(kind) {
    cancelReveal();
    tessSvg.innerHTML = '';
    if (kind === 'bird' || kind === 'fish' || kind === 'lizard') {
      buildCreatureTiling(kind);
    } else {
      buildGeometricTiling(kind);
    }
  }

  function setupTessInteraction() {
    function getTileFromEvent(e) {
      const t = (e.touches && e.touches[0]) || e;
      const target = document.elementFromPoint(t.clientX, t.clientY);
      return target;
    }
    tessSvg.addEventListener('pointerdown', (e) => {
      // Tapping anything during the reveal returns to the normal grid.
      if (revealRunning) { cancelReveal(); buildTessellation(tessPattern.value); return; }
      e.preventDefault();
      isPainting = true;
      colorTile(e.target);
    });
    tessSvg.addEventListener('pointermove', (e) => {
      if (!isPainting || revealRunning) return;
      const t = getTileFromEvent(e);
      colorTile(t);
    });
    window.addEventListener('pointerup', () => { isPainting = false; });
    window.addEventListener('pointercancel', () => { isPainting = false; });
  }

  tessPattern.addEventListener('change', () => {
    track('tess/pattern-change');
    buildTessellation(tessPattern.value);
  });
  tessRandom.addEventListener('click', () => {
    if (revealRunning) { cancelReveal(); buildTessellation(tessPattern.value); }
    document.querySelectorAll('#tessSvg .tile').forEach((t) => {
      t.setAttribute('fill', PALETTE[Math.floor(Math.random() * PALETTE.length)]);
    });
  });
  tessClear.addEventListener('click', () => {
    if (revealRunning) { cancelReveal(); buildTessellation(tessPattern.value); return; }
    // Reset to the 2-color Escher base, not a single flat color.
    document.querySelectorAll('#tessSvg .tile').forEach((t) => {
      t.setAttribute('fill', t.getAttribute('data-base') || TESS_DARK);
    });
  });

  // -----------------------------------------------------------------------
  // "HOW IT'S MADE" REVEAL
  // -----------------------------------------------------------------------
  // Animates: plain square outline -> push one edge OUT and the opposite edge
  // IN by the same amount (the key idea) -> finished creature -> multiply it
  // across the grid so the tiling appears. Skippable: tapping anything (handled
  // in setupTessInteraction / button handlers) returns to the colorable grid.
  const tessHow = document.getElementById('tessHow');
  let revealRunning = false;
  let revealRAF = null;
  let revealTimers = [];

  function cancelReveal() {
    revealRunning = false;
    if (revealRAF) { cancelAnimationFrame(revealRAF); revealRAF = null; }
    revealTimers.forEach(t => clearTimeout(t));
    revealTimers = [];
  }

  // A standalone demo creature centered in the canvas, used only by the reveal.
  // We morph a plain square into the LIZARD profile so the "out one side / in
  // the other" idea is visible at large scale, then tile that finished shape.
  function revealTilePath(tlx, tly, S, topSegs, leftSegs) {
    const top = topSegs;
    const right = leftSegs;
    const bottom = reverseSegs(topSegs);
    const left = reverseSegs(leftSegs);
    return `M ${tlx} ${tly} ${segsToPath(top)} ${segsToPath(right)} ${segsToPath(bottom)} ${segsToPath(left)} Z`;
  }

  // Build the SAME number of segments as the target, but perfectly straight:
  // each start segment keeps only its along-edge component (the bumps are
  // flattened to zero), so the square's straight edge can morph into the
  // creature's bumpy edge one segment at a time.
  function expandSquareToMatch(targetSegs, axis) {
    // axis 'x' for top edge (segments sum to (S,0)); 'y' for left edge (0,S).
    return targetSegs.map(s => axis === 'x' ? [s[0], 0] : [0, s[1]]);
  }
  function lerpSegs(a, b, t) {
    return a.map((s, i) => [ lerp(s[0], b[i][0], t), lerp(s[1], b[i][1], t) ]);
  }

  function runReveal() {
    track('tess/how-its-made');
    cancelReveal();
    revealRunning = true;
    tessSvg.innerHTML = '';

    const reduceMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const S = 150;                 // big demo cell
    const ox = (600 - S) / 2;      // centered-ish
    const oy = (400 - S) / 2 - 10;
    const liz = lizardEdges();     // re-scale profile to the big cell
    const scale = S / TILE;
    const targetTop = liz.top.map(s => [s[0] * scale, s[1] * scale]);
    const targetLeft = liz.left.map(s => [s[0] * scale, s[1] * scale]);
    const startTop = expandSquareToMatch(targetTop, 'x');
    const startLeft = expandSquareToMatch(targetLeft, 'y');

    // Persistent demo shape + helper labels.
    const demo = el('path', {
      class: 'reveal-shape',
      fill: TESS_DARK, stroke: '#ffcb47', 'stroke-width': '3',
      'stroke-linejoin': 'round', 'pointer-events': 'none'
    });
    tessSvg.appendChild(demo);
    const label = el('text', {
      x: 300, y: 360, 'text-anchor': 'middle',
      fill: '#ffcb47', 'font-size': '18', 'font-family': 'Georgia, serif',
      'font-style': 'italic', 'pointer-events': 'none'
    });
    tessSvg.appendChild(label);

    function drawDemo(topSegs, leftSegs) {
      demo.setAttribute('d', revealTilePath(ox, oy, S, topSegs, leftSegs));
    }

    function finishToGrid() {
      // Multiply the finished creature across the grid, then hand back to the
      // normal colorable build so painting works immediately. The reveal always
      // demos the lizard, so end on the lizard grid and sync the dropdown.
      revealRunning = false;
      tessPattern.value = 'lizard';
      buildTessellation('lizard');
    }

    // Phase plan
    function showSquare() {
      drawDemo(startTop, startLeft);
      label.textContent = 'Start with a plain square…';
    }
    function showCreature() {
      drawDemo(targetTop, targetLeft);
      label.textContent = 'What pokes OUT one side pokes IN the other — so they fit!';
    }

    if (reduceMotion) {
      // Jump to the end: show finished creature briefly, then tile.
      showCreature();
      const t = setTimeout(finishToGrid, 900);
      revealTimers.push(t);
      return;
    }

    // Animated sequence.
    showSquare();
    const DEFORM_MS = 1600;
    const t1 = setTimeout(() => {
      label.textContent = 'Now bend its edges…';
      const start = performance.now();
      function step(now) {
        if (!revealRunning) return;
        const t = clamp((now - start) / DEFORM_MS, 0, 1);
        // easeInOut
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        drawDemo(lerpSegs(startTop, targetTop, e), lerpSegs(startLeft, targetLeft, e));
        if (t < 1) { revealRAF = requestAnimationFrame(step); }
        else {
          showCreature();
          const t2 = setTimeout(finishToGrid, 1400);
          revealTimers.push(t2);
        }
      }
      revealRAF = requestAnimationFrame(step);
    }, 900);
    revealTimers.push(t1);
  }

  if (tessHow) tessHow.addEventListener('click', runReveal);

  buildTessellation('lizard');
  setupTessInteraction();

  // =======================================================================
  // 2. MIRROR DRAWING PAD
  // =======================================================================
  const mc = document.getElementById('mirrorCanvas');
  const mctx = mc.getContext('2d');
  const slicesEl = document.getElementById('mirrorSlices');
  const slicesVal = document.getElementById('mirrorSlicesVal');
  const brushEl = document.getElementById('mirrorBrush');
  const colorEl = document.getElementById('mirrorColor');
  const reflectEl = document.getElementById('mirrorReflect');
  const rainbowEl = document.getElementById('mirrorRainbow');
  const clearMirror = document.getElementById('mirrorClear');
  const saveMirror = document.getElementById('mirrorSave');

  function mirrorBg() {
    mctx.fillStyle = '#1a0f2e';
    mctx.fillRect(0, 0, mc.width, mc.height);
    // subtle radial guide lines
    const slices = +slicesEl.value;
    mctx.save();
    mctx.translate(mc.width / 2, mc.height / 2);
    mctx.strokeStyle = 'rgba(255,255,255,0.05)';
    mctx.lineWidth = 1;
    for (let i = 0; i < slices; i++) {
      mctx.beginPath();
      mctx.moveTo(0, 0);
      mctx.lineTo(mc.width, 0);
      mctx.stroke();
      mctx.rotate((Math.PI * 2) / slices);
    }
    mctx.restore();
  }
  mirrorBg();

  let mirrorDrawing = false;
  let lastPos = null;
  let hue = 0;

  slicesEl.addEventListener('input', () => {
    slicesVal.textContent = slicesEl.value;
    mirrorBg();
  });

  function getMirrorPos(e) {
    const rect = mc.getBoundingClientRect();
    const t = (e.touches && e.touches[0]) || e;
    const x = ((t.clientX - rect.left) / rect.width) * mc.width - mc.width / 2;
    const y = ((t.clientY - rect.top) / rect.height) * mc.height - mc.height / 2;
    return { x, y };
  }
  function drawMirrorLine(from, to) {
    const slices = +slicesEl.value;
    const angle = (Math.PI * 2) / slices;
    const brush = +brushEl.value;
    let stroke = colorEl.value;
    if (rainbowEl.checked) {
      hue = (hue + 4) % 360;
      stroke = `hsl(${hue}, 90%, 60%)`;
    }
    mctx.save();
    mctx.translate(mc.width / 2, mc.height / 2);
    mctx.lineCap = 'round';
    mctx.lineJoin = 'round';
    mctx.strokeStyle = stroke;
    mctx.lineWidth = brush;
    for (let i = 0; i < slices; i++) {
      mctx.beginPath();
      mctx.moveTo(from.x, from.y);
      mctx.lineTo(to.x, to.y);
      mctx.stroke();
      if (reflectEl.checked) {
        mctx.beginPath();
        mctx.moveTo(from.x, -from.y);
        mctx.lineTo(to.x, -to.y);
        mctx.stroke();
      }
      mctx.rotate(angle);
    }
    mctx.restore();
  }

  mc.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    mc.setPointerCapture(e.pointerId);
    mirrorDrawing = true;
    lastPos = getMirrorPos(e);
    drawMirrorLine(lastPos, lastPos);
  });
  mc.addEventListener('pointermove', (e) => {
    if (!mirrorDrawing) return;
    const p = getMirrorPos(e);
    drawMirrorLine(lastPos, p);
    lastPos = p;
  });
  function endMirror() { mirrorDrawing = false; }
  mc.addEventListener('pointerup', endMirror);
  mc.addEventListener('pointercancel', endMirror);
  mc.addEventListener('pointerleave', endMirror);

  clearMirror.addEventListener('click', mirrorBg);
  saveMirror.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'escher-mirror-art.png';
    link.href = mc.toDataURL('image/png');
    link.click();
  });

  // =======================================================================
  // 3. IMPOSSIBLE STAIRS
  // =======================================================================
  const stairsSvg = document.getElementById('stairsSvg');
  const stairsSlider = document.getElementById('stairsSlider');
  const stairsPlay = document.getElementById('stairsPlay');

  function buildStairs() {
    stairsSvg.innerHTML = '';
    const W = 600, H = 400;
    // Background sky
    const sky = el('rect', { width: W, height: H, fill: '#0e1430' });
    stairsSvg.appendChild(sky);
    // Stars
    for (let i = 0; i < 40; i++) {
      stairsSvg.appendChild(el('circle', {
        cx: Math.random() * W,
        cy: Math.random() * H * 0.6,
        r: Math.random() * 1.5 + 0.4,
        fill: '#ffcb47',
        opacity: Math.random() * 0.6 + 0.2
      }));
    }
    // Build a Penrose-like loop using 4 staircase segments forming a square
    const cx = W / 2, cy = H / 2;
    const size = 110;
    // Each segment: a parallelogram block representing a step rising
    const stepCount = 12;
    const corners = [
      { x: cx - size, y: cy - size }, // top-left
      { x: cx + size, y: cy - size }, // top-right
      { x: cx + size, y: cy + size }, // bottom-right
      { x: cx - size, y: cy + size }, // bottom-left
    ];
    const stairsGroup = el('g', { id: 'stairsGroup' });
    stairsSvg.appendChild(stairsGroup);

    // Paint top of each side as ascending steps illusion
    function drawSide(p0, p1, dir, lightness) {
      const totalSteps = stepCount;
      for (let i = 0; i < totalSteps; i++) {
        const t0 = i / totalSteps;
        const t1 = (i + 1) / totalSteps;
        const x0 = lerp(p0.x, p1.x, t0);
        const y0 = lerp(p0.y, p1.y, t0);
        const x1 = lerp(p0.x, p1.x, t1);
        const y1 = lerp(p0.y, p1.y, t1);
        const stepHeight = 14;
        const stepDepth = 20;
        // Always step "up" visually by stepHeight, regardless of side — that's the illusion
        const top = el('polygon', {
          points: [
            `${x0},${y0}`,
            `${x1},${y1}`,
            `${x1},${y1 - stepHeight}`,
            `${x0},${y0 - stepHeight}`
          ].join(' '),
          fill: `hsl(40, 30%, ${lightness}%)`,
          stroke: '#0b0f24',
          'stroke-width': '1'
        });
        const front = el('polygon', {
          points: [
            `${x0},${y0}`,
            `${x1},${y1}`,
            `${x1},${y1 + stepDepth}`,
            `${x0},${y0 + stepDepth}`
          ].join(' '),
          fill: `hsl(40, 25%, ${lightness - 15}%)`,
          stroke: '#0b0f24',
          'stroke-width': '1'
        });
        stairsGroup.appendChild(front);
        stairsGroup.appendChild(top);
      }
    }
    drawSide(corners[0], corners[1], 'right', 65);
    drawSide(corners[1], corners[2], 'down', 50);
    drawSide(corners[2], corners[3], 'left', 35);
    drawSide(corners[3], corners[0], 'up', 50);

    // Walker (a little person)
    const walker = el('g', { id: 'walker' });
    walker.appendChild(el('circle', { cx: 0, cy: -10, r: 5, fill: '#ff5577' }));
    walker.appendChild(el('rect', { x: -3, y: -5, width: 6, height: 10, fill: '#ff5577' }));
    walker.appendChild(el('line', { x1: -3, y1: 5, x2: -5, y2: 12, stroke: '#ff5577', 'stroke-width': '2' }));
    walker.appendChild(el('line', { x1: 3, y1: 5, x2: 5, y2: 12, stroke: '#ff5577', 'stroke-width': '2' }));
    stairsSvg.appendChild(walker);

    // caption
    const caption = el('text', {
      x: cx, y: 30,
      'text-anchor': 'middle',
      fill: '#ffcb47',
      'font-size': '14',
      'font-family': 'Georgia, serif',
      'font-style': 'italic'
    });
    caption.textContent = 'Ascending… and Descending… forever.';
    stairsSvg.appendChild(caption);

    return { corners, cx, cy, size };
  }

  const stairsData = buildStairs();

  function positionWalker(t) {
    // t in [0..1) — fraction around the loop
    const segments = 4;
    const seg = Math.floor(t * segments) % segments;
    const local = (t * segments) % 1;
    const a = stairsData.corners[seg];
    const b = stairsData.corners[(seg + 1) % segments];
    const x = lerp(a.x, b.x, local);
    const y = lerp(a.y, b.y, local) - 14; // sit on top of step
    const walker = document.getElementById('walker');
    if (walker) walker.setAttribute('transform', `translate(${x.toFixed(1)}, ${y.toFixed(1)})`);
  }
  positionWalker(0);

  stairsSlider.addEventListener('input', () => {
    positionWalker(+stairsSlider.value / 1000);
  });

  let autoStairs = null;
  stairsPlay.addEventListener('click', () => {
    if (autoStairs) {
      clearInterval(autoStairs);
      autoStairs = null;
      stairsPlay.innerHTML = '&#9658; Auto walk';
      return;
    }
    stairsPlay.innerHTML = '&#10074;&#10074; Pause';
    autoStairs = setInterval(() => {
      let v = +stairsSlider.value + 5;
      if (v > 1000) v = 0;
      stairsSlider.value = v;
      positionWalker(v / 1000);
    }, 30);
  });

  // =======================================================================
  // 4. METAMORPHOSIS
  // =======================================================================
  const morphSvg = document.getElementById('morphSvg');
  const morphSlider = document.getElementById('morphSlider');

  function morphPath(t) {
    // t ∈ [0,1]; 0 = square, 0.5 = diamond, 1 = bird
    // We draw 8 cells across 800x200 and morph each.
    morphSvg.innerHTML = '';
    const cells = 12;
    const w = 800 / cells;
    const cy = 100;
    for (let i = 0; i < cells; i++) {
      // Stagger morphing: cell 0 at t=0, cell cells-1 at t=1
      const cellT = clamp(t + (i - cells / 2) * 0.08, 0, 1);
      const cx = w * i + w / 2;
      const r = w * 0.4;

      // Build a shape that morphs from square -> diamond -> bird
      // Square (4 corners), diamond (rotated 45°), bird (asymmetric)
      let pts;
      if (cellT < 0.5) {
        // square -> diamond by rotating
        const tt = cellT / 0.5;
        const angle = tt * (Math.PI / 4);
        pts = [];
        for (let k = 0; k < 4; k++) {
          const a = angle + k * Math.PI / 2 + Math.PI / 4;
          pts.push([cx + r * Math.SQRT2 * Math.cos(a), cy + r * Math.SQRT2 * Math.sin(a)]);
        }
      } else {
        // diamond -> bird: stretch top points, sink bottom
        const tt = (cellT - 0.5) / 0.5;
        const top    = [cx, cy - r * (1 + tt * 0.6)];
        const right  = [cx + r * (1 + tt * 1.2), cy + tt * 4];
        const bottom = [cx, cy + r * (1 - tt * 0.4)];
        const left   = [cx - r * (1 + tt * 0.4), cy - tt * 6];
        pts = [top, right, bottom, left];
      }

      const color = `hsl(${lerp(220, 35, cellT)}, ${lerp(40, 80, cellT)}%, ${lerp(45, 60, cellT)}%)`;
      const poly = el('polygon', {
        points: pts.map(p => p.join(',')).join(' '),
        fill: color,
        stroke: '#0b0f24',
        'stroke-width': '1.5'
      });
      morphSvg.appendChild(poly);

      // Eye for bird-ish cells
      if (cellT > 0.7) {
        const eyeX = cx + r * 0.5;
        const eyeY = cy - r * 0.2;
        morphSvg.appendChild(el('circle', { cx: eyeX, cy: eyeY, r: 1.8, fill: '#0b0f24' }));
      }
    }
  }
  morphPath(+morphSlider.value / 100);
  let morphTrackTimer = null;
  morphSlider.addEventListener('input', () => {
    morphPath(+morphSlider.value / 100);
    if (morphTrackTimer) clearTimeout(morphTrackTimer);
    morphTrackTimer = setTimeout(() => track('morph/slide'), 400);
  });

  // =======================================================================
  // 5. FACT CARDS
  // =======================================================================
  document.querySelectorAll('.fact').forEach((f) => {
    f.addEventListener('click', () => f.classList.toggle('flipped'));
    f.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        f.classList.toggle('flipped');
      }
    });
  });

  // =======================================================================
  // 6. QUIZ
  // =======================================================================
  const quizQuestions = [
    {
      q: 'A pattern of shapes that fit together with no gaps is called a…',
      options: ['Tessellation', 'Constellation', 'Reservation', 'Vibration'],
      correct: 0,
      why: 'A tessellation! Escher made hundreds of them.'
    },
    {
      q: 'Where did Escher see the tile patterns that inspired him?',
      options: ['The Eiffel Tower', 'The Alhambra in Spain', 'The Pyramids', 'Buckingham Palace'],
      correct: 1,
      why: 'The Alhambra is full of geometric tiles from over 700 years ago.'
    },
    {
      q: 'In an "impossible staircase," people walking around it…',
      options: ['Reach the top quickly', 'Get tired and sit down', 'Keep going up… but never get higher', 'Slide back to the bottom'],
      correct: 2,
      why: 'It loops! That\'s the trick — your eye believes it.'
    },
    {
      q: 'What did Escher carve into wood to make his prints?',
      options: ['Pictures, mirrored backwards', 'Just his signature', 'Random scratches', 'Nothing — he painted'],
      correct: 0,
      why: 'Print-making mirrors the image, so he had to carve it backwards!'
    }
  ];

  const quizContainer = document.getElementById('quizBody');
  let score = 0;
  let answered = 0;
  function renderQuiz() {
    quizContainer.innerHTML = '';
    quizQuestions.forEach((Q, qi) => {
      const wrap = document.createElement('div');
      wrap.className = 'quiz-q';
      const h = document.createElement('h3');
      h.textContent = `${qi + 1}. ${Q.q}`;
      wrap.appendChild(h);
      const opts = document.createElement('div');
      opts.className = 'quiz-options';
      Q.options.forEach((opt, oi) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = opt;
        b.addEventListener('click', () => {
          if (wrap.dataset.locked) return;
          wrap.dataset.locked = '1';
          [...opts.children].forEach(c => c.disabled = true);
          if (oi === Q.correct) {
            b.classList.add('correct');
            score++;
            track('quiz/q' + (qi + 1) + '-correct');
          } else {
            b.classList.add('wrong');
            opts.children[Q.correct].classList.add('correct');
            track('quiz/q' + (qi + 1) + '-wrong');
          }
          const fb = document.createElement('div');
          fb.className = 'quiz-feedback';
          fb.textContent = (oi === Q.correct ? 'Yes! ' : 'Almost — ') + Q.why;
          wrap.appendChild(fb);
          answered++;
          if (answered === quizQuestions.length) {
            const tally = document.createElement('div');
            tally.className = 'quiz-score';
            tally.textContent = `You got ${score} out of ${quizQuestions.length}!`;
            quizContainer.appendChild(tally);
            track('quiz/complete');
          }
        });
        opts.appendChild(b);
      });
      wrap.appendChild(opts);
      quizContainer.appendChild(wrap);
    });
  }
  renderQuiz();

  // =======================================================================
  // 7. FEEDBACK STORAGE
  // =======================================================================
  const fb = document.getElementById('fbText');
  const fbCopy = document.getElementById('fbCopy');
  const fbClear = document.getElementById('fbClear');
  const fbStatus = document.getElementById('fbStatus');
  const KEY = 'escher-feedback-v1';
  try { fb.value = localStorage.getItem(KEY) || ''; } catch (e) { /* ignore */ }
  let fbStarted = false;
  fb.addEventListener('input', () => {
    try { localStorage.setItem(KEY, fb.value); } catch (e) { /* ignore */ }
    if (!fbStarted && fb.value.length > 0) {
      fbStarted = true;
      track('feedback/started');
    }
  });
  fbCopy.addEventListener('click', async () => {
    if (!fb.value.trim()) {
      fbStatus.textContent = 'Type something first!';
      return;
    }
    try {
      await navigator.clipboard.writeText(fb.value);
      fbStatus.textContent = 'Copied! Paste it wherever you like.';
    } catch (e) {
      fb.select();
      document.execCommand('copy');
      fbStatus.textContent = 'Copied!';
    }
    setTimeout(() => { fbStatus.textContent = ''; }, 4000);
  });
  fbClear.addEventListener('click', () => {
    fb.value = '';
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    fbStatus.textContent = 'Cleared.';
    setTimeout(() => { fbStatus.textContent = ''; }, 2000);
  });

})();
