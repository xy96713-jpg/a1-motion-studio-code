import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {fileURLToPath} from "node:url";
import {
  assertEditorialAssetWorkbench,
  recalculateEditorialAssetWorkbench,
} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {
  A1_ASSET_GENERATION_JOB_CONTRACT,
  createProductionEvent,
} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildImagegenArtDirectionSpec} from "../apps/studio-next/src/lib/a1-imagegen-art-direction-v1.mjs";
import {
  persistProjectState,
  readProjectWorkspace,
  withProjectLock,
} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const sourceFrame = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-01.jpg");
const styleReference = path.join(root, ".codex-artifacts/design-references/ed01-typography-imagegen-reference-v1.png");
const contract = "A1ShotArtDirectionReferenceSet/v1";
const purpose = "ed01-typography-packaging-concept-v1";
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const nowIso = () => new Date().toISOString();

const directions = [
  {
    id: "mic-depth-imprint",
    label: "麦克风压印",
    prompt: `Use case: identity-preserve\nAsset type: ED-01 editorial motion-graphics art-direction reference\nInput images: Image 1 is the edit target and identity/scene authority; Image 2 is typography scale and pixel-energy reference only.\nPrimary request: Preserve Image 1 exactly, including the real person's identity, face, body, pose, microphone, room, lighting, monitor, camera framing, and all physical objects. Add only premium Chinese pixel-editorial typography packaging. The typography must feel physically embedded in the room instead of floating over the footage.\nText (verbatim): \"vibe coding\"; \"智能写作\"; \"工作台\". Spell the Latin phrase exactly v-i-b-e space c-o-d-i-n-g. Render the Chinese characters exactly once each, with no substitutions.\nComposition: keep the eyes, mouth, nose, expression and torso readable. Put small acid-chartreuse \"vibe coding\" inside the real right monitor plane. Build \"智能写作\" as a custom warm-bone-white pixel imprint emerging from the left desk edge, with part of the glyphs naturally hidden behind the real microphone arm. Make \"工作台\" the decisive large word near the right monitor lower edge, partially tucked behind the monitor bezel, ready to hand off into the next shot.\nStyle: mature creator-editorial packaging, custom Chinese pixel glyph proportions, strong scale contrast, cut corners, a restrained one-to-three-pixel cobalt registration shadow only on the handoff edge.\nConstraints: edit typography only; preserve identity and scene; object-bound depth; one focal hierarchy; exact text; no face occlusion.\nAvoid: floating logo, poster title pasted over the torso, HUD, cards, labels, decorative lines, bottom strip, fake interface, new objects, extra text, watermark, generic gaming UI, full-frame pixel filter.`,
  },
  {
    id: "monitor-overflow",
    label: "显示器溢出",
    prompt: `Use case: identity-preserve\nAsset type: ED-01 editorial motion-graphics art-direction reference\nInput images: Image 1 is the edit target and identity/scene authority; Image 2 is typography scale and pixel-energy reference only.\nPrimary request: Preserve Image 1 exactly, including the real person's identity, face, body, pose, microphone, room, lighting, monitor, camera framing, and all physical objects. Add only one sophisticated object-bound pixel-typography system.\nText (verbatim): \"vibe coding\"; \"智能写作\"; \"工作台\". Spell v-i-b-e space c-o-d-i-n-g exactly. Chinese must be exact and fully legible.\nComposition: make \"vibe coding\" appear as small acid-chartreuse terminal pixels genuinely emitted by the real right monitor. Let the warm-bone-white Chinese phrase begin inside that monitor, cross the real bezel with a sharp crop, and resolve as a large asymmetrical \"工作台\" outside the screen without touching the face. Use monitor perspective, bezel occlusion and controlled pixel fragmentation to make the type cross from screen-space into room-space.\nStyle: premium creator-editorial, bespoke Chinese pixel display lettering, high scale tension, irregular but intentional baseline, one cobalt selection-edge accent reserved for the final handoff.\nConstraints: typography edit only; preserve identity and real room; exact text; eyes and mouth completely clear; the monitor must remain identifiable.\nAvoid: floating text panel, logo lockup, HUD, cards, captions, decorative rule, bottom bar, fake screen, extra readable text, duplicated phrase, watermark, neon cyberpunk treatment.`,
  },
  {
    id: "desk-type-object",
    label: "桌面字形装置",
    prompt: `Use case: identity-preserve\nAsset type: ED-01 editorial motion-graphics art-direction reference\nInput images: Image 1 is the edit target and identity/scene authority; Image 2 is typography scale and pixel-energy reference only.\nPrimary request: Preserve Image 1 exactly, including the person's identity, expression, body, microphone, room, warm lighting, monitor, and camera framing. Add only a physical editorial typography intervention anchored to the desk and microphone geometry.\nText (verbatim): \"vibe coding\"; \"智能写作\"; \"工作台\". Spell v-i-b-e space c-o-d-i-n-g exactly and preserve every Chinese character.\nComposition: keep the first half-second visual idea quiet and person-led. Place small acid-chartreuse \"vibe coding\" on the real monitor. Treat \"智能写作\" as two warm-bone-white custom pixel blocks pressed onto the desk plane with perspective, some strokes passing behind the microphone arm and some in front of the desk edge. Make \"工作台\" a single oversized sculptural word that rises from the right desk/monitor junction, with a small cobalt cursor notch on its final edge for the next-shot handoff. Preserve generous negative space around the face.\nStyle: tactile editorial pixel typography, subtle print registration, bespoke Chinese glyph architecture, restrained and cinematic rather than game-like.\nConstraints: change typography only; object-bound depth; exact text; no face or mouth coverage; no synthetic interface.\nAvoid: pasted poster, floating logo, HUD, cards, labels, decorative line, lower third, subtitle stack, extra text, watermark, glossy 3D lettering, cyberpunk neon.`,
  },
];

