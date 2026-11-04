#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const workbenchRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1");
const ledgerFile = path.join(workbenchRoot, "current-visual-decision-ledger-v1/ledger.json");
const workspaceFile = path.join(workbenchRoot, "workspace.json");
const outputRoot = path.join(root, "work/first-episode-motion-direction-v1");
const outputFile = path.join(outputRoot, "plan.json");
const reviewFile = path.join(outputRoot, "REVIEW.md");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const ledger = JSON.parse(fs.readFileSync(ledgerFile, "utf8"));
const workspace = JSON.parse(fs.readFileSync(workspaceFile, "utf8"));
if (ledger.contract !== "A1CurrentVisualDecisionLedger/v1" || ledger.current !== true || ledger.shotCount !== 34) throw new Error("first-episode-current-ledger-required");
if (ledger.userVisualApproval !== "PENDING" || ledger.globalLocks?.animationFrozenUntilLedgerBoundBoardApproval !== true) throw new Error("first-episode-static-review-gate-required");
if (ledger.entries.some((entry) => entry.animationAllowed !== false)) throw new Error("first-episode-motion-must-remain-frozen");

const timeline = workspace.production?.shotIntelligence?.wholeFilmStaticBoard?.timelineBoard?.items || [];
const timingByShot = new Map(timeline.map((item) => [item.shotId, item.timeRange]));
if (timingByShot.size !== 34) throw new Error(`first-episode-timeline-count:${timingByShot.size}`);

const packageDirections = {
  "ED-01": ["opening-glyph-field", "three-state-glyph-signal-lock", "Use the approved three-state title artwork; reveal internal glyph planes and registration marks, never slide the whole poster."],
  "ED-07": ["question-cursor", "question-select-reject-hold", "A cursor isolates the question mark and the underline arrests; the presenter remains the information owner."],
  "ED-09": ["printer-and-tangled-copy", "paper-feed-language-jam", "Paper advances while cobalt language strands jam inside the printer; no whole-frame zoom."],
  "ED-10": ["verdict-stamp", "stamp-impact-waste-verdict", "The stamp strikes once, the waste verdict locks, and debris settles into a readable hold."],
  "ED-12": ["five-model-signal-rails", "signal-scan-comparison", "One source emits five unequal response traces in sequence; rows do not fly in as cards."],
  "ED-14": ["paper-evidence-extractor", "source-scan-bound-conclusion", "A scan selects two real observations from the paper and converges them into the bounded conclusion."],
  "ED-16": ["crt-signal-chain", "signal-loss-causal-progression", "Material, angle, and generic output degrade as one CRT signal rather than three text boxes."],
  "ED-17": ["workflow-conveyor", "material-angle-draft-sequence", "Materials travel through the angle selector into the writing head; the mechanism causes the result."],
  "ED-19": ["backstage-state-rail", "state-cursor-sequence", "The active state moves through arrange, edit, read, and inspect while the presenter remains unfiltered."],
  "ED-31": ["control-window-lock", "window-open-command-lock", "One control window opens, the workflow title resolves, and a lock indicator confirms control without touching the face."],
  "ED-34": ["workflow-to-fingerprint", "conveyor-output-identity-lock", "The ED-17 conveyor completes its run and hands a cobalt signal into the fingerprint; no generic outro fade."],
};

const screenChapter = (shotId) => {
  const order = Number(shotId.slice(3));
  if (order >= 2 && order <= 6) return ["CH-01", "real-writing-focus", "source-selection-and-focus"];
  if (order >= 20 && order <= 23) return ["CH-02", "backstage-sequence", "state-rail-and-source-playback"];
  if (order >= 24 && order <= 27) return ["CH-03", "version-comparison", "matched-source-compare"];
  if (order >= 28 && order <= 30) return ["CH-04", "final-receipt", "receipt-progress-and-final-hold"];
  throw new Error(`first-episode-screen-chapter-missing:${shotId}`);
};

