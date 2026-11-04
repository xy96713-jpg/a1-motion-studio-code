import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workDir = path.join(root, "work/typography-director-v2");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const fileSha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const baseline = readJson(path.join(workDir, "baseline.json"));
const dutyMap = readJson(path.join(workDir, "whole-film-typography-duty-map.json"));
const masterLibrary = readJson(path.join(workDir, "figma-typography-master-library-v1.json"));
const blind = readJson(path.join(workDir, "blind-fixtures/report.json"));
const workspacePath = path.join(root, baseline.workspacePath);
const boardPath = path.join(root, baseline.wholeFilmStaticBoardManifestPath);
const workspaceSha = fileSha(workspacePath);
const boardSha = fileSha(boardPath);
const uiFiles = [
  "apps/studio-next/src/app/system-line-visual-workbench/TypographyDutyMapPanel.tsx",
  "apps/studio-next/src/app/system-line-visual-workbench/GlobalStoryboardReviewPanel.tsx",
].map((relative) => ({relative, content: fs.readFileSync(path.join(root, relative), "utf8"), sha256: fileSha(path.join(root, relative))}));
const failures = [];
if (workspaceSha !== baseline.workspaceFileSha256) failures.push("FORMAL_WORKSPACE_SHA_CHANGED");
if (boardSha !== baseline.wholeFilmStaticBoardManifestSha256) failures.push("FORMAL_BOARD_SHA_CHANGED");
if (dutyMap.status !== "READY_FOR_USER_REVIEW" || dutyMap.assignments.length !== 34) failures.push("DUTY_MAP_NOT_READY");
if (dutyMap.sequenceLedger?.status !== "PASS_REVIEW_ONLY" || dutyMap.summary?.sequenceRiskCount !== 0) failures.push("SEQUENCE_LEDGER_BLOCKED");
if (masterLibrary.status !== "READY_FOR_USER_VISUAL_APPROVAL" || masterLibrary.bindings?.length !== 6 || masterLibrary.scaleReviews?.length !== 18) failures.push("FIGMA_MASTER_LIBRARY_NOT_READY");
if (blind.status !== "PASS" || blind.articleCount !== 6) failures.push("BLIND_FIXTURES_NOT_READY");
if (!uiFiles.every((item) => item.content.includes("TypographyDutyMapPanel"))) failures.push("ACTIVE_WORKBENCH_VIEW_NOT_WIRED");
if (dutyMap.assignments.filter((item) => item.masterFamily).some((item) => !item.figmaBinding?.bindingSha256)) failures.push("SHOT_FIGMA_BINDING_MISSING");

const result = {
  contract: "A1TypographyDirectorV2Result/v1",
  status: failures.length ? "BLOCK" : "PASS",
  failures,
  implemented: {
    typographyRoleAuthority: "A1TypographyRoleAuthority/v2",
    shotAssignment: "A1ShotTypographyAssignment/v2",
    figmaMasterBinding: "A1FigmaTypographyMasterBinding/v1",
    sequenceLedger: "A1TypographySequenceLedger/v1",
    wholeFilmDutyMap: "A1WholeFilmTypographyDutyMap/v1",
    shotCount: dutyMap.assignments.length,
    masterFamilyCount: masterLibrary.bindings.length,
    scaleReviewCount: masterLibrary.scaleReviews.length,
    blindArticleCount: blind.articleCount,
    activeWorkbenchView: true,
  },
  summary: dutyMap.summary,
  fixtures: blind.reports.map((item) => ({id: item.articleId, genre: item.genre, status: item.sequenceLedger?.status === "PASS_REVIEW_ONLY" ? "PASS" : "BLOCK"})),
  hashes: {
    dutyMapSha256: dutyMap.dutyMapSha256,
    sequenceLedgerSha256: dutyMap.sequenceLedger.ledgerSha256,
    masterLibrarySha256: masterLibrary.librarySha256,
    blindFixtureBoardSha256: blind.board.pngSha256,
    sixMasterContactSheetSha256: fileSha(path.join(workDir, "figma-six-master-contact-sheet.png")),
    figmaMotionPreviewSha256: fileSha(path.join(workDir, "figma-motion-preview-fullscreen-chapter-hero.mp4")),
    figmaMotionContactSheetSha256: fileSha(path.join(workDir, "figma-motion-preview-contact-sheet.png")),
  },
  figma: {
    fileKey: masterLibrary.figmaFileKey,
    pageNodeId: masterLibrary.pageNodeId,
    url: masterLibrary.figmaUrl,
    approvalStatus: masterLibrary.approvalStatus,
    formalRenderSource: masterLibrary.formalRenderSource,
    figmaVideoProductionSourceAllowed: false,
  },
  approvalBoundary: {
    masterLibraryUserVisualApproval: "PENDING",
    rebuiltWholeFilmStaticBoardUserVisualApproval: "NOT_STARTED",
    implementationPassDoesNotGrantProductionAdmission: true,
  },
  formalAuthority: {
    workspaceSha256Before: baseline.workspaceFileSha256,
    workspaceSha256After: workspaceSha,
    workspaceUnchanged: workspaceSha === baseline.workspaceFileSha256,
    boardSha256Before: baseline.wholeFilmStaticBoardManifestSha256,
    boardSha256After: boardSha,
    boardUnchanged: boardSha === baseline.wholeFilmStaticBoardManifestSha256,
    assemblyAllowed: false,
    motionAllowed: false,
    resolveAllowed: false,
    releaseAllowed: false,
  },
  uiFiles: uiFiles.map(({relative, sha256}) => ({relative, sha256})),
  outputs: {
    dutyMap: "work/typography-director-v2/whole-film-typography-duty-map.json",
    masterLibrary: "work/typography-director-v2/figma-typography-master-library-v1.json",
    sixMasterContactSheet: "work/typography-director-v2/figma-six-master-contact-sheet.png",
    motionPreview: "work/typography-director-v2/figma-motion-preview-fullscreen-chapter-hero.mp4",
    blindFixtureBoard: "work/typography-director-v2/blind-fixtures/blind-fixture-board.png",
  },
  nextAction: "USER_VISUAL_REVIEW_OF_SIX_MASTER_LIBRARY_AND_34_SHOT_DUTY_MAP",
};
fs.writeFileSync(path.join(workDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