for (const direction of directions) direction.compositionSpec = buildImagegenArtDirectionSpec(direction.id, direction.label);

function inputContract() {
  if (!fs.existsSync(sourceFrame)) throw new Error("ed01-source-frame-missing");
  if (!fs.existsSync(styleReference)) throw new Error("ed01-style-reference-missing");
  return {
    sourceFrame: {path: sourceFrame, sha256: fileSha256(sourceFrame), role: "edit-target-identity-scene-authority"},
    styleReference: {path: styleReference, sha256: fileSha256(styleReference), role: "reference-only-typography-scale-energy"},
  };
}

function jobFor(workspace, direction, inputs, createdAt) {
  const promptSha256 = sha256(direction.prompt);
  const cacheKey = sha256({
    projectId: workspace.production.project.projectId,
    sourceHash: workspace.article.sourceTextSha256,
    purpose,
    directionId: direction.id,
    promptSha256,
    sourceFrameSha256: inputs.sourceFrame.sha256,
    styleReferenceSha256: inputs.styleReference.sha256,
  });
  return {
    contract: A1_ASSET_GENERATION_JOB_CONTRACT,
    id: `asset-ed01-art-direction-${direction.id}-${cacheKey.slice(0, 12)}`,
    projectId: workspace.production.project.projectId,
    sourceHash: workspace.article.sourceTextSha256,
    assetPackSha256: workspace.library.assetPackSha256,
    assetId: "composition-ED-01",
    candidateId: `ED-01-ART-${direction.id}`,
    direction: direction.label,
    purpose,
    taxonomy: "identity-preserve",
    route: "subscription-image-generation",
    provider: "openai-built-in-imagegen",
    providerMode: "subscription-zero-extra-cost",
    status: "queued",
    prompt: direction.prompt,
    promptSha256,
    inputReferences: inputs,
    cacheKey,
    outputRelativePath: `generated/system-line/editorial-asset-workbench-v1/art-direction/ED-01/${direction.id}.png`,
    attempts: 0,
    cacheHit: false,
    referenceOnly: true,
    candidateAdoptionAllowed: false,
    createdAt,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    creativeInputAllowed: true,
    compositionSpec: direction.compositionSpec,
    output: null,
    error: null,
  };
}

function queue() {
  const inputs = inputContract();
  const createdAt = nowIso();
  return withProjectLock(appRoot, () => {
    const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const next = structuredClone(current);
    const prior = next.production.generation.jobs.filter((job) => job.purpose === purpose);
    const jobs = directions.map((direction) => {
      const expected = jobFor(next, direction, inputs, createdAt);
      const existing = prior.find((job) => job.cacheKey === expected.cacheKey);
      if (existing) {
        existing.creativeInputAllowed = true;
        existing.compositionSpec = direction.compositionSpec;
        if (existing.output) {
          existing.output.creativeInputAllowed = true;
          existing.output.compositionSpec = direction.compositionSpec;
        }
        return existing;
      }
      next.production.generation.jobs.push(expected);
      return expected;
    });
    next.production.generation.summary = {
      queued: next.production.generation.jobs.filter((job) => job.status === "queued").length,
      running: next.production.generation.jobs.filter((job) => job.status === "running").length,
      complete: next.production.generation.jobs.filter((job) => job.status === "complete").length,
      failed: next.production.generation.jobs.filter((job) => job.status === "failed").length,
    };
    next.production.generation.updatedAt = createdAt;
    next.production.shotArtDirection = {
      contract,
      shotId: "ED-01",
      targetShotId: "ED-02",
      purpose,
      status: jobs.every((job) => job.status === "complete") ? "concepts-ready" : "concepts-queued",
      jobIds: jobs.map((job) => job.id),
      outputs: jobs.filter((job) => job.output).map((job) => ({jobId: job.id, candidateId: job.candidateId, direction: job.direction, ...job.output})),
      reviewOnly: true,
      creativeInputAllowed: true,
      candidateAdoptionAllowed: false,
      sourceFrameSha256: inputs.sourceFrame.sha256,
      updatedAt: createdAt,
    };
    const event = createProductionEvent({workspace: current, action: "shot-art-direction-reference-jobs-queued", targetId: "composition-ED-01", payload: {contract, purpose, jobIds: jobs.map((job) => job.id), concurrency: 2}});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    const recalculated = recalculateEditorialAssetWorkbench(next, createdAt);
    persistProjectState(appRoot, recalculated, {event});
    return {status: "QUEUED", contract, jobs: jobs.map((job) => ({id: job.id, direction: job.direction, prompt: job.prompt, outputRelativePath: job.outputRelativePath, status: job.status})), workspaceSha256: recalculated.workspaceSha256};
  });
}

