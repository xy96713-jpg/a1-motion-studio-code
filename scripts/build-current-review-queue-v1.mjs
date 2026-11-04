#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {deriveSystemLineReviewQueue} from "../apps/studio-next/src/lib/a1-system-line-review-queue-v1.mjs";
import {assertProjectWriterLease} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
assertProjectWriterLease(appRoot);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1");
const workspace = JSON.parse(fs.readFileSync(path.join(publicRoot, "workspace.json"), "utf8"));
const summary = JSON.parse(fs.readFileSync(path.join(artifactRoot, "shot-motion-review-v1/current-summary.json"), "utf8"));
const projectId = workspace.production.project.projectId;
const profile = JSON.parse(fs.readFileSync(path.join(root, "configs/system-line-projects", `${projectId}.json`), "utf8"));
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const stageBinary = (sourceRelative, outputName, expectedSha256) => {
  const source = path.join(root, sourceRelative);
  if (!fs.existsSync(source) || shaFile(source) !== expectedSha256) throw new Error(`review-queue-candidate-stale:${sourceRelative}`);
  for (const base of [publicRoot, artifactRoot]) {const target = path.join(base, "review-queue-v1", outputName); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.copyFileSync(source, target); if (shaFile(target) !== expectedSha256) throw new Error(`review-queue-copy-mismatch:${outputName}`);}
  return `/generated/system-line/editorial-asset-workbench-v1/review-queue-v1/${outputName}`;
};
const narrationCandidates = (profile.narrationReviewCandidates || []).map((candidate) => ({shotId: candidate.shotId, kind: "narration", text: candidate.text, audio: {publicUrl: stageBinary(candidate.audioPath, `${candidate.shotId}-narration.wav`, candidate.audioSha256), sha256: candidate.audioSha256}, video: {publicUrl: stageBinary(candidate.videoPath, `${candidate.shotId}-narrated-preview.mp4`, candidate.videoSha256), sha256: candidate.videoSha256}}));
const shots = workspace.production.shotIntelligence.currentStoryboardAuthority.shots;
const shotById = new Map(shots.map((shot) => [shot.shotId, shot]));
const motionCandidates = (profile.motionReviewCandidates || []).map((candidate) => {const shot=shotById.get(candidate.shotId);if(!shot||candidate.reviewOnly!==true||candidate.sourceVersionId!==shot.versionId||candidate.sourceArtifactSha256!==shot.artifactSha256||candidate.sourceMotionDesignSha256!==shot.motionDesignContract?.motionDesignSha256)throw new Error(`review-queue-motion-source-stale:${candidate.shotId}`);return{shotId:candidate.shotId,kind:"video",publicUrl:stageBinary(candidate.path,`${candidate.shotId}-motion-review.mp4`,candidate.sha256),sha256:candidate.sha256,source:{versionId:candidate.sourceVersionId,artifactSha256:candidate.sourceArtifactSha256,motionDesignSha256:candidate.sourceMotionDesignSha256},reviewOnly:true,productionAdmission:false};});
for (const shot of shots) {
  const video = shot.motionReviewReceipt?.video;
  if (video?.path && video?.sha256 && (!fs.existsSync(path.join(root, video.path)) || shaFile(path.join(root, video.path)) !== video.sha256)) throw new Error(`review-queue-motion-candidate-stale:${shot.shotId}`);
  if (shot.artifactPublicUrl && shot.artifactSha256) {const local = path.join(root, "apps/studio-next/public", shot.artifactPublicUrl); if (!fs.existsSync(local) || shaFile(local) !== shot.artifactSha256) throw new Error(`review-queue-still-candidate-stale:${shot.shotId}`);}
  const designCandidate = shot.motionReviewPlan?.designCandidate;
  if (designCandidate?.path && designCandidate?.publicUrl && designCandidate?.sha256) {
    const staged = path.join(root, designCandidate.path);
    const served = path.join(root, "apps/studio-next/public", designCandidate.publicUrl);
    if (!staged.startsWith(path.join(root, "work") + path.sep) || !fs.existsSync(staged) || shaFile(staged) !== designCandidate.sha256 || !fs.existsSync(served) || shaFile(served) !== designCandidate.sha256) throw new Error(`review-queue-design-candidate-stale:${shot.shotId}`);
  }
}
const queue = deriveSystemLineReviewQueue({workspaceSha256: workspace.workspaceSha256, items: summary.items, shots, narrationCandidates, motionCandidates});
const json = `${JSON.stringify(queue, null, 2)}\n`;
for (const base of [publicRoot, artifactRoot]) {const target = path.join(base, "review-queue-v1/current.json"); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, json);}
const out = path.join(root, "work/current-review-queue-v1"); fs.mkdirSync(out, {recursive: true});
const lines = ["# Current film review queue", "", `- Workspace: \`${workspace.workspaceSha256}\``, `- Ready for your review: **${queue.counts.READY_FOR_USER_REVIEW}**`, `- Ready for internal review: **${queue.counts.READY_FOR_INTERNAL_REVIEW}**`, `- Production still required: **${queue.counts.PRODUCTION_REQUIRED}**`, "", "## Items", ""];
for (const item of queue.items) {const media = item.candidate?.video?.publicUrl || item.candidate?.audio?.publicUrl || item.candidate?.publicUrl || "none"; lines.push(`- **${item.shotId}** · ${item.category} · ${item.queueStatus} · ${media}`);}
lines.push("", "This queue is review-only. It grants no user approval, production admission, motion, Resolve, or release permission.", "");
fs.writeFileSync(path.join(out, "REVIEW.md"), lines.join("\n"));
console.log(JSON.stringify({status: "PASS", counts: queue.counts, queueSha256: queue.queueSha256, workspaceSha256: workspace.workspaceSha256}, null, 2));
