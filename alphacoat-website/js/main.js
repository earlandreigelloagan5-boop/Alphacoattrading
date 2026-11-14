(function () {
  'use strict';

  const C = window.ALPHACOAT || {};
  const LINES = window.ALPHACOAT_LINES || [];
  const PRODUCTS = window.ALPHACOAT_PRODUCTS || [];
  const GAL = Number(C.litersPerGallon) || 3.785;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touchFirst = window.matchMedia('(pointer: coarse)').matches;

  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
  const clampQty = (v) => Math.max(1, Math.min(9999, Math.round(Number(v) || 1)));
  const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString('en-PH', { maximumFractionDigits: 1 });

  const live = $('[data-live]');
  const announce = (text) => { if (live) { live.textContent = ''; setTimeout(() => { live.textContent = text; }, 30); } };

  /* ---------- Contact details from site-config.js ---------- */

  function fillContact() {
    if (C.mobileDial) $$('[data-mobile-link]').forEach((a) => { a.href = 'tel:' + C.mobileDial; });
    if (C.mobileDisplay) $$('[data-mobile-text]').forEach((el) => { el.textContent = C.mobileDisplay; });
    if (C.telephoneDisplay) $$('[data-telephone]').forEach((el) => { el.textContent = C.telephoneDisplay; });
    if (Array.isArray(C.address)) $$('[data-address]').forEach((el) => { el.innerHTML = C.address.map(esc).join('<br>'); });
    if (C.mapsQuery) $$('[data-maps]').forEach((a) => { a.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(C.mapsQuery); });
    $$('[data-gal]').forEach((el) => { el.textContent = GAL; });
  }

  /* ---------- Header and mobile menu ---------- */

  function initHeader() {
    const header = $('.site-header');
    const menuBtn = $('.menu-btn');
    if (!header) return;

    const onScroll = () => header.classList.toggle('is-stuck', window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    if (!menuBtn) return;
    const setOpen = (open) => {
      document.body.classList.toggle('nav-open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.textContent = open ? 'Close' : 'Menu';
    };
    menuBtn.addEventListener('click', () => setOpen(!document.body.classList.contains('nav-open')));
    $$('.nav a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
    window.matchMedia('(min-width: 1020px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
  }

  /* ---------- Hero: roller passes of wet paint ---------- */

  function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  function initCoat() {
    const coat = $('[data-coat]');
    const hero = coat && coat.closest('.hero');
    if (!coat) return;

    const tones = ['#0f6b3c', '#0d6538', '#11713f'];
    let built = 0;

    const build = () => {
      const n = window.innerWidth < 700 ? 4 : 7;
      if (n === built) return;
      built = n;
      coat.textContent = '';
      const rand = seeded(3130);
      // How far down the wall each pass reaches, as a share of the hero height.
      const reach = n === 4 ? [0.965, 0.92, 0.985, 0.94] : [0.955, 0.915, 0.975, 0.93, 0.99, 0.905, 0.945];
      // About one point every 4px, so the edge has the same texture on a phone as on a wide screen.
      const teeth = Math.max(18, Math.round(window.innerWidth / n / 4));

      for (let i = 0; i < n; i++) {
        const pass = document.createElement('span');
        pass.className = 'pass';

        // Uneven lower edge, where the roller lifts off: a slow wave with a few thin streaks.
        const pts = ['0% 0%', '100% 0%'];
        const phase = rand() * 6.28;
        for (let k = 0; k <= teeth; k++) {
          const x = 100 - (k / teeth) * 100;
          const belly = Math.sin((k / teeth) * Math.PI) * 0.7;
          const wave = Math.sin((k / teeth) * 22 + phase) * 0.28;
          const streak = Math.pow(rand(), 5) * 1.7;
          const y = Math.min(100, 99.3 + belly + wave - rand() * 0.45 - streak);
          pts.push(x.toFixed(2) + '% ' + y.toFixed(2) + '%');
        }

        pass.style.setProperty('--edge', 'polygon(' + pts.join(',') + ')');
        pass.style.setProperty('--hf', reach[i]);
        pass.style.setProperty('--i', i);
        pass.style.setProperty('--n', n);
        pass.style.setProperty('--tone', tones[i % tones.length]);
        pass.style.setProperty('--d', (i * 0.085 + rand() * 0.05).toFixed(3) + 's');
        coat.appendChild(pass);
      }
    };

    build();
    requestAnimationFrame(() => requestAnimationFrame(() => hero.classList.add('is-painted')));

    let resizeTimer;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(build, 180); });

    // The highlight follows the pointer, the way a light moves across gloss paint as you walk past it.
    if (!reduceMotion && !touchFirst) {
      let frame = 0;
      hero.addEventListener('pointermove', (e) => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          const r = hero.getBoundingClientRect();
          coat.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
          coat.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
        });
      });
    }
  }

  /* ---------- Quote list ---------- */

  const STORE_KEY = 'alphacoat-quote-v1';
  let quote = [];

  function loadQuote() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      if (Array.isArray(raw)) {
        quote = raw.filter((q) => q && q.id && q.name).map((q) => ({ id: String(q.id), name: String(q.name), qty: clampQty(q.qty) }));
      }
    } catch (err) { quote = []; }
  }
  function saveQuote() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(quote)); } catch (err) { /* private mode: the list still works for this visit */ }
  }

  const qtyControl = (value, label) =>
    '<span class="qty">' +
      '<button type="button" data-step="-1" aria-label="One gallon fewer">&minus;</button>' +
      '<input type="number" inputmode="numeric" min="1" max="9999" value="' + value + '" aria-label="' + esc(label) + '">' +
      '<button type="button" data-step="1" aria-label="One gallon more">+</button>' +
    '</span><span class="qty-unit">gal</span>';

  function renderQuote() {
    const box = $('[data-quote-items]');
    const empty = $('[data-quote-empty]');
    if (box) {
      box.innerHTML = quote.map((q) =>
        '<li data-id="' + esc(q.id) + '">' +
          '<span class="qi-name">' + esc(q.name) + '</span>' +
          '<span class="qi-qty">' + qtyControl(q.qty, 'Gallons of ' + q.name) + '</span>' +
          '<button type="button" class="link-btn" data-remove aria-label="Remove ' + esc(q.name) + '">Remove</button>' +
        '</li>'
      ).join('');
    }
    if (empty) empty.hidden = quote.length > 0;
    $$('[data-quote-count]').forEach((el) => {
      el.textContent = quote.length;
      el.hidden = quote.length === 0;
      el.setAttribute('aria-label', quote.length + (quote.length === 1 ? ' product on your quote list' : ' products on your quote list'));
    });
  }

  function addToQuote(id, name, qty) {
    const found = quote.find((q) => q.id === id);
    if (found) found.qty = clampQty(found.qty + qty);
    else quote.push({ id: id, name: name, qty: clampQty(qty) });
    saveQuote();
    renderQuote();
  }

  function initQuoteList() {
    loadQuote();
    renderQuote();

    // Plus and minus buttons, anywhere on the page.
    document.addEventListener('click', (e) => {
      const stepBtn = e.target.closest('[data-step]');
      if (stepBtn) {
        const input = $('input', stepBtn.closest('.qty'));
        input.value = clampQty(Number(input.value) + Number(stepBtn.dataset.step));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      const removeBtn = e.target.closest('[data-remove]');
      if (removeBtn) {
        const li = removeBtn.closest('li');
        const item = quote.find((q) => q.id === li.dataset.id);
        quote = quote.filter((q) => q.id !== li.dataset.id);
        saveQuote();
        renderQuote();
        if (item) announce(item.name + ' removed from your quote list.');
      }
    });

    const box = $('[data-quote-items]');
    if (box) {
      box.addEventListener('change', (e) => {
        const li = e.target.closest('li');
        const item = li && quote.find((q) => q.id === li.dataset.id);
        if (!item) return;
        item.qty = clampQty(e.target.value);
        e.target.value = item.qty;
        saveQuote();
      });
    }
  }

  /* ---------- Products ---------- */

  function initProducts() {
    const list = $('[data-products]');
    const filters = $('[data-filters]');
    if (!list || !PRODUCTS.length) return;

    let active = 'all';
    const lineOf = (id) => LINES.find((l) => l.id === id) || { label: '', single: '' };

    const setOpen = (li, open) => {
      const toggle = $('.product-toggle', li);
      li.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Hide details' : 'Details';
      $('.product-panel', li).inert = !open;
    };

    const render = () => {
      const shown = PRODUCTS.filter((p) => active === 'all' || p.line === active);
      list.innerHTML = shown.map((p) => {
        const line = lineOf(p.line);
        const meta = p.pack ? line.single + ', sold by the ' + p.pack.toLowerCase() : line.single + ', ask us for types and pack sizes';
        const panelId = 'details-' + p.id;
        const specs = (p.specs || []).map((row) =>
          '<tr><th scope="row">' + esc(row[0]) + '</th><td>' + esc(row[1]) + '</td></tr>').join('');
        return (
          '<li class="product" data-id="' + esc(p.id) + '">' +
            '<div class="product-row">' +
              '<span class="chip chip-' + esc(p.chip || 'gloss') + '" aria-hidden="true"></span>' +
              '<div class="product-id"><h3>' + esc(p.name) + '</h3><p class="product-meta">' + esc(meta) + '</p>' +
                '<button type="button" class="product-toggle" aria-expanded="false" aria-controls="' + esc(panelId) + '">Details</button></div>' +
              '<p class="product-summary">' + esc(p.summary || '') + '</p>' +
              '<form class="product-add" data-add>' +
                qtyControl(1, 'Gallons of ' + p.name) +
                '<button class="btn btn-green" type="submit">Add to quote list</button>' +
              '</form>' +
            '</div>' +
            '<div class="product-panel" id="' + esc(panelId) + '" inert>' +
              '<div class="product-panel-inner"><div class="product-detail">' +
                (p.image ? '<div class="product-shot"><img src="' + esc(p.image) + '" width="480" height="600" loading="lazy" decoding="async" alt="Illustration of a gallon can labeled ' + esc(p.name) + '"></div>' : '') +
                '<div class="product-facts">' +
                  (specs ? '<table class="spec"><tbody>' + specs + '</tbody></table>' : '') +
                  '<p class="spec-note">Coverage, mixing ratio and drying times are on the technical data sheet.</p>' +
                  '<button type="button" class="btn btn-line" data-datasheet>Ask for the data sheet</button>' +
                '</div>' +
              '</div></div>' +
            '</div>' +
          '</li>'
        );
      }).join('');
      // Open the first product so the panel is seen without hunting for it.
      const first = $('.product', list);
      if (first) setOpen(first, true);
    };

    list.addEventListener('click', (e) => {
      const toggle = e.target.closest('.product-toggle');
      if (toggle) {
        const li = toggle.closest('.product');
        setOpen(li, !li.classList.contains('is-open'));
        return;
      }
      const sheet = e.target.closest('[data-datasheet]');
      if (sheet) {
        const product = PRODUCTS.find((p) => p.id === sheet.closest('.product').dataset.id);
        const details = $('#q-details');
        if (!product || !details) return;
        const line = 'Please send the data sheet for ' + product.name + '.';
        if (details.value.indexOf(line) === -1) details.value = details.value.trim() ? details.value.trim() + '\n' + line : line;
        sheet.textContent = 'Data sheet added to your request';
        sheet.disabled = true;
        announce('Data sheet for ' + product.name + ' added to your quote request.');
      }
    });

    if (filters) {
      const options = [{ id: 'all', label: 'All products' }].concat(LINES.filter((l) => PRODUCTS.some((p) => p.line === l.id)));
      filters.innerHTML = options.map((o) =>
        '<button type="button" class="filter" data-filter="' + esc(o.id) + '" aria-pressed="' + (o.id === active) + '">' + esc(o.label) + '</button>'
      ).join('');
      filters.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-filter]');
        if (!btn) return;
        active = btn.dataset.filter;
        $$('[data-filter]', filters).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        render();
      });
    }

    list.addEventListener('change', (e) => {
      if (e.target.matches('.qty input')) e.target.value = clampQty(e.target.value);
    });

    list.addEventListener('submit', (e) => {
      const form = e.target.closest('[data-add]');
      if (!form) return;
      e.preventDefault();
      const id = form.closest('.product').dataset.id;
      const product = PRODUCTS.find((p) => p.id === id);
      if (!product) return;
      const qty = clampQty($('input', form).value);
      const name = product.quoteName || product.name;
      addToQuote(id, name, qty);
      announce(qty + (qty === 1 ? ' gallon of ' : ' gallons of ') + name + ' added to your quote list.');

      const btn = $('button[type="submit"]', form);
      btn.textContent = 'Added to quote list';
      clearTimeout(btn._timer);
      btn._timer = setTimeout(() => { btn.textContent = 'Add to quote list'; }, 1700);
    });

    render();
  }

  /* ---------- Hero can: 21 rendered frames in one sheet, turned by the pointer and by scrolling ---------- */

  function initCan() {
    const can = $('[data-can]');
    if (!can || reduceMotion) return;
    const sprite = $('.can-sprite', can);
    const hero = can.closest('.hero');
    const FRAMES = 21, COLS = 7, ROWS = 3, MID = 10;
    let current = -1, shown = MID, target = MID, raf = 0, fromPointer = 0, fromScroll = 0, live = false;

    const draw = (f) => {
      f = Math.max(0, Math.min(FRAMES - 1, Math.round(f)));
      if (f === current) return;
      current = f;
      sprite.style.backgroundPosition =
        ((f % COLS) / (COLS - 1) * 100) + '% ' + (Math.floor(f / COLS) / (ROWS - 1) * 100) + '%';
    };
    const tick = () => {
      shown += (target - shown) * 0.14;
      draw(shown);
      raf = Math.abs(target - shown) > 0.05 ? requestAnimationFrame(tick) : 0;
    };
    const aim = () => {
      target = MID + fromPointer + fromScroll;
      if (live && !raf) raf = requestAnimationFrame(tick);
    };

    // The sheet is about 400 KB, so it waits until the page itself has finished loading.
    const start = () => {
      const sheet = new Image();
      sheet.onload = () => {
        sprite.style.backgroundImage = 'url("img/can/can-turn.webp")';
        draw(MID);
        can.classList.add('is-live');
        live = true;
        aim();
      };
      sheet.src = 'img/can/can-turn.webp';
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });

    const inView = () => window.scrollY < hero.offsetHeight;
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' || !inView()) return;
      fromPointer = (e.clientX / window.innerWidth - 0.5) * 15;
      aim();
    }, { passive: true });
    window.addEventListener('scroll', () => {
      if (!inView()) return;
      fromScroll = Math.min(1, window.scrollY / hero.offsetHeight) * (touchFirst ? 10 : 5);
      aim();
    }, { passive: true });
  }

  /* ---------- Color and finish explorer ---------- */

  function initExplorer() {
    const root = $('[data-explorer]');
    const data = window.ALPHACOAT_COLORS || {};
    const colors = Array.isArray(data.list) ? data.list : [];
    if (!root || !colors.length) return;

    const SCENES = [
      { id: 'steel', label: 'Steelwork', noun: 'A steel frame', short: 'steelwork' },
      { id: 'gate',  label: 'Gate',      noun: 'A steel gate',  short: 'a gate' },
      { id: 'wall',  label: 'Wall',      noun: 'A plant wall',  short: 'a wall' }
    ];
    const viz = $('[data-viz]', root);
    const base = $('[data-viz-base]', root);
    const gloss = $('[data-viz-gloss]', root);
    const paint = $('[data-viz-paint]', root);
    const oldCoat = $('.coat-old', paint);
    const newCoat = $('.coat-new', paint);
    const swatches = $('[data-swatches]', root);
    const tabs = $('[data-scenes]', root);
    const slider = $('[data-finish]', root);
    const captionEl = $('[data-viz-caption]', root);

    let color = colors[0];
    let scene = SCENES[0];
    let finish = Number(slider.value);
    let rollTimer = 0;

    const hexInput = $('[data-hex-input]', root);
    const hexPicker = $('[data-hex-picker]', root);
    const hexError = $('[data-hex-error]', root);

    // "#1e73be", "1E73BE" and the short form "#abc" are all accepted; anything else returns null.
    const parseHex = (raw) => {
      let v = String(raw).trim().replace(/^#/, '');
      if (/^[0-9a-f]{3}$/i.test(v)) v = v.split('').map((ch) => ch + ch).join('');
      return /^[0-9a-f]{6}$/i.test(v) ? '#' + v.toLowerCase() : null;
    };
    // A typed code that matches one of the named colors uses that name; otherwise it is a custom color.
    const colorFor = (hex) => colors.find((c) => c.hex.toLowerCase() === hex) || { name: '', hex: hex };
    const code = (c) => c.hex.toUpperCase();
    const label = (c) => (c.name ? c.name + ' (' + code(c) + ')' : 'HEX ' + code(c));

    const finishName = (v) => (v < 25 ? 'matte' : v < 50 ? 'satin' : v < 75 ? 'semi-gloss' : 'gloss');
    const describe = () => scene.noun + ' in ' + (color.name ? color.name.toLowerCase() : 'color ' + code(color)) + ', ' + finishName(finish) + ' finish.';
    const caption = () => { base.alt = describe(); captionEl.textContent = describe(); };

    const setMask = (id) => {
      const url = 'url("img/explorer/' + id + '-mask.webp")';
      paint.style.webkitMaskImage = url;
      paint.style.maskImage = url;
    };

    const setFinish = (v) => {
      finish = v;
      // Matte still has a faint sheen; gloss shows every highlight.
      viz.style.setProperty('--gloss', (0.05 + 0.95 * Math.pow(v / 100, 1.3)).toFixed(3));
      slider.setAttribute('aria-valuetext', finishName(v));
    };

    const setColor = (c, instant, typing) => {
      const previous = color;
      color = c;
      $$('.swatch', swatches).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.hex.toLowerCase() === c.hex.toLowerCase())));
      $('[data-picked-name]', root).textContent = c.name || 'Custom color';
      $('[data-picked-hex]', root).textContent = code(c);
      $('[data-picked-chip]', root).style.setProperty('--c', c.hex);
      hexPicker.value = c.hex.toLowerCase();
      if (!typing) hexInput.value = code(c);   // never rewrite the box while someone is typing in it
      hexError.hidden = true;
      hexInput.removeAttribute('aria-invalid');

      clearTimeout(rollTimer);
      viz.classList.remove('is-rolling');
      if (instant || reduceMotion) { oldCoat.style.background = c.hex; return; }

      // Roll the new coat down over the old one.
      oldCoat.style.background = previous.hex;
      newCoat.style.background = c.hex;
      void newCoat.offsetWidth;
      viz.classList.add('is-rolling');
      rollTimer = setTimeout(() => {
        oldCoat.style.background = c.hex;
        viz.classList.remove('is-rolling');
      }, 760);
    };

    const preload = (src) => new Promise((done) => {
      const img = new Image();
      img.onload = img.onerror = done;
      img.src = src;
    });

    const setScene = (s) => {
      scene = s;
      $$('[data-scene]', tabs).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scene === s.id)));
      const files = ['base', 'gloss', 'mask'].map((k) => 'img/explorer/' + s.id + '-' + k + '.webp');
      viz.classList.add('is-loading');
      Promise.all(files.map(preload)).then(() => {
        if (scene !== s) return;
        base.src = files[0];
        gloss.src = files[1];
        setMask(s.id);
        caption();
        requestAnimationFrame(() => viz.classList.remove('is-loading'));
      });
    };

    swatches.innerHTML = colors.map((c) =>
      '<button type="button" class="swatch" data-hex="' + esc(c.hex) + '" style="--c:' + esc(c.hex) + '" aria-pressed="false" aria-label="' + esc(c.name) + '" title="' + esc(c.name) + '"></button>'
    ).join('');
    tabs.innerHTML = SCENES.map((s) =>
      '<button type="button" class="filter" data-scene="' + s.id + '" aria-pressed="' + (s === scene) + '">' + s.label + '</button>'
    ).join('');

    swatches.addEventListener('click', (e) => {
      const btn = e.target.closest('.swatch');
      const picked = btn && colors.find((c) => c.hex === btn.dataset.hex);
      if (picked && picked.hex.toLowerCase() !== color.hex.toLowerCase()) { setColor(picked); caption(); }
    });

    // HEX code box: the color changes as soon as the code is complete; a mistake is only pointed out on leaving the box.
    hexInput.addEventListener('input', () => {
      // Only a full six-character code counts while typing. The short "#abc" form waits for Enter or leaving the box,
      // otherwise the paint would flash a different color three characters into a longer code.
      const typed = hexInput.value.trim().replace(/^#/, '');
      const hex = typed.length === 6 ? parseHex(typed) : null;
      hexError.hidden = true;
      hexInput.removeAttribute('aria-invalid');
      if (hex && hex !== color.hex.toLowerCase()) { setColor(colorFor(hex), false, true); caption(); }
    });
    const commitHex = () => {
      const hex = parseHex(hexInput.value);
      if (hex) {
        if (hex !== color.hex.toLowerCase()) { setColor(colorFor(hex)); caption(); }
        hexInput.value = hex.toUpperCase();
        return;
      }
      hexError.textContent = hexInput.value.trim()
        ? 'That is not a HEX code. Use six characters from 0 to 9 and A to F, for example #1E73BE.'
        : 'Enter a HEX code, for example #1E73BE, or pick a color above.';
      hexError.hidden = false;
      hexInput.setAttribute('aria-invalid', 'true');
    };
    hexInput.addEventListener('change', commitHex);
    hexInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') commitHex(); });

    // The system color picker fires many times while dragging, so it changes the paint without the rolling effect.
    hexPicker.addEventListener('input', () => {
      const hex = parseHex(hexPicker.value);
      if (hex && hex !== color.hex.toLowerCase()) setColor(colorFor(hex), true);
    });
    hexPicker.addEventListener('change', caption);

    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-scene]');
      const picked = btn && SCENES.find((s) => s.id === btn.dataset.scene);
      if (picked && picked !== scene) setScene(picked);
    });
    slider.addEventListener('input', () => setFinish(Number(slider.value)));
    slider.addEventListener('change', caption);

    $('[data-explorer-add]', root).addEventListener('click', () => {
      const details = $('#q-details');
      const line = 'Color wanted: ' + label(color) + ', ' + finishName(finish) + ' finish (viewed on ' + scene.short + ').';
      details.value = details.value.trim() ? details.value.trim() + '\n' + line : line;
      showStage('form');
      $('#quote').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      details.focus({ preventScroll: true });
      announce(label(color) + ' added to your quote request.');
    });

    setMask(scene.id);
    setFinish(finish);
    setColor(color, true);
    caption();
  }

  /* ---------- Before/after sliders and the finished-jobs gallery ---------- */

  function initProjects() {
    const list = Array.isArray(window.ALPHACOAT_PROJECTS) ? window.ALPHACOAT_PROJECTS.filter((p) => p && p.after) : [];
    const box = $('[data-projects]');
    const grid = $('[data-project-grid]');
    if (!box || !grid || !list.length) return;

    grid.innerHTML = list.map((p) => {
      const title = p.title || 'Finished job';
      const media = p.before
        ? '<div class="compare" data-compare>' +
            '<img class="compare-after" src="' + esc(p.after) + '" loading="lazy" decoding="async" alt="' + esc(title) + ', after painting">' +
            '<div class="compare-before"><img src="' + esc(p.before) + '" loading="lazy" decoding="async" alt="' + esc(title) + ', before painting"></div>' +
            '<span class="compare-tag compare-tag-before" aria-hidden="true">Before</span>' +
            '<span class="compare-tag compare-tag-after" aria-hidden="true">After</span>' +
            '<div class="compare-handle" aria-hidden="true"><span class="compare-knob"></span></div>' +
            '<input class="compare-range" type="range" min="0" max="100" value="50" step="0.1" aria-label="Slide to compare before and after: ' + esc(title) + '">' +
          '</div>'
        : '<img class="project-photo" src="' + esc(p.after) + '" loading="lazy" decoding="async" alt="' + esc(title) + '">';
      return (
        '<li class="project"><figure>' + media +
          '<figcaption><strong>' + esc(title) + '</strong>' +
            (p.place ? '<span>' + esc(p.place) + '</span>' : '') +
            (p.note ? '<p>' + esc(p.note) + '</p>' : '') +
          '</figcaption></figure></li>'
      );
    }).join('');
    box.hidden = false;
  }

  function initCompare() {
    $$('[data-compare]').forEach((el) => {
      const range = $('.compare-range', el);
      if (!range) return;
      const set = () => el.style.setProperty('--pos', range.value + '%');
      range.addEventListener('input', set);
      set();
    });

    // One small nudge of the main slider the first time it is seen, to show that it moves.
    const main = $('#results [data-compare]');
    if (!main || reduceMotion || !('IntersectionObserver' in window)) return;
    const range = $('.compare-range', main);
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / 1300);
        range.value = 50 - Math.sin(p * Math.PI) * 14;
        main.style.setProperty('--pos', range.value + '%');
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.6 });
    io.observe(main);
  }

  /* ---------- Wet-paint edges where one section's color meets the next ---------- */

  function initEdges() {
    const sections = $$('[data-edge]');
    if (!sections.length) return;
    let builtFor = 0;

    const build = () => {
      const width = document.documentElement.clientWidth;
      if (width === builtFor) return;
      builtFor = width;
      $$('.edge').forEach((el) => el.remove());

      const rand = seeded(1977);
      const passes = width < 700 ? 4 : 7;
      const points = Math.max(48, Math.round(width / 5));

      sections.forEach((section) => {
        section.dataset.edge.split(/\s+/).forEach((side) => {
          if (side !== 'top' && side !== 'bottom') return;
          // Each roller pass stops at its own height; within a pass the edge is uneven, with a few thin streaks.
          const stops = Array.from({ length: passes }, () => 12 + rand() * 44);
          const line = [];
          for (let k = 0; k <= points; k++) {
            const x = k / points;
            const pass = Math.min(passes - 1, Math.floor(x * passes));
            const gap = Math.max(0, stops[pass] + Math.sin(x * 70 + pass * 2) * 2.5 + rand() * 3 - Math.pow(rand(), 7) * 24);
            line.push([x * 100, gap]);
          }
          const el = document.createElement('span');
          el.className = 'edge edge-' + side;
          el.setAttribute('aria-hidden', 'true');
          const pts = side === 'top'
            ? ['0% 100%'].concat(line.map((p) => p[0].toFixed(2) + '% ' + p[1].toFixed(1) + '%'), ['100% 100%'])
            : ['0% 0%'].concat(line.map((p) => p[0].toFixed(2) + '% ' + (100 - p[1]).toFixed(1) + '%'), ['100% 0%']);
          el.style.clipPath = 'polygon(' + pts.join(',') + ')';
          section.appendChild(el);
        });
      });
    };

    build();
    let timer;
    window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(build, 200); });
  }

  /* ---------- Coating system: coats go on as each step reaches the middle of the screen ---------- */

  function initSystem() {
    const figure = $('[data-system-figure]');
    const steps = $$('[data-system-step]');
    if (!figure || !steps.length || reduceMotion || !('IntersectionObserver' in window)) return;

    const setStage = (i) => {
      figure.dataset.stage = String(i + 1);
      steps.forEach((s, j) => s.classList.toggle('is-active', j === i));
    };
    setStage(0);

    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) setStage(steps.indexOf(en.target)); });
    }, { rootMargin: '-50% 0px -50% 0px', threshold: 0 });
    steps.forEach((s) => io.observe(s));
  }

  /* ---------- Paint calculator ---------- */

  function initCalculator() {
    const form = $('[data-calc]');
    if (!form) return;

    const out = {
      number: $('[data-calc-number]'), unit: $('[data-calc-unit]'),
      detail: $('[data-calc-detail]'), error: $('[data-calc-error]'), add: $('[data-calc-add]')
    };
    const val = (id) => parseFloat($('#' + id).value);
    let last = null;

    const run = () => {
      const mode = form.elements.mode.value;
      $$('[data-mode-rate]', form).forEach((el) => { el.hidden = mode !== 'rate'; });
      $$('[data-mode-film]', form).forEach((el) => { el.hidden = mode !== 'film'; });

      const area = val('calc-area');
      const coats = val('calc-coats');
      const loss = val('calc-loss');
      let coverage; // square metres per gallon, per coat
      let problem = '';

      if (!(area > 0)) problem = 'Enter a surface area greater than zero.';
      else if (!(coats >= 1)) problem = 'Enter at least one coat.';
      else if (!(loss >= 0 && loss < 100)) problem = 'Enter a loss allowance between 0 and 90 percent.';

      if (!problem) {
        if (mode === 'rate') {
          coverage = val('calc-coverage');
          if (!(coverage > 0)) problem = 'Enter the coverage per gallon from the product data sheet.';
        } else {
          const solids = val('calc-solids');
          const dft = val('calc-dft');
          if (!(solids > 0 && solids <= 100)) problem = 'Enter volume solids between 1 and 100 percent.';
          else if (!(dft > 0)) problem = 'Enter a dry film thickness greater than zero.';
          // Theoretical spreading rate: square metres per litre = volume solids % x 10 / dry film thickness in microns.
          else coverage = (solids * 10 / dft) * GAL;
        }
      }

      if (problem) {
        last = null;
        out.error.textContent = problem;
        out.error.hidden = false;
        out.number.textContent = '0';
        out.unit.textContent = 'gallons';
        out.detail.textContent = '';
        out.add.disabled = true;
        return;
      }

      const gallons = (area * coats) / (coverage * (1 - loss / 100));
      const whole = Math.ceil(gallons - 1e-9);
      last = { area: area, coats: coats, loss: loss, coverage: coverage, gallons: gallons, whole: whole };

      out.error.hidden = true;
      out.add.disabled = false;
      out.number.textContent = whole.toLocaleString('en-PH');
      out.unit.textContent = whole === 1 ? 'gallon' : 'gallons';
      out.detail.textContent =
        'The exact figure is ' + fmt(gallons * GAL) + ' liters (' + fmt(gallons) + ' gallons), rounded up to whole gallons. Based on ' + fmt(coverage) +
        ' m² per gallon per coat and a ' + fmt(loss) + '% allowance for loss.';
    };

    form.addEventListener('input', run);
    form.addEventListener('submit', (e) => e.preventDefault());

    out.add.addEventListener('click', () => {
      if (!last) return;
      const details = $('#q-details');
      const line = 'Paint estimate: ' + last.whole + (last.whole === 1 ? ' gallon' : ' gallons') + ' for ' + fmt(last.area) + ' m², ' +
        fmt(last.coats) + (last.coats === 1 ? ' coat' : ' coats') + ' (' + fmt(last.coverage) + ' m² per gallon, ' + fmt(last.loss) + '% loss allowance).';
      details.value = details.value.trim() ? details.value.trim() + '\n' + line : line;
      showStage('form');
      $('#quote').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      details.focus({ preventScroll: true });
      announce('Estimate added to your quote request.');
    });

    run();
  }

  /* ---------- Quote request ---------- */

  function showStage(name) {
    $$('[data-quote-stage]').forEach((el) => { el.hidden = el.dataset.quoteStage !== name; });
  }

  function initQuoteForm() {
    const form = $('[data-quote-form]');
    if (!form) return;

    const submit = $('[data-quote-submit]');
    const status = $('[data-form-status]');
    const hasEndpoint = Boolean(C.formEndpoint);
    submit.textContent = hasEndpoint ? 'Send request' : 'Prepare my request';

    const setError = (field, text) => {
      const p = $('[data-error-for="' + field + '"]', form);
      const input = form.elements[field];
      if (p) { p.textContent = text || ''; p.hidden = !text; }
      if (input) { if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
    };

    const read = () => ({
      name: form.elements.name.value.trim(),
      company: form.elements.company.value.trim(),
      contact: form.elements.contact.value.trim(),
      details: form.elements.details.value.trim()
    });

    const productLines = () => quote.map((q) => '- ' + q.qty + ' gal  ' + q.name);

    const compose = (v) => {
      const lines = ['Quote request for ' + (C.name || 'Alphacoat'), ''];
      if (quote.length) lines.push('Products:', ...productLines(), '');
      if (v.details) lines.push('About the job:', v.details, '');
      lines.push('From: ' + v.name + (v.company ? ', ' + v.company : ''));
      lines.push('Contact: ' + v.contact);
      return lines.join('\n');
    };

    const showReady = (message) => {
      $('[data-ready-message]').textContent = message;

      const sms = $('[data-send-sms]');
      sms.href = 'sms:' + (C.mobileDial || '') + '?&body=' + encodeURIComponent(message);

      const mail = $('[data-send-email]');
      if (C.email) {
        mail.hidden = false;
        mail.href = 'mailto:' + C.email + '?subject=' + encodeURIComponent('Quote request') + '&body=' + encodeURIComponent(message);
      }

      // On a computer, copying is the dependable route; on a phone, a text message is.
      const copy = $('[data-copy]');
      const primary = touchFirst ? sms : (C.email ? mail : copy);
      [sms, mail, copy].forEach((el) => {
        el.classList.toggle('btn-green', el === primary);
        el.classList.toggle('btn-line', el !== primary);
      });

      showStage('ready');
      const title = $('[data-ready-title]');
      title.focus({ preventScroll: true });
      $('#quote').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = read();
      status.hidden = true;

      const errors = {
        name: v.name ? '' : 'Enter your name.',
        contact: v.contact ? '' : 'Enter a mobile number or email so we can send the quotation.',
        details: quote.length || v.details ? '' : 'Add a product to your quote list or describe what you need.'
      };
      Object.keys(errors).forEach((k) => setError(k, errors[k]));
      const firstBad = Object.keys(errors).find((k) => errors[k]);
      if (firstBad) { form.elements[firstBad].focus(); return; }

      const message = compose(v);
      if (!hasEndpoint) { showReady(message); return; }

      submit.disabled = true;
      submit.textContent = 'Sending request';
      try {
        const body = new FormData();
        body.append('name', v.name);
        body.append('company', v.company);
        body.append('contact', v.contact);
        body.append('products', productLines().join('\n'));
        body.append('details', v.details);
        body.append('message', message);
        const res = await fetch(C.formEndpoint, { method: 'POST', headers: { Accept: 'application/json' }, body: body });
        if (!res.ok) throw new Error('Status ' + res.status);

        $('[data-sent-text]').textContent = 'We will reply to ' + v.contact + ' with a written quotation.';
        quote = [];
        saveQuote();
        renderQuote();
        form.reset();
        showStage('sent');
        $('[data-sent-title]').focus({ preventScroll: true });
      } catch (err) {
        status.textContent = 'The request could not be sent from this page. You can still send it yourself below.';
        status.hidden = false;
        showReady(message);
      } finally {
        submit.disabled = false;
        submit.textContent = 'Send request';
      }
    });

    form.addEventListener('input', (e) => { if (e.target.name) setError(e.target.name, ''); });

    const copyBtn = $('[data-copy]');
    copyBtn.addEventListener('click', async () => {
      const text = $('[data-ready-message]').textContent;
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch (err) {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { ok = document.execCommand('copy'); } catch (err2) { ok = false; }
        ta.remove();
      }
      copyBtn.textContent = ok ? 'Message copied' : 'Select the message and copy it';
      announce(ok ? 'Message copied.' : 'Copying is blocked in this browser. Select the message and copy it.');
      clearTimeout(copyBtn._timer);
      copyBtn._timer = setTimeout(() => { copyBtn.textContent = 'Copy message'; }, 2200);
    });

    $$('[data-edit]').forEach((b) => b.addEventListener('click', () => { showStage('form'); form.elements.name.focus(); }));
    $$('[data-reset]').forEach((b) => b.addEventListener('click', () => {
      quote = [];
      saveQuote();
      renderQuote();
      form.reset();
      ['name', 'contact', 'details'].forEach((k) => setError(k, ''));
      showStage('form');
      announce('Quote request cleared.');
    }));
  }

  /* ---------- Start ---------- */

  fillContact();
  initHeader();
  initCoat();
  initCan();
  initQuoteList();
  initProducts();
  initSystem();
  initProjects();
  initCompare();
  initExplorer();
  initCalculator();
  initQuoteForm();
  initEdges();
})();
