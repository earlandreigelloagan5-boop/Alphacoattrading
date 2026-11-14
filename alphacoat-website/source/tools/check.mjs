// Feature checks. Drives a private, headless copy of Chrome to open the site the way a visitor would (straight from the folder),
// interact with it, and save screenshots. Uses a throwaway profile, so the user's own Chrome is not touched.
//   node shots.mjs <out-folder> <url> <desktop|mobile>
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const [out, url, mode = 'desktop'] = process.argv.slice(2);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9377;
const profile = join(out, '..', 'chrome-profile-' + mode);
mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--force-device-scale-factor=1', 'about:blank'
], { stdio: 'ignore' });

let target;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(250);
  try {
    const list = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
    target = list.find((t) => t.type === 'page');
  } catch { /* not up yet */ }
}
if (!target) { chrome.kill(); throw new Error('Chrome did not start'); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 1;
const pending = new Map();
const problems = [];
let loaded = () => {};
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Page.loadEventFired') loaded();
  if (msg.method === 'Log.entryAdded' && ['error', 'warning'].includes(msg.params.entry.level)) problems.push(msg.params.entry.level + ': ' + msg.params.entry.text);
  if (msg.method === 'Runtime.exceptionThrown') problems.push('exception: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
};
const send = (method, params = {}) => new Promise((res) => {
  const id = nextId++;
  pending.set(id, (m) => res(m.result || m));
  ws.send(JSON.stringify({ id, method, params }));
});
const run = async (expression) => {
  const r = await send('Runtime.evaluate', { expression: '(async () => {' + expression + '})()', awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) problems.push('script: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result?.value;
};
const shot = async (name, opts = {}) => {
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82, ...opts });
  writeFileSync(join(out, name + '.jpg'), Buffer.from(r.data, 'base64'));
};

const W = mode === 'mobile' ? 390 : 1440;
const H = mode === 'mobile' ? 844 : 900;
await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: mode === 'mobile' });
if (mode === 'mobile') await send('Emulation.setTouchEmulationEnabled', { enabled: true });

const didLoad = new Promise((r) => { loaded = r; });
await send('Page.navigate', { url });
await didLoad;
await sleep(3200);   // hero paint and can

const info = {};
const top = (sel, offset = 0) => `document.documentElement.style.scrollBehavior='auto'; window.scrollTo(0, document.querySelector('${sel}').getBoundingClientRect().top + scrollY - ${mode === 'mobile' ? 70 : 84} + ${offset}); await new Promise(r => setTimeout(r, 900));`;


const wait = (ms) => `await new Promise(r => setTimeout(r, ${ms}));`;
const gutter = mode === 'mobile' ? 70 : 84;

// --- start clean
await run(`try { localStorage.clear(); } catch (e) {} return 1;`);
await send('Page.reload');
await sleep(3600);
await shot('01-hero');

// --- shelf
await run(top('#products'));
await shot('02-shelf');
info.shelf = await run(`
  const cans = [...document.querySelectorAll('[data-pick]')];
  const before = document.querySelector('[data-product-detail] h3').textContent;
  cans[2].click(); ${wait(900)}
  const after = document.querySelector('[data-product-detail] h3').textContent;
  const shot = cans[0].querySelector('.shelf-shot').getBoundingClientRect();
  const wrap = document.querySelector('.shelf-wrap').getBoundingClientRect();
  const tag = cans[0].querySelector('.shelf-tag').getBoundingClientRect();
  document.querySelector('[data-product-detail] [data-add]').requestSubmit();
  document.querySelector('[data-datasheet]').click();
  return { cans: cans.length, before, after, pressed: cans.map(c => c.getAttribute('aria-pressed')).join(','),
           canWidth: Math.round(shot.width), tagTop: Math.round(tag.top - wrap.top), wrapH: Math.round(wrap.height),
           quoteCount: document.querySelector('[data-quote-count]').textContent, details: document.querySelector('#q-details').value };`);
