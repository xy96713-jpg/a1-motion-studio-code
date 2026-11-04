import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import {buildTypographySequenceLedger, buildWholeFilmTypographyDutyMap} from "../apps/studio-next/src/lib/a1-whole-film-typography-duty-map-v1.mjs";

const workspacePath = new URL("../apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json", import.meta.url);
const directorPath = new URL("../apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-director-input.json", import.meta.url);
const rawWorkspace = fs.readFileSync(workspacePath);
const rawDirector = fs.readFileSync(directorPath);
const workspace = JSON.parse(rawWorkspace);
const director = JSON.parse(rawDirector);
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const map = buildWholeFilmTypographyDutyMap({
  shots: director.plan.shots,
  v1Assignments: workspace.typographySystem.shotAssignments,
  sourceWorkspaceSha256: workspace.workspaceSha256,
  sourceWorkspaceFileSha256: sha(rawWorkspace),
  sourceDirectorInputSha256: sha(rawDirector),
});
assert.equal(map.status, "READY_FOR_USER_REVIEW");
assert.equal(map.assignments.length, 34);
assert.equal(new Set(map.assignments.map((item) => item.shotId)).size, 34);
assert.equal(map.sequenceLedger.status, "PASS_REVIEW_ONLY");
assert.equal(map.summary.sequenceRiskCount, 0);
assert.ok(map.summary.noTypeCount >= 3);
assert.ok(map.summary.sourceNativeCount >= 10);
assert.ok(map.summary.heroEventCount <= 4);
assert.ok(map.assignments.filter((item) => item.typographyRole === "SOURCE_NATIVE").every((item) => item.figmaBinding === null && item.exactCopy === item.displayCopy));
assert.ok(map.assignments.filter((item) => item.masterFamily).every((item) => item.motionPlan?.readableHold?.start === 0.48 && item.motionPlan?.readableHold?.end === 0.82));
assert.equal(map.migration.formalWorkspaceWritten, false);
assert.equal(map.migration.formalBoardWritten, false);
assert.throws(() => buildWholeFilmTypographyDutyMap({shots: director.plan.shots.slice(1), v1Assignments: workspace.typographySystem.shotAssignments}), /count-mismatch/);
const duplicateShots = director.plan.shots.map((shot) => ({...shot})); duplicateShots[1].shotId = duplicateShots[0].shotId;
assert.throws(() => buildWholeFilmTypographyDutyMap({shots: duplicateShots, v1Assignments: workspace.typographySystem.shotAssignments}), /shot-id-invalid/);
const synthetic = Array.from({length: 6}, (_, index) => ({shotId: `T-${index}`, typographyRole: index < 2 ? "FULLSCREEN_HERO" : "NO_TYPE", carrier: index < 2 ? "FULL_FRAME_TAKEOVER" : "NONE", masterFamily: index < 2 ? "FULLSCREEN_CHAPTER_HERO" : null, motionPlan: index < 2 ? {handoffFromPrevious: "X", handoffToNext: "Y"} : null}));
assert.equal(buildTypographySequenceLedger(synthetic).status, "BLOCK");

const carrierShots=[
  {shotId:"carrier-presenter-hero",editMode:"presenter-overlay",carrierType:"PRESENTER",typeIntent:"MASKED_HERO",importance:.92,sourceText:"不是不能写，而是先做判断",visualJob:"口播中的关键判断反转"},
  {shotId:"carrier-screen-demo",editMode:"screen-demo",carrierType:"SCREEN_RECORDING",typeIntent:"HERO",sourceText:"划一下就能改",visualJob:"真实界面操作结果"},
  {shotId:"carrier-pen-detail",carrierType:"OBJECT_DETAIL",typeIntent:"LABEL",sourceText:"笔尖刻度",visualJob:"钢笔刻度旁的物件标注"},
  {shotId:"carrier-presenter-quiet",editMode:"presenter-overlay",carrierType:"PRESENTER",typeIntent:"AUTO",sourceText:"普通口播解释一句话",visualJob:"普通解释"},
];
const carrierMap=buildWholeFilmTypographyDutyMap({
  shots:carrierShots,
  v1Assignments:carrierShots.map((shot)=>({contract:"A1TypographyAssignment/v1",treatmentMode:"none",pixelDuty:"NONE",headlineText:shot.sourceText})),
  sourceWorkspaceSha256:"carrier-test",sourceWorkspaceFileSha256:"carrier-test",sourceDirectorInputSha256:"carrier-test",
});
const carrierRoles=Object.fromEntries(carrierMap.assignments.map((item)=>[item.shotId,item.typographyRole]));
assert.equal(carrierRoles["carrier-presenter-hero"],"PRESENTER_HERO");
assert.equal(carrierRoles["carrier-screen-demo"],"SOURCE_NATIVE");
assert.equal(carrierRoles["carrier-pen-detail"],"OBJECT_ATTACHED_LABEL");
assert.equal(carrierRoles["carrier-presenter-quiet"],"NO_TYPE");
console.log("whole-film-typography-duty-map-v1:PASS");
