#!/usr/bin/env node
/**
 * Build an auditable per-shot decision trace for the intelligent storyboard lane.
 *
 * This is intentionally backend-facing: it proves every card is driven by
 * subtitle semantics, typography direction, image/artwork route, and motion
 * intent instead of cloned or mechanical defaults.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-intelligent-decision-trace-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const propsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return fs.existsSync(filePath) ? crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex") : null;
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nonEmpty(value) {
  return text(value).length > 0;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function hasMechanicalCopy(scene, fill) {
  const visible = text(fill.visibleText || scene.presentation?.primary);
  const source = text(fill.sourceText || scene.storyboard?.sourceSubtitleText || scene.screenText);
  const what = text(fill.fillWhat);
  const how = text(fill.fillHow);
  return Boolean(visible && source && what === source) || Boolean(visible && how === source);
}

function objectRouteFor(scene, fill) {
  const assetRoute = text(fill.assetRoute || scene.storyboard?.artworkPipeline?.route || scene.storyboard?.visualSource);
  if (assetRoute === "typography-only") return "text-packaging";
  if (assetRoute === "deterministic-semantic-stage") return "semantic-component";
  if (/generated|artwork|image/iu.test(assetRoute)) return "generated-symbolic-artwork";
  return assetRoute || "missing";
}

function typographyDecision(scene) {
  const director = scene.storyboard?.typographyDirector || {};
  const typography = scene.layout?.typography || {};
  return {
    preset: text(director.preset),
    colorRole: text(director.colorRole),
    motion: text(director.motion),
    reason: text(director.reason),
    lines: Array.isArray(typography.lines) ? typography.lines : [],
    fontSize: typography.fontSize || null,
    fitRatio: typography.fitRatio || null,
    editableChineseLayerRequired: true,
  };
}

function motionDecision(scene, fill) {
  const motion = scene.motionPlan || {};
  return {
    semanticJob: text(fill.motionJob || motion.primaryAction),
    style: text(motion.motionStyle),
    kineticTextMode: text(motion.kineticText?.mode),
    readableHold: Boolean(motion.audit?.hasReadableHold),
    transitionOut: text(motion.transitionOut),
    reason: text(scene.storyboard?.motionTemplate?.reason || fill.motionJob || motion.primaryAction),
  };
}

function buildTrace(scene, index) {
  const fill = scene.storyboard?.semanticFill || {};
  const presentation = scene.presentation || {};
  const typographic = typographyDecision(scene);
  const motion = motionDecision(scene, fill);
  const sourceText = text(fill.sourceText || scene.storyboard?.sourceSubtitleText || presentation.fullSentence || scene.screenText);
  const visibleText = text(fill.visibleText || scene.storyboard?.visualFocusText || presentation.primary);
  const semanticStageKind = text(fill.semanticStageKind || scene.storyboard?.semanticDecision?.semanticStageKind);
  const assetRoute = text(fill.assetRoute || scene.storyboard?.visualSource || scene.storyboard?.artworkSource);
  const objectRoute = objectRouteFor(scene, fill);
  const blockers = [];

  const requiredFields = {
    sourceText,
    visibleText,
    semanticStageKind,
    presentationState: text(fill.presentationState || presentation.state),
    intent: text(fill.intent),
    fillWhat: text(fill.fillWhat),
    fillHow: text(fill.fillHow),
    assetRoute,
    layoutJob: text(fill.layoutJob),
    motionJob: text(fill.motionJob),
    typographyPreset: typographic.preset,
    typographyColorRole: typographic.colorRole,
    typographyMotion: typographic.motion,
    motionStyle: motion.style,
    backgroundState: text(scene.backgroundState),
    family: text(scene.family),
  };

  for (const [field, value] of Object.entries(requiredFields)) {
    if (!nonEmpty(value)) blockers.push({id: "missing-decision-field", field});
  }
  if (hasMechanicalCopy(scene, fill)) blockers.push({id: "mechanical-copy-decision", detail: "fillWhat/fillHow must describe execution, not repeat the subtitle"});
  if (sourceText && visibleText && sourceText === visibleText && sourceText.length > 14) blockers.push({id: "visible-text-not-focused", detail: "visible text is too close to full subtitle"});
  const generatedSubjectRiskText = `${fill.fillWhat || ""} ${scene.storyboard?.artworkFile || ""}`;
  if (objectRoute === "generated-symbolic-artwork" && /人头|头像|face|head|portrait|person|human/iu.test(generatedSubjectRiskText)) {
    blockers.push({id: "figurative-human-subject-risk", detail: "generated artwork route must prefer symbolic abstraction over concrete human heads"});
  }
  if (scene.storyboard?.artworkStatus === "adopted" && /head|face|portrait|person|human|人头|头像/iu.test(`${scene.storyboard?.artworkFile || ""} ${scene.storyboard?.artworkPath || ""}`)) {
    blockers.push({id: "adopted-artwork-human-subject-review", detail: "adopted artwork filename/path suggests figurative human subject"});
  }

  return {
    beatId: scene.beatId,
    index: index + 1,
    macroId: scene.macroId,
    timeRangeMs: {start: scene.sourceStartMs, end: scene.sourceEndMs},
    subtitle: {
      sourceText,
      visibleText,
      focusCompressionRatio: sourceText ? Number((visibleText.length / sourceText.length).toFixed(3)) : null,
      sourceSubtitleIndexes: scene.storyboard?.sourceSubtitleIndexes || [],
    },
    semanticDecision: {
      stageKind: semanticStageKind,
      presentationState: requiredFields.presentationState,
      intent: requiredFields.intent,
      objectRoute,
      assetRoute,
      evidenceNeed: text(fill.evidenceNeed || "none"),
      noFakeEvidence: true,
      generatedHumanSubjectsAllowed: false,
      symbolicAbstractionRequired: true,
    },
    executionDecision: {
      fillWhat: requiredFields.fillWhat,
      fillHow: requiredFields.fillHow,
      layoutJob: requiredFields.layoutJob,
      family: requiredFields.family,
      backgroundState: requiredFields.backgroundState,
      acceptance: Array.isArray(fill.acceptance) ? fill.acceptance : [],
      steps: Array.isArray(fill.executionSteps) ? fill.executionSteps : [],
    },
    typographyDecision: typographic,
    motionDecision: motion,
    artworkDecision: {
      status: text(scene.storyboard?.artworkStatus || "not-needed"),
      source: text(scene.storyboard?.artworkSource || scene.storyboard?.visualSource),
      file: text(scene.storyboard?.artworkFile),
      reviewOnly: scene.storyboard?.artworkReviewOnly !== false,
    },
    status: blockers.length ? "FAIL" : "PASS",
    blockers,
  };
}

const blockers = [];
if (!fs.existsSync(propsPath)) blockers.push({id: "missing-storyboard-props", detail: rel(propsPath)});
const props = fs.existsSync(propsPath) ? readJson(propsPath) : {scenes: []};
const traces = (props.scenes || []).map(buildTrace);

if (!traces.length) blockers.push({id: "no-scenes", detail: "No storyboard scenes found"});
for (const trace of traces) {
  for (const blocker of trace.blockers) blockers.push({id: blocker.id, beatId: trace.beatId, detail: blocker.detail || blocker.field || blocker});
}

const byStageKind = traces.reduce((acc, trace) => {
  const key = trace.semanticDecision.stageKind || "missing";
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});
const byObjectRoute = traces.reduce((acc, trace) => {
  const key = trace.semanticDecision.objectRoute || "missing";
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});
const byTypographyPreset = traces.reduce((acc, trace) => {
  const key = trace.typographyDecision.preset || "missing";
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});
const byMotionStyle = traces.reduce((acc, trace) => {
  const key = trace.motionDecision.style || "missing";
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const report = {
  contract: "A1StoryboardIntelligentDecisionTrace/v1",
  phaseId,
  status: blockers.length ? "FAIL" : "PASS",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    propsPath: rel(propsPath),
    propsSha256: sha256File(propsPath),
  },
  policy: {
    frontendDefault: "hide-trace-behind-details-or-backend-only",
    decisionChain: ["subtitle", "semantic", "execution", "typography", "motion", "artwork"],
    generatedHumanSubjectsAllowed: false,
    symbolicAbstractionRequired: true,
    editableChineseTypographyRequired: true,
    fakeEvidenceAllowed: false,
  },
  summary: {
    sceneCount: props.scenes?.length || 0,
    traceCount: traces.length,
    passCount: traces.filter((trace) => trace.status === "PASS").length,
    failCount: traces.filter((trace) => trace.status === "FAIL").length,
    blockerCount: blockers.length,
    byStageKind,
    byObjectRoute,
    byTypographyPreset,
    byMotionStyle,
    sourceFocusCompressionAverage: traces.length
      ? Number((traces.reduce((sum, trace) => sum + (trace.subtitle.focusCompressionRatio || 0), 0) / traces.length).toFixed(3))
      : null,
    uniqueTypographyPresetCount: unique(Object.keys(byTypographyPreset)).length,
    uniqueMotionStyleCount: unique(Object.keys(byMotionStyle)).length,
  },
  blockers,
  traceFile: "trace.json",
  nextAction: blockers.length ? "fix-missing-or-mechanical-storyboard-decisions-before-visual-upgrade" : "use-decision-trace-as-backend-proof-for-intelligent-storyboard-routing",
};

const tracePayload = {
  contract: "A1StoryboardIntelligentDecisionTracePayload/v1",
  phaseId,
  generatedAt: report.generatedAt,
  source: report.source,
  policy: report.policy,
  traces,
};

writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(artifactRoot, "trace.json"), tracePayload);
writeJson(path.join(publicRoot, "report.json"), report);
writeJson(path.join(publicRoot, "trace.json"), tracePayload);

console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  publicReportPath: rel(path.join(publicRoot, "report.json")),
  tracePath: rel(path.join(publicRoot, "trace.json")),
  nextAction: report.nextAction,
}, null, 2));
if (report.status !== "PASS") process.exitCode = 2;
