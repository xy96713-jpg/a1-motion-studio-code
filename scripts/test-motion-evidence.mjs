import assert from 'node:assert/strict';
import { motionContractUneatenErrors, motionRuntimeEvidence, inferSubjectMotion, mergeShotMotionContract, parseSessionBriefShotTable, firstFrameReadErrors } from '../apps/studio-next/src/lib/recipe-board/shotmotion.mjs';
import { motionEvidenceSignature, holdErrors, cueTimingErrors } from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
import { voiceCueSchedule } from '../apps/studio-next/src/lib/recipe-board/voice.mjs';
import { defaultScreenPush } from '../apps/studio-next/src/lib/recipe-board/motion.mjs';

const contract = { shots: [
  { shotId: 'B01', camera: { move: 'push' }, subjectMotion: 'stagger', seam: { out: 'cut' } },
  { shotId: 'B02', camera: { move: 'push' }, subjectMotion: 'stagger', seam: { out: 'cut' } },
] };
const shots = [{ shotId: 'B01', at: 0, dur: 2 }, { shotId: 'B02', at: 2, dur: 2 }];
const fake = "export const label = 'push stagger flash';";
assert.deepEqual(motionContractUneatenErrors(fake, contract), [], 'a keyword match alone is not runtime proof');
const track = Array.from({ length: 20 }, (_, i) => ({ t: i / 5, camera: { flat: { x: 0, y: 0, s: i < 10 ? 1 + i / 100 : 1.1 }, world: null }, drawn: [], shapes: [] }));
const curve = Array.from({ length: 20 }, (_, i) => ({ t: i / 5, d: i < 10 ? 4 : 0 }));
const result = motionRuntimeEvidence(contract, shots, { track, curve });
assert.equal(result.rows[0].camera, 'observed');
assert.equal(result.rows[1].camera, 'not-observed', 'motion in B01 cannot satisfy B02');
assert.ok(result.errors.some((e) => /B02.*camera push/.test(e)));
assert.ok(result.errors.some((e) => /B02.*subject motion has no camera-independent actor evidence/.test(e)));
assert.ok(result.errors.some((e) => /B01.*subject motion has no camera-independent actor evidence/.test(e)), 'a camera push and changing pixels are not subject motion');
assert.equal(result.rows[0].visibleChange, 'observed', 'frame change remains useful auxiliary evidence');
assert.equal(result.rows[0].subjectMotion, 'unverified');
const actorTrack = [
  { t: 0, id: 'hero', state: { openness: 0 } },
  { t: 0.5, id: 'hero', state: { openness: 0.5 } },
  { t: 1, id: 'hero', state: { openness: 1 } },
];
const actorResult = motionRuntimeEvidence({ shots: [{ ...contract.shots[0], subject: { id: 'hero' } }] }, shots, { track, curve, actorTrack });
assert.equal(actorResult.rows[0].subjectMotion, 'observed');
assert.ok(!actorResult.errors.some((e) => /B01.*subject motion/.test(e)));
const wrongActor = motionRuntimeEvidence({ shots: [{ ...contract.shots[0], subject: { id: 'hero' } }] }, shots, { track, curve, actorTrack: actorTrack.map((x) => ({ ...x, id: 'other' })) });
assert.ok(wrongActor.errors.some((e) => /B01.*subject motion/.test(e)), 'another actor cannot prove the hero changed');
const heroContract = { shots: [{ ...contract.shots[0], hero: { id: 'hero', stateFrom: { openness: 0 }, stateTo: { openness: 1 } } }] };
assert.ok(!motionRuntimeEvidence(heroContract, shots, { track, curve, actorTrack }).errors.some((e) => /hero state/.test(e)));
assert.ok(motionRuntimeEvidence(heroContract, shots, { track, curve, actorTrack: actorTrack.map((x, i) => i === 2 ? { ...x, state: { openness: 0.5 } } : x) }).errors.some((e) => /hero state endpoint/.test(e)), 'a generic change cannot satisfy different declared hero endpoints');
const arrayActorTrack = ['left', 'right'].flatMap((id, actorIndex) => actorTrack.map((row) => ({
  ...row,
  id,
  state: { openness: row.state.openness + actorIndex },
})));
const actorsContract = { shots: [{ ...contract.shots[0], actors: [
  { id: 'left', stateFrom: { openness: 0 }, stateTo: { openness: 1 } },
  { id: 'right', stateFrom: { openness: 1 }, stateTo: { openness: 2 } },
] }] };
const actorsResult = motionRuntimeEvidence(actorsContract, shots, { track, curve, actorTrack: arrayActorTrack });
assert.equal(actorsResult.rows[0].subjectMotion, 'observed', 'every declared array actor changed to its own endpoint');
assert.ok(!actorsResult.errors.some((e) => /actor/.test(e)));
const oneArrayActor = motionRuntimeEvidence(actorsContract, shots, { track, curve, actorTrack: arrayActorTrack.filter((row) => row.id === 'left') });
assert.ok(oneArrayActor.errors.some((e) => /B01.*actor right/.test(e)), 'an array cannot be proved by only one declared instance');
const frozenArrayActor = motionRuntimeEvidence(actorsContract, shots, { track, curve, actorTrack: arrayActorTrack.map((row) => row.id === 'right' ? { ...row, state: { openness: 1 } } : row) });
const mixedStaticContract = { shots: [{ ...contract.shots[0], actors: [
  { id: 'left', stateFrom: { openness: 0 }, stateTo: { openness: 1 } },
  { id: 'right', stateFrom: { openness: 1 }, stateTo: { openness: 1 }, static: true },
] }] };
const mixedStatic = motionRuntimeEvidence(mixedStaticContract, shots, { track, curve, actorTrack: arrayActorTrack.map((row) => row.id === 'right' ? { ...row, state: { openness: 1 } } : row) });
assert.equal(mixedStatic.rows[0].subjectMotion, 'observed', 'a declared static member may stand still while the moving member changes');
assert.ok(!mixedStatic.errors.some((e) => /actor/.test(e)), 'a static member is not a substitute or a frozen failure');
const allStaticContract = { shots: [{ ...contract.shots[0], actors: [
  { id: 'left', stateFrom: { openness: 0 }, stateTo: { openness: 0 }, static: true },
  { id: 'right', stateFrom: { openness: 1 }, stateTo: { openness: 1 }, static: true },
] }] };
const allStatic = motionRuntimeEvidence(allStaticContract, shots, { track, curve, actorTrack: arrayActorTrack.map((row) => ({ ...row, state: { openness: row.id === 'left' ? 0 : 1 } })) });
assert.equal(allStatic.rows[0].subjectMotion, 'none', 'an all-static declared array proves no subject motion');
assert.ok(!allStatic.errors.some((e) => /actor/.test(e)));

