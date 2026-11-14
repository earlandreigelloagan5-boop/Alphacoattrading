// Saves one picture of a page using a private, headless copy of Chrome.
//   node capture.mjs <url> <out-file> <width> <height> [jpeg|png]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const [url, out, w = '1200', h = '630', format = 'jpeg'] = process.argv.slice(2);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9388;
const profile = join(tmpdir(), 'alphacoat-capture-profile');
mkdirSync(dirname(out), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--hide-scrollbars', '--no-first-run', '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore' });

let target;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(250);
  try { target = (await (await fetch('http://127.0.0.1:' + PORT + '/json')).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
}
if (!target) { chrome.kill(); throw new Error('Chrome did not start'); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 1;
const pending = new Map();
let loaded = () => {};
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result || msg); pending.delete(msg.id); }
  if (msg.method === 'Page.loadEventFired') loaded();
};
const send = (method, params = {}) => new Promise((res) => { const id = nextId++; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: Number(w), height: Number(h), deviceScaleFactor: 1, mobile: false });
const didLoad = new Promise((r) => { loaded = r; });
await send('Page.navigate', { url });
await didLoad;
await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => new Promise(r => setTimeout(r, 600)))', awaitPromise: true });
const shot = await send('Page.captureScreenshot', format === 'png' ? { format: 'png' } : { format: 'jpeg', quality: 88 });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('saved', out);
await send('Browser.close').catch(() => {});
ws.close();
setTimeout(() => { try { chrome.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(0); }, 1000);
