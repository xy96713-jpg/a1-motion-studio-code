// Design sketches (experiment, 2026-10-18): instead of filling a fixed card, a shot is first drawn whole by
// the image model, several times in different compositions, the best sketch is picked, and the picture is
// rebuilt in layers: a text-free version of the sketch as the plate, and the real type set by code where the
// sketch put its type (read by OCR). A sketch may carry text (SYSTEM_MAP: a full-frame generation with text is
// a design sketch only); what reaches the film is the text-free plate and code type.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { codexExecutable, runCodexJson } from './director.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const CODEX_IMAGES = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'generated_images');

// different compositions on purpose: the variety comes from the directions, the quality from the pick
export const FONTS = { display: `'A1 Serif Heavy', 'Songti SC', serif`, sans: `'PingFang SC', 'Hiragino Sans GB', sans-serif` };
export const DIRECTIONS = [
  'monumental: one huge hero element centred, everything else tiny and quiet',
  'asymmetric: the main element pushed hard to one side, a wide calm area of negative space on the other',
  'layered collage: three depths (foreground prop cutting the frame, the main type in the middle, a soft background)',
  'extreme close crop: the subject cropped by the frame edges, type set big across it',
  'diagonal energy: the main line of the composition runs corner to corner, things tilted with motion',
  'editorial grid: a magazine layout, a strong grid, a big number or word, small captions aligned to it',
];

