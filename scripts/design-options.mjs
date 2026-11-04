#!/usr/bin/env node
// Turn any brief into six comparable design directions for the same shot/transition.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.cwd();
const MEDIA = JSON.parse(fs.readFileSync(path.join(ROOT, 'work/recipe-board-v1/routing/media-policy.json'), 'utf8'));
const STRATEGIES = [
  { id: 'evidence', composition: 'evidence-card', build: 'real', thesis: '真实证据本身就是画面，包装只负责让它被看见', look: '真实照片/截图/纸上证据，字和引线做二次包装', prompt: 'real documentary evidence plate, authentic photograph or document, no readable text, cinematic print/paper finish' },
  { id: 'hero-object', composition: 'hero-object', build: '3d', thesis: '一个物件承担全部隐喻，放大到不可忽视', look: '单物件 3D/微距，极端尺度，明确轮廓和投影', prompt: 'single hero object on a designed ground, macro scale, dramatic physical light, no text, tactile material' },
  { id: 'array-system', composition: 'count-field', build: 'procedural', thesis: '重复/阵列把抽象系统变成可见的图形压力', look: '等距或透视阵列，重复、缺口、被污染的一只', prompt: 'rigorous repeated array of identical objects, one anomaly, graphic rhythm, paper print texture, no text' },
  { id: 'type-led', composition: 'title-footage', build: 'graphic', thesis: '字是主角，版口即构图，图像只做底层证据', look: '巨大竖排/横贯字，压边或压图，纯平墨', prompt: 'bold typographic poster composition, oversized ink type as structure, image as underlayer, no generated readable text' },
  { id: 'process', composition: 'sequence-line', build: 'procedural', thesis: '过程/机制沿一条线展开，观众看见因果而不是结论', look: '截面/箭头/生长/复制路径，单色加一强调色', prompt: 'diagrammatic process line, sectional cutaway, cause and effect, print-poster palette, no readable labels' },
  { id: 'material', composition: 'split-compare', build: 'graphic', thesis: '材质和印刷语言承担情绪，不靠照片解释', look: '纸、墨、金属、纤维的对照；套印/磨损/压痕', prompt: 'material study split composition, tactile paper ink metal surfaces, print registration marks, no text' },
];
const REPRO = {
  evidence: { mode: 'real', fidelity: 'high', needs: ['real photo/footage or page capture'], note: 'generated plates cannot stand in for evidence' },
  'hero-object': { mode: '3d', fidelity: 'medium', needs: ['real mesh', 'PBR lookdev', 'lighting'], note: 'exact generated brushwork is not reproducible; lock shape/material/camera' },
  'array-system': { mode: 'procedural', fidelity: 'medium', needs: ['real geometry', 'shared texture family'], note: 'count/spacing/camera lock; every grain not guaranteed' },
  'type-led': { mode: 'code', fidelity: 'high', needs: ['house type', 'layout solver'], note: 'type is code; no generated text' },
  process: { mode: 'code', fidelity: 'high', needs: ['diagram geometry', 'data/code layout'], note: 'mechanism/data drawn by code' },
  material: { mode: 'texture', fidelity: 'medium', needs: ['surface texture', 'paper/ink scans'], note: 'generated texture only as reference unless user approves texture use' },
};
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
export function buildOptions({ text, title, transition }) {
  const t = clean(text || title || 'untitled');
  const shot = clean(title || t.slice(0, 40));
  return {
    contract: 'A1DesignOptions/v1',
    shot,
    rule: 'same shot and same transition for all options; user chooses one; selected becomes lookLock',
    options: STRATEGIES.map((s, i) => ({
      id: 'OPT-' + (i + 1),
      direction: s.id,
      thesis: s.thesis,
      composition: s.composition,
      reproduction: REPRO[s.id],
      build: s.build,
      transition: clean(transition || 'same in/out seam for every option; state it before generation'),
      prompt: s.prompt + '; subject: ' + t + '; shot: ' + shot + '; 16:9, no readable text, no logo, no watermark',
      status: 'draft',
    })),
  };
}
export function validateOptions(o) {
  const errors = [];
  if (o?.contract !== 'A1DesignOptions/v1') errors.push('contract must be A1DesignOptions/v1');
  const opts = o?.options || [];
  if (opts.length < 6) errors.push('need at least 6 options');
  const theses = new Set(), comps = new Set();
  opts.forEach((x) => {
    if (!x.id) errors.push('option missing id');
    if (!x.thesis || x.thesis.length < 8) errors.push((x.id || '?') + ' missing thesis');
    if (!x.reproduction || !['real','3d','procedural','code','texture'].includes(x.reproduction.mode) || !['high','medium','low'].includes(x.reproduction.fidelity)) errors.push((x.id || '?') + ' missing/invalid reproduction');
    if (!MEDIA.finalShotBuilds.includes(x.build)) errors.push((x.id || '?') + ' bad build');
    if (theses.has(x.thesis)) errors.push((x.id || '?') + ' duplicate thesis');
    theses.add(x.thesis);
    comps.add(x.composition);
    if (!x.prompt || !x.prompt.includes('no readable text')) errors.push((x.id || '?') + ' prompt must be text-free');
  });
  if (comps.size < 3) errors.push('options need at least 3 different compositions');
  return errors;
}
function opt(argv, k, d) { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; }
export function main(argv = process.argv.slice(2)) {
  const brief = opt(argv, '--brief');
  const out = opt(argv, '--out', 'work/recipe-board-v1/projects/<id>/design-options.json');
  let text = opt(argv, '--text', '');
  let title = opt(argv, '--title', '');
  let transition = opt(argv, '--transition', '');
  if (brief) {
    const raw = fs.readFileSync(brief, 'utf8');
    let b; try { b = JSON.parse(raw); } catch { b = { logline: raw }; }
    text = text || b?.film?.logline || b?.logline || b?.text || raw.slice(0, 800);
    title = title || b?.film?.title || b?.title || '';
    transition = transition || b?.transition || '';
  }
  if (!text) { console.error('usage: design-options.mjs --brief brief.json --out design-options.json [--text "..."]'); return 2; }
  const data = buildOptions({ text, title, transition });
  const errors = validateOptions(data);
  if (errors.length) { for (const e of errors) console.error('OPTIONS FAIL: ' + e); return 1; }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(data, null, 1) + '\n');
  console.log('DESIGN OPTIONS OK: ' + data.options.length + ' -> ' + out);
  return 0;
}
if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) process.exit(main());