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

  // A small shared surface for features.js, which loads after this file.
  const hooks = {};
  const App = window.AlphacoatApp = {
    on(name, fn) { (hooks[name] = hooks[name] || []).push(fn); },
    emit(name, data) { (hooks[name] || []).forEach((fn) => { try { fn(data); } catch (err) { console.error(err); } }); },
    esc: esc, announce: announce, products: PRODUCTS
  };

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

    let built = 0;

    const build = () => {
      const n = window.innerWidth < 700 ? 4 : 7;
      if (n === built) return;
      built = n;
      coat.textContent = '';
      const rand = seeded(3130);
      // How far down the wall each pass reaches, as a share of the hero height.
      const reach = n === 4 ? [0.965, 0.92, 0.985, 0.94] : [0.955, 0.915, 0.975, 0.93, 0.99, 0.905, 0.945];
      // One point every 6px. The polygon is fine enough to read as a curve.
      const passPx = window.innerWidth / n;
      const count = Math.max(12, Math.round(passPx / 6));
      const smooth = (t) => t * t * (3 - 2 * t);

      for (let i = 0; i < n; i++) {
        const pass = document.createElement('span');
        pass.className = 'pass';

        // Lower edge where the roller lifts off: slightly rounded at both ends, with a slow wobble and nothing sharp.
        const pts = ['0% 0%', '100% 0%'];
        const phase = rand() * 6.28;
        for (let k = 0; k <= count; k++) {
          const f = 1 - k / count;                       // 1 at the right end, 0 at the left
          const px = f * passPx;
          const fromEnd = Math.min(px, passPx - px);
          const corner = (1 - smooth(Math.min(1, fromEnd / 14))) * 0.75;
          const wobble = Math.sin(px / 38 + phase) * 0.16 + Math.sin(px / 13 + phase * 1.7) * 0.07;
          const y = Math.min(100, 99.55 - corner + wobble);
          pts.push((f * 100).toFixed(2) + '% ' + y.toFixed(2) + '%');
        }

        pass.style.setProperty('--edge', 'polygon(' + pts.join(',') + ')');
        pass.style.setProperty('--hf', reach[i]);
        pass.style.setProperty('--i', i);
        pass.style.setProperty('--n', n);
        pass.dataset.tone = String(i % 3);   // three slightly different mixes of the same paint, set in the stylesheet
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

  /* ---------- Products: a shelf of cans, with the chosen product's details beneath it ---------- */

  // Add a line to the "About the job" box of the quote form, unless that exact line is already there.
  function appendDetail(line) {
    const details = $('#q-details');
    if (!details) return;
    const have = details.value.split('\n').map((l) => l.trim());
    if (have.indexOf(line) === -1) details.value = details.value.trim() ? details.value.trim() + '\n' + line : line;
  }
  function goToQuote() {
    showStage('form');
    $('#quote').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    const details = $('#q-details');
    if (details) details.focus({ preventScroll: true });
  }

  function initProducts() {
    const shelf = $('[data-shelf]');
    const detail = $('[data-product-detail]');
    const filters = $('[data-filters]');
    if (!shelf || !detail || !PRODUCTS.length) return;

    const FRAMES = 9, MID = 4;
    // Data sheet figures, in the order they are shown. Only the ones that have been filled in appear.
    const SHEET = [
      ['coverage', 'Coverage', (v) => v + ' m² per gallon, per coat'], ['mixing', 'Mixing ratio'], ['thinning', 'Thinning'],
      ['touchDry', 'Touch dry'], ['recoat', 'Recoat'], ['potLife', 'Pot life'], ['dft', 'Dry film thickness'],
      ['solids', 'Volume solids'], ['methods', 'Apply by']
    ];
    let active = 'all';
    let selected = PRODUCTS[0].id;
    const lineOf = (id) => LINES.find((l) => l.id === id) || { label: '', single: '' };
    const byId = (id) => PRODUCTS.find((p) => p.id === id);
    const frame = (el, f) => { el.style.backgroundPosition = (Math.max(0, Math.min(FRAMES - 1, Math.round(f))) / (FRAMES - 1) * 100) + '% 0'; };

    const renderShelf = () => {
      const shown = PRODUCTS.filter((p) => active === 'all' || p.line === active);
      if (shown.length && !shown.some((p) => p.id === selected)) selected = shown[0].id;
      shelf.innerHTML = shown.map((p) => {
        const shot = p.turn
          ? '<span class="shelf-shot" style="background-image:url(&quot;' + esc(p.turn) + '&quot;)" aria-hidden="true"></span>'
          : '<span class="shelf-shot shelf-shot-still" style="background-image:url(&quot;' + esc(p.image || '') + '&quot;)" aria-hidden="true"></span>';
        return (
          '<li class="shelf-item"><button type="button" class="shelf-can" data-pick="' + esc(p.id) + '" aria-pressed="' + (p.id === selected) + '">' +
            shot +
            '<span class="shelf-tag"><span class="shelf-name">' + esc(p.shelfName || p.name) + '</span><span class="shelf-kind">' + esc(lineOf(p.line).single) + '</span></span>' +
          '</button></li>'
        );
      }).join('');
      $$('.shelf-shot:not(.shelf-shot-still)', shelf).forEach((el) => frame(el, MID));
    };

    const renderDetail = () => {
      const p = byId(selected);
      if (!p) { detail.innerHTML = ''; return; }
      const line = lineOf(p.line);
      const meta = p.pack ? line.single + ', sold by the ' + p.pack.toLowerCase() : line.single + ', ask us for types and pack sizes';
      const row = (label, value) => '<tr><th scope="row">' + esc(label) + '</th><td>' + esc(value) + '</td></tr>';
      const specs = (p.specs || []).map((r) => row(r[0], r[1])).join('');
      const sheet = p.sheet || {};
      const figures = SHEET.filter((f) => sheet[f[0]] !== undefined && sheet[f[0]] !== null && sheet[f[0]] !== '')
        .map((f) => row(f[1], f[2] ? f[2](sheet[f[0]]) : sheet[f[0]])).join('');
      detail.innerHTML =
        '<div class="pd-main">' +
          '<div class="pd-head"><span class="chip chip-' + esc(p.chip || 'gloss') + '" aria-hidden="true"></span>' +
            '<div><h3>' + esc(p.name) + '</h3><p class="product-meta">' + esc(meta) + '</p></div></div>' +
          '<p class="product-summary">' + esc(p.summary || '') + '</p>' +
          '<form class="product-add" data-add>' + qtyControl(1, 'Gallons of ' + p.name) +
            '<button class="btn btn-green" type="submit">Add to quote list</button></form>' +
        '</div>' +
        '<div class="pd-facts">' +
          (specs ? '<table class="spec"><tbody>' + specs + '</tbody></table>' : '') +
          (figures
            ? '<h4 class="sheet-title">From the data sheet</h4><table class="spec"><tbody>' + figures + '</tbody></table>'
            : '<p class="spec-note">Coverage, mixing ratio and drying times are on the technical data sheet.</p>') +
          (p.datasheetFile
            ? '<a class="btn btn-line" href="' + esc(p.datasheetFile) + '" download>Download the data sheet</a>'
            : '<button type="button" class="btn btn-line" data-datasheet>Ask for the data sheet</button>') +
        '</div>';
    };

    const select = (id, quiet) => {
      selected = id;
      $$('[data-pick]', shelf).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pick === id)));
      renderDetail();
      if (quiet) return;
      const p = byId(id);
      if (p) announce(p.name + ' selected.');
      // The chosen can turns once, like being picked up and looked at.
      const shot = $('[data-pick="' + id + '"] .shelf-shot:not(.shelf-shot-still)', shelf);
      if (shot && !reduceMotion) {
        const t0 = performance.now();
        const spin = (t) => {
          const k = Math.min(1, (t - t0) / 650);
          frame(shot, MID + Math.sin(k * Math.PI) * 4);
          if (k < 1) requestAnimationFrame(spin);
        };
        requestAnimationFrame(spin);
      }
    };

    shelf.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pick]');
      if (btn && btn.dataset.pick !== selected) select(btn.dataset.pick);
    });
    // On a computer the can under the pointer turns to follow it.
    if (!reduceMotion && !touchFirst) {
      shelf.addEventListener('pointermove', (e) => {
        const btn = e.target.closest('[data-pick]');
        const shot = btn && $('.shelf-shot:not(.shelf-shot-still)', btn);
        if (!shot) return;
        const box = btn.getBoundingClientRect();
        frame(shot, MID + ((e.clientX - box.left) / box.width - 0.5) * 8);
      });
      shelf.addEventListener('pointerout', (e) => {
        const btn = e.target.closest('[data-pick]');
        if (!btn || btn.contains(e.relatedTarget)) return;
        const shot = $('.shelf-shot:not(.shelf-shot-still)', btn);
        if (shot) frame(shot, MID);
      });
    }

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
        renderShelf();
        renderDetail();
      });
    }

    detail.addEventListener('change', (e) => {
      if (e.target.matches('.qty input')) e.target.value = clampQty(e.target.value);
    });
    detail.addEventListener('submit', (e) => {
      const form = e.target.closest('[data-add]');
      const product = byId(selected);
      if (!form || !product) return;
      e.preventDefault();
      const qty = clampQty($('input', form).value);
      const name = product.quoteName || product.name;
      addToQuote(product.id, name, qty);
      announce(qty + (qty === 1 ? ' gallon of ' : ' gallons of ') + name + ' added to your quote list.');
      const btn = $('button[type="submit"]', form);
      btn.textContent = 'Added to quote list';
      clearTimeout(btn._timer);
      btn._timer = setTimeout(() => { btn.textContent = 'Add to quote list'; }, 1700);
    });
    detail.addEventListener('click', (e) => {
      const sheetBtn = e.target.closest('[data-datasheet]');
      const product = byId(selected);
      if (!sheetBtn || !product) return;
      appendDetail('Please send the data sheet for ' + product.name + '.');
      sheetBtn.textContent = 'Data sheet added to your request';
      sheetBtn.disabled = true;
      announce('Data sheet for ' + product.name + ' added to your quote request.');
    });

    renderShelf();
    renderDetail();
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
      { id: 'wall',  label: 'Wall',      noun: 'A plant wall',  short: 'a wall' },
      { id: 'tank',     label: 'Tank and pipes', noun: 'A storage tank and its pipework', short: 'a tank' },
      { id: 'machine',  label: 'Machinery',      noun: 'A motor and pump set',            short: 'machinery' },
      { id: 'building', label: 'Building',       noun: 'A building front',                short: 'a building' }
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
    // What the rest of the site is told about the current color.
    const report = () => ({ hex: color.hex.toLowerCase(), name: color.name || '', label: label(color) });
    // A returning visitor starts with the color they left the site in.
    try {
      const saved = parseHex(localStorage.getItem('alphacoat-color') || '');
      if (saved) color = colorFor(saved);
    } catch (err) { /* private mode: start in Alphacoat green */ }

    const finishName = (v) => (v < 25 ? 'matte' : v < 50 ? 'satin' : v < 75 ? 'semi-gloss' : 'gloss');
    const describe = () => scene.noun + ' in ' + (color.name ? color.name.toLowerCase() : 'color ' + code(color)) + ', ' + finishName(finish) + ' finish.';
    const caption = () => { base.alt = describe(); captionEl.textContent = describe(); };

    // The mask is an <image> inside an inline SVG <mask>, not a CSS mask file: browsers block CSS mask files
    // when a page is opened straight from disk, which left the frame unpainted.
    const maskImage = $('[data-viz-mask]', paint);
    const setMask = (id) => maskImage.setAttribute('href', 'img/explorer/' + id + '-mask.webp');

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
      try { localStorage.setItem('alphacoat-color', c.hex.toLowerCase()); } catch (err) { /* private mode */ }
      App.emit('color', report());

      clearTimeout(rollTimer);
      viz.classList.remove('is-rolling');
      if (instant || reduceMotion) { oldCoat.style.fill = c.hex; return; }

      // Roll the new coat down over the old one.
      oldCoat.style.fill = previous.hex;
      newCoat.style.fill = c.hex;
      newCoat.getBoundingClientRect();   // make the browser register the start position before the roll begins
      viz.classList.add('is-rolling');
      rollTimer = setTimeout(() => {
        oldCoat.style.fill = c.hex;
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

    App.defaultColor = colors[0].hex.toLowerCase();
    App.color = report;
    App.setColor = (hex) => {
      const parsed = parseHex(hex);
      if (parsed && parsed !== color.hex.toLowerCase()) { setColor(colorFor(parsed)); caption(); }
    };

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
    const NS = 'http://www.w3.org/2000/svg';
    const lerp = (a, b, t) => a + (b - a) * t;
    const ease = (t) => t * t * (3 - 2 * t);
    let builtFor = 0;

    const build = () => {
      const width = document.documentElement.clientWidth;
      if (width === builtFor) return;
      builtFor = width;
      $$('.edge').forEach((el) => el.remove());

      const rand = seeded(1977);
      const passes = width < 700 ? 4 : 7;
      const H = width < 700 ? 20 : 32;
      const passW = width / passes;
      const soft = Math.min(0.5, 16 / passW);   // how much of a pass is spent easing into its neighbour

      sections.forEach((section) => {
        section.dataset.edge.split(/\s+/).forEach((side) => {
          if (side !== 'top' && side !== 'bottom') return;
          // Each roller pass stops at its own height. Neighbouring passes meet in a soft S, and the line has a slow
          // wobble: the edge a roller leaves, with nothing sharp in it.
          const stops = Array.from({ length: passes }, () => 0.16 + rand() * 0.5);
          const phase = rand() * 6.28;
          const pts = [];
          for (let x = 0; x <= width + 7; x += 8) {
            const px = Math.min(x, width);
            const pos = Math.min(passes - 1e-6, px / passW);
            const i = Math.floor(pos);
            const t = pos - i;
            let level = stops[i];
            if (t > 1 - soft && i < passes - 1) level = lerp(stops[i], stops[i + 1], ease((t - (1 - soft)) / soft / 2));
            else if (t < soft && i > 0) level = lerp(stops[i - 1], stops[i], ease(0.5 + t / soft / 2));
            const wobble = Math.sin(px / 46 + phase) * 0.04 + Math.sin(px / 15 + phase * 2) * 0.022;
            const y = Math.max(0, Math.min(0.92, level + wobble)) * H;
            pts.push([px, side === 'top' ? y : H - y]);
          }

          const flat = side === 'top' ? H : 0;   // the side that joins the section
          let d = 'M0,' + flat + ' L0,' + pts[0][1].toFixed(1);
          for (let k = 1; k < pts.length - 1; k++) {
            const mx = (pts[k][0] + pts[k + 1][0]) / 2;
            const my = (pts[k][1] + pts[k + 1][1]) / 2;
            d += ' Q' + pts[k][0].toFixed(1) + ',' + pts[k][1].toFixed(1) + ' ' + mx.toFixed(1) + ',' + my.toFixed(1);
          }
          d += ' L' + width + ',' + pts[pts.length - 1][1].toFixed(1) + ' L' + width + ',' + flat + ' Z';

          const svg = document.createElementNS(NS, 'svg');
          svg.setAttribute('class', 'edge edge-' + side);
          svg.setAttribute('viewBox', '0 0 ' + width + ' ' + H);
          svg.setAttribute('preserveAspectRatio', 'none');
          svg.setAttribute('aria-hidden', 'true');
          svg.setAttribute('focusable', 'false');
          svg.style.height = H + 'px';
          const path = document.createElementNS(NS, 'path');
          path.setAttribute('d', d);
          svg.appendChild(path);
          section.appendChild(svg);
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

    // Choosing a paint fills in its coverage when the data sheet figure is known (products.js), and lets the
    // result go straight onto the quote list as that many gallons of that paint.
    const picker = $('[data-calc-product]');
    const pickerNote = $('[data-calc-product-note]');
    const chosenProduct = () => (picker && picker.value ? PRODUCTS.find((p) => p.id === picker.value) : null);
    if (picker) {
      picker.innerHTML = '<option value="">Any paint</option>' +
        PRODUCTS.map((p) => '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>').join('');
      picker.addEventListener('change', () => {
        const p = chosenProduct();
        const known = p && p.sheet && Number(p.sheet.coverage) > 0 ? Number(p.sheet.coverage) : 0;
        if (known) {
          form.elements.mode.value = 'rate';
          $('#calc-coverage').value = known;
        }
        if (pickerNote) {
          pickerNote.hidden = !p;
          pickerNote.textContent = !p ? '' : known
            ? 'Coverage filled in from the data sheet: ' + known + ' m² per gallon, per coat.'
            : 'Enter the coverage from this paint\'s data sheet. Ask us for the sheet if you do not have it.';
        }
        run();
      });
    }

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
      out.add.textContent = chosenProduct()
        ? 'Add ' + whole + (whole === 1 ? ' gallon' : ' gallons') + ' to my quote list'
        : 'Add this to my quote request';
    };

    form.addEventListener('input', run);
    form.addEventListener('submit', (e) => e.preventDefault());

    out.add.addEventListener('click', () => {
      if (!last) return;
      const product = chosenProduct();
      const line = 'Paint estimate' + (product ? ' for ' + product.name : '') + ': ' + last.whole + (last.whole === 1 ? ' gallon' : ' gallons') + ' for ' + fmt(last.area) + ' m², ' +
        fmt(last.coats) + (last.coats === 1 ? ' coat' : ' coats') + ' (' + fmt(last.coverage) + ' m² per gallon, ' + fmt(last.loss) + '% loss allowance).';
      if (product) addToQuote(product.id, product.quoteName || product.name, last.whole);
      appendDetail(line);
      goToQuote();
      announce(product ? last.whole + ' gallons of ' + product.name + ' added to your quote list.' : 'Estimate added to your quote request.');
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

  /* ---------- Phone call-and-quote bar ---------- */

  function initActionBar() {
    const bar = $('[data-action-bar]');
    const hero = $('.hero');
    if (!bar || !hero) return;
    const busy = new Set();   // sections that already have their own way forward: the color tool and the quote form
    let typing = false;

    const update = () => {
      const show = window.scrollY > hero.offsetHeight * 0.75 && !busy.size && !typing &&
        !document.body.classList.contains('nav-open');
      bar.classList.toggle('is-shown', show);
      bar.inert = !show;
    };

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) busy.add(en.target); else busy.delete(en.target); });
        update();
      }, { rootMargin: '-25% 0px -25% 0px' });
      ['#colors', '#quote'].forEach((sel) => { const el = $(sel); if (el) io.observe(el); });
    }
    // Step aside while someone is typing, so the bar never sits on top of the keyboard's field.
    document.addEventListener('focusin', (e) => {
      typing = e.target.matches('input:not([type="range"]):not([type="color"]):not([type="radio"]), textarea');
      update();
    });
    document.addEventListener('focusout', () => { typing = false; update(); });
    window.addEventListener('scroll', update, { passive: true });
    const menu = $('.menu-btn');
    if (menu) menu.addEventListener('click', () => setTimeout(update, 0));
    update();
  }

  /* ---------- Start ---------- */

  App.addToQuote = addToQuote;
  App.appendDetail = appendDetail;
  App.goToQuote = goToQuote;

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
  initActionBar();
})();