export function generate(prompt, refs, size = '1536x1024') {
  const bin = codexExecutable();
  if (!bin) throw new Error('Codex CLI not found');
  const lock = path.join(os.tmpdir(), 'recipe-board-imagegen.lock');
  // A lock left by a killed run used to block every later generation for 15 minutes: take it only when its owner is gone or it is old.
  if (fs.existsSync(lock)) {
    const age = Date.now() - fs.statSync(lock).mtimeMs;
    const pid = Number(fs.readFileSync(lock, 'utf8')) || 0;
    let alive = false;
    try { if (pid) { process.kill(pid, 0); alive = true; } } catch { alive = false; }
    if (!alive || age > 20 * 60 * 1000) fs.rmSync(lock, { force: true });
  }
  for (let i = 0; fs.existsSync(lock) && i < 900; i++) spawnSync('sleep', ['1']);
  fs.writeFileSync(lock, String(process.pid));
  try {
    const started = Date.now();
    const args = ['exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '--color', 'never', ...refs.flatMap((f) => ['-i', f]), '-'];
    const ask = ['Use your built-in image generation tool (image_gen) exactly once to create one image, then reply with only the word DONE.', prompt, `Size ${size}.`].join('\n');
    const r = spawnSync(bin, args, { input: ask, encoding: 'utf8', timeout: 600000, maxBuffer: 20 << 20 });
    if (r.status !== 0) throw new Error(`codex exec failed: ${String(r.stderr).slice(-300)}`);
    const fresh = fs.readdirSync(CODEX_IMAGES).flatMap((d) => { try { return fs.readdirSync(path.join(CODEX_IMAGES, d)).map((f) => path.join(CODEX_IMAGES, d, f)); } catch { return []; } })
      .filter((f) => f.endsWith('.png') && fs.statSync(f).mtimeMs >= started - 1000).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (!fresh.length) throw new Error('no image produced');
    return fresh[0];
  } finally { fs.rmSync(lock, { force: true }); }
}

// brief: { line, texts: [the exact words on screen, most important first], scene, style, refs }
export function sketchShot(brief, dir, { count = 6, log = () => {} } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const out = [];
  for (let i = 0; i < count; i++) {
    const file = path.join(dir, `sketch-${i + 1}.png`);
    if (!fs.existsSync(file)) {
      const prompt = [
        'A finished 16:9 frame for a premium Chinese tech-explainer video (the level of a top motion-design studio).',
        `What the narrator says here: "${brief.line}".`,
        `The frame shows: ${brief.scene}`,
        `Type on screen, in Chinese, exactly these words and nothing else: ${brief.texts.map((t) => `「${t}」`).join(' ')} (the first is the hero, much larger than the rest).`,
        `Style: ${brief.style}`,
        `Composition for this version: ${DIRECTIONS[i % DIRECTIONS.length]}.`,
        brief.refs?.length ? 'The attached images set the quality bar and the house look (materials, light, texture); make a new composition, do not copy them.' : '',
        'Strong hierarchy, generous margins, rich texture and light; no watermark, no logo of a website, no frame border.',
      ].filter(Boolean).join('\n');
      fs.copyFileSync(generate(prompt, brief.refs || []), file);
      log(`  sketch ${i + 1}/${count}`);
    }
    out.push(file);
  }
  return out;
}

// the critic picks one: sees all sketches side by side with the references
export async function pickSketch(files, brief) {
  const sheet = path.join(path.dirname(files[0]), 'sheet.jpg');
  const inputs = files.flatMap((f) => ['-i', f]);
  const n = files.length;
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', `${files.map((_, i) => `[${i}]scale=768:432[v${i}]`).join(';')};${files.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${n}:layout=${files.map((_, i) => `${(i % 3) * 768}_${Math.floor(i / 3) * 432}`).join('|')}`, sheet]);
  const schema = path.join(os.tmpdir(), 'sketch-pick.schema.json');
  fs.writeFileSync(schema, JSON.stringify({ type: 'object', additionalProperties: false, required: ['pick', 'ranking', 'why'], properties: { pick: { type: 'integer' }, ranking: { type: 'array', items: { type: 'integer' } }, why: { type: 'string' } } }));
  const prompt = `你是顶级动态设计工作室的艺术指导。第一张附图是 ${n} 张设计草图拼成的一张（从左到右、从上到下编号 1–${n}），后面是参考作品（水准线）。这一镜的口播："${brief.line}"，画面要说的是：${brief.scene}。
按这些标准挑出最好的一张：第一眼的主次（最重要的字或物件最先被看到）、构图张力与留白、质感与光影、和这句话的意思贴不贴、和参考作品的水准差多少、在视频里 1 秒内能不能读懂。不看草图里中文字写得准不准（字会由代码重排）。
只输出 JSON：{"pick": 编号, "ranking": [从好到差的编号], "why": "一两句理由"}`;
  return { ...(await runCodexJson(codexExecutable(), prompt, schema, { firstKey: 'pick', images: [sheet, ...(brief.refs || [])], timeoutMs: 600_000 })), sheet };
}

// the plate: the same picture with every letter removed (the type comes back by code)
export function plateOf(sketch, out) {
  if (fs.existsSync(out)) return out;
  const prompt = 'Recreate the attached image exactly — same composition, objects, materials, light, colours and camera — but with ALL text, letters, numbers and characters removed; where text was, continue the background or surface naturally. No text anywhere.';
  fs.copyFileSync(generate(prompt, [sketch]), out);
  return out;
}

// where the sketch set its type: OCR lines, matched to the real words by size order (largest = hero)
export function typeLayout(sketch, texts) {
  const r = spawnSync('swift', [path.join(HERE, 'ocr.swift'), sketch], { encoding: 'utf8', timeout: 120000 });
  let lines = [];
  try { lines = JSON.parse(r.stdout); } catch {}
  lines = lines.filter((l) => l.box[3] > 0.02 && /[一-鿿A-Za-z0-9]/.test(l.text)).sort((a, b) => b.box[3] - a.box[3]);
  return texts.map((t, i) => (lines[i] ? { text: t, box: lines[i].box, seen: lines[i].text } : null)).filter(Boolean);
}

// the rebuilt frame: plate full bleed, the real words where the sketch had its type (size from the line
// height, light or dark by what is behind), fitted to the box
export function sketchHtml(plateUrl, layout, { fonts }) {
  const W = 1920, H = 1080;
  const items = layout.map((l, i) => {
    const [x, y, w, h] = l.box;
    const size = Math.round(h * H * 0.92);
    const fam = i === 0 ? fonts.display : fonts.sans;
    const weight = i === 0 ? 900 : 600;
    return `<div class="t" style="left:${x * W}px;top:${y * H}px;width:${w * W * 1.08}px;height:${h * H}px;font:${weight} ${size}px ${fam};color:${l.ink || '#fff'}">${l.text.replace(/</g, '&lt;')}</div>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#000}
.p{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.t{position:absolute;white-space:nowrap;line-height:1;display:flex;align-items:center;text-shadow:0 2px 14px rgba(0,0,0,.35)}</style></head>
<body><img class="p" src="${plateUrl}">${items}<script>document.fonts.ready.then(()=>{for(const e of document.querySelectorAll('.t')){const k=Math.min(1,e.clientWidth/e.scrollWidth);if(k<1)e.style.fontSize=(parseFloat(e.style.fontSize)*k*0.98)+'px'}document.body.dataset.ready=1})</script></body></html>`;
}

// light or dark type: the mean grey of the plate under the box
export function inkFor(plate, box) {
  const [x, y, w, h] = box;
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', plate, '-vf', `crop=iw*${w.toFixed(4)}:ih*${h.toFixed(4)}:iw*${x.toFixed(4)}:ih*${y.toFixed(4)},scale=16:16,format=gray`, '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 });
  const px = r.stdout || Buffer.alloc(0);
  const mean = px.length ? px.reduce((a, v) => a + v, 0) / px.length : 0;
  return mean > 140 ? '#141414' : '#f5f2ea';
}