await run(top('[data-product-detail]', -160)); await shot('03-product-card');

// --- guide
await run(top('#guide'));
info.guide = await run(`
  const f = document.querySelector('[data-guide-form]');
  const pick = (name, value) => { const el = f.querySelector('input[name="' + name + '"][value="' + value + '"]'); el.checked = true; el.dispatchEvent(new Event('input', {bubbles: true})); };
  const steel = document.querySelector('[data-guide-result] .guide-list').textContent.replace(/\\s+/g, ' ');
  pick('surface', 'wall'); pick('place', 'harsh'); pick('finish', 'Satin');
  const a = document.querySelector('[data-guide-area]'); a.value = '320'; a.dispatchEvent(new Event('input', {bubbles: true}));
  ${wait(200)}
  const wall = document.querySelector('[data-guide-result]').textContent.replace(/\\s+/g, ' ');
  return { steel, wall };`);
await shot('04-guide');
info.guideAdd = await run(`
  document.querySelector('[data-guide-add]').click(); ${wait(700)}
  const out = { items: [...document.querySelectorAll('[data-quote-items] li .qi-name')].map(e => e.textContent), details: document.querySelector('#q-details').value };
  document.activeElement.blur();
  return out;`);

// --- coating system and compare (unchanged parts, for the pictures)
await run(`document.querySelectorAll('[data-system-step]')[2].scrollIntoView({block:'center'}); ${wait(1300)}`); await shot('05-system');

// --- explorer: new scenes
await run(top('#colors'));
for (const [scene, hex] of [['tank', '#1d3461'], ['machine', '#e0661f'], ['building', '#f4f4f1']]) {
  await run(`document.querySelector('.swatch[data-hex="${hex}"]').click(); document.querySelector('[data-scene="${scene}"]').click(); ${wait(1800)}`);
  if (mode === 'mobile') await run(top('[data-viz]', -10));
  await shot('06-scene-' + scene);
}
info.scenes = await run(`return [...document.querySelectorAll('[data-scene]')].map(b => b.textContent);`);
if (mode !== 'mobile') {
  await run(top('#colors'));
  info.explorerFit = await run(`return { viewport: innerHeight, controlsEndAt: Math.round(document.querySelector('.explorer-controls .hint').getBoundingClientRect().bottom) };`);
}

// --- repaint: the building scene left the site in white (a light color)
info.repaintLight = await run(`
  const cs = getComputedStyle(document.documentElement);
  return { paint: cs.getPropertyValue('--paint').trim(), ink: cs.getPropertyValue('--paint-ink').trim(), repainted: document.documentElement.classList.contains('is-repainted'),
           note: document.querySelector('.paint-note').innerText.replace(/\\s+/g, ' '), calcBg: getComputedStyle(document.querySelector('#calculator')).backgroundColor, calcText: getComputedStyle(document.querySelector('#calculator')).color };`);
await run(`window.scrollTo(0, 0); ${wait(900)}`); await shot('07-hero-white');
await run(top('#calculator', -60)); await shot('08-calculator-white');
info.repaintDark = await run(`
  window.AlphacoatApp.setColor('#1d3461'); ${wait(900)}
  const cs = getComputedStyle(document.documentElement);
  window.scrollTo(0, 0); ${wait(900)}
  return { paint: cs.getPropertyValue('--paint').trim(), ink: cs.getPropertyValue('--paint-ink').trim(), heroColor: getComputedStyle(document.querySelector('.hero h1')).color, stored: localStorage.getItem('alphacoat-color') };`);
await shot('09-hero-navy');

// --- the color survives a reload, then reset
await send('Page.reload'); await sleep(3200);
info.afterReload = await run(`return { paint: getComputedStyle(document.documentElement).getPropertyValue('--paint').trim(), picked: document.querySelector('[data-picked-name]').textContent, box: document.querySelector('[data-hex-input]').value };`);
info.reset = await run(`
  document.querySelector('.paint-note [data-paint-reset]').click(); ${wait(900)}
  return { paint: getComputedStyle(document.documentElement).getPropertyValue('--paint').trim(), repainted: document.documentElement.classList.contains('is-repainted'), note: document.querySelector('.paint-note').innerText.replace(/\\s+/g, ' ') };`);