const transitionOverrides = new Map([
  ["ED-07", {in: "QUESTION_SIGNAL_CUT", out: "HARD_CUT"}],
  ["ED-17", {in: "SIGNAL_TO_CONVEYOR_MATCH_CUT", out: "HARD_CUT"}],
  ["ED-20", {in: "STATE_CURSOR_TO_SOURCE_SELECTION", out: "HARD_CUT"}],
  ["ED-31", {in: "RECEIPT_TO_CONTROL_LOCK", out: "HARD_CUT"}],
  ["ED-34", {in: "COBALT_LINE_HANDOFF", out: "HARD_END"}],
]);

const scenes = ledger.entries.map((entry) => {
  const timing = timingByShot.get(entry.shotId);
  if (!timing || !Number.isFinite(timing.startMs) || !Number.isFinite(timing.endMs) || timing.endMs <= timing.startMs) throw new Error(`first-episode-timing-invalid:${entry.shotId}`);
  const transitions = transitionOverrides.get(entry.shotId) || {in: "HARD_CUT", out: "HARD_CUT"};
  const common = {
    shotId: entry.shotId,
    order: entry.order,
    sourceText: entry.sourceText,
    sourceFrame: entry.selectedFrame,
    timeRange: timing,
    transitionIn: transitions.in,
    transitionOut: transitions.out,
    renderer: "REMOTION_A1_MOTION_IR",
    hyperframesRole: "REVIEW_ONLY_PATTERN_PROTOTYPE",
    pptLikeForbidden: true,
    wholeFrameEntranceForbidden: true,
    sourceIdentityPreserved: true,
  };
  if (entry.visualRole === "CLEAN_PRESENTER_FRAME") return {
    ...common,
    sceneClass: "PRESENTER_SOURCE_HOLD",
    dominantActor: "verified-presenter-video",
    semanticAction: "continue-speaking-without-graphic-interruption",
    motionPrimitive: "DIRECT_SOURCE_PLAYBACK",
    phases: ["hard-cut-in", "natural-source-motion", "readable-hold", "hard-cut-out"],
    graphicActorCount: 0,
    presenterFaceSafe: true,
    presenterPixelFilterForbidden: true,
  };
  if (entry.visualRole === "FOCUSED_REAL_SCREEN") {
    const [chapterId, dominantActor, motionPrimitive] = screenChapter(entry.shotId);
    return {
      ...common,
      sceneClass: "VERIFIED_SCREEN_OPERATION",
      chapterId,
      dominantActor,
      semanticAction: chapterId === "CH-01" ? "focus-real-writing-operation" : chapterId === "CH-02" ? "expose-backstage-sequence" : chapterId === "CH-03" ? "compare-source-bound-version" : "confirm-final-draft-result",
      motionPrimitive,
      phases: ["source-context", "semantic-selection", "operation-or-compare", "source-bound-hold"],
      fabricatedClickForbidden: true,
      fakeUiForbidden: true,
      realSourcePixelsRequired: true,
    };
  }
  const direction = packageDirections[entry.shotId];
  if (!direction) throw new Error(`first-episode-package-direction-missing:${entry.shotId}`);
  return {
    ...common,
    sceneClass: "SEMANTIC_PACKAGE_ACTION",
    dominantActor: direction[0],
    semanticAction: direction[1],
    motionPrimitive: direction[1],
    directionNote: direction[2],
    phases: ["stable-source-state", "semantic-trigger", "one-causal-response", "readable-hold"],
    fullCardMoveForbidden: true,
    decorativeParticleForbidden: true,
  };
});

