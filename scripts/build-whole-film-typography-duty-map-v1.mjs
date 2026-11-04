import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {typographyRoleAuthorityReceipt} from "../apps/studio-next/src/lib/a1-typography-role-authority-v2.mjs";
import {A1_FIGMA_TYPOGRAPHY_MASTER_SPEC_V1} from "../apps/studio-next/src/lib/a1-figma-typography-master-binding-v1.mjs";
import {assertWholeFilmTypographyDutyMap, buildWholeFilmTypographyDutyMap} from "../apps/studio-next/src/lib/a1-whole-film-typography-duty-map-v1.mjs";
import {compileTypographyEffectSequenceV1} from "../apps/studio-next/src/lib/a1-typography-effect-authority-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workDir = path.join(root, "work/typography-director-v2");
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line/typography-director-v2");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const directorInputPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-director-input.json");
const boardManifestPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/board-manifest.json");
const baselinePath = path.join(workDir, "baseline.json");

const fileSha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const jsonSha = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (dir, name, value) => {
  fs.mkdirSync(dir, {recursive: true});
  const target = path.join(dir, name);
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, target);
};
const writeReviewArtifact = (name, value) => {
  writeJson(workDir, name, value);
  writeJson(publicDir, name, value);
};

const baseline = readJson(baselinePath);
const workspaceShaBefore = fileSha(workspacePath);
const boardShaBefore = fileSha(boardManifestPath);
if (workspaceShaBefore !== baseline.workspaceFileSha256) throw new Error(`typography-v2-workspace-baseline-drift:${workspaceShaBefore}`);
if (boardShaBefore !== baseline.wholeFilmStaticBoardManifestSha256) throw new Error(`typography-v2-board-baseline-drift:${boardShaBefore}`);

const workspace = readJson(workspacePath);
const directorInput = readJson(directorInputPath);
if (workspace.typographySystem?.contract !== "A1TypographyDirection/v1") throw new Error("typography-v2-source-workspace-contract-invalid");
if (directorInput.contract !== "A1WholeFilmAiDirectorRun/v1" || directorInput.plan?.shots?.length !== 34) throw new Error("typography-v2-source-director-input-invalid");

let dutyMap = assertWholeFilmTypographyDutyMap(buildWholeFilmTypographyDutyMap({
  shots: directorInput.plan.shots,
  v1Assignments: workspace.typographySystem.shotAssignments,
  sourceWorkspaceSha256: workspace.workspaceSha256,
  sourceWorkspaceFileSha256: workspaceShaBefore,
  sourceDirectorInputSha256: fileSha(directorInputPath),
}));
if (dutyMap.status !== "READY_FOR_USER_REVIEW") throw new Error(`typography-v2-duty-map-not-ready:${dutyMap.status}`);

const existingMasterLibraryPath = path.join(workDir, "figma-typography-master-library-v1.json");
const existingMasterLibrary = fs.existsSync(existingMasterLibraryPath) ? readJson(existingMasterLibraryPath) : null;
const approvedStructureLibrary = existingMasterLibrary?.status === "READY_FOR_USER_VISUAL_APPROVAL" && Array.isArray(existingMasterLibrary.bindings) && existingMasterLibrary.bindings.length === 6 ? existingMasterLibrary : null;
if (approvedStructureLibrary) {
  const bindingByFamily = new Map(approvedStructureLibrary.bindings.map((binding) => [binding.masterFamily, binding]));
  const assignments = dutyMap.assignments.map((assignment) => {
    const {assignmentSha256: _previousSha, ...rest} = assignment;
    const enriched = {...rest, figmaBinding: assignment.masterFamily ? bindingByFamily.get(assignment.masterFamily) || null : null};
    return {...enriched, assignmentSha256: jsonSha(enriched)};
  });
  const {dutyMapSha256: _previousMapSha, ...mapRest} = dutyMap;
  const enrichedMap = {...mapRest, assignments, figmaMasterLibrarySha256: approvedStructureLibrary.librarySha256};
  dutyMap = {...enrichedMap, dutyMapSha256: jsonSha(enrichedMap)};
}

const effectSequence = compileTypographyEffectSequenceV1(dutyMap.assignments);
if (effectSequence.ledger.status !== "PASS_REVIEW_ONLY") throw new Error(`typography-v2-effect-sequence-blocked:${effectSequence.ledger.failures.map((item) => item.code).join(",")}`);
{
  const assignments = effectSequence.items.map((assignment) => {
    const {assignmentSha256: _previousSha, ...rest} = assignment;
    return {...rest, assignmentSha256: jsonSha(rest)};
  });
  const {dutyMapSha256: _previousMapSha, ...mapRest} = dutyMap;
  const effectCounts = effectSequence.ledger.effectCounts;
  const enrichedMap = {
    ...mapRest,
    assignments,
    typographyEffectSequenceLedger: effectSequence.ledger,
    summary: {
      ...mapRest.summary,
      effectFamilyCount: Object.keys(effectCounts).filter((id) => id !== "NONE").length,
      expressiveEffectCount: effectSequence.ledger.expressiveShotIds.length,
      noEffectCount: effectCounts.NONE || 0,
      effectSequenceRiskCount: effectSequence.ledger.failures.length,
      effectCounts,
    },
  };
  dutyMap = {...enrichedMap, dutyMapSha256: jsonSha(enrichedMap)};
}