assert.ok(frozenArrayActor.errors.some((e) => /B01.*actor right/.test(e)), 'a present but frozen declared actor cannot be carried by another moving instance');
const substituteActor = motionRuntimeEvidence(actorsContract, shots, { track, curve, actorTrack: arrayActorTrack.map((row) => row.id === 'right' ? { ...row, id: 'other' } : row) });
assert.ok(substituteActor.errors.some((e) => /B01.*actor right/.test(e)), 'another moving actor cannot replace a declared array actor');
const wrongArrayEndpoint = motionRuntimeEvidence(actorsContract, shots, { track, curve, actorTrack: arrayActorTrack.map((row) => row.id === 'right' && row.t === 1 ? { ...row, state: { openness: 1.5 } } : row) });
assert.ok(wrongArrayEndpoint.errors.some((e) => /B01.*actor right.*endpoint/.test(e)), 'each array actor must match its own declared endpoint');
assert.match(motionRuntimeEvidence(contract, shots, {}).errors.join(), /runtime motion evidence unavailable/);
assert.match(motionRuntimeEvidence(contract, shots, { greyboxDiffer: { B01: '导演调整这个镜头的动作与节奏' } }).errors.join(), /B01.*runtime motion evidence unavailable/, 'a written deviation does not invent runtime proof');
assert.ok(motionRuntimeEvidence(contract, shots, { track, curve, greyboxDiffer: { B01: '导演调整这个镜头的动作与节奏' } }).warnings.some((e) => /B01.*declared deviation.*independent review/.test(e)));
const noFocus = track.map((x) => ({ ...x, camera: { flat: x.camera.flat, world: { position: [x.t, 0, 0], focus: null } } }));
const uncertain = motionRuntimeEvidence({ shots: [contract.shots[0]] }, shots, { track: noFocus, curve });
assert.equal(uncertain.rows[0].camera, 'unverified', 'unobserved 3D camera target must not be marked as a verified push');
const pushThenPull = [0, 0.4, 0.8, 1.2, 1.6].map((t, i) => ({ t, camera: { flat: { x: 0, y: 0, s: [1, 1.06, 1.1, 1.02, 0.95][i] }, world: null } }));
const reversed = motionRuntimeEvidence({ shots: [contract.shots[0]] }, shots, { track: pushThenPull, curve });
assert.equal(reversed.rows[0].camera, 'contradicted', 'a brief push followed by a net pull must not pass as a push');
assert.ok(reversed.rows[0].measured.flatPush > 0.09, 'the brief push remains recorded as evidence');
const settled = pushThenPull.map((row, i) => ({ ...row, camera: { ...row.camera, flat: { ...row.camera.flat, s: [1, 1.06, 1.1, 1.08, 1.05][i] } } }));
assert.equal(motionRuntimeEvidence({ shots: [contract.shots[0]] }, shots, { track: settled, curve }).rows[0].camera, 'observed', 'a small settle after a net push is allowed');
assert.equal(motionEvidenceSignature([{ shotId: 'B01', camera: 'observed', measured: { flatShift: 20.1 } }]), motionEvidenceSignature([{ shotId: 'B01', camera: 'observed', measured: { flatShift: 20.2 } }]), 'subpixel variation must not trigger another review');
assert.notEqual(motionEvidenceSignature([{ shotId: 'B01', camera: 'observed' }]), motionEvidenceSignature([{ shotId: 'B01', camera: 'not-observed' }]), 'a change in evidence state invalidates the old review');
assert.equal(inferSubjectMotion('镜头推近，主体保持静止', { cameraMove: 'push' }), 'none', 'a camera push must not invent subject motion');
const briefStatic = parseSessionBriefShotTable('| 拍 | 运动 | 字 | 材料 |\n| --- | --- | --- | --- |\n| B01 | 主体保持静止 | 标题 | 档案 |');
assert.equal(briefStatic[0].camera.move, 'static', 'an unknown/static brief must not default to a push');
assert.equal(briefStatic[0].subjectMotion, 'none');
const mergedStatic = mergeShotMotionContract({ chapter: 'C', shots: [{ shotId: 'B01', camera: { move: 'push' }, camMove: 'push', subjectMotion: 'subject-push', type: {}, seam: {} }] }, briefStatic);
assert.equal(mergedStatic.shots[0].camera.move, 'static', 'an explicit static brief must override the greybox push');
assert.equal(mergedStatic.shots[0].subjectMotion, 'none');
const stillCurve = Array.from({ length: 12 }, (_, i) => ({ t: 0.3 + i * 0.3, d: 0, s: 0, f: 1 }));
const stillShot = [{ shotId: 'B01', at: 0, dur: 4 }];
assert.ok(holdErrors(stillCurve, stillShot).errors.some((e) => /frozen/.test(e)), 'an undeclared frozen shot remains an error');
const deliberateStill = holdErrors(stillCurve, stillShot, { contracts: { B01: { camera: { move: 'static' }, subjectMotion: 'none' } } });
assert.ok(!deliberateStill.errors.some((e) => /frozen/.test(e)), 'an explicitly static shot must not be forced to drift');
assert.ok(!deliberateStill.warnings.some((e) => /nothing moves/.test(e)));
assert.equal(defaultScreenPush(4).scale, 1, 'a screen without an explicit reading focus stays locked instead of inventing Ken Burns motion');
const firstFrameSpec = { shotId: 'B01', firstFrame: { read: [{ actor: 'hero' }, { text: '当前信息' }] } };
const firstShot = { shotId: 'B01', at: 4, dur: 3 };
const firstTrack = [{ t: 4, drawn: [{ text: '当前信息', alpha: 1 }] }];
const firstActors = [{ t: 4, id: 'hero', state: { openness: 0 } }];
assert.deepEqual(firstFrameReadErrors(firstFrameSpec, firstShot, firstTrack, firstActors), []);
assert.match(firstFrameReadErrors(firstFrameSpec, firstShot, [], firstActors)[0], /当前信息/);
assert.match(firstFrameReadErrors(firstFrameSpec, firstShot, firstTrack, [])[0], /hero/);
assert.deepEqual(firstFrameReadErrors({ shotId: 'B01' }, firstShot, [], []), [], 'un declared black or empty openings are not banned');
const voiceWords = [
  { word: '现在', startMs: 10000, endMs: 10500 }, { word: '开始', startMs: 10500, endMs: 11000 }, { word: '测量', startMs: 11500, endMs: 12000 },
];
const voiceSchedule = voiceCueSchedule([{ shotId: 'B01', at: 10, dur: 4, text: '现在开始测量' }], { beats: { B01: { start: 10, end: 14 } } }, voiceWords);
assert.equal(voiceSchedule.B01.text, '现在开始测量');
assert.equal(voiceSchedule.B01.times[4], 11.5);
const voiceTrack = [{ t: 11.7, drawn: [{ text: '测量', size: 60, alpha: 1 }] }];
assert.deepEqual(cueTimingErrors(voiceTrack, [{ shotId: 'B01', at: 10, dur: 4, text: '现在开始测量' }], x => x, { schedule: voiceSchedule }), [], 'real ASR word time replaces character-proportional estimation');
assert.ok(cueTimingErrors(voiceTrack, [{ shotId: 'B01', at: 10, dur: 4, text: '现在开始测量' }]).length, 'the old estimate would have rejected this actual word alignment');
console.log('motion evidence: camera-only motion is not subject proof; actor state and explicit static contracts are enforced');