const body = {
  contract: "A1FirstEpisodeMotionDirection/v1",
  status: "PLANNING_READY_STATIC_APPROVAL_REQUIRED",
  planningOnly: true,
  productionMotionAllowed: false,
  source: {
    workspaceSha256: workspace.workspaceSha256,
    ledgerSha256: ledger.ledgerSha256,
    boardSha256: ledger.board.sha256,
    shotCount: ledger.shotCount,
    userVisualApproval: ledger.userVisualApproval,
  },
  thesis: "Animate semantic actors and verified source operations; never animate rectangular slides as the subject.",
  antiPptContract: {
    wholeFrameSlideInForbidden: true,
    cardStackAsDefaultForbidden: true,
    equalPanelBuildForbidden: true,
    fadeScaleOnlySceneForbidden: true,
    transitionEffectSpamForbidden: true,
    mostCutsAreHardCuts: true,
    motionMustHaveCauseAndReadableHold: true,
    presenterAndEvidenceRemainReal: true,
  },
  engineDecision: {
    productionAuthority: "REMOTION_A1_MOTION_IR",
    productionReason: "Existing editable renderer, exact copy, source-video timing, transparent layers, and deterministic A1 Motion IR authority.",
    hyperframes: "REVIEW_ONLY_PATTERN_PROTOTYPE_FROM_SAME_MOTION_IR",
    hyperframesReason: "Seek-by-frame GSAP and adapter checks are useful for risky motion grammar, but must not create a second project store or render authority.",
    heygenAvatar: "NOT_USED_FIRST_EPISODE_REAL_PRESENTER_EXISTS",
    xyq: "DEFERRED_OPTIONAL_TEXTLESS_ILLUSTRATIVE_INSERT_ONLY",
    xyqReason: "The installed CLI is not logged in and no current shot requires nondeterministic generated video; exact text, evidence, presenter identity, and mechanical editability stay local.",
  },
  providerPolicy: {
    xyqAllowedOnlyWhen: ["textless-illustrative-motion", "no-factual-evidence", "no-presenter-identity", "local-remotion-cannot-achieve-required-organic-motion", "credits-explicitly-approved"],
    xyqForbiddenFor: ["formal-chinese-copy", "real-product-ui", "research-evidence", "presenter-replacement", "final-render-authority"],
    externalOutputsMustBeDownloadedAndShaBound: true,
  },
  canary: {
    status: "BLOCKED_UNTIL_STATIC_BOARD_USER_APPROVAL",
    shotIds: ["ED-01", "ED-10", "ED-17", "ED-20", "ED-31"],
    coverage: ["hero-title", "object-impact", "causal-mechanism", "verified-screen", "presenter-safe-overlay"],
    resolution: "960x540",
    maximumStructuralRepairPasses: 1,
  },
  scenes,
  research: [
    {id: "remotion", url: "https://www.remotion.dev/", adopted: "parameterized React composition and deterministic frame rendering"},
    {id: "hyperframes-determinism", url: "https://hyperframes.heygen.com/concepts/determinism", adopted: "seek-by-frame deterministic review prototypes"},
    {id: "hyperframes-adapters", url: "https://hyperframes.heygen.com/concepts/frame-adapters", adopted: "single canonical frame clock and random-seek conformance"},
    {id: "heygen-avatar-api", url: "https://docs.heygen.com/docs/create-video-archived", adopted: "explicitly excluded because first episode already has verified presenter footage"},
    {id: "xyq", url: "https://xyq.jianying.com/", adopted: "optional external generative provider, not the deterministic production renderer"},
  ],
};
const plan = {...body, planSha256: sha256(body)};
fs.mkdirSync(outputRoot, {recursive: true});
fs.writeFileSync(outputFile, `${JSON.stringify(plan, null, 2)}\n`);
const review = `# 第一期动效方向 v1\n\n状态：${plan.status}\n\n- 静帧板：${plan.source.boardSha256}\n- 当前台账：${plan.source.ledgerSha256}\n- 正式渲染：Remotion + A1 Motion IR\n- HyperFrames：同一 Motion IR 的 review-only 原型\n- 小云雀：当前不需要；仅保留无文字、无证据、无真人身份的外部插画动效入口\n- 代表性 canary：${plan.canary.shotIds.join(", ")}，静帧确认前禁止执行\n\n## 反 PPT 硬规则\n\n1. 不移动整张静帧作为主要动作。\n2. 不用卡片依次飞入表达流程。\n3. 动作必须落在语义演员：印章、打印机、信号、传送带、光标、选择区、真实源视频。\n4. 大多数镜头硬切；只有五个叙事转折使用动作接力。\n5. 每镜遵守“稳定状态 → 语义触发 → 一次因果响应 → 可读停留”。\n`;
fs.writeFileSync(reviewFile, review);
console.log(JSON.stringify({status: plan.status, output: path.relative(root, outputFile), review: path.relative(root, reviewFile), planSha256: plan.planSha256, shotCount: scenes.length, canary: plan.canary}, null, 2));
