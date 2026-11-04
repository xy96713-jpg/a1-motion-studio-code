// The film's material library (user, 2026-10-22: 找素材要聪明高效，执行吧). Material was searched shot by shot: 128 searches
// for one film, the same people searched again in every passage (Ilya, Karpathy), each found by its title and turned down
// after download (too small, a watermark, a drawing, burned-in words): 84 of 102 picks were replaced. Here the people,
// organisations and products the film names are found once, before any passage is planned, and each gets the pictures
// its kind is shown with: a person a portrait and a still from a talk of theirs (the frame with the largest face, a real
// photograph: never drawn), an organisation its mark and its building, a product its photograph cut out. They go through
// the same search, eye pick, fetch and checks as any request (shotplan.materialLoop), and are kept in the shared library
// (work/recipe-board-v1/entities.json, the files in the NAS A1素材库) for every later film: a name met before costs nothing.
// The director plans with what is there (the task's `library`), not the other way round.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectPaths, sourcePath } from './store.mjs';

const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const regFile = (cfg) => path.join(cfg.dataDir, 'entities.json');
export const slugOf = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 32);
const latinOf = (names) => names.find((n) => /^[\x20-\x7e]+$/.test(n) && /[A-Za-z]/.test(n)) || null;

// what each kind of entity is shown with: the request the materials step gets for it (shotplan.requestNeed)
export const ROLES = {
  person: [
    { role: 'portrait', kind: 'portrait', slotWidth: 900, what: (n) => `${n}的照片（真实照片，正脸清楚，无水印，不是画的）`, search: (en) => `${en} portrait photo` },
    { role: 'talk', kind: 'footage', what: (n) => `${n}接受采访或演讲的视频（正脸清楚，无字幕）`, search: (en) => `${en} interview` },
  ],
  org: [
    { role: 'logo', kind: 'logo', what: (n) => `${n}的标志（透明底或干净底）`, search: (en) => `${en} logo` },
    { role: 'place', kind: 'photo', what: (n) => `${n}总部大楼外的标志实拍`, search: (en) => `${en} headquarters sign` },
  ],
  product: [
    { role: 'product', kind: 'cutout', what: (n) => `${n}的产品照片（整件，干净底）`, search: (en) => `${en} product photo` },
  ],
};

