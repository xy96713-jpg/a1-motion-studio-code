import assert from 'node:assert/strict';
import {auditCapExecutionReadback} from './lib/cap-execution-readback.mjs';
import {preflightCapRequest} from './lib/cap-request-preflight.mjs';
const config = {timeline: {segments: [{recordingSegment: 0, start: 0, end: 6, timescale: 1}], zoomSegments: [{start: 1, end: 4, amount: 1.2, mode: {manual: {x: .5, y: .6}}, glideSpeed: .4, edgeSnapRatio: .2, glideDirection: 'none', instantAnimation: false}]}, cursor: {hide: true, hideWhenIdle: true, ripple: {enabled: false}}};
assert.equal(auditCapExecutionReadback(config, structuredClone(config)).status, 'PASS');
const mutations = {
  lostTarget: c => c.timeline.zoomSegments[0].mode = 'auto',
  droppedMove: c => c.timeline.zoomSegments = [],
  extraMove: c => c.timeline.zoomSegments.push(structuredClone(c.timeline.zoomSegments[0])),
  wrongTiming: c => c.timeline.zoomSegments[0].start = .5,
  missingCoordinate: c => delete c.timeline.zoomSegments[0].mode.manual.x,
  changedScale: c => c.timeline.zoomSegments[0].amount = 1.08,
  unwantedRing: c => c.cursor.ripple.enabled = true,
  sourceRetimed: c => c.timeline.segments[0].timescale = 2,
};
for (const [name, mutate] of Object.entries(mutations)) {
  const candidate = structuredClone(config); mutate(candidate);
  assert.equal(auditCapExecutionReadback(config, candidate).status, 'FAIL', name);
}
console.log(JSON.stringify({status: 'PASS', scope: 'READBACK_FAULT_TEST_ONLY', detectedFaults: Object.keys(mutations)}, null, 2));
const request = {geometryTruth: {status: 'PASS_REVIEW_ONLY'}, captureSync: {method: 'PIXEL_MATCH', syncPass: true}, directorPlan: {beats: [{id: 'wide', technique: 'LOCK_WIDE'}]}};
assert.equal(preflightCapRequest(request).status, 'READY_FOR_PARAMETER_COMPILATION');
for (const technique of ['MENU_OPEN_FOLLOW', 'DRAG_PATH_FOLLOW', 'SCROLL_ANCHOR_FOLLOW', 'UNRECOGNIZED']) {
  const mutated = structuredClone(request); mutated.directorPlan.beats[0].technique = technique;
  assert.equal(preflightCapRequest(mutated).status, 'BLOCKED', technique);
}
const missingSync = structuredClone(request); delete missingSync.captureSync.method;
assert.equal(preflightCapRequest(missingSync).status, 'BLOCKED');
console.log('Unsupported effect and missing synchronization requests are blocked before project creation.');
