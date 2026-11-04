#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
import {hashScreenPackagingAssistValueV2, sha256ScreenPackagingAssistTextV2} from "../apps/studio-next/src/lib/a1-screen-packaging-assist-schema-v2.mjs";
import {buildSystemLineResearchTaskViewV1} from "../apps/studio-next/src/lib/a1-system-line-task-view-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const fixtures = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/src/data/test-fixtures/a1-six-unseen-articles-v1.json"), "utf8"));
assert.equal(sha256ScreenPackagingAssistTextV2("abc"), sha("abc"));
const baseline = JSON.parse(fs.readFileSync(path.join(root, "work/system-line-task-view-v1/baseline.json"), "utf8"));
assert.equal(baseline.status, "BASELINE_GAP_REPRODUCED");
assert.equal(baseline.visibleRequiredFields.length, 0);

const configs = [
  {current: "director", intakeStatus: "PROJECT_DIRECTOR_PENDING"},
  {current: "director", intakeStatus: "AI_DIRECTOR_RUNNING", directorStatus: "running"},
  {current: "director", intakeStatus: "PROJECT_DIRECTOR_COMPLETED", directorStatus: "completed", omitPlanSha: true},
  {current: "assets", intakeStatus: "PROJECT_ASSET_MATERIALIZATION_BLOCKED", directorStatus: "completed", visualBibleStatus: "approved", assetStatus: "ASSET_MATERIALIZATION_BLOCKED", materialBlocker: "VERIFIED_SOURCE_OUTPUT_NOT_BOUND"},
  {current: "scene-graph", intakeStatus: "PROJECT_SHOT_CANDIDATE_REVIEW_REQUIRED", directorStatus: "completed", visualBibleStatus: "approved", assetStatus: "ASSET_PACK_APPROVED_SCENE_GRAPH_READY", sceneStatus: "SHOT_CANDIDATE_REVIEW_REQUIRED", visualReview: "pending"},
  {current: "review-540p", intakeStatus: "PROJECT_540P_READY_FOR_FINAL_DECISION", directorStatus: "completed", visualBibleStatus: "approved", assetStatus: "ASSET_PACK_APPROVED_SCENE_GRAPH_READY", sceneStatus: "ALL_SHOTS_APPROVED_ACCEPTED_IR_READY", acceptedShotIrStatus: "compiled-review-only", motionStatus: "complete", visualQualityStatus: "passed", review540pStatus: "ready-for-final-decision", visualReview: "pending"},
];
const rows = [];
const created = [];
for (let index = 0; index < fixtures.articles.length; index += 1) {
  const article = fixtures.articles[index];
  const config = configs[index];
  const projectId = `task-${article.id}`;
  const articleSha = sha(`${article.id}-article`), intakeSha = sha(`${article.id}-intake`), planSha = sha(`${article.id}-plan`), bibleSha = sha(`${article.id}-visual-bible`), assetSha = sha(`${article.id}-assets`), sceneSha = sha(`${article.id}-scene`), reportSha = sha(`${article.id}-report`), filmSha = sha(`${article.id}-film`);
  const shotId = `${article.id}-ED-01`;
  const materialId = `source-${article.id}`;
  const intake = {projectId, title: article.title, publicUrl: `/generated/projects/${projectId}/intake.json`, sha256: intakeSha, status: config.intakeStatus, cueCount: 8, durationMs: 12000,
    directorStatus: config.directorStatus || "pending", directorPlanPublicUrl: config.directorStatus ? `/generated/projects/${projectId}/director-plan.json` : null, planSha256: config.directorStatus && !config.omitPlanSha ? planSha : null,
    visualBibleStatus: config.visualBibleStatus || "pending", visualBiblePublicUrl: config.visualBibleStatus ? `/generated/projects/${projectId}/visual-bible.json` : null, visualBibleSha256: config.visualBibleStatus ? bibleSha : null,
    assetWorkspaceStatus: config.assetStatus || null, assetWorkspacePublicUrl: config.assetStatus ? `/generated/projects/${projectId}/project-asset-workspace.json` : null, assetWorkspaceSha256: config.assetStatus ? assetSha : null,
    sceneGraphWorkspaceStatus: config.sceneStatus || null, sceneGraphWorkspacePublicUrl: config.sceneStatus ? `/generated/projects/${projectId}/project-scene-graph-workspace.json` : null, sceneGraphWorkspaceSha256: config.sceneStatus ? sceneSha : null,
    acceptedShotIrStatus: config.acceptedShotIrStatus || null, acceptedShotIrPublicUrl: config.acceptedShotIrStatus ? `/generated/projects/${projectId}/accepted-shot-ir-v2.json` : null, acceptedShotIrSha256: config.acceptedShotIrStatus ? sha(`${article.id}-accepted-ir`) : null,
    motionStatus: config.motionStatus || null, motionIrPublicUrl: config.motionStatus ? `/generated/projects/${projectId}/motion-ir-v2.json` : null, motionIrSha256: config.motionStatus ? sha(`${article.id}-motion-ir`) : null,
    visualQualityStatus: config.visualQualityStatus || null, visualQualityReportPublicUrl: config.visualQualityStatus ? `/generated/projects/${projectId}/visual-quality.json` : null, visualQualityReportSha256: config.visualQualityStatus ? reportSha : null,
    review540pStatus: config.review540pStatus || null, review540pPublicUrl: config.review540pStatus ? `/generated/projects/${projectId}/review-540p.mp4` : null, review540pSha256: config.review540pStatus ? filmSha : null};
  const directorPlan = config.directorStatus ? {contract: "A1WholeFilmAiDirectorPlan/v1", sha256: planSha, source: {articleSha256: articleSha}, shots: [{shotId, order: 1, chapterId: "C01", cueIds: [1], sourceText: article.shots[0], editWindow: {startMs: 0, endMs: 3000}}]} : null;
  const visualBiblePack = config.visualBibleStatus ? {projectId, sha256: bibleSha, source: {articleSha256: articleSha}, shotBlueprints: [{shotId, order: 1, chapterId: "C01", cueIds: [1], sourceText: article.shots[0], editWindow: {startMs: 0, endMs: 3000}, materialRequirements: [{id: materialId, duty: "verified-source"}]}]} : null;
  const assetWorkspace = config.assetStatus ? {projectId, sha256: assetSha, nextAction: "绑定并审核真实来源", assets: [{id: materialId, name: materialId, output: {publicUrl: `/generated/projects/${projectId}/${materialId}.png`, sha256: sha(`${article.id}-source`), width: 640, height: 360}, binding: {publicUrl: `/generated/projects/${projectId}/${materialId}.png`, sha256: sha(`${article.id}-source`), status: "bound"}, outputReview: {status: "approved"}}],
    materializationPlan: {records: [{materialId, duty: "verified-source", usedByShotIds: [shotId], sourceEvidenceIds: [], status: config.materialBlocker ? "BLOCKED" : "READY_FOR_SCENE_GRAPH_BINDING", blockers: config.materialBlocker ? [config.materialBlocker] : [], payload: {publicUrl: `/generated/projects/${projectId}/${materialId}.png`, sha256: sha(`${article.id}-source`)}}]}} : null;
  const sceneWorkspace = config.sceneStatus ? {projectId, sha256: sceneSha, gates: {acceptedShotIrCompilationAllowed: config.sceneStatus === "ALL_SHOTS_APPROVED_ACCEPTED_IR_READY"}, shots: [{shotId, candidates: [{candidateId: `${shotId}-D01-V1`, screening: {hardFailures: [], status: "keep-for-user-review"}}], review: {status: config.visualReview || "pending"}}]} : null;
  const taskView = buildSystemLineResearchTaskViewV1({intake, directorPlan, visualBiblePack, assetWorkspace, sceneWorkspace});
  assert.equal(taskView.sha256, hashScreenPackagingAssistValueV2(Object.fromEntries(Object.entries(taskView).filter(([key]) => key !== "sha256"))));
  assert.equal(taskView.currentNode?.id, config.current, `${article.id}:current-node`);
  assert.deepEqual(taskView.nodes.map((node) => node.id), ["intake", "director", "visual-bible", "assets", "scene-graph", "accepted-ir", "motion-ir", "review-540p", "technical-review", "final-1080p"]);
  assert.deepEqual(taskView.nodes[1].dependsOn, ["intake"]);
  assert.deepEqual(taskView.nodes[4].dependsOn, ["assets"]);
  assert.equal(taskView.input.intake.sha256, intakeSha);
  assert.ok(taskView.input.intake.path);
  if (config.omitPlanSha) assert.equal(taskView.nodes.find((node) => node.id === "director").status, "BLOCKED");
  if (config.materialBlocker) assert.ok(taskView.blockers.includes(config.materialBlocker));
  if (config.sceneStatus) {
    assert.equal(taskView.shots.length, 1);
    assert.equal(taskView.shots[0].input.copy, article.shots[0]);
    assert.equal(taskView.shots[0].input.sha256, sha(article.shots[0]));
    assert.equal(taskView.shots[0].candidates.technicalAcceptance, "PASS");
    assert.equal(taskView.shots[0].candidates.visualReview, config.visualReview || "pending");
    assert.equal(taskView.shots[0].nodes[0].files[0].path, `/generated/projects/${projectId}/${materialId}.png`);
    assert.match(taskView.shots[0].nodes[0].files[0].sha256, /^[a-f0-9]{64}$/u);
  }
  if (config.visualQualityStatus) {
    assert.equal(taskView.technicalAcceptance.status, "passed");
    assert.equal(taskView.visualReview.status, "ready-for-final-decision");
  }
  assert.equal(taskView.productionAdmission, false);
  rows.push({id: article.id, genre: article.genre, status: "PASS", currentNode: taskView.currentNode?.id || null, projectStatus: taskView.status,
    inputSha256: taskView.input.intake.sha256, nodeCount: taskView.nodes.length, shotCount: taskView.shots.length,
    technicalAcceptance: taskView.technicalAcceptance.status, visualReview: taskView.visualReview.status, blockerCount: taskView.blockers.length,
    taskViewSha256: taskView.sha256, taskView});
  created.push(taskView);
}
const noProject = {contract: "A1SystemLineEmptyTaskView/v1", status: "EMPTY", projectCount: 0, productionAdmission: false};
assert.throws(() => buildSystemLineResearchTaskViewV1({}), /project-intake-required/u);
const shaMismatchWorkspace = {projectId: "sha-mismatch", sha256: sha("mismatch"), assets: [{id: "source", name: "source", binding: {sha256: "a".repeat(64)}, output: {sha256: "b".repeat(64), publicUrl: "/source.png"}}], materializationPlan: {records: [{materialId: "source", usedByShotIds: ["ED-01"], duty: "verified-source", status: "READY_FOR_SCENE_GRAPH_BINDING", payload: {outputSha256: "c".repeat(64), outputPublicUrl: "/source.png"}}]}};
const mismatch = buildSystemLineResearchTaskViewV1({intake: {projectId: "sha-mismatch", title: "sha mismatch", publicUrl: "/intake.json", sha256: sha("input")}, visualBiblePack: {source: {articleSha256: sha("article")}, shotBlueprints: [{shotId: "ED-01", sourceText: "输入", materialRequirements: []}]}, assetWorkspace: shaMismatchWorkspace});
assert.ok(mismatch.shots[0].blockers.includes("MATERIALIZATION_OUTPUT_SHA_MISMATCH"));