// --- photo: a made-up picture with a known color, read back by clicking on it
await run(top('#colors'));
info.photo = await run(`
  const c = document.createElement('canvas'); c.width = 600; c.height = 400; const x = c.getContext('2d');
  x.fillStyle = '#336699'; x.fillRect(0, 0, 600, 400); x.fillStyle = '#aa3355'; x.fillRect(300, 0, 300, 400);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  window.AlphacoatApp.loadPhoto(blob); ${wait(900)}
  const dlg = document.querySelector('[data-photo-dialog]'); const cv = document.querySelector('[data-photo-canvas]');
  const box = cv.getBoundingClientRect();
  const out = { open: dlg.open, canvas: cv.width + 'x' + cv.height, shown: Math.round(box.width) + 'x' + Math.round(box.height), useDisabledBefore: document.querySelector('[data-photo-use]').disabled };
  cv.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: box.left + box.width * 0.75, clientY: box.top + box.height * 0.5 }));
  out.read = document.querySelector('[data-photo-hex]').textContent;
  out.markerShown = !document.querySelector('[data-photo-marker]').hidden;
  return out;`);
await sleep(300); await shot('10-photo-dialog');
info.photoUse = await run(`
  document.querySelector('[data-photo-use]').click(); ${wait(900)}
  return { open: document.querySelector('[data-photo-dialog]').open, color: window.AlphacoatApp.color(), box: document.querySelector('[data-hex-input]').value };`);
await run(`window.AlphacoatApp.setColor(window.AlphacoatApp.defaultColor); ${wait(900)}`);

// --- calculator with a chosen paint
await run(top('#calculator', -60));
info.calc = await run(`
  const sel = document.querySelector('[data-calc-product]'); sel.value = '3130'; sel.dispatchEvent(new Event('change', {bubbles: true}));
  const out = { options: sel.options.length, note: document.querySelector('[data-calc-product-note]').textContent, button: document.querySelector('[data-calc-add]').textContent };
  document.querySelector('[data-calc-add]').click(); ${wait(700)}
  out.items = [...document.querySelectorAll('[data-quote-items] li')].map(li => li.querySelector('.qi-name').textContent + ' x' + li.querySelector('input').value);
  document.activeElement.blur();
  return out;`);

// --- questions
await run(top('#faq', -40));
info.faq = await run(`
  const items = [...document.querySelectorAll('.faq')]; items[0].open = true; items[3].open = true;
  return { shown: items.length, inFile: (window.ALPHACOAT_FAQ || []).length, first: items[0].textContent.replace(/\\s+/g, ' ').slice(0, 120) };`);
await sleep(400); await shot('11-faq');

await run(top('#quote')); await shot('12-quote');
info.overflowX = await run(`return document.documentElement.scrollWidth > innerWidth;`);
info.brokenImages = await run(`return [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.getAttribute('src'));`);

// Whole page, shrunk.
await run(`try { localStorage.clear(); } catch (e) {} window.scrollTo(0, 0); ${wait(600)}`);
const metrics = await send('Page.getLayoutMetrics');
const fullH = Math.ceil(metrics.cssContentSize.height);
info.pageHeight = fullH;
const scale = mode === 'mobile' ? 0.5 : 0.3;
const third = Math.ceil(fullH / 3);
for (let i = 0; i < 3; i++) await shot('13-overview-' + 'abc'[i], { captureBeyondViewport: true, clip: { x: 0, y: i * third, width: W, height: Math.min(third, fullH - i * third), scale } });

info.problems = problems;
console.log(JSON.stringify(info, null, 2));
await send('Browser.close').catch(() => {});
ws.close();
setTimeout(() => { try { chrome.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(0); }, 1200);
