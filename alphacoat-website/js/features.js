/*
  Features that sit on top of main.js:
    1. the site repaints in the color the visitor chooses
    2. pick a color from a photo
    3. the "Not sure what you need?" guide
    4. the "Before you order" questions
*/
(function () {
  'use strict';

  const App = window.AlphacoatApp;
  if (!App) return;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = App.esc;
  const PRODUCTS = App.products || [];

  /* ---------- 1. The site repaints in the visitor's color ---------- */

  const DEFAULT = (App.defaultColor || '#0f6b3c').toLowerCase();
  const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const luminance = (hex) => {
    const [r, g, b] = channels(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const mix = (hex, toward, amount) => {
    const a = channels(hex), b = channels(toward);
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, '0')).join('');
  };

  // Everything painted on the page reads these. Text set on the paint switches between white and black,
  // whichever is easier to read on the chosen color.
  function paintVars(hex) {
    const light = luminance(hex) > 0.179;
    return {
      '--paint': hex,
      '--paint-ink': light ? '#000' : '#fff',
      '--paint-ink-inverse': light ? '#fff' : '#000',
      '--paint-soft': light ? 'rgba(0, 0, 0, .74)' : 'rgba(255, 255, 255, .84)',
      '--paint-line': light ? 'rgba(0, 0, 0, .32)' : 'rgba(255, 255, 255, .3)',
      '--paint-tone-a': mix(hex, '#000000', 0.07),
      '--paint-tone-b': mix(hex, '#ffffff', 0.05),
      '--paint-sheen': hex === DEFAULT ? 'rgba(190, 255, 214, .36)' : (light ? 'rgba(255, 255, 255, .5)' : 'rgba(255, 255, 255, .26)')
    };
  }

  function repaint(color) {
    const hex = color.hex.toLowerCase();
    const custom = hex !== DEFAULT;
    const vars = paintVars(hex);
    const root = document.documentElement;
    Object.keys(vars).forEach((name) => root.style.setProperty(name, vars[name]));
    root.classList.toggle('is-repainted', custom);
    // Saved so the next visit opens already painted, before any script has run (see the small script in index.html).
    try { localStorage.setItem('alphacoat-paint', JSON.stringify({ custom: custom, vars: vars })); } catch (err) { /* private mode */ }
    $$('[data-paint-name]').forEach((el) => { el.textContent = color.label; });
    $$('[data-paint-default]').forEach((el) => { el.hidden = custom; });
    $$('[data-paint-custom]').forEach((el) => { el.hidden = !custom; });
  }

  App.on('color', repaint);
  if (App.color) repaint(App.color());
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-paint-reset]') && App.setColor) {
      App.setColor(DEFAULT);
      App.announce('Back to Alphacoat green.');
    }
  });

  /* ---------- 2. Pick a color from a photo ---------- */

  function initPhoto() {
    const openBtn = $('[data-photo-open]');
    const fileInput = $('[data-photo-file]');
    const dialog = $('[data-photo-dialog]');
    if (!openBtn || !fileInput || !dialog || typeof dialog.showModal !== 'function') {
      if (openBtn) openBtn.hidden = true;
      return;
    }
    const canvas = $('[data-photo-canvas]', dialog);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const chip = $('[data-photo-chip]', dialog);
    const readout = $('[data-photo-hex]', dialog);
    const marker = $('[data-photo-marker]', dialog);
    const useBtn = $('[data-photo-use]', dialog);
    let chosen = null;

    const reset = () => {
      chosen = null;
      marker.hidden = true;
      useBtn.disabled = true;
      chip.style.setProperty('--c', 'transparent');
      readout.textContent = 'Tap or click the color you want';
    };

    // Average a small patch, so one odd pixel of grain does not decide the color.
    const sample = (e) => {
      const box = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - box.left) / box.width * canvas.width);
      const y = Math.floor((e.clientY - box.top) / box.height * canvas.height);
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
      const size = 5;
      const sx = Math.max(0, Math.min(canvas.width - size, x - 2));
      const sy = Math.max(0, Math.min(canvas.height - size, y - 2));
      const data = ctx.getImageData(sx, sy, size, size).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
      const n = data.length / 4;
      const hex = '#' + [r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('');
      const stage = marker.parentElement.getBoundingClientRect();
      return { hex: hex, left: e.clientX - stage.left, top: e.clientY - stage.top };
    };
    const show = (hex) => { chip.style.setProperty('--c', hex); readout.textContent = hex.toUpperCase(); };

    canvas.addEventListener('pointermove', (e) => {
      if (chosen || e.pointerType === 'touch') return;
      const s = sample(e);
      if (s) show(s.hex);
    });
    canvas.addEventListener('click', (e) => {
      const s = sample(e);
      if (!s) return;
      chosen = s.hex;
      show(s.hex);
      marker.hidden = false;
      marker.style.left = s.left + 'px';
      marker.style.top = s.top + 'px';
      useBtn.disabled = false;
    });

    const load = (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        reset();
        if (!dialog.open) dialog.showModal();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        App.announce('That file could not be opened as a picture. Choose a JPG or PNG photo.');
        window.alert('That file could not be opened as a picture. Choose a JPG or PNG photo.');
      };
      img.src = url;
    };

    openBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => { load(fileInput.files && fileInput.files[0]); fileInput.value = ''; });
    $('[data-photo-another]', dialog).addEventListener('click', () => fileInput.click());
    $('[data-photo-close]', dialog).addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });   // click on the dimmed backdrop
    useBtn.addEventListener('click', () => {
      if (!chosen) return;
      App.setColor(chosen);
      dialog.close();
      App.announce('Color ' + chosen.toUpperCase() + ' taken from your photo.');
    });

    App.loadPhoto = load;
  }

  /* ---------- 3. "Not sure what you need?" guide ---------- */

  function initGuide() {
    const root = $('[data-guide]');
    const rules = window.ALPHACOAT_GUIDE;
    if (!root || !rules) return;
    const result = $('[data-guide-result]', root);
    const area = $('[data-guide-area]', root);

    const choices = (name, items) => items.map((item, i) => {
      const id = typeof item === 'string' ? item : item.id;
      const label = typeof item === 'string' ? item : item.label;
      return '<label class="choice"><input type="radio" name="' + name + '" value="' + esc(id) + '"' + (i === 0 ? ' checked' : '') + '><span>' + esc(label) + '</span></label>';
    }).join('');
    $('[data-guide-surfaces]', root).innerHTML = choices('surface', rules.surfaces);
    $('[data-guide-places]', root).innerHTML = choices('place', rules.places);
    $('[data-guide-finishes]', root).innerHTML = choices('finish', rules.finishes);

    const form = $('[data-guide-form]', root);
    const state = () => {
      const surface = rules.surfaces.find((s) => s.id === form.elements.surface.value) || rules.surfaces[0];
      const place = rules.places.find((p) => p.id === form.elements.place.value) || rules.places[0];
      const finish = form.elements.finish.value;
      const primer = surface.primer ? PRODUCTS.find((p) => p.id === surface.primer) : null;
      const square = parseFloat(area.value);
      return { surface: surface, place: place, finish: finish, primer: primer, area: square > 0 ? square : null, color: App.color ? App.color() : null };
    };
    const finishWords = (finish) => (/not sure/i.test(finish) ? 'finish to be decided' : finish.toLowerCase() + ' finish');

    const render = () => {
      const s = state();
      const colorText = s.color ? esc(s.color.label) : 'your color';
      result.innerHTML =
        '<h3>Your starting list</h3>' +
        '<ol class="guide-list">' +
          '<li><strong>Primer</strong><span>' + (s.primer ? esc(s.primer.name) + ', ' + esc(s.surface.why || 'the first coat') + '.' : esc(s.surface.ask || 'We will recommend a primer.')) + '</span></li>' +
          '<li><strong>Topcoat</strong><span><span class="guide-chip" style="--c:' + (s.color ? esc(s.color.hex) : 'transparent') + '"></span>In ' + colorText + ', ' + esc(finishWords(s.finish)) + '. <a href="#colors">Change the color</a></span></li>' +
          '<li><strong>Thinner</strong><span>' + esc(rules.thinner || 'The one that matches the topcoat.') + '</span></li>' +
        '</ol>' +
        (s.place.note ? '<p class="guide-note">' + esc(s.place.note) + '</p>' : '') +
        '<button class="btn btn-green" type="button" data-guide-add>Add this to my quote request</button>' +
        '<p class="hint">A starting point only. Alphacoat confirms the system and the quantities when it replies.</p>';
    };

    form.addEventListener('input', render);
    form.addEventListener('submit', (e) => e.preventDefault());
    App.on('color', render);

    result.addEventListener('click', (e) => {
      if (!e.target.closest('[data-guide-add]')) return;
      const s = state();
      if (s.primer) App.addToQuote(s.primer.id, s.primer.quoteName || s.primer.name, 1);
      const topcoat = PRODUCTS.find((p) => p.line === 'topcoat');
      if (topcoat) App.addToQuote(topcoat.id, topcoat.quoteName || topcoat.name, 1);
      App.appendDetail(
        'Job: ' + s.surface.label.toLowerCase() + ', ' + s.place.label.toLowerCase() + '. Topcoat: ' +
        (s.color ? s.color.label : 'color to be decided') + ', ' + finishWords(s.finish) + '.' +
        (s.area ? ' Area: about ' + s.area + ' m².' : '') + ' Please confirm the system and quantities.');
      App.goToQuote();
      App.announce('Starting list added to your quote request.');
    });

    render();
  }

  /* ---------- 4. "Before you order" ---------- */

  function initFaq() {
    const box = $('[data-faq]');
    const section = box && box.closest('section');
    const items = (window.ALPHACOAT_FAQ || []).filter((f) => f && f.q && f.a);
    if (!box) return;
    if (!items.length) { if (section) section.hidden = true; return; }
    box.innerHTML = items.map((f) =>
      '<details class="faq"><summary>' + esc(f.q) + '</summary><div class="faq-a"><p>' + esc(f.a) + '</p>' +
      (f.link && f.link.href ? '<p><a href="' + esc(f.link.href) + '"' + (/^https?:/.test(f.link.href) ? ' target="_blank" rel="noopener"' : '') + '>' + esc(f.link.text || f.link.href) + '</a></p>' : '') +
      '</div></details>'
    ).join('');
  }

  initPhoto();
  initGuide();
  initFaq();
})();
