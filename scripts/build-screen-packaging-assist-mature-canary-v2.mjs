#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync, spawnSync} from "node:child_process";
import sharp from "sharp";
import {compileScreenPackagingAssistPlanV2} from "../apps/studio-next/src/lib/a1-screen-packaging-assist-director-v2.mjs";
import {compileScreenPackagingAssistAdapterV2} from "../apps/studio-next/src/lib/a1-screen-packaging-assist-adapter-v2.mjs";
import {
  validateScreenPackagingAssistAdapterV2,
  validateScreenPackagingAssistPlanV2,
} from "../apps/studio-next/src/lib/a1-screen-packaging-assist-schema-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const renderer = path.join(root, "remotion-renderer");
const publicRoot = path.join(renderer, "public");
const out = path.join(root, "work/screen-packaging-assist-mature-canary-v2");
const stageRoot = path.join(publicRoot, "proof-only/screen-packaging-assist-v2");
const entry = "src/screen-packaging-assist-v2-entry.tsx";
const composition = "ScreenPackagingAssistCanaryV2";
const output = {width: 960, height: 540};
const segmentFrames = 180;
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const implementationFiles = [
  "apps/studio-next/src/lib/a1-screen-packaging-assist-policy-v2.mjs",
  "apps/studio-next/src/lib/a1-screen-packaging-assist-schema-v2.mjs",
  "apps/studio-next/src/lib/a1-screen-packaging-assist-director-v2.mjs",
  "apps/studio-next/src/lib/a1-screen-packaging-assist-adapter-v2.mjs",
  "remotion-renderer/src/ScreenPackagingAssistV2.tsx",
  "remotion-renderer/src/ScreenPackagingAssistCanaryV2.tsx",
  "remotion-renderer/src/screen-packaging-assist-v2-entry.tsx",
  "remotion-renderer/public/proof-only/screen-packaging-assist-v2/default-suppressed.mp4",
  "remotion-renderer/package.json",
  "remotion-renderer/package-lock.json",
  "scripts/build-screen-packaging-assist-mature-canary-v2.mjs",
  "scripts/test-screen-packaging-assist-contract-v2.mjs",
  "scripts/test-screen-packaging-assist-canary-v2.mjs",
  "scripts/test-screen-packaging-assist-renderer-guard-v2.mjs",
];
const shaBuffer = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const sha = (file) => shaBuffer(fs.readFileSync(file));
const rel = (file) => path.relative(root, file);
const artifactRel = (file) => rel(path.join(out, path.basename(file)));
const copyRunOutput = (runOut) => {
  for (const name of fs.readdirSync(runOut))
    fs.cpSync(path.join(runOut, name), path.join(out, name), {recursive: true, force: true});
};
const runRemotion = (args) => execFileSync(
  path.join(renderer, "node_modules/.bin/remotion"),
  args,
  {cwd: renderer, stdio: "inherit"},
);

fs.mkdirSync(out, {recursive: true});
fs.mkdirSync(stageRoot, {recursive: true});
const lockPath = path.join(out, ".build.lock");
let lockFd;
try {
  lockFd = fs.openSync(lockPath, "wx");
} catch {
  throw new Error("screen-packaging-assist-v2-build-already-running");
}
const runOut = fs.mkdtempSync(path.join(out, ".run-"));
const stageDir = fs.mkdtempSync(path.join(stageRoot, "run-"));
const workspaceShaBefore = sha(workspacePath);
const currentPhaseShaBefore = sha(currentPhasePath);

