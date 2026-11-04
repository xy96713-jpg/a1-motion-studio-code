// A1ShotMotionContract/v1 — machine-readable per-shot motion hard input for 章节工.
// Extends the existing Claude uneaten line (routeUneatenErrors / matureFirstDraftErrors / openingMotionErrors):
// session-brief §0.7 + approved greybox serialize here; morph check motionContractUneatenErrors fails 未吃.
// Schema: work/recipe-board-v1/routing/shot-motion-contract.schema.json
// Hard extensions: camMove numeric band, seam.poseFrom, subject.model, motif.layers, preview delivery bind.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { projectPaths } from './store.mjs';

const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const sha = (s) => crypto.createHash('sha256').update(String(s || '')).digest('hex').slice(0, 16);
const fileSha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export const SHOT_MOTION_CONTRACT = 'A1ShotMotionContract/v1';
export const MOTION_UNEATEN = '运动合同选了但答案未吃';
export const PREVIEW_DELIVERY = 'preview-delivery';
export const PURE_TIME = 'pure-time';
export const STILLS_BEFORE_PREVIEW = 'stills-before-preview';
export const PREVIEW_STILLS_MIN = 3;

/** Morph check gate profile: rough-cut softens B26-gold calm duration only; mature/design-set full gates stay. */
export const GATE_PROFILE_ROUGH = 'rough-cut';
export const GATE_PROFILE_FULL = 'full';

/**
 * Resolve gateProfile from motion contract / session brief marks.
 * Explicit gateProfile | delivery.gateProfile wins; else source rough-cut*|about/session「粗版 GO」|ROUGH-CUT GO.
 * Default full (design-set / mature calm thresholds still block).
 */
export function resolveGateProfile(contract = null, { sessionMd = null } = {}) {
  const raw = contract?.gateProfile ?? contract?.delivery?.gateProfile;
  if (raw != null && String(raw).trim()) {
    const p = String(raw).trim().toLowerCase().replace(/_/g, '-');
    if (p === 'rough-cut' || p === 'roughcut' || p === '粗版' || p === 'rough') return GATE_PROFILE_ROUGH;
    return GATE_PROFILE_FULL;
  }
  const source = String(contract?.source || '');
  if (/rough-?cut/i.test(source)) return GATE_PROFILE_ROUGH;
  const blob = [contract?.about, sessionMd].filter(Boolean).join('\n');
  if (/粗版\s*GO|ROUGH-?\s*CUT\s*GO/i.test(blob)) return GATE_PROFILE_ROUGH;
  return GATE_PROFILE_FULL;
}


export const SUBJECT_MOTION = Object.freeze([
  'stagger', 'tableGrows', 'gridMotion', 'formation-chain', 'copyRepeat', 'lineup',
  'subject-push', 'orbit-subject', 'contagion-stagger', 'subject-motion', 'none',
]);

export const CAMERA_MOVES = Object.freeze(['static', 'push', 'pull', 'pan', 'orbit', 'cut', 'dolly', 'tilt', 'whip']);
export const SEAM_OUTS = Object.freeze(['cut', 'match', 'whip', 'push', 'glitch', 'flash', 'pan', 'orbit']);
export const TYPE_IN_STRATEGIES = Object.freeze(['late', 'after-motion']);

/** House gold intensity band for beats[].move (session-brief 金样 ≈ 0.55–0.65). */
export const CAM_MOVE_BAND_GOLD = Object.freeze({ min: 0.55, max: 0.65 });

const CAM_ALIASES = {
  push: ['push', 'dolly', 'press', '续压', '压进', '特写'],
  pull: ['pull', 'pullback'],
  pan: ['pan', '横移', 'truck'],
  orbit: ['orbit', '环绕'],
  static: ['static', 'hold', '静'],
  whip: ['whip'],
  tilt: ['tilt'],
  cut: ['cut'],
  dolly: ['dolly', 'push'],
};

function poseOf(p) {
  if (!p || typeof p !== 'object') return null;
  if (typeof p.s !== 'number' || typeof p.x !== 'number' || typeof p.y !== 'number') return null;
  return { s: p.s, x: p.x, y: p.y };
}

/** Map free text / greybox note → subjectMotion enum. */
export function inferSubjectMotion(text = '', { cameraMove = null, shapes = [] } = {}) {
  const t = String(text || '');
  // A prohibition is a constraint, not a direction to animate. Only infer this
  // effect from a non-negated clause; semantic truth still needs director review.
  const positiveClauses = t.split(/[，,。；;！!？?\n]/).filter((clause) => !/(不|不能|不可|禁止|避免|别|勿|切勿|不要|不得|不应)/.test(clause));
  if (/subjectMotion\s*[:=]\s*none|主体(?:保持)?静止|主体无运动|画面静止/.test(t) || (!t.trim() && (!cameraMove || cameraMove === 'static'))) return 'none';
  if (positiveClauses.some((clause) => /传染|病斑|一路传|沿排.*传/.test(clause))) return 'contagion-stagger';
  if (/tableGrows|table-grows|table.?grow|百格|格亮|点阵|gridMotion|一格格|依次亮/.test(t) || shapes.includes('grid')) return 'tableGrows';
  if (/gridMotion/.test(t)) return 'gridMotion';
  if (/formation|吸芽|球茎|链.*生|依次长|subject.?链/.test(t)) return 'formation-chain';
  if (/copyRepeat|copy-to-repeat|copy.?repeat/.test(t)) return 'copyRepeat';
  if (/lineup|lineup-row|一排同时/.test(t)) return 'lineup';
  if (/stagger|错开|侧影|逐个|落下|moves\.stagger/.test(t)) return 'stagger';
  if (/subject.?orbit|主体.*(?:自转|环绕)/.test(t)) return 'orbit-subject';
  if (/subject.?push|主体.*(?:推近|靠近)/.test(t)) return 'subject-push';
  return 'subject-motion';
}

/** Map free text → camera.move enum. */
export function inferCameraMove(text = '', fallback = 'static') {
  const t = String(text || '').toLowerCase();
  for (const move of ['whip', 'orbit', 'pan', 'pull', 'push', 'dolly', 'tilt', 'cut', 'static']) {
    const keys = CAM_ALIASES[move] || [move];
    if (keys.some((k) => t.includes(String(k).toLowerCase()))) return move === 'dolly' ? 'push' : move;
  }
  return CAMERA_MOVES.includes(fallback) ? fallback : 'static';
}

/** Map free text → seam.out enum. */
export function inferSeamOut(text = '', fallback = 'cut') {
  const t = String(text || '').toLowerCase();
  for (const s of ['flash', 'glitch', 'whip', 'match', 'push', 'pan', 'orbit', 'cut']) {
    if (t.includes(s) || (s === 'flash' && /闪白|flash/.test(t))) return s;
  }
  return SEAM_OUTS.includes(fallback) ? fallback : 'cut';
}

export function inferTypeInStrategy(text = '', typeRows = []) {
  const t = String(text || '');
  if (/after.?motion|运动.*后|先.*运动.*字|字.*后段/.test(t)) return 'after-motion';
  if (/晚|late|中后|最晚|字晚/.test(t)) return 'late';
  const ins = (typeRows || []).map((r) => r?.in).filter((n) => typeof n === 'number');
  if (ins.length && Math.min(...ins) >= 2) return 'late';
  return 'late'; // house default: type late / after motion
}

