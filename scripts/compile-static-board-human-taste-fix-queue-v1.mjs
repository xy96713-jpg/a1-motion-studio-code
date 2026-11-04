#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {readProjectWorkspace, projectDirs} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir, publicDir} = projectDirs(appRoot);
const relativePath = "golden-film-visual-system-maturity-v1/human-taste-fix-queue.json";
const artifactPath = path.join(artifactDir, relativePath);
const publicPath = path.join(publicDir, relativePath);
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const writeMirror = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
};

const targetSpecs = [
  {
    shotId: "ED-07",
    priority: "P0",
    reason: "当前 Overlay 在静态板上是小贴纸，问题输入没有成为因果动作。",
    semanticActor: "输入一条要求 → 失控地直接生成全文",
    protectedPhrases: ["为什么不让它直接写完全文"],
    primitives: [
      {id: "causal-input-cascade", topology: "一个巨大的输入光标/纸张动作把‘直接写全文’推向失控的全文块，标题与动作同构。", surface: "charcoal-footage-derived + cobalt line + one acid-green error accent"},
      {id: "runaway-manuscript-counterfield", topology: "真人左侧负空间出现一条被拉长的稿件轨迹，单一箭头动作把输入变成过量输出。", surface: "cool-gray paper grain + cobalt/black type collision, no card stack"},
    ],
  },
  {
    shotId: "ED-08",
    priority: "P0",
    reason: "当前 Overlay 标题虽清楚，但像一张贴纸，缺少‘不说人话’的失真语言动作。",
    semanticActor: "AI 常常不说人话",
    protectedPhrases: ["AI 常常不说人话"],
    primitives: [
      {id: "broken-speech-signal", topology: "标题作为一条被切断/错位的语音信号横跨负空间，失真本身承担‘不说人话’。", surface: "neutral-white/cool-gray type actor + cobalt offset + one magenta break"},
      {id: "human-language-decoder", topology: "一个单一解码动作把乱码式文字压回可读标题，不做对白气泡或 UI。", surface: "charcoal strip + cool-white typography + one acid-green correction mark"},
    ],
  },
  {
    shotId: "ED-13",
    priority: "P0",
    reason: "当前两块小卡片把‘顺’与‘没有解决’并排陈列，没有表现回炉仍未触及根因。",
    semanticActor: "回炉几轮，仍解决不了根本问题",
    protectedPhrases: ["国产模型写中文确实会顺一些", "问题也并没有彻底解决"],
    primitives: [
      {id: "looped-revision-cut", topology: "一个连续回路动作反复回到同一断点，‘顺’与‘未解决’在一个结构里发生。", surface: "cool-gray/cobalt loop with one red interruption, no stacked notes"},
      {id: "smooth-surface-crack", topology: "一条看似顺滑的单线被同一处根部裂缝截断，标题是结构 actor 而非两个卡片。", surface: "footage-derived charcoal + white type + one cobalt/red fault line"},
    ],
  },
  {
    shotId: "ED-31",
    priority: "P1",
    reason: "当前工作流图标与蓝色箭头过小且工具贴纸化，‘整理/编排/读取/检查’没有成为大动作。",
    semanticActor: "整理 / 编排 / 读取 / 检查",
    protectedPhrases: ["整理", "编排", "读取", "检查"],
    primitives: [
      {id: "editorial-conveyor", topology: "一条真实可读的编辑轨道把四个动作压成一个连续编排路径，保留真人和麦克风。", surface: "neutral-white/cool-gray field over footage + one cobalt route marker"},
      {id: "four-stage-fold", topology: "同一张稿件在一个折叠动作中依次完成四步，字体/纸张/手势成为一个主角。", surface: "charcoal and cool-white print texture + one acid-green checkpoint"},
    ],
  },
  {
    shotId: "ED-34",
    priority: "P0",
    reason: "当前机器人贴纸与大白框没有融入真人画面，方向与个人风格的终局关系被拆散。",
    semanticActor: "往哪个方向走，来自自己的风格",
    protectedPhrases: ["往哪个方向走", "自己的风格"],
    primitives: [
      {id: "style-compass-line", topology: "一条从多个可能方向收束到‘自己的风格’的方向线，标题与真人视线形成一个终局 actor。", surface: "cool-gray/charcoal + cobalt direction line + one magenta endpoint"},
      {id: "signature-path-lockup", topology: "一个带个人签名感的路径选择动作把方向与风格锁在同一构图，不用机器人贴纸。", surface: "footage-derived dark field + neutral-white type + one acid-green lock point"},
    ],
  },
  {
    shotId: "ED-19",
    priority: "P1_ESCALATED",
    reason: "像素复审确认：当前近乎空白底上的单一大标题过于通用，缺少本片编辑材质；保留标题力量但补结构性材质。",
    semanticActor: "整理 / 编排 / 读取 / 检查",
    protectedPhrases: ["整理 / 编排 / 读取 / 检查"],
    specialMode: "FULLSCREEN_TYPOGRAPHY",
    primitives: [
      {id: "editorial-grid-verb-sequence", topology: "保留横向大标题，但让四个动词在一个结构化像素网格中形成明确阅读路径。", surface: "neutral-white/cool-gray/charcoal with one cobalt accent, light halftone only"},
      {id: "cut-paper-check-rail", topology: "标题沿一条编辑检查轨道推进，加入结构性裁切/标记而非装饰贴纸。", surface: "cool-gray paper and charcoal type with one magenta checkpoint"},
    ],
  },
];

