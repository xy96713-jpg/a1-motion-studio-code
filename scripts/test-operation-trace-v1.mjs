#!/usr/bin/env node

import assert from "node:assert/strict";
import {buildInteractionTraceFromBrowserReplay, buildInteractionTraceFromVideoEvidence, buildOperationBriefFromShot, buildScreenPerformanceIrFromTrace, assertInteractionTrace} from "../apps/studio-next/src/lib/a1-operation-trace-v1.mjs";

const shot = {
  shotId: "NEW-ARTICLE-01",
  editMode: "screen-demo",
  sourceText: "展示一个全新的网页产品如何从输入走到结果。",
  narrativeJob: "demonstrate-causality",
  visualJob: "让真实操作成为论证，而不是装饰",
  primaryActor: "real-web-product",
  viewerTakeaway: "结果必须回到同一真实界面并可读",
  screenActions: ["打开真实页面并定位输入区域", "输入并提交操作", "确认真实结果回到同一页面"],
};
const source = {
  id: "real-new-product-recording",
  videoEvidence: {
    contract: "A1RealVideoCapture/v1",
    publicUrl: "/generated/example/new-product.mp4",
    sha256: "source-hash",
    durationSeconds: 6,
    evidenceBoundary: "user-provided real recording",
    evidenceFrames: [
      {beat: "opened", publicUrl: "/generated/example/opened.png", focusRegion: {x: .1, y: .2, width: .3, height: .2}},
      {beat: "submitted", publicUrl: "/generated/example/submitted.png", focusRegion: {x: .2, y: .3, width: .4, height: .2}},
      {beat: "result", publicUrl: "/generated/example/result.png", focusRegion: {x: .3, y: .35, width: .45, height: .25}},
    ],
  },
  provenance: {sourceType: "user-owned-real-recording"},
};
const brief = buildOperationBriefFromShot(shot, {projectId: "new-article-project"});
assert.equal(brief.contract, "A1OperationBrief/v1");
const trace = buildInteractionTraceFromVideoEvidence({projectId: "new-article-project", shot, asset: source});
assertInteractionTrace(trace);
assert.equal(trace.contract, "A1InteractionTrace/v1");
assert.equal(trace.events.length, 3);
assert.equal(trace.events[0].eventType, "focus");
assert.equal(trace.events[1].eventType, "submit");
assert.equal(trace.events[2].eventType, "result-commit");
assert.equal(trace.source.replayable, false);
const replaySource = {
  ...source,
  videoEvidence: {
    ...source.videoEvidence,
    evidenceFrames: [
      source.videoEvidence.evidenceFrames[0],
      source.videoEvidence.evidenceFrames[1],
      {beat: "candidate-pressed", publicUrl: "/generated/example/candidate-pressed.png", focusRegion: {x: .68, y: .48, width: .12, height: .08}},
      {beat: "typing", publicUrl: "/generated/example/typing.png", focusRegion: {x: .3, y: .35, width: .45, height: .25}},
      source.videoEvidence.evidenceFrames[2],
    ],
  },
};
const replay = buildInteractionTraceFromBrowserReplay({projectId: "new-article-project", shot, asset: replaySource, replay: {
  contract: "A1BrowserReplayExecution/v1",
  adapterId: "browser-replay",
  status: "executed",
  replayable: true,
  sourceUrl: "http://127.0.0.1:8766/v2/",
  sourceSha256: "draft-hash",
  setup: {documentRoute: "POST /api/document", documentIdStrategy: "temporary-clone"},
  selectors: {editor: "#editor", invokeAction: "#selectionMenu [data-run]"},
  events: [
    {eventType: "drag", locator: {selector: "#editor", strategy: "visible-pointer-native-drag-selection", text: "打开真实页面并定位输入区域"}, performance: {pointerVisible: true, action: "native-drag-selection"}, region: {x: .1, y: .2, width: .3, height: .2}},
    {eventType: "submit", locator: {selector: "#selectionMenu [data-run]", strategy: "visible-pointer-click"}, performance: {pointerVisible: true, action: "source-control-click"}, region: {x: .2, y: .3, width: .4, height: .2}},
    {eventType: "click", locator: {selector: "#candidateList [data-accept]", strategy: "visible-pointer-pressed-choice"}, performance: {pointerVisible: true, action: "candidate-button-press"}, region: {x: .68, y: .48, width: .12, height: .08}},
    {eventType: "type", locator: {selector: "#editor", strategy: "visible-pointer-return-then-contenteditable-input"}, performance: {pointerVisible: true, action: "contenteditable-input-event-typing", characterCount: 18, visibleCaret: true}, region: {x: .3, y: .35, width: .45, height: .25}},
    {eventType: "result-commit", locator: {selector: "#editor .accepted-change", strategy: "source-bound-accepted-change-hold"}, performance: {pointerVisible: true, action: "accepted-change-and-caret-hold", visibleCaret: true}, region: {x: .3, y: .35, width: .45, height: .25}},
  ],
}});
assertInteractionTrace(replay);
assert.equal(replay.source.adapterId, "browser-replay");
assert.equal(replay.source.replayable, true);
assert.equal(replay.replayPlan.selectorDataPresent, true);
const performance = buildScreenPerformanceIrFromTrace(trace);
assert.equal(performance.contract, "A1ScreenPerformanceIR/v1");
assert.equal(performance.camera.length, 3);
assert.equal(performance.emphasis.every((beat) => beat.region), true);
const replayPerformance = buildScreenPerformanceIrFromTrace(replay);
assert.equal(replay.events.length, 5);
assert.deepEqual(replay.events.map((event) => event.eventType), ["drag", "submit", "click", "type", "result-commit"]);
assert.equal(replayPerformance.pointer.length, 5);
assert.equal(replayPerformance.textInput.length, 1);
assert.equal(replayPerformance.textInput[0].characterCount, 18);
assert.equal(replayPerformance.camera.length, 5);
assert.equal(replayPerformance.camera[2].toScale > replayPerformance.camera[1].toScale, true);
assert.equal(replayPerformance.camera[2].toScale < replayPerformance.camera[3].toScale, true);
assert.equal(replayPerformance.camera[3].fromScale, replayPerformance.camera[2].toScale);
assert.throws(() => buildInteractionTraceFromVideoEvidence({projectId: "bad", shot, asset: {...source, videoEvidence: {...source.videoEvidence, evidenceFrames: [{beat: "bad", publicUrl: "/bad.png", focusRegion: {x: 1, y: 1, width: 0, height: 0}}]}}}), /at-least-two-source-frames/);
console.log(JSON.stringify({status: "PASS", contract: "A1InteractionTrace/v1", crossArticleFixture: true, eventCount: trace.events.length, browserReplayEventCount: replay.events.length, performanceBeats: performance.camera.length}, null, 2));
