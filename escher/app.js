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

  function buildTessellation(kind) {
    tessSvg.innerHTML = '';
    const W = 600, H = 400;
    if (kind === 'hex') {
      const r = 30;
      const w = Math.sqrt(3) * r;
      const h = 1.5 * r;
      for (let row = 0, y = 0; y < H + h; y += h, row++) {
        const xOffset = (row % 2) * (w / 2);
        for (let x = -w; x < W + w; x += w) {
          const cx = x + xOffset, cy = y;
          const pts = [];
          for (let i = 0; i < 6; i++) {
            const a = Math.PI / 3 * i + Math.PI / 6;
            pts.push((cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1));
          }
          const poly = el('polygon', {
            points: pts.join(' '),
            class: 'tile',
            fill: '#1a1f48',
            stroke: '#0b0f24',
            'stroke-width': '1.5'
          });
          tessSvg.appendChild(poly);
        }
      }
    } else if (kind === 'tri') {
      const s = 50;
      const h = (Math.sqrt(3) / 2) * s;
      for (let row = 0, y = 0; y < H + h; y += h, row++) {
        for (let col = 0, x = 0; x < W + s; x += s / 2, col++) {
          const up = (row + col) % 2 === 0;
          const x1 = x, y1 = y;
          const points = up
            ? [x1, y1 + h, x1 + s / 2, y1, x1 + s, y1 + h]
            : [x1, y1, x1 + s / 2, y1 + h, x1 + s, y1];
          const poly = el('polygon', {
            points: points.join(' '),
            class: 'tile',
            fill: '#1a1f48',
            stroke: '#0b0f24',
            'stroke-width': '1.5'
          });
          tessSvg.appendChild(poly);
        }
      }
    } else if (kind === 'lizard') {
      // P3 hex-based lizard tessellation (stylized)
      const cell = 70;
      const lizPath = (cx, cy, rot, color) => {
        // A stylized lizard built from a closed path
        const d = `M ${cx} ${cy - 28}
                   c 8 0 14 6 14 14
                   c 0 6 -4 10 -8 12
                   c 8 4 12 10 12 18
                   c 0 10 -8 16 -18 16
                   c -10 0 -18 -6 -18 -16
                   c 0 -8 4 -14 12 -18
                   c -4 -2 -8 -6 -8 -12
                   c 0 -8 6 -14 14 -14 z`;
          // legs
        const path = el('path', {
          d, class: 'tile',
          fill: color, stroke: '#0b0f24', 'stroke-width': '1.5',
          transform: `rotate(${rot} ${cx} ${cy})`
        });
        return path;
      };
      const colors = ['#1a1f48', '#1a1f48', '#1a1f48'];
      let i = 0;
      for (let row = 0, y = 0; y < H + cell; y += cell, row++) {
        const offset = (row % 2) * cell / 2;
        for (let x = -cell / 2; x < W + cell; x += cell, i++) {
          const rot = (i % 3) * 120;
          const color = colors[i % 3];
          tessSvg.appendChild(lizPath(x + offset, y, rot, color));
        }
      }
    } else if (kind === 'bird') {
      // Day & Night style: alternating birds and fish using simple shapes in a hex grid
      const r = 36;
      const w = Math.sqrt(3) * r;
      const h = 1.5 * r;
      let i = 0;
      for (let row = 0, y = 0; y < H + h; y += h, row++) {
        const xOffset = (row % 2) * (w / 2);
        for (let x = -w; x < W + w; x += w, i++) {
          const cx = x + xOffset, cy = y;
          const isBird = (i % 2 === 0);
          const d = isBird
            // bird silhouette
            ? `M ${cx - 24} ${cy}
               q 6 -10 18 -10
               q 12 0 18 6
               q 4 -8 10 -10
               q -2 8 -2 12
               q 0 8 -10 12
               q -10 4 -16 4
               q -10 0 -18 -6
               q -4 -4 0 -8 z`
            // fish silhouette
            : `M ${cx - 24} ${cy}
               q 6 -8 18 -8
               q 14 0 22 8
               q 4 -2 8 -6
               q -2 6 -2 8
               q 0 8 -10 10
               q -10 2 -18 2
               q -12 0 -18 -6
               q -4 -4 0 -8 z`;
          tessSvg.appendChild(el('path', {
            d,
            class: 'tile',
            fill: isBird ? '#1a1f48' : '#22264f',
            stroke: '#0b0f24',
            'stroke-width': '1.5'
          }));
        }
      }
    }
  }

  function setupTessInteraction() {
    function getTileFromEvent(e) {
      const t = (e.touches && e.touches[0]) || e;
      const target = document.elementFromPoint(t.clientX, t.clientY);
      return target;
    }
    tessSvg.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      isPainting = true;
      colorTile(e.target);
    });
    tessSvg.addEventListener('pointermove', (e) => {
      if (!isPainting) return;
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
    document.querySelectorAll('#tessSvg .tile').forEach((t) => {
      t.setAttribute('fill', PALETTE[Math.floor(Math.random() * PALETTE.length)]);
    });
  });
  tessClear.addEventListener('click', () => {
    document.querySelectorAll('#tessSvg .tile').forEach((t) => t.setAttribute('fill', '#1a1f48'));
  });
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
