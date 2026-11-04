// Screen camera bridge: compiles a shot's `screen.camera` block with the main line's pure camera
// compilers and samples the result once per output frame, so the browser runtime only replays poses.
//
//   screen: {
//     telemetry: 'projects/<id>/materials/screen/<shot>/telemetry.json',   // A1RecipeBoardScreenTelemetry/v1
//     camera: {
//       mode: 'follow' | 'grammar' | 'manual',
//       // follow  — compileDynamicScreenFollowCamera: critically damped spring over timed telemetry
//       //           targets. path: [{ target, at }] (times in s; the geometry comes from telemetry);
//       //           style: CURSOR_FOLLOW | SCROLL_FOLLOW | CARET_FOLLOW_LARGE.
//       // grammar — compileMatureScreenCameraGrammar: anchor-locked pushes / pans between verified
//       //           targets, ROI-safe, wide reset for far anchors, final return when there is time.
//       //           beats: [{ target, at, settle?, scale }] (settle defaults to at + 0.8 s).
//       // manual  — no telemetry (imported footage / screenshot): one push-in to a hand-picked point.
//       //           push: { at: [x, y], scale, start, end }. Never claims semantic following.
//     },
//   }
//
// Poses use the main-line convention: x/y is the crop centre in normalised source coordinates and
// scale >= 1 is the zoom, so a source point p lands at (p - centre) * scale + 0.5 on screen.
import fs from 'node:fs';
import { compileDynamicScreenFollowCamera } from '../a1-dynamic-screen-follow-camera-v1.mjs';
import { compileMatureScreenCameraGrammar } from '../a1-mature-screen-camera-grammar-v1.mjs';
import { deriveAnchorLockedPose } from '../a1-anchor-locked-screen-camera-v1.mjs';

export const SCREEN_TELEMETRY_CONTRACT = 'A1RecipeBoardScreenTelemetry/v1';
export const SCREEN_CAMERA_CONTRACT = 'A1RecipeBoardScreenCamera/v1';

// What a build may say about its camera. Only telemetry-backed modes may claim to follow anything.
const CLAIMS = { follow: 'TELEMETRY_TARGET_FOLLOW', grammar: 'TELEMETRY_ANCHOR_GRAMMAR', manual: 'MANUAL_PUSH_NO_SEMANTIC_FOLLOW' };

// cubic-bezier(x1, y1, x2, y2) easing, solved for x by Newton steps with a bisection fallback.
function bezier([x1, y1, x2, y2]) {
  const f = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  const df = (a, b, t) => 3 * a * (1 - t) ** 2 + 6 * (b - a) * t * (1 - t) + 3 * (1 - b) * t * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const d = df(x1, x2, t);
      if (Math.abs(d) < 1e-6) break;
      t -= (f(x1, x2, t) - x) / d;
    }
    if (!(t >= 0 && t <= 1) || Math.abs(f(x1, x2, t) - x) > 1e-5) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 40; i++) { t = (lo + hi) / 2; if (f(x1, x2, t) < x) lo = t; else hi = t; }
    }
    return f(y1, y2, t);
  };
}

export function loadTelemetry(file) {
  const t = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (t.contract !== SCREEN_TELEMETRY_CONTRACT) throw new Error(`${file}: not ${SCREEN_TELEMETRY_CONTRACT}`);
  return t;
}

const centre = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

function target(telemetry, name, shotId) {
  const r = telemetry.targets?.[name];
  if (!r) throw new Error(`${shotId}: screen target "${name}" is not in the telemetry (have: ${Object.keys(telemetry.targets || {}).join(', ')})`);
  return r;
}