/** Infer kit.props.model name from prose (banana.glb / kit.props.model(banana)). */
export function inferSubjectModel(text = '') {
  const t = String(text || '');
  const m = t.match(/kit\.props\.model\s*\(\s*(?:THREE\s*,\s*)?['"]([A-Za-z0-9_-]+)['"]/)
    || t.match(/parts\/([A-Za-z0-9_-]+)\.glb/)
    || t.match(/\b([A-Za-z0-9_-]+)\.glb\b/)
    || t.match(/model\s*[=:]\s*['"]([A-Za-z0-9_-]+)['"]/);
  return m ? m[1] : null;
}

/**
 * (pure) Build A1ShotMotionContract/v1 from approved greybox beat rows (+ optional prev out as seam.in).
 * greybox row shape: { beat, camera:{move,note,from,to}, type:[], out, note, blocks:[] }
 */
export function buildShotMotionContractFromGreybox({ chapter, project = null, rows = [], prevOut = null, source = 'greybox', motif = null, delivery = null } = {}) {
  const shots = (rows || []).filter((r) => r?.beat).map((r, i) => {
    const shapes = (r.blocks || []).map((b) => b.shape).filter(Boolean);
    const blob = [r.note, r.camera?.note, (r.blocks || []).map((b) => b.label).join(' ')].filter(Boolean).join('；');
    const move = CAMERA_MOVES.includes(r.camera?.move) ? r.camera.move : inferCameraMove(blob, 'static');
    const subjectMotion = inferSubjectMotion(blob, { cameraMove: move, shapes });
    const typeIn = (r.type || []).map((t) => t?.in).find((n) => typeof n === 'number') ?? null;
    const poseFrom = poseOf(r.camera?.from) || (i === 0 ? null : poseOf(rows[i - 1]?.camera?.to));
    const model = inferSubjectModel(blob)
      || ((r.blocks || []).map((b) => b.model).find((m) => typeof m === 'string' && m.trim()) || null);
    return {
      shotId: r.beat,
      camera: {
        move,
        camMove: null,
        camMoveMin: null,
        camMoveMax: null,
        note: r.camera?.note || null,
      },
      camMove: move,
      subjectMotion,
      subject: model ? { model } : null,
      type: {
        inStrategy: inferTypeInStrategy(blob, r.type || []),
        in: typeIn,
      },
      seam: {
        in: i === 0 ? (prevOut || null) : (rows[i - 1]?.out || null),
        out: SEAM_OUTS.includes(r.out) ? r.out : inferSeamOut(blob, r.out || 'cut'),
        poseFrom,
      },
      note: r.note || null,
    };
  });
  return {
    contract: SHOT_MOTION_CONTRACT,
    chapter: String(chapter || ''),
    project: project || null,
    source,
    updated: new Date().toISOString().slice(0, 10),
    motif: motif || null,
    delivery: delivery || null,
    shots,
  };
}

/**
 * (pure) Parse session-brief §0.7 markdown table rows into partial shot records.
 * Expects a table with header containing 拍 plus 运动|镜头|主体 and body rows like `| B02 | … | … | … |`.
 * Also detects gold intensity band prose (0.55–0.65) and subject .glb mentions outside the table.
 */
export function parseSessionBriefShotTable(md = '') {
  const text = String(md || '');
  const band = /0\.55\s*[,–\-〜~到至]\s*0\.65|camMove\s*[≈∈\[]\s*0\.55|camMove∈\s*\[\s*0\.55/.test(text) ? { ...CAM_MOVE_BAND_GOLD } : null;
  const chapterModel = inferSubjectModel(text);
  const lines = text.split('\n');
  // rough-cut briefs use 镜头 / 主体 columns instead of 运动
  const start = lines.findIndex((l) => /^\|/.test(l) && /拍/.test(l) && (/运动/.test(l) || /镜头/.test(l) || /主体/.test(l)));
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\|/.test(line)) {
      if (out.length) break;
      continue;
    }
    if (/^\|\s*-+/.test(line)) continue;
    const parts = line.split('|').map((c) => c.trim());
    const cols = parts[0] === '' ? parts.slice(1, -1) : parts;
    if (cols.length < 2) continue;
    const shotId = cols[0];
    if (!/^B\d+/i.test(shotId)) continue;
    const motion = cols[1] || '';
    const typeCell = cols[2] || '';
    const mat = cols[3] || '';
    const move = inferCameraMove(`${motion} ${mat}`, 'static');
    const subjectMotion = inferSubjectMotion(`${motion} ${mat}`, { cameraMove: move });
    const model = inferSubjectModel(`${motion} ${mat} ${text}`) || chapterModel;
    const useBand = band && move !== 'static';
    out.push({
      shotId,
      camera: {
        move,
        camMove: null,
        camMoveMin: useBand ? band.min : null,
        camMoveMax: useBand ? band.max : null,
        note: motion || null,
      },
      camMove: move,
      subjectMotion,
      subject: model ? { model } : null,
      type: { inStrategy: inferTypeInStrategy(`${typeCell} ${motion}`), in: null },
      seam: { in: null, out: inferSeamOut(mat, 'cut'), poseFrom: null },
      note: [motion, typeCell, mat].filter(Boolean).join(' · ') || null,
    });
  }
  return out;
}

/** Detect B01→Bxx pose inheritance numbers in session md (s:1.08, x:0, y:-20). */
export function parsePoseFromSessionMd(md = '') {
  const t = String(md || '');
  const m = t.match(/camera\.to[^=]*=\s*`?\{?\s*s\s*:\s*([-\d.]+)\s*,\s*x\s*:\s*([-\d.]+)\s*,\s*y\s*:\s*([-\d.]+)/i)
    || t.match(/B01[^\n]{0,40}to[^\n]{0,20}s\s*:\s*([-\d.]+)\s*,\s*x\s*:\s*([-\d.]+)\s*,\s*y\s*:\s*([-\d.]+)/i)
    || t.match(/from\s*=\s*B01\.to[^\n]{0,20}s\s*:\s*([-\d.]+)\s*,\s*x\s*:\s*([-\d.]+)\s*,\s*y\s*:\s*([-\d.]+)/i)
    || t.match(/承接[^\n]{0,60}s\s*:\s*([-\d.]+)\s*,\s*x\s*:\s*([-\d.]+)\s*,\s*y\s*:\s*([-\d.]+)/i);
  if (!m) return null;
  return { s: +m[1], x: +m[2], y: +m[3] };
}

/** Merge §0.7 table shots over a greybox-built contract (table wins on subjectMotion / type / noted seams). */
export function mergeShotMotionContract(base, tableShots = []) {
  if (!base?.shots?.length) {
    return {
      contract: SHOT_MOTION_CONTRACT,
      chapter: base?.chapter || '',
      project: base?.project || null,
      source: 'session-brief-0.7',
      updated: new Date().toISOString().slice(0, 10),
      motif: base?.motif || null,
      delivery: base?.delivery || null,
      shots: tableShots,
    };
  }
  const byId = Object.fromEntries((tableShots || []).map((s) => [s.shotId, s]));
  const shots = base.shots.map((s) => {
    const t = byId[s.shotId];
    if (!t) return s;
    return {
      ...s,
      camera: {
        move: t.camera?.move || s.camera.move,
        camMove: t.camera?.camMove ?? s.camera?.camMove ?? null,
        camMoveMin: t.camera?.camMoveMin ?? s.camera?.camMoveMin ?? null,
        camMoveMax: t.camera?.camMoveMax ?? s.camera?.camMoveMax ?? null,
        note: t.camera?.note || s.camera?.note || null,
      },
      camMove: t.camera?.move || s.camMove || s.camera?.move,
      subjectMotion: t.subjectMotion === 'none' || (t.subjectMotion && t.subjectMotion !== 'subject-motion') ? t.subjectMotion : s.subjectMotion,
      subject: t.subject?.model || t.subject?.id ? { ...(s.subject || {}), ...t.subject } : (s.subject || null),
      hero: t.hero || s.hero || undefined,
      actors: t.actors || s.actors || undefined,
      firstFrame: t.firstFrame || s.firstFrame || undefined,
      type: {
        inStrategy: t.type?.inStrategy || s.type?.inStrategy || 'late',
        in: s.type?.in ?? t.type?.in ?? null,
      },
      seam: {
        in: s.seam?.in ?? t.seam?.in ?? null,
        out: (t.seam?.out && t.seam.out !== 'cut') || (s.seam?.out === 'cut' && t.seam?.out) ? (t.seam?.out || s.seam?.out) : (s.seam?.out || t.seam?.out || 'cut'),
        poseFrom: s.seam?.poseFrom || t.seam?.poseFrom || null,
      },
      note: t.note || s.note || null,
    };
  });
  for (const t of tableShots || []) {
    if (!shots.some((s) => s.shotId === t.shotId)) shots.push(t);
  }
  return {
    ...base,
    contract: SHOT_MOTION_CONTRACT,
    source: tableShots?.length ? 'merged' : base.source || 'greybox',
    updated: new Date().toISOString().slice(0, 10),
    shots,
  };
}

/** Short summary injected into session-brief / morph task. */
export function motionContractSummary(contract) {
  if (!contract?.shots?.length) return '';
  const lines = contract.shots.map((s) => {
    const cam = s.camera?.move || s.camMove || '?';
    const band = (s.camera?.camMoveMin != null && s.camera?.camMoveMax != null)
      ? ` · camMove∈[${s.camera.camMoveMin},${s.camera.camMoveMax}]` : '';
    const type = s.type?.inStrategy || 'late';
    const seam = `${s.seam?.in || '–'}→${s.seam?.out || 'cut'}`;
    const pose = s.seam?.poseFrom ? ` · poseFrom={s:${s.seam.poseFrom.s},x:${s.seam.poseFrom.x},y:${s.seam.poseFrom.y}}` : '';
    const sub = s.subject?.model ? ` · subject.model=${s.subject.model}` : '';
    return `- ${s.shotId}: camera=${cam}${band} · subjectMotion=${s.subjectMotion}${sub} · type.in=${type} · seam ${seam}${pose}`;
  });
  const motif = contract.motif?.layers?.length
    ? [`- motif.${contract.motif.id}: ${contract.motif.layers.map((l) => `${l.shotId}/${l.subjectMotion}`).join(' → ')}`]
    : [];
  const delivery = contract.delivery?.previewMp4
    ? ['- delivery: preview.mp4 required + morph-hash bind']
    : [];
  return [
    `### 分镜运动合同（${SHOT_MOTION_CONTRACT} · 硬输入）`,
    '',
    '章节工必须吃进模块；`motionContractUneatenErrors` 拦截未吃（与「路由选了但答案未吃」同级）。偏离须 `export const greyboxDiffer = { Bxx: \"理由\" }`。',
    '',
    ...(contract.motionRules ? [
      `整片共同运动规则（继承，不另造风格）：${JSON.stringify(contract.motionRules)}`,
      ...contract.shots.map((s) => `${s.shotId} 起态/变化/落态/交接：${JSON.stringify(s.directorIntent)}`),
      '答案 motionImplementation 数组每项写 shotId/start/change/end/handoff/motionRules，各为当前 code 中的原样非注释代码片段。只检查落地索引，不是运行证据或审美评分；静止、切换、不同轴都可由语义决定。',
    ] : []),
    ...lines,
    ...motif,
    ...delivery,
  ].join('\n');
}

export function motionContractPath(cfg, id, chapter) {
  return path.join(projectPaths(cfg, id).root, 'tasks', `session-${chapter}.motion.json`);
}

export function loadChapterMotionContract(cfg, id, chapter) {
  return readJson(motionContractPath(cfg, id, chapter), null);
}

export function writeChapterMotionContract(cfg, id, chapter, contract) {
  const f = motionContractPath(cfg, id, chapter);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const body = { ...contract, contract: SHOT_MOTION_CONTRACT, chapter: chapter || contract.chapter };
  fs.writeFileSync(f, JSON.stringify(body, null, 1) + '\n');
  return f;
}

// CAMERA.md as a checkable grammar on the shot-motion contract (routing/camera-grammar.json, A1CameraGrammar/v1):
// one camera owner per shot, a move from the grammar's vocabulary, a locked shot that stays locked, a declared move
// that actually moves when it pins from/to, whip only on a whip/cut seam, and the camera pose carried across
// push/match/whip seams (CAMERA.md: 一镜一个镜头主人 / 默认锁定; SHOT-DIRECTION.md §3 连续性). The rules that need
// the measured picture (180°/30°, reading speed, reference camera path) stay with the runtime measurement and reviews.
export const CAMERA_GRAMMAR = 'A1CameraGrammar/v1';
const CAMERA_NUM = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const CAMERA_SAME_POSE = 0.001;
const cameraPose = (v) => v && ['s', 'x', 'y'].every((k) => Number.isFinite(Number(v[k])));
export function cameraGrammarErrors(contract, grammar = null) {
  if (!grammar || grammar.contract !== CAMERA_GRAMMAR || !Array.isArray(contract?.shots) || !contract.shots.length) return [];
  const rules = grammar.rules || {}, aliases = grammar.aliases || {}, vocab = grammar.vocabulary || {}, errors = [];
  const norm = (m) => aliases[m] || m;
  const whose = (s) => `${contract.chapter || '?'} ${s.shotId || '?'}`;
  contract.shots.forEach((s, i) => {
    const cam = s.camera || {}, top = typeof s.camMove === 'string' ? s.camMove : null, declared = cam.move || top;
    if (!declared) { errors.push(`${whose(s)}: no camera move declared (camera.move / camMove: one owner, default ${rules.defaultMove || 'static'})`); return; }
    const move = norm(declared);
    if (top && cam.move && norm(top) !== norm(cam.move)) errors.push(`${whose(s)}: two camera owners — camera.move "${cam.move}" vs camMove "${top}"`);
    if (!Object.hasOwn(vocab, move)) { errors.push(`${whose(s)}: unknown camera move "${declared}" (grammar: ${Object.keys(vocab).join('/')})`); return; }
    const intensity = CAMERA_NUM(cam.camMove), min = CAMERA_NUM(cam.camMoveMin), max = CAMERA_NUM(cam.camMoveMax);
    if (move === 'static') {
      const maxStill = rules.staticIntensityMax ?? 0.05;
      const pinned = [intensity, min, max].filter((v) => v !== null && v > maxStill);
      if (pinned.length) errors.push(`${whose(s)}: the camera is static but pins an intensity ${pinned.map((v) => v.toFixed(2)).join('/')} (> ${maxStill}): a locked shot does not push (CAMERA.md: 默认锁定)`);
    }
    const [lo, hi] = rules.bandBounds || [0, 1];
    for (const [key, v] of [['camMoveMin', min], ['camMoveMax', max]]) if (v !== null && (v < lo || v > hi)) errors.push(`${whose(s)}: ${key} ${v} outside ${lo}..${hi}`);
    if (min !== null && max !== null && min > max) errors.push(`${whose(s)}: camMoveMin ${min} > camMoveMax ${max}`);
    const from = cam.from, to = cam.to;
    if ((from && !cameraPose(from)) || (to && !cameraPose(to))) errors.push(`${whose(s)}: camera.from/to must be {s, x, y} numbers`);
    else if (from && to) {
      const minD = rules.moveMinDelta || { scale: 0.001, offset: 0.5 };
      const moved = Math.abs(from.s - to.s) >= (minD.scale ?? 0.001) || Math.abs(from.x - to.x) >= (minD.offset ?? 0.5) || Math.abs(from.y - to.y) >= (minD.offset ?? 0.5);
      if (move === 'static' && moved) errors.push(`${whose(s)}: the camera is static but from→to differ (s ${from.s}→${to.s}, x ${from.x}→${to.x}, y ${from.y}→${to.y})`);
      if (move !== 'static' && !moved) errors.push(`${whose(s)}: the camera declares "${move}" but from = to: the shot does not move`);
    } else if (from || to) errors.push(`${whose(s)}: the camera has only one of from/to — declare both ends or neither`);
    if ((rules.seamOnlyMoves || []).includes(move)) {
      const seams = rules.whipSeams || ['whip', 'cut'], inSeam = s.seam?.in, outSeam = s.seam?.out;
      if (!seams.includes(inSeam) && !seams.includes(outSeam)) errors.push(`${whose(s)}: the camera move "${move}" is seam-only but the seams are in=${inSeam || '?'} out=${outSeam || '?'} (allowed: ${seams.join('/')})`);
    }
    if (i > 0) {
      const prev = contract.shots[i - 1], pose = s.seam?.poseFrom, prevTo = prev?.camera?.to;
      if (pose && prevTo && cameraPose(pose) && cameraPose(prevTo) && (rules.poseContinuitySeams || []).includes(s.seam?.in)) {
        const jumped = ['s', 'x', 'y'].filter((k) => Math.abs(Number(pose[k]) - Number(prevTo[k])) > CAMERA_SAME_POSE);
        if (jumped.length) errors.push(`${whose(s)}: seam.poseFrom does not continue ${prev.shotId}'s camera.to (${jumped.join('/')}): a cut between beats jumps the camera position`);
      }
    }
  });
  return errors;
}

/** Strip // and /* comments for signal scans (same idea as chapter.withoutCodeComments). */
export function withoutComments(code) {
  return String(code || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

const SUBJECT_SIGNALS = {
  stagger: [/moves\.stagger\b/, /\bstagger\b/, /错开/],
  tableGrows: [/tableGrows\b/, /table-grows/, /type\.dev\.tableGrows/, /gridMotion\b/, /依次亮/, /百格/],
  gridMotion: [/gridMotion\b/, /tableGrows\b/, /依次亮/],
  'formation-chain': [/formation\b/, /kit\.props\.formation/, /吸芽/, /球茎/],
  copyRepeat: [/copyRepeat\b/, /copy-to-repeat/, /type\.dev\.copyRepeat/],
  lineup: [/lineup\b/, /lineup-row/, /layoutLineup/, /K2\.lineup/],
  'subject-push': [/props\.model\b/, /engine\.subject\b/, /block\.model\b/, /\bpush\b/, /camMove/],
  'orbit-subject': [/\borbit\b/, /kit\.orbit/],
  'contagion-stagger': [/stagger\b/, /传染/, /病斑/, /moves\.stagger/],
  'subject-motion': [/props\.model\b/, /engine\.subject\b/, /formation\b/, /stagger\b/, /tableGrows\b/, /move\s*:/],
  none: [],
};

const CAMERA_SIGNALS = {
  push: [/\bpush\b/, /camMove\s*:/, /camera\.move\s*[:=]\s*['"]push['"]/, /s\s*:\s*1\.\d+/],
  pull: [/\bpull\b/],
  pan: [/\bpan\b/, /横移/],
  orbit: [/\borbit\b/],
  dolly: [/\bdolly\b/, /\bpush\b/],
  whip: [/\bwhip\b/],
  tilt: [/\btilt\b/],
  cut: [/\bcut\b/],
  static: [],
};

const SEAM_SIGNALS = {
  flash: [/flashCut\b/, /\bflash\b/, /闪白/],
  glitch: [/\bglitch\b/],
  whip: [/\bwhip\b/],
  match: [/\bmatch\b/],
  push: [/\bpush\b/],
  pan: [/\bpan\b/],
  orbit: [/\borbit\b/],
  cut: [/\bcut\b/, /out\s*:\s*[\'\"]cut[\'\"]/],
};

const TYPE_LATE_SIGNALS = [
  /晚进/, /字晚/, /after.?motion/, /delay\s*:\s*[0-9.]+/,
  /\bin\s*:\s*[3-9]/,
  /\bin\s*:\s*[1-9]\d/,
  /typeOnset|labelDelay|lateType/,
];

function signalsHit(src, patterns = []) {
  return (patterns || []).some((re) => re.test(src));
}

function hasWrittenDiffer(differ, shotId) {
  const why = differ?.[shotId];
  return typeof why === 'string' && why.trim().length >= 8;
}

/** Parse morph beats[].move and beats[].camMove numeric intensities. */
export function parseMorphIntensities(code) {
  const src = withoutComments(code);
  const vals = [];
  for (const re of [/\bmove\s*:\s*(-?\d+(?:\.\d+)?)/g, /\bcamMove\s*:\s*(-?\d+(?:\.\d+)?)/g]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) vals.push(Number(m[1]));
  }
  return vals.filter((n) => Number.isFinite(n));
}

/** True when morph carries camera scale continuity for poseFrom.s (greybox x/y are offsets; morph uses screen cam). */
export function morphEatsPoseFrom(code, poseFrom) {
  if (!poseFrom || typeof poseFrom.s !== 'number') return true;
  const src = withoutComments(code);
  const s = poseFrom.s;
  const sPat = new RegExp(`s\\s*:\\s*${String(s).replace('.', '\\.')}\\b`);
  if (sPat.test(src)) return true;
  // explicit carry declaration
  if (/poseFrom|B01\.to|camera\.from/.test(src) && src.includes(String(s))) return true;
  // full triple present as numbers
  const nums = [poseFrom.s, poseFrom.x, poseFrom.y].map(String);
  if (nums.every((n) => src.includes(n))) return true;
  return false;
}


/** Subject motions that may grow/shrink mesh scale as the prescribed read (not 忽大忽小). */
export const POSEFROM_SCALE_OK_SUBJECT = Object.freeze([
  'tableGrows', 'gridMotion', 'formation-chain', 'copyRepeat',
]);

/**
 * Parse morph beats[].cam {s,x,y} in source order (numbers only).
 */
export function parseMorphCamKeyframes(code) {
  const src = withoutComments(code);
  const out = [];
  const re = /\bcam\s*:\s*\{\s*([^}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const body = m[1];
    const num = (k) => {
      const mm = new RegExp(String.raw`\b${k}\s*:\s*(-?\d+(?:\.\d+)?)`).exec(body);
      return mm ? Number(mm[1]) : null;
    };
    const s = num('s'), x = num('x'), y = num('y');
    if (s == null && x == null && y == null) continue;
    // preceding at: N on same beat object when present
    const prefix = src.slice(0, m.index), atM = [...prefix.matchAll(/\bat\s*:\s*(-?\d+(?:\.\d+)?)/g)].at(-1);
    const fromMatch = /\bcamFrom\s*:\s*\{([^}]*)\}/.exec(atM ? prefix.slice(atM.index) : '');
    const from = fromMatch ? Object.fromEntries(['s', 'x', 'y'].map((key) => {
      const value = new RegExp(String.raw`\b${key}\s*:\s*(-?\d+(?:\.\d+)?)`).exec(fromMatch[1]);
      return [key, value ? Number(value[1]) : null];
    })) : null;
    out.push({ at: atM ? Number(atM[1]) : null, s, x, y, ...(from ? { from } : {}) });
  }
  return out;
}

/**
 * Quantified early-window subject scale lerps in morph source.
 * Matches scale.setScalar(lerp(A,B,…)) and `lerp(A, B, seg(t, T0, T1))` used as a scale factor
 * while t is gated below windowSec (e.g. `t < 2.0 ? lerp(1.35, 1.05, …)`).
 * Returns { a, b, amp, t0, t1, rel } with rel = |a-b|/max(min(|a|,|b|), 1e-6).
 */
export function parseEarlySubjectScaleLerps(code, { windowSec = 2.0 } = {}) {
  const src = withoutComments(code);
  const found = [];
  const push = (a, b, t0 = null, t1 = null, via = '') => {
    if (![a, b].every(Number.isFinite)) return;
    const lo = Math.min(Math.abs(a), Math.abs(b));
    const rel = Math.abs(a - b) / Math.max(lo, 1e-6);
    found.push({ a, b, amp: Math.abs(a - b), rel, t0, t1, via });
  };
  let m;
  // t < W ? lerp(A, B, seg(t, T0, T1))  — hero pop pattern (chapter-start only; late formation lerps excluded)
  const reGate = new RegExp(
    String.raw`t\s*<\s*(-?\d+(?:\.\d+)?)\s*\?\s*lerp\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*seg\s*\(\s*t\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)`,
    'g',
  );
  while ((m = reGate.exec(src))) {
    const w = Number(m[1]);
    if (w <= windowSec + 1e-9) push(Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), 't-gate');
  }
  // seg(t, T0, T1) with T1 <= windowSec inside lerp used near scale (broader)
  const reSeg = /lerp\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*seg\s*\(\s*t\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g;
  while ((m = reSeg.exec(src))) {
    const t1 = Number(m[4]);
    if (t1 <= windowSec + 1e-9) push(Number(m[1]), Number(m[2]), Number(m[3]), t1, 'seg-early');
  }
  // dedupe by endpoints + window window (t-gate and seg-early may both match one lerp)
  const seen = new Set();
  return found.filter((r) => {
    const k = `${r.a}|${r.b}|${r.t0}|${r.t1}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Count sign flips in a series of adjacent deltas above noise. */
export function adjacentSignFlips(values, { noise = 0.012 } = {}) {
  if (!values || values.length < 3) return { flips: 0, peakToPeak: 0, deltas: [] };
  const deltas = [];
  for (let i = 1; i < values.length; i++) deltas.push(values[i] - values[i - 1]);
  let flips = 0;
  let last = 0;
  for (const d of deltas) {
    if (Math.abs(d) < noise) continue;
    const sign = d > 0 ? 1 : -1;
    if (last && sign !== last) flips += 1;
    last = sign;
  }
  const peakToPeak = Math.max(...values) - Math.min(...values);
  return { flips, peakToPeak, deltas };
}

/**
 * Morph-side hard gate: after seam.poseFrom, beats cam.s must open on poseFrom.s,
 * must not 忽大忽小 across keyframes, and subject scale must not lerp without prescription.
 */
export function morphPoseFromScaleErrors(code, contract, {
  windowSec = 2.0,
  sEps = 0.025,
  relAmp = 0.12,
  maxSignFlips = 1,
  ampMin = 0.04,
  shots = [],
  greyboxDiffer = {},
} = {}) {
  const e = [];
  if (!contract?.shots?.length || !String(code || '').trim()) return e;
  const cams = parseMorphCamKeyframes(code);
  const lerps = parseEarlySubjectScaleLerps(code, { windowSec });
  for (const [index, s] of contract.shots.entries()) {
    if (hasWrittenDiffer(greyboxDiffer, s.shotId)) continue;
    const pose = s.seam?.poseFrom;
    if (!pose || typeof pose.s !== 'number') continue;
    const tag = `morph.${s.shotId}.seam.poseFrom`;
    // opening cam.s must match inherited pose
    const timeline = shots.find((q) => q.shotId === s.shotId);
    const shotCams = timeline
      ? cams.filter((c) => c.at >= timeline.at && c.at < timeline.at + timeline.dur && typeof c.s === 'number')
      : contract.shots.length === 1 ? cams.filter((c) => typeof c.s === 'number')
        : cams[index] ? [cams[index]] : [];
    const first = shotCams[0];
    const entryScale = first?.from?.s ?? first?.s;
    if (first && Math.abs(entryScale - pose.s) > sEps) {
      e.push(`${tag}.inherit: ${MOTION_UNEATEN} (beats entry cam.s=${entryScale} ≠ poseFrom.s=${pose.s}; Δ=${(entryScale - pose.s).toFixed(4)})`);
    }
    // keyframe cam.s oscillation (忽大忽小) within early cams / first shot cams
    // Prefer cams whose at falls inside a generous first-chapter window; if at missing, use all
    const series = shotCams.map((c) => c.s);
    if (series.length >= 3) {
      const { flips, peakToPeak } = adjacentSignFlips(series, { noise: sEps });
      if (flips >= maxSignFlips + 1 && peakToPeak >= ampMin) {
        e.push(`${tag}.camScale: 忽大忽小 (beats cam.s signFlips=${flips} peakToPeak=${peakToPeak.toFixed(4)}; series=[${series.slice(0, 8).join(',')}])`);
      }
    }
    const sub = s.subjectMotion;
    const scaleOk = POSEFROM_SCALE_OK_SUBJECT.includes(sub);
    if (!scaleOk) {
      for (const L of index === 0 ? lerps : []) {
        if (L.rel < relAmp) continue;
        // formation/table grow often uses setScalar(lerp(0.2,1)) — only flag when not scale-ok motion
        e.push(`${tag}.subjectScale: 忽大忽小 (unprescribed early scale lerp ${L.a}→${L.b} rel=${L.rel.toFixed(3)} via=${L.via}; subjectMotion=${sub || 'none'} does not prescribe mesh scale; poseFrom.s=${pose.s})`);
      }
    }
  }
  return e;
}

/**
 * Track-side hard gate: runtime camera.flat.s after poseFrom inheritance.
 * Prefer adjacent-frame Δs / variance — no aesthetic prose.
 */
export function trackPoseFromScaleErrors(contract, track = [], shots = [], {
  inheritSec = 1.5,
  sEps = 0.025,
  xyEps = 48,
  adjNoise = 0.012,
  maxSignFlips = 1,
  ampMin = 0.04,
  coverRelAmp = 0.12,
  greyboxDiffer = {},
} = {}) {
  const e = [];
  if (!contract?.shots?.length || !Array.isArray(track) || !track.length) return e;
  const shotOf = (id) => (shots || []).find((x) => x.shotId === id) || null;
  for (const spec of contract.shots) {
    if (hasWrittenDiffer(greyboxDiffer, spec.shotId)) continue;
    const pose = spec.seam?.poseFrom;
    if (!pose || typeof pose.s !== 'number') continue;
    const shot = shotOf(spec.shotId);
    const at = shot?.at ?? 0;
    const dur = shot?.dur ?? 8;
    const tag = `${spec.shotId}.seam.poseFrom`;
    const samples = track.filter((r) => r && typeof r.t === 'number' && r.t >= at - 1e-9 && r.t < at + dur && r.camera?.flat);
    const flats = samples.map((r) => r.camera.flat).filter((f) => f && Number.isFinite(f.s));
    if (flats.length < 2) {
      e.push(`${tag}.track: runtime scale continuity unavailable (fewer than 2 camera.flat samples)`);
      continue;
    }
    const inherit = samples.filter((r) => r.t <= at + inheritSec);
    const inheritFlats = inherit.map((r) => r.camera.flat).filter((f) => Number.isFinite(f?.s));
    if (inheritFlats.length) {
      const s0 = inheritFlats[0].s;
      if (Math.abs(s0 - pose.s) > sEps) {
        e.push(`${tag}.inherit: camera.flat.s=${s0} ≠ poseFrom.s=${pose.s} at t≈${(inherit[0]?.t ?? at).toFixed(2)} (Δ=${(s0 - pose.s).toFixed(4)})`);
      }
      if (typeof pose.x === 'number' && Number.isFinite(inheritFlats[0].x) && Math.abs(inheritFlats[0].x - (960 + pose.x)) > xyEps && Math.abs(inheritFlats[0].x - pose.x) > xyEps) {
        // greybox x is offset; morph screen cam often uses 960+offset — accept either absolute or offset frame
        // only flag when neither interpretation matches
        const absOk = Math.abs(inheritFlats[0].x - pose.x) <= xyEps;
        const screenOk = Math.abs(inheritFlats[0].x - (960 + pose.x)) <= xyEps;
        if (!absOk && !screenOk) {
          e.push(`${tag}.inherit: camera.flat.x=${inheritFlats[0].x} ↛ poseFrom.x=${pose.x} (screen or offset)`);
        }
      }
    }
    const sSeries = flats.map((f) => f.s);
    const { flips, peakToPeak } = adjacentSignFlips(sSeries, { noise: adjNoise });
    if (flips >= maxSignFlips + 1 && peakToPeak >= ampMin) {
      e.push(`${tag}.camScale: 忽大忽小 (track camera.flat.s signFlips=${flips} peakToPeak=${peakToPeak.toFixed(4)} n=${sSeries.length})`);
    }
    // Unprescribed cam.s drift when move is static
    const move = spec.camera?.move || spec.camMove || 'static';
    if (move === 'static' || move === 'cut') {
      const drift = Math.max(...sSeries.map((s) => Math.abs(s - pose.s)));
      if (drift > sEps * 2) {
        e.push(`${tag}.camScale: unprescribed scale drift under camera.move=${move} (max|s-poseFrom.s|=${drift.toFixed(4)}; poseFrom.s=${pose.s})`);
      }
    }
    // cover-area proxy for subject scale oscillation in inheritance window
    const areas = [];
    for (const r of inherit) {
      const cov = r.cover || [];
      const flat = [];
      for (const g of cov) {
        if (Array.isArray(g)) flat.push(...g);
        else if (g && typeof g === 'object') flat.push(g);
      }
      const nums = flat.map((c) => c?.area).filter((a) => Number.isFinite(a) && a > 0);
      if (nums.length) areas.push(Math.max(...nums));
    }
    if (areas.length >= 3) {
      const { flips: cf, peakToPeak: cpp } = adjacentSignFlips(areas, { noise: Math.max(...areas) * 0.02 });
      const rel = cpp / Math.max(Math.min(...areas), 1e-9);
      if (cf >= maxSignFlips + 1 && rel >= coverRelAmp) {
        e.push(`${tag}.subjectScale: 忽大忽小 (cover.area signFlips=${cf} relPeak=${rel.toFixed(3)} areas=[${areas.slice(0, 6).map((a) => a.toFixed(4)).join(',')}])`);
      }
    }
  }
  return e;
}

/**
 * Hard gate: after chapter-start / seam poseFrom inheritance, scale (and cam) must not
 * mutate without prescription. Morph numbers + runtime track adjacent-frame Δs.
 * Does NOT rewrite morph visuals — fail is the correct signal.
 */
export function poseFromScaleContinuityErrors(contract, {
  track = [],
  shots = [],
  morphCode = '',
  greyboxDiffer = {},
} = {}) {
  return [
    ...morphPoseFromScaleErrors(morphCode, contract, { shots, greyboxDiffer }),
    ...trackPoseFromScaleErrors(contract, track, shots, { greyboxDiffer }),
  ];
}

/** Declared subject.model must appear in kit.props.model / engine.subject / block.model call. */
export function morphEatsSubjectModel(code, model) {
  if (!model) return true;
  const src = withoutComments(code);
  const name = String(model).replace(/\.glb$/i, '');
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    String.raw`(?:props\.model|engine\.subject|block\.model)\s*(?:\(|\s*=)[^;]{0,120}['"]${esc}['"]|['"]${esc}['"]\s*,\s*\{[^}]*(?:what|fallback)|parts\/${esc}\.glb`,
  ).test(src) || new RegExp(String.raw`props\.model\s*\(\s*THREE\s*,\s*['"]${esc}['"]`).test(src);
}

/**
 * Fail when morph code does not reflect the motion contract (same tier as routeUneatenErrors).
 * Message always includes 「运动合同选了但答案未吃」.
 * Explicit greyboxDiffer[shotId] with written reason skips that shot's mismatches.
 */
export function motionContractUneatenErrors(code, contract, { greyboxDiffer = {}, motionImplementation = {}, filmDesign = null, shotIds = null } = {}) {
  const e = [];
  if (filmDesign?.motionRules) {
    if (JSON.stringify(contract?.motionRules) !== JSON.stringify(filmDesign.motionRules)) e.push('morph.motionRules.inheritance: motion contract differs from accepted film design; regenerate/reconcile session-brief');
    for (const shot of contract?.shots || []) {
      const expected = filmDesign.beats?.find((b) => b.beat === shot.shotId)?.directorIntent;
      if (!expected || JSON.stringify(shot.directorIntent) !== JSON.stringify(expected)) e.push(`morph.${shot.shotId}.directorIntent.inheritance: motion contract differs from accepted film design`);
    }
  }
  for (const b of filmDesign?.beats || []) {
    if (!(b.productionRisk === 'high' || b.activeRevision === true) || (shotIds && !shotIds.includes(b.beat))) continue;
    const shot = contract?.shots?.find(s => s.shotId === b.beat);
    if (!shot && shotIds) e.push(`morph.${b.beat}.directorIntent: missing scoped shot in motion contract`);
    if (shot && JSON.stringify(shot.directorIntent) !== JSON.stringify(b.directorIntent)) e.push(`morph.${b.beat}.directorIntent.inheritance: scoped event differs from accepted film design`);
  }
  if (!contract?.shots?.length) return e;
  const src = withoutComments(code);
  if (!String(code || '').trim()) {
    for (const s of contract.shots) {
      e.push(`morph.${s.shotId}.motion: ${MOTION_UNEATEN} (contract present, morph empty)`);
    }
    return e;
  }
  const intensities = parseMorphIntensities(code);
  for (const s of contract.shots) {
    const id = s.shotId;
    const tag = `morph.${id}`;
    const scoped = filmDesign?.beats?.some(b => b.beat === id && (b.productionRisk === 'high' || b.activeRevision === true));
    if (contract.motionRules || scoped) {
      // An implementation index into the submitted code, NOT runtime or aesthetic proof.
      // Even a declared deviation must show where its replacement was implemented.
      for (const field of ['start', 'change', 'end', 'handoff', ...(contract.motionRules ? ['motionRules'] : [])]) {
        const anchor = (Array.isArray(motionImplementation) ? motionImplementation.find((row) => row.shotId === id) : null)?.[field];
        if (typeof anchor !== 'string' || anchor.trim().length < 8 || !src.includes(anchor.trim())) {
          e.push(`${tag}.implementation.${field}: ${MOTION_UNEATEN} (provide an exact uncommented code excerpt for this shot; semantic correctness still needs visual review)`);
        }
      }
    }
    if (hasWrittenDiffer(greyboxDiffer, id)) continue;
    const move = s.camera?.move || s.camMove;
    if (move && move !== 'static') {
      const pats = CAMERA_SIGNALS[move] || CAMERA_SIGNALS.push;
      if (!signalsHit(src, pats) && !signalsHit(src, [/camMove\s*:/, /\bmove\s*:\s*0?\.\d+/])) {
        e.push(`${tag}.camera: ${MOTION_UNEATEN} (camera.move=${move})`);
      }
    }
    const min = s.camera?.camMoveMin;
    const max = s.camera?.camMoveMax;
    if (typeof min === 'number' && typeof max === 'number') {
      const inBand = intensities.some((n) => n >= min - 1e-9 && n <= max + 1e-9);
      if (!inBand) {
        e.push(`${tag}.camMoveBand: ${MOTION_UNEATEN} (need beats[].move|camMove in [${min},${max}]; got [${intensities.slice(0, 8).join(',')}])`);
      }
    } else if (typeof s.camera?.camMove === 'number') {
      const pin = s.camera.camMove;
      const hit = intensities.some((n) => Math.abs(n - pin) <= 0.05);
      if (!hit) {
        e.push(`${tag}.camMove: ${MOTION_UNEATEN} (pinned camMove=${pin})`);
      }
    }
    const sub = s.subjectMotion;
    if (sub && sub !== 'none') {
      const pats = SUBJECT_SIGNALS[sub] || SUBJECT_SIGNALS['subject-motion'];
      if (pats.length && !signalsHit(src, pats)) {
        e.push(`${tag}.subjectMotion: ${MOTION_UNEATEN} (subjectMotion=${sub})`);
      }
    }
    const model = s.subject?.model;
    if (model && !morphEatsSubjectModel(code, model)) {
      e.push(`${tag}.subject.model: ${MOTION_UNEATEN} (declared subject.model=${model}; need kit.props.model/engine.subject/block.model)`);
    }
    // P1 D3: missing inStrategy defaults to late (HOUSE) — same TYPE_LATE_SIGNALS uneaten gate
    const typeStrat = s.type?.inStrategy || 'late';
    if (typeStrat === 'late' || typeStrat === 'after-motion') {
      const hasTypeTiming = signalsHit(src, TYPE_LATE_SIGNALS) || signalsHit(src, SUBJECT_SIGNALS.stagger) || /props\.model\b|tableGrows|formation|gridMotion/.test(src);
      if (!hasTypeTiming) {
        e.push(`${tag}.type: ${MOTION_UNEATEN} (type.inStrategy=${typeStrat})`);
      }
    }
    const seamOut = s.seam?.out;
    if (seamOut && seamOut !== 'cut') {
      const pats = SEAM_SIGNALS[seamOut] || [];
      if (pats.length && !signalsHit(src, pats)) {
        e.push(`${tag}.seam.out: ${MOTION_UNEATEN} (seam.out=${seamOut})`);
      }
    }
    const poseFrom = s.seam?.poseFrom;
    if (poseFrom && !morphEatsPoseFrom(code, poseFrom)) {
      e.push(`${tag}.seam.poseFrom: ${MOTION_UNEATEN} (poseFrom={s:${poseFrom.s},x:${poseFrom.x},y:${poseFrom.y}})`);
    }
  }
  // motif layers: each declared layer must exist on shots with matching subjectMotion class
  const layers = contract.motif?.layers || [];
  if (layers.length) {
    const byId = Object.fromEntries(contract.shots.map((s) => [s.shotId, s]));
    for (const layer of layers) {
      const shot = byId[layer.shotId];
      if (!shot) {
        e.push(`morph.motif.${layer.shotId}: ${MOTION_UNEATEN} (motif layer shot missing from contract.shots)`);
        continue;
      }
      if (layer.subjectMotion && shot.subjectMotion !== layer.subjectMotion) {
        e.push(`morph.motif.${layer.shotId}: ${MOTION_UNEATEN} (motif subjectMotion=${layer.subjectMotion} vs shot ${shot.subjectMotion})`);
        continue;
      }
      if (hasWrittenDiffer(greyboxDiffer, layer.shotId)) continue;
      const pats = SUBJECT_SIGNALS[layer.subjectMotion] || SUBJECT_SIGNALS['subject-motion'];
      if (layer.subjectMotion && layer.subjectMotion !== 'none' && pats.length && !signalsHit(src, pats)) {
        e.push(`morph.motif.${layer.shotId}: ${MOTION_UNEATEN} (motif layer subjectMotion=${layer.subjectMotion})`);
      }
    }
  }
  e.push(...briefBeatsUneatenErrors(code, contract));
  return e;
}

// Measured per-shot evidence from the rendered page. Pixel changes are only evidence of a visible
// change; they do not prove which subject moved or that a transition has the intended meaning.
export function firstFrameReadErrors(spec, shot, track, actorTrack) {
  const errors = [];
  for (const item of spec.firstFrame?.read || []) {
    if (item.actor) {
      const seen = actorTrack.some((r) => r.id === item.actor && r.t >= shot.at && r.t <= shot.at + 0.12 && r.state != null);
      if (!seen) errors.push(`${spec.shotId}: firstFrame actor ${item.actor} is not measured within 0.12 s of the cut`);
    }
    if (item.text) {
      const seen = track.some((r) => r.t >= shot.at && r.t <= shot.at + 0.12 && (r.drawn || []).some((d) => (d.alpha ?? 1) >= 0.5 && String(d.whole || d.text || '').includes(item.text)));
      if (!seen) errors.push(`${spec.shotId}: firstFrame text “${item.text}” is not visible within 0.12 s of the cut`);
    }
  }
  return errors;
}

export function motionRuntimeEvidence(contract, shots, { track = [], curve = [], camTrack = [], actorTrack = [], greyboxDiffer = {} } = {}) {
  const errors = [], warnings = [], rows = [];
  const dist = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
  const directional = (values) => {
    let min = values[0], max = values[0], rise = 0, fall = 0;
    for (const value of values) { if (min > 0) rise = Math.max(rise, (value - min) / min); if (max > 0) fall = Math.max(fall, (max - value) / max); min = Math.min(min, value); max = Math.max(max, value); }
    return { rise, fall };
  };
  for (const spec of contract?.shots || []) {
    const shot = shots.find((x) => x.shotId === spec.shotId);
    if (!shot) { errors.push(`${spec.shotId}: runtime motion evidence has no matching shot`); continue; }
    const differs = hasWrittenDiffer(greyboxDiffer, spec.shotId);
    const samples = track.filter((x) => x.t >= shot.at && x.t < shot.at + shot.dur && x.camera);
    const pixels = curve.filter((x) => x.t > shot.at + 0.2 && x.t < shot.at + shot.dur);
    const expected = spec.camera?.move || spec.camMove || 'static';
    const row = { shotId: spec.shotId, expectedCamera: expected, samples: samples.length, camera: 'not-required', visibleChange: 'unverified', subjectMotion: 'not-required', semantic: 'independent-review-required' };
    if (samples.length < 3) {
      errors.push(`${spec.shotId}: runtime motion evidence unavailable (fewer than 3 camera samples)`);
      row.camera = 'unverified'; rows.push(row); continue;
    }
    errors.push(...firstFrameReadErrors(spec, shot, track, actorTrack));
    if (differs) {
      row.camera = 'declared-difference'; row.reason = greyboxDiffer[spec.shotId];
      row.visibleChange = pixels.length < 3 ? 'unverified' : pixels.some((x) => Number.isFinite(x.d) && x.d >= 2.5) ? 'observed' : 'not-observed';
      warnings.push(`${spec.shotId}: declared deviation still requires independent review of the rendered shot`); rows.push(row); continue;
    }
    const flats = samples.map((x) => x.camera.flat).filter((x) => x && Number.isFinite(x.x) && Number.isFinite(x.y) && Number.isFinite(x.s));
    const worlds = samples.map((x) => x.camera.world).filter((x) => x && Array.isArray(x.position) && x.position.length === 3 && x.position.every(Number.isFinite));
    const first = flats[0], last = flats.at(-1), flatShift = first ? Math.max(0, ...flats.map((x) => dist([first.x, first.y], [x.x, x.y]))) : 0;
    const zoom = first && last && first.s > 0 ? (last.s - first.s) / first.s : 0;
    const flatDirection = flats.length ? directional(flats.map((x) => x.s)) : { rise: 0, fall: 0 };
    const worldTravel = worlds.length > 1 ? Math.max(...worlds.map((x) => dist(worlds[0].position, x.position))) : 0;
    const focused = worlds.filter((x) => Array.isArray(x.focus) && x.focus.length === 3 && x.focus.every(Number.isFinite)), distances = focused.map((x) => dist(x.position, x.focus));
    const worldZoom = distances.length > 1 && distances[0] > 0 ? (distances[0] - distances.at(-1)) / distances[0] : null;
    const worldDirection = distances.length ? directional(distances) : { rise: 0, fall: 0 };
    const projected = camTrack.filter((x) => x.t >= shot.at && x.t < shot.at + shot.dur).reduce((sum, x) => sum + (Number.isFinite(x.px) ? x.px : 0), 0);
    row.measured = { flatShift: +flatShift.toFixed(2), flatZoom: +zoom.toFixed(4), flatPush: +flatDirection.rise.toFixed(4), flatPull: +flatDirection.fall.toFixed(4), worldTravel: +worldTravel.toFixed(4), worldZoom: worldZoom == null ? null : +worldZoom.toFixed(4), worldPush: +worldDirection.fall.toFixed(4), worldPull: +worldDirection.rise.toFixed(4), projectedPx: +projected.toFixed(2) };
    if (expected !== 'static' && expected !== 'cut') {
      let proved = false;
      if (expected === 'push' || expected === 'dolly') proved = worlds.length ? worldZoom != null && worldDirection.fall >= 0.015 : flatDirection.rise >= 0.015;
      else if (expected === 'pull') proved = worlds.length ? worldZoom != null && worldDirection.rise >= 0.015 : flatDirection.fall >= 0.015;
      else proved = worlds.length ? worldTravel >= Math.max(0.05, (distances[0] || 1) * 0.015) : flatShift >= 12;
      const net = worlds.length ? worldZoom : zoom;
      const opposite = net != null && ((['push', 'dolly'].includes(expected) && net <= -0.015) || (expected === 'pull' && net >= 0.015));
      if (proved && opposite) { row.camera = 'contradicted'; errors.push(`${spec.shotId}: a brief ${expected} was measured but the shot's net camera direction is opposite; check the actual shot and contract`); }
      else if (proved) { row.camera = 'observed'; if (!['push', 'dolly', 'pull'].includes(expected)) warnings.push(`${spec.shotId}: camera movement was measured; the ${expected} direction still requires independent review`); }
      else if (worlds.length && worldZoom == null && (worldTravel > 0.05 || projected >= 12)) {
        row.camera = 'unverified'; warnings.push(`${spec.shotId}: camera moved, but runtime data cannot verify the requested ${expected} direction`);
      } else { row.camera = 'not-observed'; errors.push(`${spec.shotId}: requested camera ${expected} was not observed in this shot's runtime samples`); }
    }
    row.visibleChange = pixels.length >= 3 && pixels.some((x) => Number.isFinite(x.d) && x.d >= 2.5) ? 'observed' : 'not-observed';
    if (spec.subjectMotion && spec.subjectMotion !== 'none') {
      const inShot = actorTrack.filter((x) => x.t >= shot.at && x.t < shot.at + shot.dur && x.id && x.state != null);
      if (Array.isArray(spec.actors) && spec.actors.length) {
        const actorErrors = [];
        // A declared instance that is explicitly static (or whose declared endpoints are equal) is
        // allowed to stand still: an array or a scene has resting members. It still has to be measured,
        // and the moving members still have to change.
        const staticActor = (a) => a?.static === true || (a?.stateFrom != null && a?.stateTo != null && JSON.stringify(a.stateFrom) === JSON.stringify(a.stateTo));
        row.actors = spec.actors.map((actor) => {
          const states = inShot.filter((x) => x.id === actor.id).map((x) => x.state);
          const changed = states.length >= 2 && states.some((state) => JSON.stringify(state) !== JSON.stringify(states[0]));
          const endpointMismatch = states.length >= 2 && (JSON.stringify(states[0]) !== JSON.stringify(actor.stateFrom) || JSON.stringify(states.at(-1)) !== JSON.stringify(actor.stateTo));
          if (staticActor(actor)) {
            if (!states.length) actorErrors.push(`${spec.shotId}: actor ${actor.id} is declared static but has no measured state sample`);
            return { id: actor.id, samples: states.length, changed, static: true, endpoints: 'static' };
          }
          if (!changed) actorErrors.push(`${spec.shotId}: actor ${actor.id} has no same-shot state-change evidence`);
          else if (endpointMismatch) actorErrors.push(`${spec.shotId}: actor ${actor.id} state endpoint differs from its declared stateFrom/stateTo`);
          return { id: actor.id, samples: states.length, changed, endpoints: states.length >= 2 && !endpointMismatch ? 'observed' : 'unverified' };
        });
        errors.push(...actorErrors);
        const movingActors = spec.actors.filter((a) => !staticActor(a));
        row.subjectMotion = actorErrors.length ? 'unverified' : (movingActors.length ? 'observed' : 'none');
        if (!actorErrors.length) warnings.push(movingActors.length ? `${spec.shotId}: every moving declared actor changed state and matched its endpoints; ${spec.subjectMotion} still requires independent visual review` : `${spec.shotId}: every declared actor is static; subject motion is none`);
      } else {
      const requestedId = spec.subject?.id || spec.subject?.model || spec.hero?.id || null;
      const ids = [...new Set(inShot.map((x) => x.id))];
      const actorId = requestedId || (ids.length === 1 ? ids[0] : null);
      const states = inShot.filter((x) => x.id === actorId).map((x) => x.state);
      const changed = states.length >= 2 && states.some((state) => JSON.stringify(state) !== JSON.stringify(states[0]));
      const endpointMismatch = states.length >= 2 && spec.hero && (JSON.stringify(states[0]) !== JSON.stringify(spec.hero.stateFrom) || JSON.stringify(states.at(-1)) !== JSON.stringify(spec.hero.stateTo));
      row.actorId = actorId;
      if (!actorId || states.length < 2 || !changed) {
        row.subjectMotion = 'unverified';
        errors.push(`${spec.shotId}: subject motion has no camera-independent actor evidence${actorId ? ` for ${actorId}` : ''}`);
      } else if (endpointMismatch) {
        row.subjectMotion = 'unverified';
        errors.push(`${spec.shotId}: hero state endpoint differs from the declared ${spec.hero.id} stateFrom/stateTo`);
      } else {
        row.subjectMotion = 'observed';
        warnings.push(`${spec.shotId}: actor ${actorId} changed state; ${spec.subjectMotion} still requires independent visual review`);
      }
      }
    }
    if (spec.seam?.out && spec.seam.out !== 'cut') warnings.push(`${spec.shotId}: ${spec.seam.out} seam type requires independent review of the rendered transition`);
    rows.push(row);
  }
  return { errors, warnings, rows };
}

/**
 * Cheap static lint (OVH Hard Rule 1 / seek(t)·pure f(t)): morph pose must not be driven by wall-clock.
 * Strips comments first; flags Date.now / performance.now / setInterval / setTimeout.
 */

/**
 * G6 — optional contract.beats[] {t,read,cam}: morph must reference declared times (heuristic).
 * Uneaten when a beat time has no matching at:/t≈ in uncommented source.
 * This is a lexical hint only, not proof that the runtime rendered the cue.
 */
export function briefBeatsUneatenErrors(morphCode = '', contract = null) {
  const beats = contract?.beats;
  if (!Array.isArray(beats) || !beats.length) return [];
  const code = withoutComments(morphCode);
  const e = [];
  for (const b of beats) {
    if (b == null || typeof b.t !== 'number') continue;
    const t = b.t;
    const reAt = new RegExp('(?:at\\s*:\\s*|\\bt\\s*[:=]\\s*)' + String(t) + '(?:\\.0+)?\\b');
    const loose = new RegExp('(?:at\\s*:\\s*|\\bt\\s*[:=]\\s*)' + t.toFixed(1) + '\\b');
    if (!reAt.test(code) && !loose.test(code)) {
      const near = Math.abs(t) < 1e-6 ? /at\s*:\s*0(?:\.0+)?\b/.test(code) : false;
      if (!near) {
        const read = b.read ? ` read="${String(b.read).slice(0, 24)}"` : '';
        e.push(`beats[${t}]: ${MOTION_UNEATEN} (declared beat t=${t}${read} not found in morph)`);
      }
    }
  }
  return e;
}


export function pureTimeErrors(morphCode = '') {
  const src = withoutComments(morphCode);
  const e = [];
  const rules = [
    [/Date\.now\s*\(/, 'Date.now('],
    [/performance\.now\s*\(/, 'performance.now('],
    [/\bsetInterval\s*\(/, 'setInterval('],
    [/\bsetTimeout\s*\(/, 'setTimeout('],
  ];
  for (const [re, label] of rules) {
    if (re.test(src)) e.push(`${PURE_TIME}: ${label} drives motion — use seek(t)/pure f(t) (OVH Hard Rule 1; frame N must replay)`);
  }
  return e;
}

/**
 * Scoped writers must say what they preserved and changed against a real bound reference.
 * This is traceability for the existing blind review, not a visual pass by itself.
 */
export function referenceComparisonErrors(motionImplementation = [], filmDesign = null, productionFiles = []) {
  if (!productionFiles.length) return [];
  const rows = Array.isArray(motionImplementation) ? motionImplementation : [], errors = [];
  for (const beat of filmDesign?.beats || []) {
    if (beat.productionRisk !== 'high' && beat.activeRevision !== true) continue;
    const comparison = rows.find(row => row?.shotId === beat.beat)?.referenceComparison;
    if (!comparison) { errors.push(`morph.${beat.beat}.referenceComparison: compare the bound reference at start/change/end`); continue; }
    const bound = productionFiles.find(file => file.file === comparison.reference?.file && file.hash && file.hash === comparison.reference?.hash);
    if (!bound) errors.push(`morph.${beat.beat}.referenceComparison.reference.hash: reference is missing, stale or not bound to this task`);
    for (const phase of ['start', 'change', 'end']) if (typeof comparison[phase] !== 'string' || comparison[phase].trim().length < 8) errors.push(`morph.${beat.beat}.referenceComparison.${phase}: describe the actual reference comparison`);
  }
  return errors;
}

/** High-risk/active-revision poses use the ordinary chapter blind review before MP4. */
export function scopedPoseReviewErrors({ filmDesign = null, check = null, answerHash = null } = {}) {
  const scoped = (filmDesign?.beats || []).filter(beat => beat.productionRisk === 'high' || beat.activeRevision === true).map(beat => beat.beat);
  if (!scoped.length) return [];
  if (!check || check.answerHash !== answerHash) return ['scoped pose review is missing or stale for this answer'];
  const errors = [];
  if (check.errors?.length) errors.push('scoped pose review cannot admit a candidate with code/runtime errors');
  for (const beat of scoped) {
    const frame = check.review?.frames?.find(row => row.beat === beat);
    if (!frame || !(frame.score >= 4)) errors.push(`${beat}: entry/key/exit poses need an independent score ≥4 before preview MP4`);
  }
  return errors;
}

/**
 * Stills-before-preview policy (G2 / OVH 02-verification contact sheet).
 * - delivery.stillsBeforePreview === true → hard
 * - === false → off
 * - else when preview delivery active: rough-cut → warn; full/studio → hard
 */
export function resolveStillsBeforePreview(delivery = null, gateProfile = GATE_PROFILE_FULL) {
  if (!delivery) return 'off';
  if (delivery.stillsBeforePreview === false) return 'off';
  if (delivery.stillsBeforePreview === true) return 'hard';
  const wantsPreview = delivery.previewMp4 === true || delivery.bindMorphHash === true
    || (typeof delivery.previewMp4 === 'string' && String(delivery.previewMp4).trim().length > 0);
  if (!wantsPreview) return 'off';
  const profile = String(gateProfile || GATE_PROFILE_FULL).toLowerCase().replace(/_/g, '-');
  if (profile === GATE_PROFILE_ROUGH || profile === 'roughcut' || profile === 'rough') return 'warn';
  return 'hard';
}

export function previewStillsDir(outDir) {
  return path.join(outDir, 'stills');
}

export function previewStillsManifestPath(outDir) {
  return path.join(outDir, 'preview.stills.json');
}

// A post-render extraction is useful for inspection, but cannot prove that
// the current chapter was inspected before rendering its preview.
export function writePreviewPreflight(outDir, morphCode, files = []) {
  const root = path.resolve(outDir);
  const frames = files.map((file) => {
    const absolute = path.resolve(file), relative = path.relative(root, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(absolute)) throw new Error('preflight frame must exist inside chapter output');
    return { file: relative, hash: fileSha(absolute) };
  });
  const previous = readJson(path.join(root, 'preview.preflight.json'), null);
  if (previous?.contract === 'A1PreviewPreflight/v1' && previous.morphHash === sha(morphCode)
      && JSON.stringify(previous.frames) === JSON.stringify(frames)) return previous;
  const receipt = { contract: 'A1PreviewPreflight/v1', morphHash: sha(morphCode), at: new Date().toISOString(), frames };
  fs.writeFileSync(path.join(root, 'preview.preflight.json'), JSON.stringify(receipt, null, 1) + '\n');
  return receipt;
}

export function previewPreflightErrors(outDir, morphCode, bind = null) {
  const receipt = readJson(path.join(outDir, 'preview.preflight.json'), null);
  if (receipt?.contract !== 'A1PreviewPreflight/v1' || receipt.morphHash !== sha(morphCode)) return ['missing or stale pre-preview frame receipt'];
  if (!Array.isArray(receipt.frames) || receipt.frames.length < PREVIEW_STILLS_MIN) return [`need ≥${PREVIEW_STILLS_MIN} bound pre-preview frames`];
  const root = path.resolve(outDir);
  for (const frame of receipt.frames) {
    if (typeof frame?.file !== 'string' || !frame.hash) return ['invalid pre-preview frame receipt'];
    const file = path.resolve(root, frame.file), relative = path.relative(root, file);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(file) || fileSha(file) !== frame.hash) return ['pre-preview frame missing or changed'];
  }
  if (!bind?.startedAt || !Number.isFinite(Date.parse(receipt.at)) || !Number.isFinite(Date.parse(bind.startedAt)) || Date.parse(receipt.at) > Date.parse(bind.startedAt)) return ['pre-preview receipt is newer than render start or preview has no start timestamp'];
  return [];
}

export function listPreviewStills(outDir, { minBytes = 32 } = {}) {
  const dir = previewStillsDir(outDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((n) => /\.png$/i.test(n))
    .map((n) => path.join(dir, n))
    .filter((f) => {
      try { return fs.statSync(f).size >= minBytes; } catch { return false; }
    })
    .sort();
}

export function writePreviewStillsManifest(outDir, files = [], extra = {}) {
  const body = {
    contract: 'A1PreviewStills/v1',
    count: files.length,
    files: files.map((f) => path.basename(f)),
    at: new Date().toISOString(),
    ...extra,
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(previewStillsManifestPath(outDir), JSON.stringify(body, null, 1) + '\n');
  return body;
}

/**
 * Extract post-preview inspection frames. These are never pre-preview evidence.
 * Reuse only when the source video and every generated frame still match.
 */
export function ensurePreviewStillsFromMp4(outDir, previewMp4, { min = PREVIEW_STILLS_MIN } = {}) {
  if (!previewMp4 || !fs.existsSync(previewMp4) || fs.statSync(previewMp4).size < 32) {
    return [];
  }
  const stillsDir = previewStillsDir(outDir);
  fs.mkdirSync(stillsDir, { recursive: true });
  const sourceHash = fileSha(previewMp4);
  const previous = readJson(previewStillsManifestPath(outDir), null);
  if (previous?.source === 'ffmpeg-preview' && previous.sourceHash === sourceHash
      && Array.isArray(previous.frames) && previous.frames.length >= min
      && previous.frames.every((f) => /^preview-extract-\d+\.png$/.test(f.name) && fs.existsSync(path.join(stillsDir, f.name)) && fileSha(path.join(stillsDir, f.name)) === f.hash)) {
    return previous.frames.map((f) => path.join(stillsDir, f.name));
  }
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', previewMp4], { encoding: 'utf8' });
  const duration = Number(String(probe.stdout || '').trim());
  if (probe.status !== 0 || !Number.isFinite(duration) || duration <= 0) throw new Error('preview stills: cannot read video duration');
  const count = Math.max(3, Math.ceil(min));
  const times = count === 3 ? [0, duration * 0.5, duration * 0.9] : Array.from({ length: count }, (_, i) => duration * 0.9 * i / (count - 1));
  const stage = fs.mkdtempSync(path.join(stillsDir, '.preview-'));
  try {
    const frames = times.map((time, i) => {
      const name = `preview-extract-${String(i).padStart(3, '0')}.png`, dest = path.join(stage, name);
      const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(time), '-i', previewMp4, '-frames:v', '1', dest], { encoding: 'utf8' });
      if (r.status !== 0 || !fs.existsSync(dest) || fs.statSync(dest).size < 32) throw new Error(`preview stills: extraction failed at ${time}s`);
      return { name, hash: fileSha(dest) };
    });
    if (fileSha(previewMp4) !== sourceHash) throw new Error('preview stills: source changed during extraction');
    const stagedContact = path.join(stage, 'contact.png');
    const contactResult = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...frames.slice(0, 3).flatMap((frame) => ['-i', path.join(stage, frame.name)]), '-filter_complex', '[0:v]scale=480:-1[a];[1:v]scale=480:-1[b];[2:v]scale=480:-1[c];[a][b][c]hstack=inputs=3[v]', '-map', '[v]', '-frames:v', '1', stagedContact], { encoding: 'utf8' });
    for (const frame of frames) fs.renameSync(path.join(stage, frame.name), path.join(stillsDir, frame.name));
    const files = frames.map((frame) => path.join(stillsDir, frame.name));
    const contact = contactResult.status === 0 && fs.existsSync(stagedContact) ? 'preview-contact.png' : null;
    if (contact) fs.renameSync(stagedContact, path.join(outDir, contact));
    writePreviewStillsManifest(outDir, files, { source: 'ffmpeg-preview', sourceHash, duration, times, frames, contact });
    return files;
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
}

/**
 * Session/morph delivery: preview.mp4 must exist and (when bindMorphHash) sidecar morphHash must match current morph.
 * Pure + fs: pass outDir (…/out/chapters/<id>) and morph code string.
 * G2: stills-before-preview (gateProfile-aware). Soft (rough-cut) messages go to optional `soft` array.
 */
export function previewBindPath(outDir) {
  return path.join(outDir, 'preview.bind.json');
}

export function writePreviewBind(outDir, morphCode, extra = {}) {
  const morphHash = sha(morphCode);
  const body = {
    contract: 'A1PreviewBind/v1',
    morphHash,
    at: new Date().toISOString(),
    ...extra,
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(previewBindPath(outDir), JSON.stringify(body, null, 1) + '\n');
  return body;
}

export function previewDeliveryErrors({
  outDir = null, morphCode = '', delivery = null, previewName = 'preview.mp4',
  gateProfile = null, contract = null, soft = null,
} = {}) {
  const e = [];
  const need = delivery?.previewMp4 === true || delivery?.bindMorphHash === true
    || (typeof delivery?.previewMp4 === 'string' && String(delivery.previewMp4).trim().length > 0)
    || delivery?.stillsBeforePreview === true;
  if (!need) return e;
  if (!outDir) {
    e.push(`${PREVIEW_DELIVERY}: ${MOTION_UNEATEN} (delivery.previewMp4 set but outDir missing)`);
    return e;
  }
  const mp4 = path.join(outDir, previewName);
  if (delivery?.previewMp4 !== false && (delivery?.previewMp4 || delivery?.bindMorphHash)) {
    if (!fs.existsSync(mp4) || fs.statSync(mp4).size < 32) {
      e.push(`${PREVIEW_DELIVERY}.previewMp4: ${MOTION_UNEATEN} (missing or empty ${previewName})`);
    }
  }
  if (delivery?.bindMorphHash) {
    const bind = readJson(previewBindPath(outDir), null);
    const want = sha(morphCode);
    if (!bind?.morphHash) {
      e.push(`${PREVIEW_DELIVERY}.bindMorphHash: ${MOTION_UNEATEN} (no preview.bind.json morphHash)`);
    } else if (String(bind.morphHash) !== want) {
      e.push(`${PREVIEW_DELIVERY}.bindMorphHash: ${MOTION_UNEATEN} (bind ${bind.morphHash} ≠ morph ${want})`);
    }
  }
  const profile = gateProfile || resolveGateProfile(contract || { delivery, gateProfile: delivery?.gateProfile });
  const stillsMode = resolveStillsBeforePreview(delivery, profile);
  if (stillsMode !== 'off') {
    const issues = previewPreflightErrors(outDir, morphCode, readJson(previewBindPath(outDir), null));
    for (const issue of issues) {
      const msg = `${PREVIEW_DELIVERY}.${STILLS_BEFORE_PREVIEW}: ${issue} (gateProfile=${profile}); post-preview extraction does not count`;
      if (stillsMode === 'hard') e.push(msg);
      else if (Array.isArray(soft)) soft.push(msg);
    }
  }
  return e;
}

export function buildChapterMotionContract({
  chapter, project = null, greyboxRows = [], prevOut = null, sessionMd = null,
  motif = null, delivery = null, filmDesign = null,
} = {}) {
  const base = buildShotMotionContractFromGreybox({
    chapter, project, rows: greyboxRows, prevOut, source: 'greybox', motif, delivery,
  });
  const table = sessionMd ? parseSessionBriefShotTable(sessionMd) : [];
  let merged = table.length ? mergeShotMotionContract(base, table) : base;
  // Apply poseFrom from session prose onto first shot when greybox lacked camera.from
  if (sessionMd && merged.shots?.[0] && !merged.shots[0].seam?.poseFrom) {
    const pose = parsePoseFromSessionMd(sessionMd);
    if (pose) {
      merged = {
        ...merged,
        shots: merged.shots.map((s, i) => (i === 0 ? { ...s, seam: { ...s.seam, poseFrom: pose } } : s)),
      };
    }
  }
  if (motif && !merged.motif) merged = { ...merged, motif };
  if (delivery && !merged.delivery) merged = { ...merged, delivery };
  // New designs opt in through their shared rules. Never invent start/end semantics
  // from camera keywords or retroactively require them of approved historical designs.
  if (filmDesign?.motionRules || filmDesign?.beats?.some(b => b.productionRisk === 'high' || b.activeRevision === true)) {
    const byBeat = new Map((filmDesign.beats || []).map((b) => [b.beat, b.directorIntent]));
    merged = { ...merged, motionRules: structuredClone(filmDesign.motionRules), shots: merged.shots.map((s) => ({ ...s, directorIntent: structuredClone(byBeat.get(s.shotId) || null) })) };
  }
  return merged;
}

export { sha as morphHashOf };
