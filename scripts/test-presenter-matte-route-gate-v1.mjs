#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {auditPresenterTakeoverContract, auditSubjectOcclusionGeometry} from "../apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const reportPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/golden-film-visual-system-maturity-v1/overlay-geometry-dry-run/geometry-capacity-dry-run.json");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "a1-presenter-matte-gate-"));
const candidate = path.join(tmp, "overlap.png");
const svg = `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect x="35" y="30" width="45" height="40" fill="#fff"/></svg>`;
fs.writeFileSync(candidate, await sharp(Buffer.from(svg)).png().toBuffer());

const layeredRaw = await auditSubjectOcclusionGeometry({
  candidateFile: candidate,
  subjectBounds: {x: .3, y: .3, width: .4, height: .4},
  faceBounds: {x: .4, y: .4, width: .1, height: .1},
  eyesBounds: {x: .4, y: .4, width: .1, height: .04},
  allowedRegionPolygon: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}, {x: 0, y: 1}],
  exclusionMask: [{id: "subject", bounds: {x: .3, y: .3, width: .4, height: .4}}],
  targetWidth: 100,
  targetHeight: 100,
  packagingMode: "BEHIND_SUBJECT_MATTE",
});
assert.equal(layeredRaw.status, "DEFERRED_TO_FINAL_LAYERED_COMPOSITE");
assert.equal(layeredRaw.exclusionMaskIntersection.status, "NOT_APPLICABLE_RAW_PACKAGE_BEHIND_MATTE");

const takeover = auditPresenterTakeoverContract({packagingMode: "TYPOGRAPHY_TAKEOVER", durationMs: 1600, narrativeValue: "短暂承接全片的结构化结论路径", entryPlan: "硬切入冷灰结构场景", exitPlan: "沿轨道切回真人画面"});
assert.equal(takeover.status, "PASS");
assert.equal(report.shots.every((shot) => shot.modeAudit.status === "PASS"), true);
assert.equal(report.shots.filter((shot) => shot.route.rawPackageMayIntersectSubjectBbox).length, 2);
assert.equal(report.shots.filter((shot) => ["SHORT_FULLSCREEN_TAKEOVER", "SHORT_EXPLAINER_TAKEOVER", "TYPOGRAPHY_TAKEOVER"].includes(shot.mode)).length, 4);
console.log(JSON.stringify({status: "PASS", rawOverlap: layeredRaw.status, takeover: takeover.status, layeredShots: 2, takeoverShots: 4}, null, 2));
