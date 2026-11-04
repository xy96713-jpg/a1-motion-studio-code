// The module bench (user, 2026-10-22: 为什么不先设计好减少返工呢). A module's layout faults (a serif name whose glyphs
// reached onto the line under it, a heading tape centred on its left edge, a table drawn at two thirds of the frame)
// were found one film shot at a time, by the picture review, and fixed after the shot had been planned, rendered and
// reviewed. Here every module is tried before a film uses it: on the specs the line has accepted (its seeds), with
// the words made as short and as long as its spec check allows and its display type in each house face, under the
// line's own frame checks (no reference: the words are made up). What fails here is the module's, fixed once for
// every film. Results are cached by the module's code and the case, so a run after a change redraws only what changed.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkModuleSpec, renderModule, MODULES } from './modules.mjs';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const HERE = path.dirname(new URL(import.meta.url).pathname);

// the words of each module the bench varies, as paths (a[] every item of a list)
export const TEXT_FIELDS = {
  title: ['text', 'en'], quote: ['lines[].text'], person: ['name', 'role', 'bio', 'en'],
  steps: ['title', 'nodes[].text', 'nodes[].note', 'nodes[].sub'], sidecard: ['cards[].title', 'cards[].sub', 'cards[].label', 'tags[].text'],
  brand: ['name', 'label'], chat: ['title', 'messages[].text'], table: ['columns[]'], chart: ['items[].label', 'items[].note', 'items[].desc'],
  compare: ['left.title', 'right.title'],
};
// the faces a display line may be set in
export const DISPLAY_FACES = ['スミカク', '廻想体 ネクスト', '黒華明朝', '金畫字', '装甲明朝'];
const FACE_MODULES = ['title', 'quote', 'person'];
// what makes two specs of a module different designs (a seed for each)
const VARIANT_KEYS = ['style', 'layout', 'look', 'tone', 'shape', 'side', 'torn', 'scatter', 'stack', 'fit', 'mode', 'kind', 'brush', 'color'];

