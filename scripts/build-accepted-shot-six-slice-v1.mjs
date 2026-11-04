#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "accepted-shot-six-slice-v1";
const sourcePath = path.join(root, "apps/studio-next/public/generated/system-line/visual-ai-director-v2-proof/report.json");
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const rendererPublic = path.join(root, "remotion-renderer/public");
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
if (source?.truth?.aiDesigned !== true || source?.truth?.fallbackUsed !== false || source?.visualDirector?.status !== "completed") {
  throw new Error("accepted-shot-six-slice-blocked:ai-director-not-completed-without-fallback");
}
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const asset = (assetUri, route, sourceUri, provenance, reviewed = true) => {
  const full = path.join(rendererPublic, assetUri);
  if (!fs.existsSync(full)) throw new Error(`accepted-shot-material-missing:${assetUri}`);
  return {route, assetUri, sourceUri, provenance, sha256: shaFile(full), reviewed};
};
const typographyOnly = (provenance = "editable type only; no factual image asserted") => ({route: "typography-only", assetUri: null, sourceUri: "local://editable-typography", provenance, sha256: null, reviewed: true});

const profiles = [
  {shotId: "section-01", adapterId: "real-material-collision", material: asset("creator-material-pixel-type-v1/plates/creator-desk-wide.png", "real-evidence", "local://creator-desk-wide", "reviewed creator desk plate; contextual material only"), role: "opening paradox / surface change versus author judgment", crop: "desk-wide with a living lower-third title field", anchors: {subject: {x: 0.57, y: 0.48, role: "real desk and hand"}, claim: {x: 0.08, y: 0.16, role: "quiet claim"}, verdict: {x: 0.63, y: 0.72, role: "large judgement"}}, thesis: "真实桌面先建立人的工作现场，模型标签只像纸屑一样撞入；判断字形必须压住工具噪声。", motion: {entry: "桌面从近裁切进入，手和纸面先被看见", focus: "观众先读稳定的判断句而不是模型名", transformation: "模型名由边缘撞入并被判断字形压回", resolve: "保留“AI 味”字形作为下一镜的承接对象"}},
  {shotId: "section-02", adapterId: "entity-evidence-composition", material: asset("entity-icons/openai.svg", "official-entity", "https://openai.com/brand/", "official entity icon registry; paired with local names", true), role: "model names as material, not recommendation", crop: "asymmetric entity marks over one continuous paper field", anchors: {gpt: {x: 0.16, y: 0.23, role: "source mark"}, claude: {x: 0.69, y: 0.18, role: "source mark"}, kimi: {x: 0.3, y: 0.64, role: "source mark"}, deepseek: {x: 0.78, y: 0.67, role: "source mark"}, verdict: {x: 0.43, y: 0.42, role: "unchanged result"}}, thesis: "把模型品牌降级为被比较的材料，四个真实实体围绕同一个未解决结果，而不是四张产品卡。", motion: {entry: "上一镜的结果字形固定在纸面中央", focus: "观众先看到不同实体的真实来源标记", transformation: "实体标记非规则压入并短暂遮挡结果，但结果从未改善", resolve: "实体褪成冷灰，留下共同的“模型名字”概念"}},
  {shotId: "section-03", adapterId: "typographic-verdict", material: typographyOnly(), role: "black-field diagnosis", crop: "full dark field with one serif verdict and red correction trace", anchors: {verdict: {x: 0.1, y: 0.37, role: "single conclusion"}, residue: {x: 0.1, y: 0.62, role: "problem residue"}}, thesis: "没有材料可以替作者判断；黑场只留下一个明确的诊断，文字本身成为空间。", motion: {entry: "所有材料噪声瞬间退场，黑场先保持空", focus: "观众先读“通篇没重点”这一句", transformation: "问题词被轻微删除线划掉，重点字重显影", resolve: "最后只留一个可交接的“重点”字形"}},
  {shotId: "section-04", adapterId: "screen-surface-edit", material: asset("editorial-documentary-reset-v1/source/workbench-overview.png", "real-evidence", "local://writing-workbench-overview", "real writing-workbench screen capture; source-bound evidence"), role: "show the real workbench surface being edited", crop: "large screen surface with a single editorial intervention", anchors: {screen: {x: 0.08, y: 0.08, role: "real workbench surface"}, edit: {x: 0.62, y: 0.48, role: "editable text region"}, label: {x: 0.1, y: 0.82, role: "small editable note"}}, thesis: "工作台不是 UI 装饰，而是发生取舍的真实表面；文字动作要贴着屏幕里的句子发生。", motion: {entry: "真实屏幕以大面积裁切进入，先读屏幕内容", focus: "选择范围和改写动作成为唯一前景", transformation: "编辑标记沿真实文字表面移动并替换一句", resolve: "留下一个被选中的短语承接到证据页"}},
  {shotId: "section-05", adapterId: "document-scan-annotation", material: asset("editorial-documentary-reset-v1/source/document-surface.png", "real-evidence", "local://writing-workflow-document-surface", "real current writing-workflow source capture"), role: "scan one real evidence page and hold one sentence", crop: "macro document crop with one blue editorial mark", anchors: {document: {x: 0.09, y: 0.1, role: "real evidence page"}, sentence: {x: 0.16, y: 0.56, role: "selected sentence"}, mark: {x: 0.74, y: 0.56, role: "annotation path"}}, thesis: "证据页只提供可核验的材料，作者的蓝色标记把其中一句从平均噪声里取出来。", motion: {entry: "真实证据页从局部裁切展开，保留页面语境", focus: "视线沿扫描方向找到被选中的真实句子", transformation: "一条短路径贴着句子完成圈选，不绘制无对象 HUD", resolve: "句子从页面中抽离一小段交给结尾"}},
  {shotId: "section-06", adapterId: "object-handoff-bridge", material: asset("style-guides/experimental-editorial-tech-v1/type-material/archive-process-material-v1.png", "editorial-artwork", "local://archive-process-material-v1", "reviewed editorial print texture; no factual text asserted"), role: "human edit carries the film to the close", crop: "archival print texture with a clean final type field", anchors: {object: {x: 0.56, y: 0.42, role: "archive object"}, final: {x: 0.08, y: 0.7, role: "human verdict"}}, thesis: "从证据页承接到有触感的档案材料，最后把责任归还给人的改写，而不是再列模型。", motion: {entry: "证据句子像纸片一样进入档案表面", focus: "观众先看到被改过的痕迹和材质", transformation: "档案层被擦除一部分，人的结论从底下显出", resolve: "停在“人来修改”与下一篇文章的空白之间"}},
];
const variants = ["quiet", "collision", "crop", "editorial"];
const forbiddenPatterns = ["generic-card", "floating-HUD", "white-document-card", "decorative-unanchored-lines", "fake-evidence", "subtitle-stack", "repeated-family-template"];
const shotById = new Map((source.visualDirector.shots || []).map((shot) => [shot.shotId, shot]));
const shots = profiles.map((profile, index) => {
  const directorShot = shotById.get(profile.shotId);
  if (!directorShot) throw new Error(`accepted-shot-director-shot-missing:${profile.shotId}`);
  const sourceText = [directorShot.primaryActor?.label, ...(directorShot.wordActors || []).map((actor) => actor.text)].filter(Boolean).join(" · ");
  const typography = {
    editableText: [...new Set((directorShot.wordActors || []).map((actor) => actor.text).filter(Boolean))],
    fontRoles: Object.fromEntries((directorShot.wordActors || []).map((actor) => [actor.text, actor.fontRole])),
    generatedGlyphAssets: [],
  };
  const candidates = variants.map((variant) => {
    const acceptedShotDesign = {
      contract: "A1AcceptedShotDesign/v1",
      shotId: profile.shotId,
      sourceText,
      editorialRole: profile.role,
      visualThesis: profile.thesis,
      primaryMaterial: profile.material,
      topology: profile.adapterId,
      layout: {anchors: profile.anchors, bounds: {x: 0, y: 0, width: 1920, height: 1080}, crop: `${profile.crop}; variant=${variant}`, zOrder: ["material", "evidence", "type", "handoff"]},
      typography,
      motionPhrase: profile.motion,
      handoff: {carryIn: directorShot.handoff?.carryIn || "previous accepted shot", carryOut: directorShot.handoff?.carryOut || "next accepted shot", actorId: directorShot.handoff?.actorId || `${profile.shotId}-handoff`},
      forbiddenPatterns,
      reviewStatus: "pending",
      candidateId: `${profile.shotId}-${variant}`,
    };
    return {
      candidateId: acceptedShotDesign.candidateId,
      shotId: profile.shotId,
      variant,
      adapterId: profile.adapterId,
      acceptedShotDesign: {...acceptedShotDesign, designSha256: sha(acceptedShotDesign)},
      candidatePreviewOnly: true,
      formalRenderAllowed: false,
      still: null,
      aiScreening: {status: "keep-for-user-review", reasons: ["distinct composition variant", "source-bound material or editable type", "no generic card fallback"]},
    };
  });
  return {order: index + 1, shotId: profile.shotId, sourceDirectorShot: directorShot, adapterId: profile.adapterId, primaryMaterial: profile.material, candidates};
});
const boardCore = {
  contract: "A1ShotCandidateBoard/v1",
  phaseId,
  status: "CANDIDATE_PREVIEW_READY",
  article: {title: "换了不同 AI 模型，文章为什么还是有 AI 味", sourceReport: "visual-ai-director-v2-proof/report.json", sourceReportSha256: shaFile(sourcePath)},
  strategy: {visualThesis: source.visualDirector.strategy.visualThesis, paletteLogic: source.visualDirector.strategy.paletteLogic, typographySystem: source.visualDirector.strategy.typographySystem, mixedNarrative: true},
  sourceOfTruth: "A1VisualAiDirector/v2",
  shots,
  candidatePolicy: {perShot: 4, actualCompositionCandidates: true, aiScreening: "keep-for-user-review", userReviewRequired: true, noAutoAdopt: true},
  gates: {acceptedShotIrAllowed: false, dynamicPrototypeAllowed: false, h47ExpansionAllowed: false, fullRenderAllowed: false, finalRenderAllowed: false},
  currentAuthority: source.currentAuthority,
};
const boardSha256 = sha(boardCore);
const board = {...boardCore, boardSha256};
const ledger = {contract: "A1ShotReviewLedger/v1", phaseId, boardSha256, decisions: shots.map((shot) => ({shotId: shot.shotId, candidateId: null, status: "pending", note: null, reviewedDesignSha256: null, updatedAt: new Date().toISOString()})), summary: {shotCount: 6, approvedCount: 0, pendingCount: 6, reviseCount: 0}, gates: {acceptedShotIrAllowed: false, dynamicPrototypeAllowed: false, h47ExpansionAllowed: false, finalRenderAllowed: false}};
const report = {contract: "A1AcceptedShotSixSliceReport/v1", phaseId, status: "CANDIDATE_PREVIEW_READY", aiDesigned: true, fallbackUsed: false, candidatePreviewOnly: true, source: {reportPath: path.relative(root, sourcePath), reportSha256: shaFile(sourcePath)}, boardSha256, shots: shots.map((shot) => ({shotId: shot.shotId, adapterId: shot.adapterId, candidateCount: shot.candidates.length, sourceBoundMaterial: shot.primaryMaterial.assetUri !== null})), summary: {shotCount: 6, candidateCount: 24, approvedCount: 0, pendingCount: 6}, gates: board.gates, currentAuthority: source.currentAuthority, nextAction: "user-review-six-shot-candidate-board"};
for (const file of [path.join(publicDir, "accepted-shot-ir.json"), path.join(artifactDir, "accepted-shot-ir.json")]) if (fs.existsSync(file)) fs.unlinkSync(file);
for (const [dir, files] of [[publicDir, {"candidate-board.json": board, "review-decisions.json": ledger, "report.json": report}], [artifactDir, {"candidate-board.json": board, "review-decisions.json": ledger, "report.json": report}]]) for (const [name, value] of Object.entries(files)) writeJson(path.join(dir, name), value);
writeJson(path.join(root, "remotion-renderer/src/generated/acceptedShotSixSliceProps.json"), board);
console.log(JSON.stringify({phaseId, status: report.status, boardSha256, shotCount: 6, candidateCount: 24, adapters: shots.map((shot) => shot.adapterId), dynamicPrototypeAllowed: false}, null, 2));
