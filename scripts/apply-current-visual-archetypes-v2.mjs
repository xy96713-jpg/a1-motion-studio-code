#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const rendererPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const artifactPath = path.join(root, ".codex-artifacts/system-progress-system-line/current-visual-archetypes-v2/report.json");
const publicPath = path.join(root, "apps/studio-next/public/generated/system-line/current-visual-archetypes-v2/report.json");

const archetypes = {
  "thesis-statement": {
    typographyRole: "editorial-serif",
    accentPolicy: "ink title; cobalt rule; muted red only for a true contradiction",
    layoutRule: "one editable judgment and one subordinate visual zone with generous paper",
    motionRule: "one semantic-line reveal, short settle, readable hold",
  },
  "process-path": {
    typographyRole: "information-sans",
    accentPolicy: "cobalt path and active step only",
    layoutRule: "no more than four action phrases on one causal path; no card wall",
    motionRule: "path first, then causal nodes; previous nodes remain visible at lower emphasis",
  },
  "contrast-turn": {
    typographyRole: "impact-condensed",
    accentPolicy: "muted red for rejected premise; cobalt for correction",
    layoutRule: "two equal-scale claims separated by one transition axis",
    motionRule: "establish premise, then reveal correction with one structural shift",
  },
  "evidence-source": {
    typographyRole: "information-sans",
    accentPolicy: "cobalt crop or underline tied to verified source",
    layoutRule: "verified source occupies the main field; title and host remain in a separate safe area",
    motionRule: "source first, then evidence lock; camera movement limited to six percent",
  },
  "archive-timeline": {
    typographyRole: "information-sans",
    accentPolicy: "cobalt current state; paper and ink for history",
    layoutRule: "versions or records share one archive axis; history is demoted and current is explicit",
    motionRule: "records archive in sequence and the current state locks last",
  },
  "quiet-resolution": {
    typographyRole: "editorial-serif",
    accentPolicy: "ink first; cobalt may close an existing motif",
    layoutRule: "one conclusion and generous negative space; no new visual object",
    motionRule: "gentle settle and long hold; no slam ending",
  },
};

const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha256Json = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

function archetypeIdFor(scene) {
  const beatNumber = Number(String(scene.beatId || "").split("-B")[1] || 0);
  const hasVerifiedEntity = (scene.entityEvidence || []).some((item) => item.asset && item.assetSha256 && item.sourceUrl && item.officialHost);
  if (scene.macroId === "H11" && beatNumber >= 2) return "quiet-resolution";
  if (hasVerifiedEntity) return "evidence-source";
  if (scene.family === "archive-stack") return "archive-timeline";
  if (["process-chain", "annotation-judgement", "insertion-flow"].includes(scene.family)) return "process-path";
  if (["model-comparison", "editorial-metaphor", "direction-convergence"].includes(scene.family)) return "contrast-turn";
  if (["question", "comparison", "criteria-write", "decision-branch"].includes(scene.presentation?.state)) return "contrast-turn";
  return "thesis-statement";
}

function apply(props) {
  const rows = [];
  for (const scene of props.scenes || []) {
    const id = archetypeIdFor(scene);
    const archetype = archetypes[id];
    scene.storyboard = {
      ...(scene.storyboard || {}),
      visualArchetype: {
        contract: "A1FilmVisualArchetype/v2",
        id,
        ...archetype,
        factualEvidenceRequired: id === "evidence-source",
        rejects: ["fake-interface", "decorative-hud", "card-wall", "unverified-evidence", "overlapping-type", "more-than-one-focal-message"],
      },
    };
    rows.push({beatId: scene.beatId, family: scene.family, archetypeId: id, verifiedEntityCount: (scene.entityEvidence || []).filter((item) => item.asset && item.assetSha256).length});
  }
  props.contentHash = sha256Json({
    sourceProductionHash: props.sourceProductionHash,
    sourceVariationHash: props.sourceVariationHash,
    visualMasterHash: props.visualMasterHash,
    scenes: props.scenes,
  });
  return rows;
}

if (sha256File(storyboardPropsPath) !== sha256File(rendererPropsPath)) throw new Error("storyboard-renderer-props-mismatch-before-archetype-apply");
const storyboardProps = readJson(storyboardPropsPath);
const rendererProps = readJson(rendererPropsPath);
const beforeSha256 = sha256File(rendererPropsPath);
const rows = apply(storyboardProps);
apply(rendererProps);
writeJson(storyboardPropsPath, storyboardProps);
writeJson(rendererPropsPath, rendererProps);
const storyboardSha256 = sha256File(storyboardPropsPath);
const rendererSha256 = sha256File(rendererPropsPath);
if (storyboardSha256 !== rendererSha256) throw new Error("storyboard-renderer-props-mismatch-after-archetype-apply");

const counts = rows.reduce((result, row) => ({...result, [row.archetypeId]: (result[row.archetypeId] || 0) + 1}), {});
const failures = Object.keys(archetypes).filter((id) => !counts[id]).map((id) => `missing-archetype:${id}`);
const evidenceRows = rows.filter((row) => row.archetypeId === "evidence-source");
if (evidenceRows.some((row) => row.verifiedEntityCount < 1)) failures.push("evidence-source-without-verified-entity");
const report = {
  contract: "A1CurrentVisualArchetypeApplication/v2",
  status: failures.length ? "BLOCKED" : "APPLIED",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  beforePropsSha256: beforeSha256,
  after: {storyboardPropsSha256: storyboardSha256, rendererPropsSha256: rendererSha256, parity: storyboardSha256 === rendererSha256},
  archetypeCount: Object.keys(archetypes).length,
  counts,
  evidenceRows,
  rows,
  failures,
  nextAction: failures.length ? "repair-archetype-routing" : "render-current-12-frame-visual-master",
};
for (const output of [artifactPath, publicPath]) writeJson(output, report);
console.log(JSON.stringify({status: report.status, archetypeCount: report.archetypeCount, counts, evidenceRows, failures, after: report.after}, null, 2));
if (failures.length) process.exitCode = 2;
