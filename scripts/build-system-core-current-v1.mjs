#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertSystemLineLifecycle, deriveSystemLineLifecycle} from "../apps/studio-next/src/lib/a1-system-line-lifecycle-v1.mjs";
import {assertProjectWriterLease} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
assertProjectWriterLease(path.join(root, "apps/studio-next"));
const progressRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const phasePath = path.join(progressRoot, "current-phase.json");
const auditPath = path.join(progressRoot, "system-line-current-authority-v2/audit-report.json");
const summaryPath = path.join(progressRoot, "editorial-asset-workbench-v1/shot-motion-review-v1/current-summary.json");
const staticBoardPath = path.join(progressRoot, "editorial-asset-workbench-v1/whole-film-static-board-v1/board-manifest.json");
const artifactPath = path.join(progressRoot, "system-core-v1/current.json");
const publicPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/system-core-v1/current.json");
const reportRoot = path.join(root, "work/system-core-convergence-v1");
const readText = (file) => fs.readFileSync(file, "utf8");
const readJson = (file) => JSON.parse(readText(file));
const fileSha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const atomicWrite = (file, bytes) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, file);
};

const phase = readJson(phasePath);
const audit = readJson(auditPath);
const shotReview = readJson(summaryPath);
const staticBoard = fs.existsSync(staticBoardPath) ? readJson(staticBoardPath) : null;
const lifecycle = assertSystemLineLifecycle(deriveSystemLineLifecycle({phase, audit, shotReview, staticBoard}));
const source = {
  workspaceSha256: lifecycle.source.workspaceSha256,
  phase: {path: path.relative(root, phasePath), sha256: fileSha256(phasePath), bytes: fs.statSync(phasePath).size},
  authority: {path: path.relative(root, auditPath), sha256: fileSha256(auditPath), bytes: fs.statSync(auditPath).size},
  shotReview: {path: path.relative(root, summaryPath), sha256: fileSha256(summaryPath), bytes: fs.statSync(summaryPath).size},
  staticBoard: staticBoard ? {path: path.relative(root, staticBoardPath), sha256: fileSha256(staticBoardPath), bytes: fs.statSync(staticBoardPath).size} : null,
};
const current = {...lifecycle, source: {...lifecycle.source, files: source}};
const bytes = `${JSON.stringify(current, null, 2)}\n`;
atomicWrite(artifactPath, bytes);
atomicWrite(publicPath, bytes);
const markdown = `# A1 Motion Studio current truth\n\n- Stage: **${current.stage.label}** (\`${current.stage.id}\`)\n- Status: \`${current.status}\`\n- Primary next action: **${current.nextAction.label}**\n- Ready user gates: **${current.readyUserGates.length}**\n- Available actions: **${current.availableActions.length}**\n- Motion allowed: \`${current.gates.motionAllowed}\`\n- Production admitted: \`${current.gates.productionAdmission}\`\n- Final render allowed: \`${current.gates.finalRenderAllowed}\`\n- Target shots: ${current.nextAction.targetShotIds.length ? current.nextAction.targetShotIds.join(", ") : "none"}\n- Projection SHA: \`${current.projectionSha256}\`\n- Workspace SHA: \`${current.source.workspaceSha256}\`\n\nGenerated from exact current phase, authority audit, shot-review summary and optional current static-board manifest. This file is derived evidence; it does not grant approval or mutate production state.\n`;
atomicWrite(path.join(reportRoot, "CURRENT.md"), markdown);
console.log(JSON.stringify({status: "PASS", stage: current.stage.id, nextAction: current.nextAction.id, readyUserGateCount: current.readyUserGates.length, availableActionCount: current.availableActions.length, targetShotIds: current.nextAction.targetShotIds, bytes: Buffer.byteLength(bytes), filesRead: staticBoard ? 4 : 3, workspaceRead: false, mediaScan: false, artifactPath: path.relative(root, artifactPath), publicPath: path.relative(root, publicPath)}, null, 2));