// (pure, tested) the entities a text names: the known ones whose names appear in it (longest names first, each once),
// and those the director's requests named that the line does not know yet (their kind from what was asked)
// (people the director set on person cards, named marks: their names in the plans' specs, with the English one)
export function namedInPlans(answers) {
  const out = [];
  for (const a of answers) for (const sh of a?.shots || []) { let sp = {}; try { sp = JSON.parse(sh.spec); } catch { continue; }
    if (sh.module === 'person' && sp.name) out.push({ kind: 'person', names: [sp.name, sp.en].filter(Boolean) });
    if (sh.module === 'brand' && sp.name) out.push({ kind: 'org', names: [sp.name] }); }
  return out;
}
export function entitiesIn(text, known, requests = [], named = []) {
  const t = String(text || ''), out = [];
  // a name on a plan the line does not know yet joins the known ones (Ilya's card named him; known-names did not)
  known = [...known, ...named.filter((x) => !known.some((e) => e.names.some((n) => x.names.includes(n)))).map((x) => ({ id: slugOf(latinOf(x.names) || x.names[0]), kind: x.kind, names: x.names, fresh: true }))];
  for (const x of named) if (!out.some((e) => e.names.some((n) => x.names.includes(n)))) { const e = known.find((k) => k.names.some((n) => x.names.includes(n))); if (e) out.push({ id: e.id, kind: e.kind, names: [...new Set([...e.names, ...x.names])], ...(e.fresh ? { fresh: true } : {}) }); }
  for (const e of known) if ((e.names || []).some((n) => [...n].length >= 2 && t.includes(n)) && !out.some((x) => x.id === e.id)) out.push({ id: e.id, kind: e.kind, names: e.names });
  const KIND = { portrait: 'person', footage: 'person', logo: 'org', cutout: 'product' };
  // (q.alias: the name as set on screen, in Traditional: a request written in Simplified is the same person)
  for (const q of requests) { const n = q.entity, al = [n, q.alias].filter(Boolean); if (!n || !KIND[q.kind] || out.some((x) => al.some((a) => x.names.includes(a)))) continue;
    const e = known.find((k) => al.some((a) => k.names.includes(a)));
    out.push(e ? { id: e.id, kind: e.kind, names: [...new Set([...e.names, ...al])] } : { id: slugOf(n) || `e-${out.length}`, kind: KIND[q.kind], names: al, fresh: true }); }
  return out.filter((e) => ROLES[e.kind]);
}
// (pure, tested) the requests for the roles an entity still lacks
export function entityRequests(e, have = {}) {
  const name = e.names[0], en = latinOf(e.names) || name;
  // (the archives are searched by the entity's name: its Latin name where it has one; Commons found nothing for
  // 伊爾亞·蘇茨克維 and has Ilya Sutskever)
  return (ROLES[e.kind] || []).filter((r) => !have[r.role]).map((r) => ({ shot: `${slugOf(e.id)}-${r.role}`, kind: r.kind, ...(r.slotWidth ? { slotWidth: r.slotWidth } : {}), what: r.what(name), search: r.search(en), entity: latinOf(e.names) || name, reference: `资料库：${name} 的${r.role}` }));
}
// the characters printed on a frame (OCR, ocr.swift): a talk whose frame carries a broadcast's text is no portrait
const OVERLAY_CHARS = 40;
export const textOn = (f) => { try { return JSON.parse(spawnSync('swift', [path.join(path.dirname(new URL(import.meta.url).pathname), 'ocr.swift'), f], { encoding: 'utf8', timeout: 120000 }).stdout || '[]').map((l) => l.text).join('').replace(/\s/g, '').length; } catch { return 0; } };
// the still of a talk: of eight frames across the clip, the one with a single face, the largest, a real photograph (held to the drawn
// check), saved beside the clip; null when no frame has a face or the face is drawn
export async function talkStill(cfg, clip, name) {
  const abs = sourcePath(cfg, clip), out = abs.replace(/\.(mp4|mov|webm|mkv)$/i, '-still.jpg');
  if (fs.existsSync(out)) return path.relative(cfg.sourceRoot, out);
  const { facesOf } = await import('./design-check.mjs'), { drawnPerson } = await import('./shotplan.mjs');
  const dur = parseFloat(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', abs], { encoding: 'utf8' }).stdout) || 4;
  const best = Array.from({ length: 8 }, (_, i) => dur * (i + .5) / 8).map((t, i) => { const f = path.join(os.tmpdir(), `rb-talk-${path.basename(abs)}-${i}.jpg`); spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(t), '-i', abs, '-frames:v', '1', '-q:v', '2', f]); const fs0 = fs.existsSync(f) ? facesOf(f).filter((x) => x[2] * x[3] > .004) : [], fc = fs0.length === 1 ? fs0[0] : null; return { f, area: fc ? fc[2] * fc[3] : 0 }; }).sort((a, b) => b.area - a.area)[0];   // (one face alone in the frame: the largest of two was the interviewer beside Ilya)
  if (!best?.area || drawnPerson(cfg, { entity: name, original: '人像' }, best.f)) return null;
  // a broadcast's text over the frame (a stream's banner, ticker and chat round Andreessen: the index read it as a page)
  if (textOn(best.f) >= OVERLAY_CHARS) return null;
  fs.copyFileSync(best.f, out);
  return path.relative(cfg.sourceRoot, out);
}

// the shared library: an entity's assets by role, each a file in this project (path) and in the NAS library (library)
export function readLibrary(cfg) { return readJson(regFile(cfg), { contract: 'A1RecipeBoardEntities/v1', entities: [] }); }
function saveLibrary(cfg, lib) { fs.writeFileSync(regFile(cfg), JSON.stringify(lib, null, 1) + '\n'); }
// an asset is there when its file is in this project, or in the NAS library (then copied in)
function present(cfg, id, a) {
  if (a.path && fs.existsSync(sourcePath(cfg, a.path))) return a.path;
  if (a.library && fs.existsSync(a.library)) { const dst = path.join(projectPaths(cfg, id).root, 'materials', 'clips', path.basename(a.library)); fs.mkdirSync(path.dirname(dst), { recursive: true }); if (!fs.existsSync(dst)) fs.copyFileSync(a.library, dst); return path.relative(cfg.sourceRoot, dst); }
  return null;
}