// Grammar keyframes -> one pose per output frame. Holds stay put; moves keep their source anchor at a
// fixed screen position while scale eases in log space (deriveAnchorLockedPose at each eased scale).
function sampleGrammar(compiled, durationMs, fps) {
  const kf = compiled.cameraTrack;
  const curves = { 'cinematic-in-out': bezier(compiled.curveProfiles.pointToPoint.bezier), 'cinematic-return': bezier(compiled.curveProfiles.finalReturn.bezier) };
  const out = [];
  const n = Math.ceil((durationMs / 1000) * fps);
  for (let f = 0, k = 0; f <= n; f++) {
    const ms = Math.min(durationMs, (f / fps) * 1000);
    while (k < kf.length - 1 && kf[k + 1].atMs <= ms) k++;
    const a = kf[k];
    const b = kf[k + 1];
    if (!b || a.easingToNext === 'hold' || !a.anchorLockToNext) { out.push([a.x, a.y, a.scale]); continue; }
    const p = (curves[a.easingToNext] || ((x) => x))((ms - a.atMs) / (b.atMs - a.atMs));
    const scale = Math.exp(Math.log(a.scale) + (Math.log(b.scale) - Math.log(a.scale)) * p);
    const { pose } = deriveAnchorLockedPose({ fromPose: { x: a.x, y: a.y, scale: a.scale }, sourceAnchor: { x: a.anchorLockToNext.sourceX, y: a.anchorLockToNext.sourceY }, targetScale: Math.max(1, scale) });
    out.push([pose.x, pose.y, pose.scale]);
  }
  return out;
}

const round = (v) => Math.round(v * 1e5) / 1e5;

// The follow compiler logs a retarget on every frame the target sits outside the dead zone; the
// report keeps one entry per target with the window during which the camera was chasing it.
function retargets(decisions) {
  const out = [];
  for (const d of decisions) {
    const last = out.at(-1);
    if (last && last.x === d.x && last.y === d.y) last.untilMs = d.atMs;
    else out.push({ ...d, untilMs: d.atMs });
  }
  return out;
}

// Returns { claim, mode, fps, samples: [[x, y, scale] per frame], report } or throws with the
// compiler's failure codes. `telemetry` is null for manual mode.
export function compileScreenCamera({ shotId, duration, screen, telemetry, fps = 60 }) {
  const cam = screen?.camera;
  if (!cam) throw new Error(`${shotId}: screen.camera is required`);
  const mode = cam.mode;
  if (!CLAIMS[mode]) throw new Error(`${shotId}: screen.camera.mode must be follow | grammar | manual`);
  if (mode !== 'manual' && !telemetry) throw new Error(`${shotId}: ${mode} needs telemetry; imported footage without telemetry may only use mode "manual" (SOP: no semantic following without signals)`);
  if (mode === 'manual' && telemetry) throw new Error(`${shotId}: telemetry is present; use follow or grammar so the camera is bound to it`);
  const durationMs = Math.round(duration * 1000);
  const size = telemetry?.source || { width: 1920, height: 1080 };
  let compiled;
  let samples;
  if (mode === 'follow') {
    const targetSamples = (cam.path || []).map((p) => ({ atMs: p.at * 1000, ...centre(target(telemetry, p.target, shotId)), kind: telemetry.targets[p.target].kind || 'DOM_TARGET' }));
    compiled = compileDynamicScreenFollowCamera({ shotId, durationMs, targetSamples, mode: cam.style || 'CURSOR_FOLLOW', sourceWidth: size.width, sourceHeight: size.height, fps, deadZoneFraction: cam.deadZone });
    if (compiled.status !== 'PASS') throw new Error(`${shotId}: follow camera ${compiled.failures.join(', ')}`);
    samples = compiled.track.map((r) => [r.x, r.y, r.scale]);
  } else {
    let cameraTrack;
    let attentionTrack = [];
    if (mode === 'grammar') {
      const beats = cam.beats || [];
      cameraTrack = [{ atMs: 0, x: 0.5, y: 0.5, scale: 1, easingToNext: 'hold', beatId: 'wide' }];
      for (const [i, b] of beats.entries()) {
        const r = target(telemetry, b.target, shotId);
        const id = `${b.target}-${i}`;
        cameraTrack.push({ atMs: b.at * 1000, x: 0.5, y: 0.5, scale: 1, easingToNext: 'cinematic-in-out', beatId: `${id}-go` });
        // settle (when the push lands) defaults to 0.8 s after it starts, inside the shot.
        const settle = b.settle ?? Math.min(duration - 0.05, b.at + 0.8);
        cameraTrack.push({ atMs: settle * 1000, ...centre(r), scale: b.scale || 1.6, easingToNext: 'hold', beatId: id });
        attentionTrack.push({ beat: id, region: { x: r.x, y: r.y, width: r.width, height: r.height } });
      }
    } else {
      const p = cam.push || {};
      if (!Array.isArray(p.at) || !(p.scale > 1) || !(p.end > p.start)) throw new Error(`${shotId}: manual camera needs push: { at: [x, y], scale > 1, start, end > start }`);
      cameraTrack = [
        { atMs: 0, x: 0.5, y: 0.5, scale: 1, easingToNext: 'hold', beatId: 'wide' },
        { atMs: p.start * 1000, x: 0.5, y: 0.5, scale: 1, easingToNext: 'cinematic-in-out', beatId: 'push-go' },
        { atMs: p.end * 1000, x: p.at[0], y: p.at[1], scale: p.scale, easingToNext: 'hold', beatId: 'push' },
      ];
    }
    compiled = compileMatureScreenCameraGrammar({ durationMs, cameraTrack, attentionTrack, width: 1920, height: 1080, policy: cam.policy || {} });
    if (compiled.status !== 'PASS') throw new Error(`${shotId}: ${mode} camera ${compiled.failures.join(', ')}`);
    samples = sampleGrammar(compiled, durationMs, fps);
  }
  const report = {
    contract: SCREEN_CAMERA_CONTRACT,
    scope: 'RESEARCH_ONLY',
    shotId,
    mode,
    claim: CLAIMS[mode],
    compiler: compiled.contract,
    status: compiled.status,
    telemetry: telemetry ? { contract: telemetry.contract, url: telemetry.url, capturedAt: telemetry.capturedAt, imageSha256: telemetry.image?.sha256, timing: 'DIRECTED_CUES_OVER_CAPTURED_GEOMETRY' } : null,
    decisions: mode === 'follow' ? retargets(compiled.decisions) : compiled.decisions,
    performance: compiled.performance || compiled.summary,
    cameraProgramSha256: compiled.cameraProgramSha256 || null,
    productionAdmission: false,
  };
  return { claim: CLAIMS[mode], mode, fps, samples: samples.map((s) => s.map(round)), report };
}