// (pure, tested) every value at a path ('cards[].title', 'columns[]'), and a setter
export function atPath(obj, p) {
  const parts = p.split('.'), out = [];
  const walk = (o, i, set) => {
    if (o == null) return;
    const m = parts[i].match(/^(\w*)(\[\])?$/), key = m[1], arr = !!m[2], v = key ? o[key] : o;
    if (i === parts.length - 1) { if (arr) (v || []).forEach((_, k) => out.push({ get: () => v[k], set: (x) => { v[k] = x; } })); else if (v != null) out.push({ get: () => o[key], set: (x) => { o[key] = x; } }); return; }
    if (arr) (v || []).forEach((x) => walk(x, i + 1)); else walk(v, i + 1);
  };
  walk(obj, 0);
  return out;
}
const POOL = '深度求索人工智能模型训练成本开源推理芯片显卡市场公司世界中国技术未来算力数据', LATIN = 'Reasoning Model Open Source Compute';
const fill = (n, latin) => (latin ? LATIN.repeat(4).slice(0, n).trim() : Array.from({ length: n }, (_, i) => POOL[i % POOL.length]).join(''));
const isLatin = (v) => /^[\x20-\x7e]*$/.test(String(v || ''));
// (pure, tested) the cases of one seed: as it is, its words at their shortest, at their longest the check allows, and
// (title, quote, person) its display line in each house face
export function casesOf(seed) {
  const m = seed.module, fields = TEXT_FIELDS[m] || [], out = [{ label: 'as accepted', spec: seed }];
  const clone = () => JSON.parse(JSON.stringify(seed));
  if (fields.length) {
    const short = clone(); for (const f of fields) for (const v of atPath(short, f)) v.set(isLatin(v.get()) ? 'AI' : fill(2));
    if (!checkModuleSpec(short).length) out.push({ label: 'shortest words', spec: short });
    // the longest each field takes, one field after another (the others already long)
    const long = clone();
    for (const f of fields) for (const v of atPath(long, f)) { const lat = isLatin(v.get()), was = v.get(); let n = 30; v.set(fill(n, lat)); while (n > 2 && checkModuleSpec(long).length) { n--; v.set(fill(n, lat)); } if (checkModuleSpec(long).length) v.set(was); }
    if (!checkModuleSpec(long).length && JSON.stringify(long) !== JSON.stringify(seed)) out.push({ label: 'longest words', spec: long });
  }
  if (FACE_MODULES.includes(m)) for (const f of DISPLAY_FACES) { const s = clone(); s.type = { ...(s.type || {}), display: f }; if (!checkModuleSpec(s).length) out.push({ label: `display ${f}`, spec: s }); }
  return out;
}
// the seeds: accepted specs of every project, a few different designs of each module
export function seeds(cfg, { per = 2, only = null } = {}) {
  const root = path.join(cfg.dataDir, 'projects'), by = {};
  for (const id of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const md = path.join(root, id, 'modules'); if (!fs.existsSync(md)) continue;
    for (const seg of fs.readdirSync(md)) { const d = path.join(md, seg); if (!fs.statSync(d).isDirectory() || seg === 'cutouts') continue;
      for (const f of fs.readdirSync(d).filter((x) => /^S\d+\.json$/.test(x))) { let s; try { s = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); } catch { continue; }
        if (!MODULES.includes(s.module) || (only && !only.includes(s.module))) continue;
        const { about, ...spec } = s, key = JSON.stringify(VARIANT_KEYS.map((k) => spec[k] ?? null).concat([!!spec.cards?.length, !!spec.tags?.length, !!spec.curl]));
        const list = (by[s.module] ||= []); if (list.length < per && !list.some((x) => x.key === key)) list.push({ key, project: id, name: `${seg}-${f.replace('.json', '')}`, spec }); } }
  }
  return by;
}
const codeOf = (module) => ['modules.mjs', 'framecheck.mjs', 'cardgeometry.mjs'].map((f) => fs.readFileSync(path.join(HERE, f), 'utf8')).join('') + ['common.js', 'marks.js', 'camera.js', 'treat.js', `${module}.html`].map((f) => { const p = path.join(HERE, '../../../../../work/recipe-board-v1/modules', f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; }).join('');
// run the bench: every case drawn at its key frames with the line's checks; a sheet a module (a row a case: its three
// frames and what failed) and a report
export async function runBench(cfg, { only = null, per = 2, log = () => {} } = {}) {
  const out = path.join(cfg.dataDir, 'bench'), cases = [];
  for (const [m, list] of Object.entries(seeds(cfg, { per, only }))) for (const sd of list) for (const c of casesOf(sd.spec)) cases.push({ module: m, project: sd.project, name: `${sd.name} · ${c.label}`, spec: c.spec, key: sha(codeOf(m) + JSON.stringify(c.spec)) });
  log(`  bench: ${cases.length} cases of ${new Set(cases.map((c) => c.module)).size} modules`);
  const { pool } = await import('./pool.mjs'), { keyTimes } = await import('./layers.mjs');
  await pool(cases, async (c) => {
    const dir = path.join(out, 'cases', c.key), res = path.join(dir, 'result.json');
    if (fs.existsSync(res)) { c.result = JSON.parse(fs.readFileSync(res, 'utf8')); return; }
    fs.mkdirSync(dir, { recursive: true });
    let problems = [], r = null, error = null;
    const opts = { stills: keyTimes(c.spec), reference: false };
    try { r = await renderModule(cfg, c.project, c.spec, path.join(dir, 'f'), opts); }
    catch (e) { if (e.problems) { problems = e.problems; try { r = await renderModule(cfg, c.project, c.spec, path.join(dir, 'f'), { ...opts, checks: false }); } catch (e2) { error = String(e2.message || e2).split('\n')[0]; } } else error = String(e.message || e).split('\n')[0]; }
    c.result = { problems: problems.map((p) => ({ kind: p.kind, at: p.at, say: p.say, owner: p.owner })), error, stills: r?.stills || [] };
    fs.writeFileSync(res, JSON.stringify(c.result, null, 1) + '\n');
    log(`  ${c.module} ${c.name}: ${error ? `could not be drawn: ${error.slice(0, 120)}` : problems.length ? `${problems.length} problems` : 'passes'}`);
  });
  // a sheet a module
  const FONT = '/System/Library/Fonts/STHeiti Medium.ttc', esc = (t) => String(t || '').replace(/[\\':%,\[\]]/g, ' ').slice(0, 90);
  const sheets = {};
  for (const m of [...new Set(cases.map((c) => c.module))]) {
    const rows = [], tmp = fs.mkdtempSync(path.join(out, '.rows-'));
    cases.filter((c) => c.module === m).forEach((c, i) => {
      const f = path.join(tmp, `${i}.jpg`), st = (c.result.stills || []).filter((x) => fs.existsSync(x)).slice(0, 3), bad = c.result.error || c.result.problems.length;
      const say = [c.name, ...(c.result.error ? [`could not be drawn: ${c.result.error}`] : c.result.problems.slice(0, 3).map((p) => p.say))];
      const label = say.map((t, k) => `drawtext=fontfile='${FONT}':text='${esc(t)}':x=12:y=${10 + k * 30}:fontsize=${k ? 20 : 24}:fontcolor=${k ? (bad ? '0xff8080' : 'white') : 'yellow'}`).join(',');
      const ins = st.length ? st : [];
      const filt = ins.length ? `${ins.map((_, k) => `[${k}]scale=480:270[v${k}]`).join(';')};${ins.map((_, k) => `[v${k}]`).join('')}hstack=inputs=${ins.length}[h];color=c=0x1e1e1e:s=${480 * ins.length}x130[l];[l]${label}[lb];[h][lb]vstack` : `color=c=0x1e1e1e:s=1440x130,${label}`;
      spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...ins.flatMap((x) => ['-i', x]), ...(ins.length ? [] : ['-f', 'lavfi', '-i', 'color=c=0x1e1e1e:s=1440x130']), '-filter_complex', ins.length ? filt : label, '-frames:v', '1', f]);
      if (fs.existsSync(f)) rows.push(f);
    });
    const sheet = path.join(out, `${m}.jpg`);
    if (rows.length) spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...rows.flatMap((x) => ['-i', x]), '-filter_complex', `${rows.map((_, k) => `[${k}]scale=1440:-2,pad=1440:ih[r${k}]`).join(';')};${rows.map((_, k) => `[r${k}]`).join('')}vstack=inputs=${rows.length}`, '-q:v', '4', sheet]);
    fs.rmSync(tmp, { recursive: true, force: true }); sheets[m] = sheet;
  }
  const report = { at: new Date().toISOString(), cases: cases.map((c) => ({ module: c.module, name: c.name, project: c.project, key: c.key, error: c.result.error, problems: c.result.problems })), sheets };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1) + '\n');
  return report;
}