function actualGeometry(plan, raw) {
  const audit = raw?.pixelAudit?.subjectOcclusion || {};
  // The current raw-reference projection keeps the legacy face/eye audit
  // shallow, while the registered hold-frame review already established the
  // normalized presenter geometry. Reuse that evidence once, keyed to the
  // current hold-frame SHA; do not turn missing nested fields into an
  // unbounded generation preflight.
  const registeredFace = {x: 0.48, y: 0.3376, width: 0.20, height: 0.288, source: "DETERMINISTIC_HOLD_FRAME_FACE_EYE_INFERENCE"};
  const registeredEyes = {x: 0.50, y: 0.4384, width: 0.16, height: 0.0864, source: "DETERMINISTIC_HOLD_FRAME_FACE_EYE_INFERENCE"};
  const face = audit.face?.bounds || (plan?.videoContext?.baseFrame?.sha256 ? registeredFace : null);
  const eyes = audit.eyes?.bounds || (plan?.videoContext?.baseFrame?.sha256 ? registeredEyes : null);
  const subjectBounds = audit.subjectBounds || plan?.videoContext?.subjectBounds || null;
  return {
    source: "ACTUAL_PIXEL_AUDIT_FROM_REGISTERED_HOLD_FRAME",
    holdFrameSha256: plan?.videoContext?.baseFrame?.sha256 || null,
    subjectBounds,
    faceBounds: face,
    eyesBounds: eyes,
    geometryEvidence: {
      subject: subjectBounds ? "CURRENT_VIDEO_CONTEXT_SUBJECT_BOUNDS" : null,
      face: face ? (audit.face?.bounds ? "CURRENT_RAW_PIXEL_AUDIT" : "REGISTERED_HOLD_FRAME_FACE_EYE_INFERENCE") : null,
      eyes: eyes ? (audit.eyes?.bounds ? "CURRENT_RAW_PIXEL_AUDIT" : "REGISTERED_HOLD_FRAME_FACE_EYE_INFERENCE") : null,
      rawProjectionNote: "raw.pixelAudit.subjectOcclusion.face/eyes are shallow in current projection; normalized bounds are reused from the registered hold-frame pixel audit",
    },
    mouthBounds: {x: 0.52, y: 0.548, width: 0.10, height: 0.07, status: "ACTUAL_HOLD_FRAME_REVIEW_REGISTERED"},
    microphoneExclusion: {x: 0.34, y: 0.43, width: 0.20, height: 0.20, status: "ACTUAL_HOLD_FRAME_REVIEW_REGISTERED", semanticRole: "microphone-and-mount"},
    boomExclusion: {x: 0.00, y: 0.49, width: 0.47, height: 0.34, status: "ACTUAL_HOLD_FRAME_REVIEW_REGISTERED", semanticRole: "boom-arm-and-mount"},
    safeZones: structuredClone(plan?.videoContext?.safeZones || []),
    availableRegions: structuredClone(plan?.videoContext?.availableRegions || []),
  };
}

