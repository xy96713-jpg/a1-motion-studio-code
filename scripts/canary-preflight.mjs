#!/usr/bin/env node
// Canary preflight: a canary is a test, not a design result. Before it can be shown as a design direction (or
// promoted into the design board) it must pass the same class of checks the chapter line runs: it parses, it loads
// without a page error, it is not a still, the model it loads was made/reviewed/textured by the line (not a raw GLB),
// and it is registered in the canary manifest with a passing quality report.
//
//   node scripts/canary-preflight.mjs --project banana-design [--canary A-3d-final]... [--static-only] [--json <file>] [--write]
//
// --static-only: syntax/assets/registration only (no browser, safe in tests and on CI without a GPU).
// --write: keep the verdict per canary under projects/<id>/canaries/preflight/<canary>.json (read-only otherwise).
// Any error → exit 1. This is a mechanical gate; it is not a design review and never approves a direction.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const DATA = 'work/recipe-board-v1';
const ENGINE = `${DATA}/style-lab/engine`;
const PARTS = `${ENGINE}/subjects/parts`;
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const here = path.dirname(fileURLToPath(import.meta.url));

// ---- pure helpers (offline-tested by scripts/test-canary-preflight.mjs) ----

// Every <script type="module"> in the page, with the HTML line where its code starts (so a syntax error in the
// extracted module is reported on the line of the page a person edits).
export function moduleScripts(html) {
  const out = [], re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '';
    if (!/type\s*=\s*["']module["']/i.test(attrs)) continue;
    const start = m.index + m[0].indexOf('>') + 1;
    out.push({ code: m[2], startLine: html.slice(0, start).split('\n').length });
  }
  return out;
}

// Every render script the page carries: type=module and classic. A canary may use a classic <script> (E-type), and a
// syntax error there is the same class of obvious error as in a module.
export function pageScripts(html) {
  const out = [], re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '';
    if (/type\s*=\s*["'](?:importmap|application\/json|text\/plain)["']/i.test(attrs)) continue;
    const start = m.index + m[0].indexOf('>') + 1;
    out.push({ type: /type\s*=\s*["']module["']/i.test(attrs) ? 'module' : 'classic', code: m[2], startLine: html.slice(0, start).split('\n').length });
  }
  return out;
}

// node --check on each module, with the reported line mapped back to the page's own line numbers.
export function syntaxErrors(html) {
  const scripts = pageScripts(html);
  if (!scripts.length) return { checked: 0, errors: ['no <script> block: not a renderable canary page'] };
  const errors = [];
  for (const [i, s] of scripts.entries()) {
    if (!s.code.trim()) continue;
    const tmp = path.join(os.tmpdir(), `canary-${process.pid}-${i}-${crypto.randomBytes(4).toString('hex')}.${s.type === 'module' ? 'mjs' : 'js'}`);
    fs.writeFileSync(tmp, s.code);
    const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    fs.rmSync(tmp, { force: true });
    if (r.status === 0) continue;
    const lines = String(r.stderr || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const at = +(lines.map((l) => l.match(new RegExp(`${path.basename(tmp).replace(/\./g, '\\.')}:(\\d+)$`))).find(Boolean) || [])[1];
    const msg = lines.find((l) => /Error:/.test(l)) || lines[0] || 'syntax error';
    errors.push(`script ${i + 1} does not parse (page line ${at ? s.startLine + at - 1 : '?'}): ${msg}`);
  }
  return { checked: scripts.length, errors };
}

// GLB references the page code loads. Chapter code would ask the kit (kit.props.model); a canary that loads a GLB
// itself bypasses modelCheck/visual review unless the preflight checks it here.
export function glbRefs(code) {
  const out = new Set();
  for (const m of String(code || '').matchAll(/['"`]([^'"`\s]+?\.glb)['"`]/g)) out.add(m[1]);
  return [...out];
}
export function resolveGlb(ref, canaryDir) {
  if (ref.startsWith('/')) return path.join(ROOT, decodeURIComponent(ref));
  return path.resolve(canaryDir, ref);
}

// A canary that loads a textured GLB and then assigns a code material throws away the baked colour/normal maps
// (banana-design canaries/A-3d did exactly this on 2026-11-04 and the flat yellow read as plastic).
export function materialDropErrors(code, glbInfo) {
  if (!glbInfo || !glbInfo.images) return [];
  const src = String(code || '');
  const assign = /traverse\([\s\S]{0,600}?\.material\s*=\s*new\s+THREE\.Mesh\w*Material[\s\S]{0,300}?\.material\s*=/.test(src)
    || /\.material\s*=\s*new\s+THREE\.Mesh\w*Material[\s\S]{0,600}?traverse\([\s\S]{0,300}?\.material/.test(src)
    || /\.scene[\s\S]{0,300}?\.material\s*=\s*new\s+THREE\.Mesh\w*Material/.test(src);
  if (assign) return ['the page replaces the loaded model material with a code material: the baked colour/normal maps are dropped (load the model through the kit, or leave its material alone)'];
  return [];
}

// A canary must be registered in canaries/manifest.json and its quality report must pass; otherwise nothing measured
// it and it cannot stand in for a design direction.
export function manifestErrors(manifest, quality, id, project = 'banana-design') {
  const entry = (manifest?.canaries || []).find((c) => c.id === id);
  if (!entry) return [`canary ${id} is not registered in canaries/manifest.json — run canary-quality and register it; an unmeasured canary cannot be shown as a design result`];
  const errors = [];
  if (!['pass', 'mechanical-pass'].includes(entry.verdict)) errors.push(`manifest verdict for ${id} is "${entry.verdict}" (needs pass/mechanical-pass)`);
  const q = (quality?.canaries || []).find((c) => c.id === id);
  if (!q) errors.push(`no canary-quality entry for ${id} — run node scripts/canary-quality.mjs --project ${project}`);
  else if (q.verdict !== 'pass') errors.push(`canary-quality verdict for ${id} is "${q.verdict}": ${(q.errors || []).join('; ')}`);
  return errors;
}

// ---- model asset check (reuses the chapter line's own provenance/QA/texture verdicts) ----

async function modelAssetErrors(glbPath, code) {
  const errors = [], warnings = [];
  const partsRoot = path.dirname(glbPath), name = path.basename(glbPath, '.glb');
  if (!glbPath.startsWith(path.join(ROOT, PARTS) + path.sep)) {
    return { errors, warnings: [`${name}: GLB is outside the engine model library — no provenance/QA/texture receipt to check`], info: null };
  }
  const C = await import(pathToFileURL(path.join(ROOT, 'apps/studio-next/src/lib/recipe-board/chapter.mjs')).href);
  const request = readJson(path.join(partsRoot, `${name}.request.json`)), mesh = readJson(path.join(partsRoot, `${name}.json`)), qa = readJson(path.join(partsRoot, `${name}.qa.json`));
  const info = C.glbTextureInfo(glbPath);
  if (!request) errors.push(`${name}: no A1PartRequest beside the GLB — it was not made by the image-to-3D line`);
  if (!C.modelProvenanceOk(partsRoot, name)) errors.push(`${name}: no matching partset build receipt (request/views/GLB hashes)`);
  const what = qa?.what || request?.why?.replace(/^partset:\s*/, '') || null;
  if (!what) errors.push(`${name}: cannot tell what it was asked to be (no request.why / qa.what)`);
  else if (!C.modelQaOk(partsRoot, name, what)) errors.push(`${name}: no current model QA + independent visual review bound to this GLB`);
  if (request?.texture) {
    const t = C.textureVerdict(name, { textureRequested: true, glb: info, coverage: mesh?.textureCoverage });
    if (!t.ok) errors.push(t.say);
  }
  for (const e of materialDropErrors(code, info)) errors.push(`${name}: ${e}`);
  return { errors, warnings, info };
}

// ---- runtime check: the page loads without a page error and is not a still ----

async function runtimeCheck(canaryDir, { timeoutMs = 15000 } = {}) {
  const errs = [];
  let session;
  try {
    const { openPage } = await import(pathToFileURL(path.join(ROOT, ENGINE, 'shoot.mjs')).href);
    session = await openPage({ pageDir: path.resolve(canaryDir), variant: 'clean', timeoutMs, onError: (t) => errs.push(t) });
  } catch (e) {
    return { errors: [...new Set([...errs, `page did not become ready: ${String(e.message || e).split('\n')[0]}`])].slice(0, 5), meta: null, motionDiff: null };
  }
  const { page, meta, close } = session;
  try {
    if (!(meta?.FPS > 0 && meta?.N > 0)) errs.push('page does not expose window.__meta {FPS, N}');
    const clip = await page.locator('#out').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const shot = async (t) => {
      await page.evaluate(async (tt) => { if (window.__prep) await window.__prep(tt); window.renderAt(tt); }, t);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, clip: { x: Math.floor(clip.x), y: Math.floor(clip.y), width: Math.floor(clip.width), height: Math.floor(clip.height), scale: 1 } });
      return Buffer.from(data, 'base64');
    };
    const fps = meta?.FPS || 30, n = meta?.N || 300;
    const a = await shot(0), b = await shot(n / 2 / fps);   // sequential: two concurrent captures on one page race the render
    const { default: sharp } = await import('sharp');
    const [ra, rb] = await Promise.all([a, b].map((buf) => sharp(buf).resize(480, 270, { fit: 'fill' }).removeAlpha().greyscale().raw().toBuffer()));
    let d = 0;
    for (let i = 0; i < ra.length; i++) d += Math.abs(ra[i] - rb[i]);
    const motionDiff = d / ra.length / 255;
    const gate = readJson(path.join(ROOT, DATA, 'routing/quality-gates.json'))?.thresholds?.minMotionDiff ?? 0.0015;
    if (motionDiff < gate) errs.push(`dead motion: the first frame and the middle frame differ by ${(motionDiff * 100).toFixed(2)} % of the frame (at least ${(gate * 100).toFixed(2)} %): a still is not a canary`);
    return { errors: [...new Set(errs)].slice(0, 5), meta, motionDiff };
  } catch (e) {
    return { errors: [...new Set([...errs, `render check failed: ${String(e.message || e).split('\n')[0]}`])].slice(0, 5), meta, motionDiff: null };
  } finally { await close().catch(() => {}); }
}

// ---- main ----

async function main() {
  const argv = process.argv.slice(2);
  const opt = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const flag = (k) => argv.includes(k);
  const project = opt('--project', 'banana-design');
  const canariesDir = path.join(ROOT, DATA, 'projects', project, 'canaries');
  const manifest = readJson(path.join(canariesDir, 'manifest.json')), quality = readJson(path.join(canariesDir, 'quality.json'));
  const wanted = [...argv].reduce((acc, a, i) => (a === '--canary' ? [...acc, argv[i + 1]] : acc), []);
  const all = fs.existsSync(canariesDir)
    ? fs.readdirSync(canariesDir, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(canariesDir, e.name, 'index.html'))).map((e) => e.name).sort()
    : [];
  const ids = wanted.length ? wanted : all;
  const report = { contract: 'A1CanaryPreflight/v1', project, generatedAt: new Date().toISOString(), staticOnly: flag('--static-only'), checker: 'scripts/canary-preflight.mjs (mechanical gate, not a design review)', canaries: [] };
  const fail = [];
  for (const id of ids) {
    const dir = path.join(canariesDir, id), index = path.join(dir, 'index.html');
    if (!fs.existsSync(index)) { console.log(`CANARY ${id}: FAIL\n  - no index.html in ${path.relative(ROOT, dir)}`); fail.push(id); continue; }
    const html = fs.readFileSync(index, 'utf8'), scripts = pageScripts(html).map((s) => s.code).join('\n');
    const errors = [], warnings = [];
    const syntax = syntaxErrors(html), checks = { syntax: syntax.checked ? 'checked' : 'none' };
    errors.push(...syntax.errors);
    for (const ref of glbRefs(scripts)) {
      const glbPath = resolveGlb(ref, dir);
      if (!fs.existsSync(glbPath)) { errors.push(`GLB not found: ${ref}`); continue; }
      const m = await modelAssetErrors(glbPath, scripts);
      errors.push(...m.errors); warnings.push(...m.warnings);
    }
    errors.push(...manifestErrors(manifest, quality, id, project));
    if (!flag('--static-only')) {
      const r = await runtimeCheck(dir);
      checks.runtime = r.errors.length ? 'fail' : 'pass'; checks.motionDiff = r.motionDiff;
      if (r.meta) checks.meta = { fps: r.meta.FPS, frames: r.meta.N };
      errors.push(...r.errors);
    }
    const ok = errors.length === 0;
    report.canaries.push({ id, ok, checks, errors, warnings });
    console.log(`CANARY ${id}: ${ok ? 'PASS' : 'FAIL'}` + (warnings.length ? ` (${warnings.length} warning)` : ''));
    for (const e of errors) console.log('  - ' + e);
    for (const w of warnings) console.log('  ~ ' + w);
    if (!ok) fail.push(id);
    if (flag('--write')) {
      const out = path.join(canariesDir, 'preflight', `${id}.json`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify({ ...report, canaries: report.canaries.filter((c) => c.id === id) }, null, 1) + '\n');
    }
  }
  const json = opt('--json');
  if (json) { fs.mkdirSync(path.dirname(path.resolve(json)), { recursive: true }); fs.writeFileSync(path.resolve(json), JSON.stringify(report, null, 1) + '\n'); console.log('report -> ' + json); }
  console.log(`CANARY PREFLIGHT: ${ids.length - fail.length}/${ids.length} pass` + (flag('--static-only') ? ' (static only; runtime not checked)' : '') + (fail.length ? ` — failing: ${fail.join(', ')}` : ''));
  return fail.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(await main());