const plannedMasterLibrary = {
  contract: "A1FigmaTypographyMasterLibrary/v1",
  status: "STRUCTURE_READY_FIGMA_BINDINGS_PENDING",
  approvalVersion: null,
  approvalStatus: "PENDING_USER_VISUAL_APPROVAL",
  spec: A1_FIGMA_TYPOGRAPHY_MASTER_SPEC_V1,
  families: [
    {id: "PRESENTER_IDENTITY_HERO", purpose: "人物身份与个人立场 字在人物后方形成负形"},
    {id: "FULLSCREEN_CHAPTER_HERO", purpose: "问题 章节 强转折 两组以内"},
    {id: "CONCLUSION_STAMP", purpose: "证据之后的短结论 前景盖章 不重复字幕"},
    {id: "GIANT_NUMBER_OBJECT", purpose: "数字与单位分离 金额绑定物件或证据"},
    {id: "ROLE_GRID_PROCESS", purpose: "问题条 角色列 流程状态 对比追加"},
    {id: "DARK_RESET_VERDICT", purpose: "黑场短判断 用于密度重置"},
  ].map((family) => ({
    ...family,
    frame: {width: 1920, height: 1080},
    semanticGroups: ["EXACT_COPY_SHADOW", "PRIMARY_GLYPH", "SUPPORTING_GLYPH", "MATERIAL", "SAFE_ZONE"],
    keyPoses: ["PRE", "PEAK", "HOLD", "POST"],
    figmaBinding: null,
    approvalStatus: "PENDING_USER_VISUAL_APPROVAL",
  })),
  criticMayApproveNewMaster: false,
  formalRenderSource: "REMOTION_OR_HYPERFRAMES",
};
plannedMasterLibrary.librarySha256 = jsonSha(plannedMasterLibrary);
const masterLibrary = approvedStructureLibrary || plannedMasterLibrary;

const migrationReceipt = {
  contract: "A1TypographyV1ToV2MigrationReceipt/v1",
  status: "PASS_REVIEW_ONLY",
  sourceWorkspaceFileSha256: workspaceShaBefore,
  sourceWorkspaceDeclaredSha256: workspace.workspaceSha256,
  sourceDirectorInputSha256: fileSha(directorInputPath),
  sourceV1AssignmentsSha256: dutyMap.source.v1AssignmentsSha256,
  shotOrderSha256: dutyMap.source.shotOrderSha256,
  v1AssignmentCount: workspace.typographySystem.shotAssignments.length,
  v2AssignmentCount: dutyMap.assignments.length,
  uniqueShotIdCount: new Set(dutyMap.assignments.map((item) => item.shotId)).size,
  positionalBindingVerified: dutyMap.assignments.every((item, index) => item.sourceIndex === index),
  sourceObjectShaVerified: dutyMap.assignments.every((item, index) => item.sourceV1ObjectSha256 === jsonSha(workspace.typographySystem.shotAssignments[index])),
  formalWorkspaceWritten: false,
  formalBoardWritten: false,
};
migrationReceipt.receiptSha256 = jsonSha(migrationReceipt);

writeReviewArtifact("typography-role-authority-v2.json", typographyRoleAuthorityReceipt());
writeReviewArtifact("figma-typography-master-library-v1.json", masterLibrary);
writeReviewArtifact("whole-film-typography-duty-map.json", dutyMap);
writeReviewArtifact("typography-effect-sequence-ledger.json", dutyMap.typographyEffectSequenceLedger);
writeReviewArtifact("typography-v1-v2-diff.json", {contract: "A1TypographyV1V2Diff/v1", sourceDutyMapSha256: dutyMap.dutyMapSha256, items: dutyMap.v1ToV2Diff});
writeReviewArtifact("migration-receipt.json", migrationReceipt);

const workspaceShaAfter = fileSha(workspacePath);
const boardShaAfter = fileSha(boardManifestPath);
if (workspaceShaAfter !== workspaceShaBefore) throw new Error("typography-v2-formal-workspace-mutated");
if (boardShaAfter !== boardShaBefore) throw new Error("typography-v2-formal-board-mutated");

const result = {
  contract: "A1TypographyDirectorV2FoundationResult/v1",
  status: "PASS_REVIEW_ONLY",
  dutyMapSha256: dutyMap.dutyMapSha256,
  sequenceLedgerSha256: dutyMap.sequenceLedger.ledgerSha256,
  masterLibrarySha256: masterLibrary.librarySha256,
  migrationReceiptSha256: migrationReceipt.receiptSha256,
  summary: dutyMap.summary,
  formalWorkspace: {before: workspaceShaBefore, after: workspaceShaAfter, unchanged: true},
  formalBoard: {before: boardShaBefore, after: boardShaAfter, unchanged: true},
  nextAction: "BUILD_AND_REVIEW_SIX_FIGMA_MASTER_FAMILIES",
  productionAdmission: false,
};
writeJson(workDir, "result.json", result);
console.log(JSON.stringify(result, null, 2));