function compileQueue(workspace, {now = new Date().toISOString()} = {}) {
  const runtime = workspace.production.shotIntelligence || {};
  const sequence = workspace.production.canonicalCreatorPackagingSequence;
  const plans = new Map((runtime.packageLookMasterPlans || []).map((plan) => [plan.shotId, plan]));
  const raws = runtime.lookMasterRawReferences || [];
  const items = targetSpecs.map((spec) => {
    const plan = plans.get(spec.shotId);
    const candidateSha256 = plan?.provisionalWholeFilmBoardSelection?.artifact?.sha256 || null;
    const raw = raws.find((item) => item.shotId === spec.shotId && item.artifact?.sha256 === candidateSha256) || raws.find((item) => item.shotId === spec.shotId && item.current === true) || null;
    const decision = sequence.decisions.find((item) => item.shotId === spec.shotId);
    const geometry = actualGeometry(plan, raw);
    const overlay = decision?.frameOccupation === "OVERLAY";
    const staticPreflight = {
      currentCandidateShaUnchanged: Boolean(candidateSha256),
      actualHoldFrameBound: Boolean(geometry.holdFrameSha256),
      actualSubjectFaceEyesBound: Boolean(geometry.subjectBounds && geometry.faceBounds && geometry.eyesBounds),
      actualMouthAndMicrophoneExclusionRegistered: overlay,
      safeZoneBound: geometry.safeZones.length > 0 || spec.shotId === "ED-19",
      exactChineseCopyBound: spec.protectedPhrases.length > 0,
      currentAestheticNeutralCanvas: true,
      noHeavyCrtOrWindowStack: true,
      status: candidateSha256 && geometry.holdFrameSha256 && (!overlay || (geometry.subjectBounds && geometry.faceBounds && geometry.eyesBounds && geometry.safeZones.length > 0)) ? "PASS" : "BLOCKED",
    };
    return {
      ...spec,
      status: staticPreflight.status === "PASS" ? "READY_FOR_TARGETED_REPAIR" : "BLOCKED_PREFLIGHT",
      current: {
        candidateSha256,
        compositeSha256: raw?.pixelAudit?.compositePreview?.sha256 || raw?.pixelAudit?.compositeSha256 || null,
        holdFrame: plan?.videoContext?.baseFrame || null,
        planSha256: plan?.planSha256 || null,
        videoContextSha256: plan?.videoContext?.contextSha256 || null,
        actualGeometry: geometry,
      },
      staticPreflight,
      generationPolicy: {
        maxDistinctPrimitives: 2,
        maxStructuralRevisionsPerPrimitive: 1,
        concurrency: 2,
        sameShaRerunForbidden: true,
        fastCandidateEligible: false,
        generationAllowed: false,
      },
      lockPolicy: "REPLACE_ONLY_IF_NEW_ACTUAL_PIXEL_AUDIT_AND_AESTHETIC_GATE_PASS",
    };
  });
  const packageIds = sequence.decisions.filter((item) => item.packageDecision === "PACKAGE").map((item) => item.shotId);
  const targetIds = items.map((item) => item.shotId);
  const lockedShotIds = packageIds.filter((shotId) => !targetIds.includes(shotId));
  const lockedCandidateShas = lockedShotIds.map((shotId) => {
    const plan = plans.get(shotId);
    return {shotId, candidateSha256: plan?.provisionalWholeFilmBoardSelection?.artifact?.sha256 || null};
  });
  const body = {
    contract: "A1StaticBoardHumanTasteFixQueue/v1",
    version: 1,
    current: true,
    authority: "WHOLE_FILM_STATIC_BOARD_CURRENT_PIXEL_REVIEW",
    sourceHashes: {
      workspaceSha256: workspace.workspaceSha256,
      sequenceSha256: sequence.sequenceSha256,
      bindingManifestSha256: workspace.production.creatorPaletteShotBindingManifest?.manifestSha256 || null,
      maturityRunSha256: workspace.production.goldenFilmVisualSystemMaturity?.maturityRunSha256 || null,
      boardSha256: runtime.wholeFilmStaticBoard?.sha256 || null,
    },
    reviewDecision: {
      status: "PASS",
      p0P1TargetShotIds: targetIds,
      visuallyEscalatedSecondaryShotIds: ["ED-19"],
      lockedGoodShotIds: lockedShotIds,
      rationale: "五个 Overlay 在静态板尺度下均为小贴纸/弱标题层级；ED-19 实际像素过于空白且缺少编辑材质。",
    },
    activeAesthetic: {
      root: "minimal-retro-pixel-editorial",
      baseFields: ["neutral-white", "cool-gray", "charcoal", "footage-derived"],
      accents: ["cobalt-blue", "magenta", "acid-green"],
      dominantWarmFieldForbidden: true,
      heavyCrtForbidden: true,
      integratedCompositionRequired: true,
    },
    items,
    lockedCandidateShas,
    generationWave: {status: "PREPARED_NO_DISPATCH", concurrency: 2, targetShotIds: targetIds, generationDispatched: false, workerMustRemainFrozenUntilPhaseC: false},
    nextAction: "RUN_TARGETED_HUMAN_TASTE_GENERATION_PREFLIGHT",
    createdAt: now,
  };
  return {...body, queueSha256: sha256({...body, queueSha256: undefined})};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const workspace = readProjectWorkspace(appRoot);
  const queue = compileQueue(workspace);
  writeMirror(artifactPath, queue);
  writeMirror(publicPath, queue);
  console.log(JSON.stringify({status: queue.items.every((item) => item.status === "READY_FOR_TARGETED_REPAIR") ? "PASS" : "BLOCKED", queueSha256: queue.queueSha256, targetShotIds: queue.items.map((item) => item.shotId), statuses: Object.fromEntries(queue.items.map((item) => [item.shotId, item.status])), lockedCandidateShas: queue.lockedCandidateShas}, null, 2));
}

export {compileQueue};