try {
  const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
  const storyboardShots = workspace.production.shotIntelligence.currentStoryboardAuthority.shots;
  const resolveCurrentCapture = (shotId) => {
    const shot = storyboardShots.find((item) => item.shotId === shotId);
    if (!shot?.prototypeEligible) throw new Error(`${shotId}:prototype-eligibility-required`);
    const captured = shot.motionReviewPlan?.capturedSource;
    if (captured?.versionId !== shot.versionId || !captured?.sha256)
      throw new Error(`${shotId}:current-capture-binding-required`);
    const sourcePath = path.join(root, captured.path);
    if (!fs.existsSync(sourcePath) || sha(sourcePath) !== captured.sha256)
      throw new Error(`${shotId}:current-capture-sha-mismatch`);
    const reportPath = path.join(
      root,
      captured.reportPath || path.join(path.dirname(captured.path), "report.json"),
    );
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    if (
      report.storyboardBinding?.versionId !== shot.versionId ||
      report.storyboardBinding?.revisionSha256 !== shot.revisionSha256 ||
      report.output?.sha256 !== captured.sha256
    ) throw new Error(`${shotId}:capture-report-current-revision-mismatch`);
    return {shot, captured, sourcePath, reportPath, report};
  };

  const ed21 = resolveCurrentCapture("ED-21");
  const textEntry = ed21.report.textRangeEvidence?.find((entry) =>
    entry.event === "document_opened" &&
    entry.evidence?.exactMatch === true &&
    entry.evidence?.sourceTextSha256 === entry.evidence?.matchedTextSha256 &&
    entry.evidence?.nativeSelection?.containsExactText === false &&
    entry.evidence?.sourceHighlight?.detected === false,
  );
  const textEvidence = textEntry?.evidence;
  if (!textEvidence?.lineRects?.length) throw new Error("ED-21:exact-text-line-rects-required");
  if (
    textEvidence.viewport?.width !== ed21.report.output.width ||
    textEvidence.viewport?.height !== ed21.report.output.height ||
    !Number.isFinite(textEvidence.viewport?.scrollX) ||
    !Number.isFinite(textEvidence.viewport?.scrollY)
  ) throw new Error("ED-21:text-viewport-transform-required");
  const geometryFrame = Math.round((textEvidence.observedAtMs / 1000) * 60);
  if (geometryFrame < 0 || geometryFrame >= ed21.report.output.frameCount)
    throw new Error("ED-21:text-geometry-frame-out-of-range");
  const evidenceBinding = {
    kind: "TEXT_RANGE",
    sourceTextSha256: textEvidence.sourceTextSha256,
    matchedTextSha256: textEvidence.matchedTextSha256,
    rangeToken: textEvidence.rangeToken,
    frameIndex: geometryFrame,
    viewport: {
      width: textEvidence.viewport.width,
      height: textEvidence.viewport.height,
      scrollX: textEvidence.viewport.scrollX,
      scrollY: textEvidence.viewport.scrollY,
    },
    coordinateSpace: "NORMALIZED_SOURCE_VIEWPORT",
    lineRects: textEvidence.lineRects,
    sourceStateAlreadyEmphatic: false,
  };
  const definitions = [
    {id: "evidence-underline", intent: "EVIDENCE_CLAIM"},
    {id: "highlight-wash", intent: "KEY_RESULT"},
  ];
  const stagedName = `${ed21.shot.shotId.toLowerCase()}-${ed21.captured.sha256.slice(0, 12)}.mp4`;
  const stagedPath = path.join(stageDir, stagedName);
  fs.copyFileSync(ed21.sourcePath, stagedPath);
  if (sha(stagedPath) !== ed21.captured.sha256)
    throw new Error("ED-21:staged-source-sha-mismatch");
  const sourceVideoUri = path.relative(publicRoot, stagedPath).split(path.sep).join("/");
  const variants = definitions.map((definition, index) => {
    const plan = compileScreenPackagingAssistPlanV2({
      shotId: ed21.shot.shotId,
      source: {
        videoSha256: ed21.captured.sha256,
        revisionSha256: ed21.shot.revisionSha256,
      },
      durationFrames: segmentFrames,
      intent: definition.intent,
      evidenceBinding,
    });
    const planValidation = validateScreenPackagingAssistPlanV2(plan);
    if (planValidation.status !== "PASS")
      throw new Error(`${definition.id}:plan:${planValidation.failures.join(",")}`);
    const adapter = compileScreenPackagingAssistAdapterV2({
      plan,
      sourceVideoSha256: ed21.captured.sha256,
      output,
    });
    const adapterValidation = validateScreenPackagingAssistAdapterV2(adapter);
    if (adapterValidation.status !== "PASS")
      throw new Error(`${definition.id}:adapter:${adapterValidation.failures.join(",")}`);
    return {
      id: definition.id,
      sourceFrame: geometryFrame,
      sourceVideoUri,
      sourceVideoSha256: ed21.captured.sha256,
      startFrame: index * segmentFrames,
      overlayEnabled: true,
      plan,
      adapter,
    };
  });
  const props = {
    variants: variants.map((variant) => ({
      id: variant.id,
      sourceFrame: variant.sourceFrame,
      sourceVideoUri: variant.sourceVideoUri,
      sourceVideoSha256: variant.sourceVideoSha256,
      startFrame: variant.startFrame,
      overlayEnabled: true,
      adapter: variant.adapter,
    })),
  };
  const baselineProps = {
    variants: props.variants.map((variant) => ({...variant, overlayEnabled: false})),
  };
  const propsPath = path.join(runOut, "props.json");
  const baselinePropsPath = path.join(runOut, "baseline-props.json");
  fs.writeFileSync(propsPath, `${JSON.stringify(props, null, 2)}\n`);
  fs.writeFileSync(baselinePropsPath, `${JSON.stringify(baselineProps, null, 2)}\n`);

  const mediaPath = path.join(runOut, "screen-packaging-assist-mature-v2-review-960x540.mp4");
  runRemotion([
    "render", entry, composition, mediaPath,
    "--props", propsPath,
    "--codec", "h264",
    "--crf", "16",
    "--log", "error",
  ]);

  const proofFrames = [];
  for (const variant of variants) {
    const frame = variant.startFrame + 150;
    const baseline = path.join(runOut, `${variant.id}-baseline.png`);
    const decorated = path.join(runOut, `${variant.id}-decorated.png`);
    const replay = path.join(runOut, `${variant.id}-decorated-replay.png`);
    runRemotion(["still", entry, composition, baseline, "--props", baselinePropsPath, "--frame", String(frame), "--log", "error"]);
    runRemotion(["still", entry, composition, decorated, "--props", propsPath, "--frame", String(frame), "--log", "error"]);
    runRemotion(["still", entry, composition, replay, "--props", propsPath, "--frame", String(frame), "--log", "error"]);
    const baselineRaw = await sharp(baseline).removeAlpha().raw().toBuffer({resolveWithObject: true});
    const decoratedRaw = await sharp(decorated).removeAlpha().raw().toBuffer({resolveWithObject: true});
    const replayRaw = await sharp(replay).removeAlpha().raw().toBuffer({resolveWithObject: true});
    if (
      baselineRaw.info.width !== output.width || baselineRaw.info.height !== output.height ||
      decoratedRaw.info.width !== output.width || decoratedRaw.info.height !== output.height
    ) throw new Error(`${variant.id}:proof-dimensions-invalid`);
    const deterministicPixelSha256 = shaBuffer(decoratedRaw.data);
    if (deterministicPixelSha256 !== shaBuffer(replayRaw.data))
      throw new Error(`${variant.id}:repeat-render-pixel-drift`);
    const actor = variant.adapter.actors[0];
    const allowedEnvelopes = actor.rects.map((rect) => ({
      left: Math.max(0, Math.floor(rect.x - 18)),
      top: Math.max(0, Math.floor(rect.y - 14)),
      right: Math.min(output.width, Math.ceil(rect.x + rect.width + 18)),
      bottom: Math.min(output.height, Math.ceil(rect.y + rect.height + 18)),
    }));
    let changedPixels = 0;
    let changedInsidePixels = 0;
    let changedOutsidePixels = 0;
    for (let offset = 0, pixelIndex = 0; offset < baselineRaw.data.length; offset += 3, pixelIndex += 1) {
      const changed =
        baselineRaw.data[offset] !== decoratedRaw.data[offset] ||
        baselineRaw.data[offset + 1] !== decoratedRaw.data[offset + 1] ||
        baselineRaw.data[offset + 2] !== decoratedRaw.data[offset + 2];
      if (!changed) continue;
      changedPixels += 1;
      const x = pixelIndex % output.width;
      const y = Math.floor(pixelIndex / output.width);
      const inside = allowedEnvelopes.some((box) =>
        x >= box.left && x < box.right && y >= box.top && y < box.bottom);
      if (inside) changedInsidePixels += 1;
      else changedOutsidePixels += 1;
    }
    if (changedInsidePixels < 40)
      throw new Error(`${variant.id}:approved-envelope-pixel-delta-too-small:${changedInsidePixels}`);
    if (changedOutsidePixels !== 0)
      throw new Error(`${variant.id}:source-pixels-changed-outside-approved-envelope:${changedOutsidePixels}`);
    proofFrames.push({
      effect: actor.kind,
      shotId: ed21.shot.shotId,
      frame,
      geometryFrame,
      changedPixels,
      changedInsidePixels,
      changedOutsidePixels,
      allowedEnvelopes,
      deterministicPixelSha256,
      repeatRenderPixelMatch: true,
      baseline: {path: artifactRel(baseline), sha256: sha(baseline)},
      decorated: {path: artifactRel(decorated), sha256: sha(decorated)},
      replay: {path: artifactRel(replay), sha256: sha(replay)},
    });
  }

  const contactSheet = path.join(runOut, "contact-sheet.png");
  const images = await Promise.all(variants.map((variant) =>
    sharp(path.join(runOut, `${variant.id}-decorated.png`)).png().toBuffer()));
  await sharp({create: {
    width: output.width * images.length,
    height: output.height,
    channels: 3,
    background: "#f4f1e8",
  }}).composite(images.map((input, index) => ({input, left: output.width * index, top: 0}))).png().toFile(contactSheet);

  const ffprobe = JSON.parse(execFileSync(path.join(root, ".tools/bin/ffprobe"), [
    "-v", "error", "-count_frames",
    "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration",
    "-of", "json", mediaPath,
  ], {encoding: "utf8"}));
  const stream = ffprobe.streams.find((item) => item.codec_type === "video");
  const decode = spawnSync(path.join(root, ".tools/bin/ffmpeg"), [
    "-v", "error", "-i", mediaPath, "-f", "null", "-",
  ], {encoding: "utf8"});
  const effects = variants.flatMap((variant) => variant.adapter.actors.map((actor) => actor.kind));
  const allowedKinds = new Set([
    "EVIDENCE_UNDERLINE", "HIGHLIGHT_WASH", "MARGIN_BRACKET",
    "CAUSAL_TETHER_DASHED", "STATE_TICKS",
  ]);
  const forbiddenVisibleEffects = effects.filter((kind) => !allowedKinds.has(kind));
  const implementation = implementationFiles.map((file) => {
    const absolute = path.join(root, file);
    return {path: file, sha256: sha(absolute)};
  });
  const packageJson = JSON.parse(fs.readFileSync(path.join(renderer, "package.json"), "utf8"));
  const packageLock = JSON.parse(fs.readFileSync(path.join(renderer, "package-lock.json"), "utf8"));
  const remotionDependencies = Object.entries(packageJson.dependencies).filter(
    ([name]) => name === "remotion" || name.startsWith("@remotion/"),
  );
  const dependencyVersions = Object.fromEntries(remotionDependencies.flatMap(([name, version]) => [
    [`manifest:${name}`, version],
    [`lock:${name}`, packageLock.packages[`node_modules/${name}`]?.version || null],
  ]));
  const workspaceShaAfter = sha(workspacePath);
  const currentPhaseShaAfter = sha(currentPhasePath);
  const failures = [];
  if (stream?.width !== output.width || stream?.height !== output.height) failures.push("MEDIA_DIMENSIONS");
  if (stream?.r_frame_rate !== "60/1") failures.push("MEDIA_FPS");
  if (Number(stream?.nb_read_frames) !== segmentFrames * variants.length) failures.push("MEDIA_FRAME_COUNT");
  if (decode.status !== 0) failures.push("MEDIA_DECODE");
  if (forbiddenVisibleEffects.length) failures.push("FORBIDDEN_VISIBLE_EFFECTS");
  if (variants.some((variant) => variant.adapter.actors.length > 1)) failures.push("MULTIPLE_PRIMARY_ACTORS");
  if (proofFrames.some((proof) => proof.changedOutsidePixels !== 0)) failures.push("SOURCE_PIXEL_MUTATION");
  if (proofFrames.some((proof) => !proof.repeatRenderPixelMatch)) failures.push("NON_DETERMINISTIC_RENDER");
  if (workspaceShaBefore !== workspaceShaAfter) failures.push("WORKSPACE_MUTATION");
  if (currentPhaseShaBefore !== currentPhaseShaAfter) failures.push("CURRENT_PHASE_MUTATION");
  if (new Set(Object.values(dependencyVersions)).size !== 1 || dependencyVersions["manifest:remotion"] !== "4.0.520")
    failures.push("REMOTION_VERSION_DRIFT");

  const audit = {
    contract: "A1ScreenPackagingAssistCanaryAudit/v2",
    status: failures.length ? "FAIL" : "PASS",
    source: {
      shotId: ed21.shot.shotId,
      versionId: ed21.shot.versionId,
      revisionSha256: ed21.shot.revisionSha256,
      videoPath: ed21.captured.path,
      videoSha256: ed21.captured.sha256,
      captureReport: rel(ed21.reportPath),
      captureReportSha256: sha(ed21.reportPath),
      prototypeEligible: ed21.shot.prototypeEligible,
    },
    evidenceBinding,
    evidence: {
      exactText: textEvidence.matchedText,
      sourceTextSha256: textEvidence.sourceTextSha256,
      matchedTextSha256: textEvidence.matchedTextSha256,
      rangeToken: textEvidence.rangeToken,
      geometryFrame,
      viewport: evidenceBinding.viewport,
      lineRects: textEvidence.lineRects,
    },
    effects,
    forbiddenVisibleEffects,
    adapters: variants.map((variant) => ({
      id: variant.id,
      planSha256: variant.plan.planSha256,
      adapterSha256: variant.adapter.adapterSha256,
      sourceVideoSha256: variant.sourceVideoSha256,
    })),
    proofFrames,
    props: {path: artifactRel(propsPath), sha256: sha(propsPath)},
    baselineProps: {path: artifactRel(baselinePropsPath), sha256: sha(baselinePropsPath)},
    media: {
      path: artifactRel(mediaPath),
      sha256: sha(mediaPath),
      width: output.width,
      height: output.height,
      fps: stream?.r_frame_rate,
      frameCount: Number(stream?.nb_read_frames),
      durationMs: Math.round(Number(ffprobe.format.duration) * 1000),
    },
    contactSheet: {
      path: artifactRel(contactSheet),
      sha256: sha(contactSheet),
      width: output.width * images.length,
      height: output.height,
    },
    implementation,
    dependencyVersions,
    checks: {
      currentShotRevision: ed21.shot.revisionSha256 === ed21.report.storyboardBinding.revisionSha256,
      exactTextIdentity: textEvidence.sourceTextSha256 === textEvidence.matchedTextSha256,
      fullViewportTransformIdentity: Number.isFinite(evidenceBinding.viewport.scrollX) && Number.isFinite(evidenceBinding.viewport.scrollY),
      geometryFrameIsRenderedFrame: variants.every((variant) => variant.sourceFrame === geometryFrame),
      exhaustiveRuntimeValidation: variants.every((variant) =>
        validateScreenPackagingAssistPlanV2(variant.plan).status === "PASS" &&
        validateScreenPackagingAssistAdapterV2(variant.adapter).status === "PASS"),
      onePrimaryActorPerSegment: variants.every((variant) => variant.adapter.actors.length <= 1),
      forbiddenEffectsDerivedEmpty: forbiddenVisibleEffects.length === 0,
      changedPixelsInsideApprovedEnvelope: proofFrames.every((proof) =>
        proof.changedInsidePixels >= 40 && proof.changedOutsidePixels === 0),
      sourcePixelsPreservedOutsideApprovedEnvelope: proofFrames.every((proof) => proof.changedOutsidePixels === 0),
      repeatRenderPixelsDeterministic: proofFrames.every((proof) => proof.repeatRenderPixelMatch),
      fullDecode: decode.status === 0,
      implementationIdentityRecorded: implementation.length === implementationFiles.length,
      dependencyVersionsAligned: new Set(Object.values(dependencyVersions)).size === 1,
    },
    boundary: {
      reviewOnly: true,
      productionAdmission: false,
      userVisualApproval: "NOT_APPROVED",
      workspaceShaBefore,
      workspaceShaAfter,
      workspaceMutationPerformed: workspaceShaBefore !== workspaceShaAfter,
      currentPhaseShaBefore,
      currentPhaseShaAfter,
      currentCandidateReplacementPerformed: currentPhaseShaBefore !== currentPhaseShaAfter,
    },
    failures,
    generatedAt: new Date().toISOString(),
  };
  const auditPath = path.join(runOut, "audit-report.json");
  fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
  if (failures.length) throw new Error(`screen-packaging-assist-canary-v2-failed:${failures.join(",")}`);
  copyRunOutput(runOut);
  console.log(JSON.stringify({...audit, artifactRoot: rel(out)}, null, 2));
} finally {
  fs.rmSync(stageDir, {recursive: true, force: true});
  fs.rmSync(runOut, {recursive: true, force: true});
  if (lockFd !== undefined) fs.closeSync(lockFd);
  fs.rmSync(lockPath, {force: true});
}