// A read web page (a 读报 cut): where the sentence that matters sits on the bound reading window, from the
// capture (materials bindings, archive.window). The camera pushes there and the still shows that pose, so
// the line is readable instead of a whole page at thumbnail size. null when the slot is not such a window.
export const READ_SCALE = 1.8;
// the sentence fills about 72% of the frame width (up to 2.6x; a column-cut window needs none); without
// its boxes, the capture's own scale
export const readScale = (boxes, fallback = READ_SCALE) => {
  const w = Math.max(0, ...(boxes || []).map((b) => b[2]));
  return +(w ? Math.min(2.6, Math.max(1.0, 0.72 / w)) : Math.min(fallback || READ_SCALE, READ_SCALE)).toFixed(2);
};
export function readingFocus(bindings, shot, slot = 'screen') {
  // the read set up by the materials step (scene 0 is the still): its push and highlighted lines
  const first = shot.scenes?.length ? { ...shot, ...shot.scenes[0] } : shot;
  const push = first.screen?.camera?.mode === 'manual' ? first.screen.camera.push : null;
  if (push?.at && push.scale > 1.05) return { at: push.at, scale: readScale(first.cues?.highlight?.boxes, push.scale), boxes: first.cues?.highlight?.boxes || [] };
  const file = shot.slots?.[slot]?.asset;
  if (!file) return null;
  for (const [k, b] of Object.entries(bindings?.shots || {})) {
    const w = b?.archive?.window;
    if ((k === shot.shotId || k.startsWith(`${shot.shotId}~`)) && w?.file && w.file.split('/').pop() === file.split('/').pop() && Array.isArray(w.at)) {
      return { at: w.at, scale: readScale(w.boxes, w.scale), boxes: w.boxes || [] };
    }
  }
  return null;
}
// The frame at that pose, as a CSS transform on the slot (origin top left): the point centred, clamped so
// the page still covers the frame.
export function focusTransform({ at, scale }, W = 1920, H = 1080) {
  const c = (v) => Math.min(1 - 0.5 / scale, Math.max(0.5 / scale, v));
  return `transform-origin:0 0;transform:scale(${scale}) translate(${Math.round((0.5 / scale - c(at[0])) * W)}px,${Math.round((0.5 / scale - c(at[1])) * H)}px)`;
}