// find what the film's entities lack, fetch it through the materials step, and keep it in the library; returns the
// film's library as the director sees it
export async function prepareLibrary(cfg, id, { log = () => {}, text = null } = {}) {
  const { knownNames, requestNeeds, materialLoop, materialsLock } = await import('./shotplan.mjs'), { subtitles } = await import('./modules.mjs');
  const said = text ?? subtitles(cfg, id, 0, 1e9).map((x) => x.text).join('');
  const answers = fs.readdirSync(path.join(projectPaths(cfg, id).root, 'tasks')).filter((f) => /^shotplan-.*\.answer\.json$/.test(f)).map((f) => readJson(path.join(projectPaths(cfg, id).root, 'tasks', f), {}));
  const H = await import('./house.mjs'), rq = answers.flatMap((a) => a.requests || []).filter((q) => q.entity), hant = rq.length ? H.toHant(rq.map((q) => q.entity)) : [];
  const lib = readLibrary(cfg), ents = entitiesIn(said, knownNames(cfg), rq.map((q, i) => ({ ...q, alias: hant[i] !== q.entity ? hant[i] : null })), namedInPlans(answers));
  // (an entity is written to the shared library only once a picture of it is there: the library's names mean verified
  // material to the storyboard, and Google with nothing found read as known)
  const want = [];
  for (const e of ents) {
    const rec = lib.entities.find((x) => x.id === e.id || x.names.some((n) => e.names.includes(n))) || { id: e.id, kind: e.kind, names: e.names, assets: {} };
    const have = {}; for (const [role, a] of Object.entries(rec.assets || {})) { const p = present(cfg, id, a); if (p) have[role] = p; }
    if (have.talk && !have.still && rec.assets) { const st = await talkStill(cfg, have.talk, rec.names[0]); if (st) { rec.assets.still = { path: st, from: have.talk, at: new Date().toISOString(), project: id }; if (lib.entities.includes(rec)) saveLibrary(cfg, lib); } }
    want.push(...entityRequests({ ...e, id: rec.id }, have).map((q) => ({ ...q, rec: rec.id, ent: { id: rec.id, kind: rec.kind, names: [...new Set([...rec.names, ...e.names])] } })));
  }
  if (want.length) {
    log(`  library: ${ents.length} names in the film, ${want.length} pictures to find`);
    const release = await materialsLock(cfg, id, log);
    try {
      const keys = requestNeeds(cfg, id, 'lib', want.map(({ rec, ent, ...q }) => q), { shots: [], narration: [] });
      // a talk whose frames never show the person alone and clean (one face, no broadcast text) is withdrawn and the next
      // candidate fetched, a few times
      const { withdraw } = await import('./shotplan.mjs');
      let got = await materialLoop(cfg, id, keys, { log, lockOwner: release });
      for (let pass = 0; pass < 3; pass++) { const bad = keys.filter((k) => /-talk$/.test(k) && got[k] && !fs.existsSync(sourcePath(cfg, got[k]).replace(/\.(mp4|mov|webm|mkv)$/i, '-still.jpg')));
        for (const k of bad) { const q = want.find((x) => `lib-${x.shot}` === k), st = await talkStill(cfg, got[k], q?.entity); if (st) continue; log(`  ${k}: no frame shows them alone and clean (one face, no broadcast text); the next candidate`); withdraw(cfg, id, k, 'no frame shows the person alone and clean'); delete got[k]; }
        if (!bad.some((k) => !got[k])) break;
        got = { ...got, ...(await materialLoop(cfg, id, bad.filter((k) => !got[k]), { log, lockOwner: release })) }; }
      const bind = readJson(path.join(projectPaths(cfg, id).root, 'materials', 'bindings.json'), { shots: {} }).shots || {};
      const L2 = readLibrary(cfg);
      for (const q of want) { const k = `lib-${q.shot}`; let f = got[k]; if (!f) continue;
        let rec = L2.entities.find((x) => x.id === q.rec); if (!rec) { rec = { ...q.ent, files: [], assets: {} }; L2.entities.push(rec); } rec.assets ||= {};
        const role = q.shot.split('-').pop();
        if (role === 'talk') { const st = await talkStill(cfg, f, q.entity); if (st) rec.assets.still = { path: st, from: f, at: new Date().toISOString(), project: id }; }
        rec.assets[role] = { path: f, library: bind[k]?.library || null, url: bind[k]?.url || null, credit: bind[k]?.credit || null, at: new Date().toISOString(), project: id };
        rec.files = [...(rec.files || []).filter((x) => x.path !== f), { path: f, url: bind[k]?.url || null, role }];
        log(`  library: ${rec.names[0]} ${role} ${path.basename(f)}`); }
      saveLibrary(cfg, L2);
      (await import('./matindex.mjs')).buildIndex(cfg, id, { log: () => {} });   // (the stills cut here are read too)
    } finally { release(); }
  }
  return filmLibrary(cfg, id, ents);
}
// the film's library as the director sees it: each entity named, its pictures with their size, kind and face
export function filmLibrary(cfg, id, ents = null) {
  const { readIndex } = { readIndex: (c, i) => readJson(path.join(projectPaths(c, i).root, 'materials', 'index.json'), { files: {} }) };
  const idx = readIndex(cfg, id), lib = readLibrary(cfg);
  return lib.entities.filter((e) => !ents || ents.some((x) => x.id === e.id || x.names.some((n) => e.names.includes(n)))).map((e) => ({ names: e.names, kind: e.kind,
    pictures: Object.entries(e.assets || {}).map(([role, a]) => { const p = present(cfg, id, a), m = p ? idx.files[p] : null; return p ? { role, path: p, kind: m?.kind || null, size: m ? `${m.w}x${m.h}` : null, faces: m?.faces ?? null, marks: m?.marks?.length ? m.marks : undefined } : null; }).filter(Boolean) }));
}
