#!/usr/bin/env node
// MiniMax H3 video fallback. Only for art shots whose triage allows ai-video; never evidence/text.
// usage: node scripts/minimax-video.mjs --prompt "..." --out out/x.mp4 [--model MiniMax-H3-Lite] [--duration 5] [--approve] [--dry-run]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = 'https://api.minimax.cn';
const opt = (argv, k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
function readKey() {
  if (process.env.MINIMAX_CN_API_KEY) return process.env.MINIMAX_CN_API_KEY;
  const env = path.join(os.homedir(), '.hermes', '.env');
  if (!fs.existsSync(env)) return null;
  const m = fs.readFileSync(env, 'utf8').match(/^MINIMAX_CN_API_KEY=(.+)$/m);
  return m ? m[1].trim() : null;
}
async function post(pathname, key, body) {
  const r = await fetch(BASE + pathname, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('MiniMax create ' + r.status + ': ' + JSON.stringify(j).slice(0, 600));
  return j;
}
async function get(pathname, key) {
  const r = await fetch(BASE + pathname, { headers: { Authorization: 'Bearer ' + key } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('MiniMax query ' + r.status + ': ' + JSON.stringify(j).slice(0, 600));
  return j;
}
function findVideoUrl(x) {
  if (!x || typeof x !== 'object') return null;
  for (const v of Object.values(x)) {
    if (typeof v === 'string' && /^https?:.*\.(mp4|mov)(\?|$)/i.test(v)) return v;
  }
  for (const v of Object.values(x)) { const u = findVideoUrl(v); if (u) return u; }
  return null;
}
function findTaskId(x) {
  if (!x || typeof x !== 'object') return null;
  for (const k of ['task_id', 'taskId', 'id']) if (typeof x[k] === 'string' || typeof x[k] === 'number') return String(x[k]);
  for (const v of Object.values(x)) { const id = findTaskId(v); if (id) return id; }
  return null;
}
export async function generate({ prompt, model = 'MiniMax-H3-Lite', duration = 5, resolution = null, out, approve = false, dryRun = false, imageUrl = null }) {
  const res = resolution || (/lite/i.test(model) ? '768P' : '2K');
  if (!prompt || prompt.length < 12) throw new Error('prompt too short');
  if (!approve) throw new Error('AI video requires explicit --approve after triage');
  const key = readKey();
  if (!key) throw new Error('MINIMAX_CN_API_KEY not found');
  const content = [{ type: 'text', text: prompt }];
  if (imageUrl) content.push({ type: 'image_url', image_url: { url: imageUrl }, role: 'first_frame' });
  const body = { model, content, resolution: res, duration, ratio: '16:9' };
  if (dryRun) { console.log(JSON.stringify({ endpoint: BASE + '/v2/video_generation', body }, null, 2)); return null; }
  const created = await post('/v2/video_generation', key, body);
  const taskId = findTaskId(created);
  if (!taskId) throw new Error('no task id: ' + JSON.stringify(created).slice(0, 500));
  console.log('MINIMAX_TASK', taskId);
  let last = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const q = await get('/v2/query/video_generation/' + encodeURIComponent(taskId), key);
    last = q;
    const status = JSON.stringify(q).match(/"status"\s*:\s*"([^"]+)"/)?.[1] || 'unknown';
    console.log('MINIMAX_STATUS', status);
    const url = findVideoUrl(q);
    if (url) {
      if (!out) throw new Error('--out required to download');
      const res = await fetch(url);
      if (!res.ok) throw new Error('download failed ' + res.status);
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(out, buf);
      console.log('MINIMAX_VIDEO', out, buf.length);
      return { taskId, out, url, response: q };
    }
    if (status === 'failed' || status === 'fail') throw new Error('MiniMax task failed: ' + JSON.stringify(q).slice(0, 700));
  }
  throw new Error('MiniMax timeout: ' + JSON.stringify(last).slice(0, 700));
}
function main(argv = process.argv.slice(2)) {
  const prompt = opt(argv, '--prompt');
  const out = opt(argv, '--out');
  const dryRun = argv.includes('--dry-run');
  const approve = argv.includes('--approve');
  return generate({ prompt, out, dryRun, approve, model: opt(argv, '--model', 'MiniMax-H3-Lite'), duration: Number(opt(argv, '--duration', 5)), resolution: opt(argv, '--resolution', null), imageUrl: opt(argv, '--image-url') })
    .then(() => process.exit(0)).catch((e) => { console.error('MINIMAX FAIL:', e.message); process.exit(1); });
}
if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) main();