const W = 620, H = 360, G = 18, cols = 3;
const boardW = cols * W + (cols + 1) * G, boardH = 64 + 2 * (H + G) + G;
const cards = rows.map((row, index) => {
  const task = row.taskView, x = G + (index % cols) * (W + G), y = 64 + G + Math.floor(index / cols) * (H + G);
  const stages = task.nodes.map((node) => `${node.label} · ${node.status}`).slice(0, 6);
  const stageLines = stages.map((line, i) => `<text x="20" y="${124 + i * 28}" fill="#abb3ad" font-family="Arial" font-size="12">${esc(line)}</text>`).join("");
  const current = task.currentNode ? `${task.currentNode.label} · ${task.currentNode.status}` : "全部节点完成";
  const shot = task.shots[0];
  const blocker = task.blockers[0] || "无阻塞";
  const card = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" rx="5" fill="#111617" stroke="#394a4a"/><text x="20" y="30" fill="#8fd6dc" font-family="Arial" font-size="12">${esc(row.genre)} · ${esc(row.id)}</text><text x="20" y="58" fill="#eee9dc" font-family="Arial" font-size="15">NODE · ${esc(current)}</text><text x="20" y="84" fill="#89918c" font-family="Arial" font-size="10">INPUT SHA · ${esc(task.input.intake.sha256.slice(0, 20))}</text><line x1="20" y1="98" x2="600" y2="98" stroke="#283234"/>${stageLines}<text x="20" y="312" fill="#d7b579" font-family="Arial" font-size="10">BLOCKER · ${esc(blocker)}</text><text x="20" y="338" fill="#8fd6dc" font-family="Arial" font-size="10">TECH · ${esc(task.technicalAcceptance.status)} · VISUAL · ${esc(task.visualReview.status)}</text></svg>`;
  return {input: Buffer.from(card), left: x, top: y};
});
const header = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${boardW}" height="64"><rect width="100%" height="100%" fill="#080a0b"/><text x="${G}" y="28" fill="#eee9dc" font-family="Arial" font-size="19">SYSTEM-LINE RESEARCH TASK VIEW · READ ONLY</text><text x="${G}" y="50" fill="#8fd6dc" font-family="Arial" font-size="10">SYNTHETIC 3-GENRE FIXTURES · NO PRODUCTION WRITES</text></svg>`);
const png = await sharp({create: {width: boardW, height: boardH, channels: 4, background: "#080a0b"}}).composite([{input: header, left: 0, top: 0}, ...cards]).png().toBuffer();
const imagePath = path.join(root, "work/system-line-task-view-v1/task-view-board.png");
fs.writeFileSync(imagePath, png);
const result = {contract: "A1SystemLineResearchTaskViewTest/v1", status: "PASS", fixtureCount: rows.length, genreCount: new Set(rows.map((row) => row.genre)).size, fixtures: rows.map(({taskView, ...row}) => row),
  negatives: {noProject: noProject.status, missingProjectIntakeBlocks: true, completedNodeWithoutFileOrShaBlocks: true, materializationShaMismatchBlocks: true},
  projectStageCount: created[0].nodes.length, noProject, visibleArtifact: path.relative(root, imagePath), visibleArtifactSha256: sha(png), productionAdmission: false};
const resultPath = path.join(root, "work/system-line-task-view-v1/result.json");
fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({status: result.status, fixtureCount: result.fixtureCount, genreCount: result.genreCount, negatives: result.negatives, visibleArtifact: result.visibleArtifact, result: path.relative(root, resultPath)}, null, 2));
