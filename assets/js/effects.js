/*
 * 博客动效（无第三方库）：
 *  1. 景深背景：三层柔光粒子，远处小而模糊、近处大而柔和，随鼠标和滚动产生视差
 *  2. 侧边栏标语打字效果
 *  3. 文章卡片 / 项目卡片滚动渐显，项目卡片悬停倾斜
 *  4. 文章页阅读进度条
 *  5. 全站“写日记”悬浮按钮
 * 遵守 prefers-reduced-motion；标签页隐藏时暂停。
 */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var script = doc.currentScript;
  var writeUrl = (script && script.getAttribute('data-write-url')) || '/write/';
  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = reduceMQ.matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var layoutMeta = doc.querySelector('meta[name="fx-layout"]');
  var layout = layoutMeta ? layoutMeta.content : '';

  root.classList.add('fx-ready');

  function isDark() {
    var t = root.getAttribute('data-bs-theme');
    if (t) return t === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /* ---------------- 1. 景深背景 ---------------- */
  function depthBackground() {
    var canvas = doc.createElement('canvas');
    canvas.id = 'fx-depth';
    canvas.setAttribute('aria-hidden', 'true');
    doc.body.insertBefore(canvas, doc.body.firstChild);
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var W = 0, H = 0, dpr = 1;
    var palettes = {
      light: ['#5b8cff', '#a07bff', '#ff86b8', '#4fc4bd'],
      dark: ['#4f8cff', '#9a6bff', '#ff6fae', '#3fd0c9']
    };
    /* depth: 0 远 → 1 近 */
    var layers = [
      { depth: 0.15, size: [2, 5], blur: 0.9, alpha: [0.35, 0.6], light: 1.2, dark: 1.2, speed: 0.06, density: 0.00006 },
      { depth: 0.5, size: [8, 22], blur: 0.6, alpha: [0.18, 0.32], light: 1.6, dark: 1.25, speed: 0.12, density: 0.000022 },
      { depth: 1.0, size: [40, 90], blur: 0.25, alpha: [0.06, 0.12], light: 2.6, dark: 1.6, speed: 0.2, density: 0.0000045 }
    ];
    var sprites = {};
    var particles = [];
    var mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    var scrollY = window.scrollY, smoothScroll = scrollY;
    var running = false, raf = 0, last = 0;
    var mode = isDark() ? 'dark' : 'light';

    function rand(a, b) { return a + Math.random() * (b - a); }

    /* 预先画好柔光圆点贴图，绘制时只做 drawImage，比实时 blur 滤镜省很多 CPU */
    function sprite(color, blur) {
      var key = color + blur;
      if (sprites[key]) return sprites[key];
      var s = 128, c = doc.createElement('canvas');
      c.width = c.height = s;
      var g = c.getContext('2d');
      var grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      var core = Math.max(0.02, 1 - blur); /* 越模糊，实心核越小 */
      grad.addColorStop(0, color);
      grad.addColorStop(core * 0.6, color);
      grad.addColorStop(Math.min(0.98, core * 0.6 + 0.35), hexAlpha(color, 0.35));
      grad.addColorStop(1, hexAlpha(color, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
      sprites[key] = c;
      return c;
    }

    function hexAlpha(hex, a) {
      var n = parseInt(hex.slice(1), 16);
      return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
    }

    function seed() {
      particles = [];
      var area = W * H;
      var mobileFactor = W < 768 ? 0.6 : 1;
      layers.forEach(function (L, li) {
        var count = Math.max(3, Math.min(90, Math.round(area * L.density * mobileFactor)));
        for (var i = 0; i < count; i++) {
          particles.push({
            layer: li,
            x: Math.random() * W,
            y: Math.random() * H,
            r: rand(L.size[0], L.size[1]),
            a: rand(L.alpha[0], L.alpha[1]),
            c: Math.floor(Math.random() * 4),
            vx: rand(-1, 1) * L.speed,
            vy: rand(-1, -0.2) * L.speed,
            ph: Math.random() * Math.PI * 2
          });
        }
      });
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      draw(0);
    }

    function draw(dt) {
      ctx.clearRect(0, 0, W, H);
      var pal = palettes[mode];
      mouse.x += (mouse.tx - mouse.x) * 0.06;
      mouse.y += (mouse.ty - mouse.y) * 0.06;
      smoothScroll += (scrollY - smoothScroll) * 0.12;
      ctx.globalCompositeOperation = mode === 'dark' ? 'lighter' : 'source-over';
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        var L = layers[p.layer];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.ph += 0.0006 * dt;
        var m = p.r * 2;
        if (p.y < -m) { p.y = H + m; p.x = Math.random() * W; }
        if (p.x < -m) p.x = W + m;
        if (p.x > W + m) p.x = -m;
        /* 视差：越近的层随鼠标、滚动移动得越多 */
        var px = p.x - mouse.x * 30 * L.depth;
        var py = p.y - mouse.y * 20 * L.depth - smoothScroll * 0.15 * L.depth;
        var span = H + m * 2;
        py = ((py + m) % span + span) % span - m;
        var tw = 0.75 + 0.25 * Math.sin(p.ph);
        ctx.globalAlpha = Math.min(1, p.a * tw * L[mode]);
        var img = sprite(pal[p.c], L.blur);
        var d = p.r * 2;
        ctx.drawImage(img, px - p.r, py - p.r, d, d);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    function loop(t) {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      var dt = t - last;
      if (dt < 30) return; /* 约 30fps，足够顺滑又省电 */
      last = t;
      draw(Math.min(dt, 64) / 16);
    }

    function start() {
      if (running || reduced || doc.hidden) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
    function stop() { running = false; cancelAnimationFrame(raf); }

    window.addEventListener('resize', debounce(resize, 200));
    window.addEventListener('scroll', function () {
      scrollY = window.scrollY;
    }, { passive: true });
    if (finePointer) {
      window.addEventListener('mousemove', function (e) {
        mouse.tx = e.clientX / W - 0.5;
        mouse.ty = e.clientY / H - 0.5;
      }, { passive: true });
    }
    doc.addEventListener('visibilitychange', function () { doc.hidden ? stop() : start(); });
    reduceMQ.addEventListener && reduceMQ.addEventListener('change', function (e) {
      reduced = e.matches;
      reduced ? (stop(), draw(0)) : start();
    });
    /* Chirpy 切换明暗模式时会改 <html data-bs-theme> */
    new MutationObserver(function () {
      mode = isDark() ? 'dark' : 'light';
      if (!running) draw(0);
    }).observe(root, { attributes: true, attributeFilter: ['data-bs-theme'] });

    resize();
    start();
  }

  /* ---------------- 2. 打字效果 ---------------- */
  function typing() {
    var el = doc.querySelector('#sidebar .site-subtitle');
    if (!el) return;
    /* 副标题：每次打开随机生成 3-9 个 z */
    var text = 'z'.repeat(3 + Math.floor(Math.random() * 7));
    el.textContent = text;
    el.setAttribute('aria-label', text);
    var key = 'fx-typed';
    var seen = false;
    try { seen = sessionStorage.getItem(key) === '1'; sessionStorage.setItem(key, '1'); } catch (e) { /* 忽略 */ }
    /* 只在首页或本次浏览第一次打开时打字，避免每次翻页都等 */
    if (reduced || (seen && layout !== 'home')) return;
    var chars = Array.from(text);
    var span = doc.createElement('span');
    var caret = doc.createElement('span');
    caret.className = 'fx-caret';
    caret.setAttribute('aria-hidden', 'true');
    el.textContent = '';
    span.setAttribute('aria-hidden', 'true');
    el.appendChild(span);
    el.appendChild(caret);
    var i = 0;
    (function tick() {
      span.textContent = chars.slice(0, ++i).join('');
      if (i < chars.length) setTimeout(tick, 110 + Math.random() * 90);
      else setTimeout(function () { caret.classList.add('fx-caret-done'); }, 2400);
    })();
  }

  /* ---------------- 3. 滚动渐显 + 悬停倾斜 ---------------- */
  var io = null;
  function reveal(nodes) {
    if (!nodes.length) return;
    if (reduced || !('IntersectionObserver' in window)) return;
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          en.target.classList.add('fx-in');
          io.unobserve(en.target);
        });
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });
    }
    Array.prototype.forEach.call(nodes, function (n, idx) {
      if (n.classList.contains('fx-reveal')) return;
      n.classList.add('fx-reveal');
      n.style.transitionDelay = Math.min(idx, 8) * 60 + 'ms';
      io.observe(n);
      n.addEventListener('transitionend', function clear() {
        n.style.transitionDelay = '';
        n.removeEventListener('transitionend', clear);
      });
    });
  }

  function tilt(card) {
    if (reduced || !finePointer || card.dataset.fxTilt) return;
    card.dataset.fxTilt = '1';
    card.classList.add('fx-tilt');
    card.addEventListener('mousemove', function (e) {
      var r = card.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = 'perspective(700px) translateY(-4px) rotateX(' + (-y * 7).toFixed(2) +
        'deg) rotateY(' + (x * 9).toFixed(2) + 'deg)';
      card.style.setProperty('--fx-gx', (x + 0.5) * 100 + '%');
      card.style.setProperty('--fx-gy', (y + 0.5) * 100 + '%');
    });
    card.addEventListener('mouseleave', function () { card.style.transform = ''; });
  }

  function cards() {
    reveal(doc.querySelectorAll('#post-list .card-wrapper, #related-posts .card, .repo-card'));
    Array.prototype.forEach.call(doc.querySelectorAll('.repo-card'), tilt);
    /* 项目页会在浏览器端用 GitHub API 刷新卡片，新卡片也要加上效果 */
    var repos = doc.getElementById('repos');
    if (repos && 'MutationObserver' in window) {
      new MutationObserver(function () {
        var list = repos.querySelectorAll('.repo-card');
        reveal(list);
        Array.prototype.forEach.call(list, tilt);
      }).observe(repos, { childList: true });
    }
  }

  /* ---------------- 4. 阅读进度条 ---------------- */
  function progress() {
    if (layout !== 'post') return;
    var bar = doc.createElement('div');
    bar.id = 'fx-progress';
    bar.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(bar);
    var ticking = false;
    function update() {
      ticking = false;
      var max = root.scrollHeight - window.innerHeight;
      var v = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      bar.style.transform = 'scaleX(' + v + ')';
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  /* ---------------- 5. 写日记悬浮按钮 ---------------- */
  function writeButton() {
    /* 只有博主模式（?owner=1 开启）才显示 */
    if (!root.classList.contains('blog-owner')) return;
    if (location.pathname.replace(/\/+$/, '/') === writeUrl) return;
    var a = doc.createElement('a');
    a.id = 'fx-write';
    a.href = writeUrl;
    a.title = '写日记';
    a.setAttribute('aria-label', '写日记');
    a.innerHTML = '<i class="fas fa-pen"></i><span>写日记</span>';
    doc.body.appendChild(a);
  }

  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  /* ---------------- 6. 点击彩带 ---------------- */
  function confetti() {
    var cv = doc.createElement('canvas');
    cv.id = 'fx-confetti';
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000';
    doc.body.appendChild(cv);
    var ctx = cv.getContext('2d');
    var dpr = 1, W = 0, H = 0, bits = [], raf = 0, last = 0;
    var COLORS = ['#ff6b6b', '#fcc419', '#51cf66', '#339af0', '#cc5de8', '#ff922b', '#22b8cf', '#f06595'];
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function burst(x, y) {
      var n = innerWidth < 768 ? 18 : 30;
      for (var i = 0; i < n; i++) {
        var a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
        var v = 2 + Math.random() * 3;
        bits.push({
          x: x, y: y,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          w: 5 + Math.random() * 5, h: 10 + Math.random() * 10,
          rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
          flip: Math.random() * Math.PI, vf: 0.12 + Math.random() * 0.18,
          c: COLORS[(Math.random() * COLORS.length) | 0], life: 0, max: 70 + Math.random() * 40
        });
      }
      if (bits.length > 400) bits.splice(0, bits.length - 400);
      if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
    }
    function tick(t) {
      var k = last ? Math.min((t - last) / 16.7, 3) : 1; last = t;
      ctx.clearRect(0, 0, W, H);
      for (var i = bits.length - 1; i >= 0; i--) {
        var b = bits[i];
        b.life += k;
        b.vy += 0.11 * k; b.vx *= Math.pow(0.985, k); b.vy *= Math.pow(0.985, k);
        b.x += b.vx * k + Math.sin(b.life / 8) * 0.2; b.y += b.vy * k;
        b.rot += b.vr * k; b.flip += b.vf * k;
        var alpha = 1 - Math.max(0, (b.life - b.max * 0.6) / (b.max * 0.4));
        if (alpha <= 0 || b.y > H + 30) { bits.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.scale(1, Math.cos(b.flip));
        ctx.fillStyle = b.c;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      }
      raf = bits.length ? requestAnimationFrame(tick) : 0;
      if (!raf) ctx.clearRect(0, 0, W, H);
    }
    resize();
    window.addEventListener('resize', debounce(resize, 150));
    doc.addEventListener('pointerdown', function (e) {
      if (reduced || e.button > 0) return;
      burst(e.clientX, e.clientY);
    }, { passive: true });
  }

  function init() {
    try { depthBackground(); } catch (e) { /* 背景失败不影响其它效果 */ }
    typing();
    cards();
    progress();
    writeButton();
    try { confetti(); } catch (e) { /* 彩带失败不影响其它效果 */ }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();