async function record(assignments) {
  if (!assignments.length) throw new Error("record-requires-jobId=filePath");
  const completedAt = nowIso();
  const prepared = [];
  for (const assignment of assignments) {
    const separator = assignment.indexOf("=");
    if (separator < 1) throw new Error(`invalid-record-assignment:${assignment}`);
    const jobId = assignment.slice(0, separator);
    const source = path.resolve(assignment.slice(separator + 1));
    if (!fs.existsSync(source)) throw new Error(`generated-output-missing:${source}`);
    const metadata = await sharp(source).metadata();
    if (!metadata.width || !metadata.height) throw new Error(`generated-output-dimensions-missing:${source}`);
    prepared.push({jobId, source, width: metadata.width, height: metadata.height, sha256: fileSha256(source)});
  }
  return withProjectLock(appRoot, () => {
    const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const next = structuredClone(current);
    const outputs = [];
    for (const item of prepared) {
      const job = next.production.generation.jobs.find((entry) => entry.id === item.jobId && entry.purpose === purpose);
      if (!job) throw new Error(`ed01-art-direction-job-not-found:${item.jobId}`);
      const outputPath = path.join(publicRoot, job.outputRelativePath);
      if (!outputPath.startsWith(`${publicRoot}${path.sep}`)) throw new Error("ed01-art-direction-output-outside-public");
      fs.mkdirSync(path.dirname(outputPath), {recursive: true});
      if (path.resolve(item.source) !== path.resolve(outputPath)) fs.copyFileSync(item.source, outputPath);
      const outputSha256 = fileSha256(outputPath);
      job.status = "complete";
      job.startedAt ||= completedAt;
      job.completedAt = completedAt;
      job.durationMs = Math.max(1, Date.parse(job.completedAt) - Date.parse(job.startedAt || job.createdAt));
      job.attempts = Math.max(1, Number(job.attempts || 0));
      job.output = {
        contract: "A1ShotArtDirectionReference/v1",
        publicUrl: `/${job.outputRelativePath}`,
        sha256: outputSha256,
        width: item.width,
        height: item.height,
        provider: job.provider,
        model: "gpt-image-2",
        promptSha256: job.promptSha256,
        inputReferenceHashes: [job.inputReferences.sourceFrame.sha256, job.inputReferences.styleReference.sha256],
        creativeInputAllowed: job.creativeInputAllowed === true,
        compositionSpec: job.compositionSpec,
        referenceOnly: true,
        generatedAt: completedAt,
      };
      outputs.push({jobId: job.id, candidateId: job.candidateId, direction: job.direction, ...job.output});
    }
    next.production.generation.summary = {
      queued: next.production.generation.jobs.filter((job) => job.status === "queued").length,
      running: next.production.generation.jobs.filter((job) => job.status === "running").length,
      complete: next.production.generation.jobs.filter((job) => job.status === "complete").length,
      failed: next.production.generation.jobs.filter((job) => job.status === "failed").length,
    };
    next.production.generation.updatedAt = completedAt;
    const currentJobs = next.production.generation.jobs.filter((job) => job.purpose === purpose);
    next.production.shotArtDirection = {
      contract,
      shotId: "ED-01",
      targetShotId: "ED-02",
      purpose,
      status: currentJobs.length === directions.length && currentJobs.every((job) => job.status === "complete") ? "concepts-ready" : "concepts-generating",
      jobIds: currentJobs.map((job) => job.id),
      outputs: currentJobs.filter((job) => job.output).map((job) => ({jobId: job.id, candidateId: job.candidateId, direction: job.direction, ...job.output})),
      reviewOnly: true,
      creativeInputAllowed: true,
      candidateAdoptionAllowed: false,
      sourceFrameSha256: currentJobs[0]?.inputReferences?.sourceFrame?.sha256 || null,
      updatedAt: completedAt,
    };
    const event = createProductionEvent({workspace: current, action: "shot-art-direction-reference-output-recorded", targetId: "composition-ED-01", payload: {contract, purpose, outputSha256s: outputs.map((output) => output.sha256)}});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    const recalculated = recalculateEditorialAssetWorkbench(next, completedAt);
    const report = {...recalculated.production.shotArtDirection, workspaceSha256: recalculated.workspaceSha256};
    persistProjectState(appRoot, recalculated, {event, files: {"ed01-art-direction-reference-v1.json": report}});
    return {status: report.status, contract, outputs, workspaceSha256: recalculated.workspaceSha256};
  });
}

const args = process.argv.slice(2);
const result = args[0] === "--record" ? await record(args.slice(1)) : queue();
console.log(JSON.stringify(result, null, 2));
