// Drives a private, headless copy of Chrome to open the site the way a visitor would (straight from the folder),
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

await shot('01-hero');
await run(top('#products')); await shot('02-products');
info.barAfterHero = await run(`return document.querySelector('[data-action-bar]').classList.contains('is-shown');`);
await run(top('.product-panel', -40)); await shot('03-product-panel');
await run(top('#system')); await shot('04-system-start');
await run(`document.querySelectorAll('[data-system-step]')[1].scrollIntoView({block:'center'}); await new Promise(r => setTimeout(r, 1300));`); await shot('05-system-step2');
await run(`document.querySelectorAll('[data-system-step]')[2].scrollIntoView({block:'center'}); await new Promise(r => setTimeout(r, 1300));`); await shot('06-system-step3');
await run(top('#results', -60)); await sleep(1800); await shot('07-compare');
await run(top('#colors')); await shot('08-colors-default');
info.explorer = await run(`
  const last = document.querySelector('.explorer-controls .hint').getBoundingClientRect();
  const viz = document.querySelector('[data-viz]').getBoundingClientRect();
  return { viewport: innerHeight, controlsEndAt: Math.round(last.bottom), pictureFrom: Math.round(viz.top), pictureTo: Math.round(viz.bottom),
           barShown: document.querySelector('[data-action-bar]').classList.contains('is-shown') };`);

// The reported bug: a custom color typed as a HEX code, on a page opened from disk.
info.customColor = await run(`
  const inp = document.querySelector('[data-hex-input]');
  inp.focus(); inp.value = '#B19CD9'; inp.dispatchEvent(new Event('input', {bubbles: true}));
  await new Promise(r => setTimeout(r, 1300));
  return { protocol: location.protocol, picked: document.querySelector('[data-picked-name]').textContent + ' ' + document.querySelector('[data-picked-hex]').textContent, fill: document.querySelector('.coat-old').style.fill };`);
if (mode === 'mobile') await run(top('[data-viz]', -10));
await shot('09-colors-custom-hex');
await run(`document.querySelector('.swatch[data-hex="#c5281c"]').click(); document.querySelector('[data-scene="gate"]').click(); await new Promise(r => setTimeout(r, 1600));`); await shot('10-colors-gate-red');
await run(`document.querySelector('.swatch[data-hex="#f0b323"]').click(); document.querySelector('[data-scene="wall"]').click(); const s = document.querySelector('[data-finish]'); s.value = 15; s.dispatchEvent(new Event('input', {bubbles:true})); await new Promise(r => setTimeout(r, 1600));`); await shot('11-colors-wall-yellow-matte');
if (mode === 'mobile') {
  info.pinnedWhileChoosing = await run(`
    document.querySelector('[data-finish]').scrollIntoView({block: 'center'});
    await new Promise(r => setTimeout(r, 900));
    const viz = document.querySelector('[data-viz]').getBoundingClientRect();
    const slider = document.querySelector('[data-finish]').getBoundingClientRect();
    return { pictureFrom: Math.round(viz.top), pictureTo: Math.round(viz.bottom), sliderAt: Math.round(slider.top), viewport: innerHeight };`);
  await shot('11b-colors-controls');
}
await run(top('#calculator', -60)); await shot('12-calculator');
await run(top('#quote')); await shot('13-quote');
await run(top('#about', -60)); await shot('14-about');
await run(`window.scrollTo(0, document.documentElement.scrollHeight); await new Promise(r => setTimeout(r, 700));`); await shot('15-footer');

// Whole page, shrunk, to judge the rhythm of the sections.
await run(`window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 600));`);
const metrics = await send('Page.getLayoutMetrics');
const fullH = Math.ceil(metrics.cssContentSize.height);
info.pageHeight = fullH;
const scale = mode === 'mobile' ? 0.5 : 0.3;
const half = Math.ceil(fullH / 2);
await shot('16-overview-a', { captureBeyondViewport: true, clip: { x: 0, y: 0, width: W, height: half, scale } });
await shot('17-overview-b', { captureBeyondViewport: true, clip: { x: 0, y: half, width: W, height: fullH - half, scale } });

info.problems = problems;
console.log(JSON.stringify(info, null, 2));
await send('Browser.close').catch(() => {});
ws.close();
setTimeout(() => { try { chrome.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(0); }, 1200);
