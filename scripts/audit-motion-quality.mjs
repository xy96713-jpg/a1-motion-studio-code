import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultPropsPath = path.join(root, "public", "generated", "studio-next-template-timeline", "article-template-timeline-props.json");
const defaultHyperframesAuditPath = path.join(root, "public", "generated", "studio-next-template-timeline", "hyperframes-sidecar", "audit-report.json");
const defaultRemotionPath = path.join(root, "remotion-renderer", "src", "ArticleTemplateTimeline.tsx");
const defaultSfxManifestPath = path.join(root, "public", "generated", "studio-next-template-timeline", "sfx", "manifest.json");
const templateDir = path.join(root, "external", "rve-remotion-templates", "templates");
const templateFileBySlug = {
  "progress-bars": "progress-bars.tsx",
  "stat-counter": "stat-counter.tsx",
  "quote-card": "quote-card.tsx",
  "progress-steps": "progress-steps.tsx",
  "animated-list": "animated-list.tsx",
  "end-card": "end-card.tsx",
  "image-zoom-reveal": "image-zoom-reveal.tsx",
  "image-carousel": "image-carousel.tsx",
  "polaroid-frame": "polaroid-frame.tsx",
  "title-split": "title-split.tsx",
};

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.resolve(argValue("--out-dir", path.join(root, ".codex-artifacts", "motion-quality", timestamp)));
const propsPath = path.resolve(argValue("--props", defaultPropsPath));
const hyperframesAuditPath = path.resolve(argValue("--hyperframes-audit", defaultHyperframesAuditPath));
const remotionPath = path.resolve(argValue("--remotion", defaultRemotionPath));
const sfxManifestPath = path.resolve(argValue("--sfx-manifest", defaultSfxManifestPath));
const reportPath = path.join(outDir, "motion-quality-report.json");
const markdownPath = path.join(outDir, "motion-quality-report.md");

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, "utf8"));
const readTextOptional = async (filePath, fallback = "") => {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return fallback;
  }
};
const readJsonOptional = async (filePath, fallback = null) => {
  try {
    return await readJson(filePath);
  } catch {
    return fallback;
  }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function compact(value = "", max = 130) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max + 1).replace(/\s+\S*$/u, "").trim() || text.slice(0, max).trim()}...`;
}

function scoreBand(score) {
  if (score >= 85) return "strong";
  if (score >= 70) return "usable";
  if (score >= 55) return "thin";
  return "weak";
}

function narrativeRoleFor(item, index, total) {
  const plannedRole = String(item.narrative?.storyRole || item.templateProps?.narrative?.storyRole || "");
  if (plannedRole === "setup") return "opening";
  if (plannedRole === "closing") return "closing";
  if (plannedRole === "problem") return "problem";
  if (plannedRole === "comparison") return "comparison";
  if (plannedRole === "proof") return "evidence";
  if (plannedRole === "method" || plannedRole === "roles") return "sequence";
  const title = item.templateProps?.title || "";
  const text = `${title} ${item.templateProps?.subtitle || ""} ${item.assetSlotPlan?.query || ""}`;
  if (index === 0) return "opening";
  if (index === total - 1) return "closing";
  if (/不清晰|信号|可能|风险|问题/u.test(text)) return "problem";
  if (/两种|或者|变化|新喷口/u.test(text)) return "comparison";
  if (/GPS|倾斜仪|震级|半小时|300|压力|数据/u.test(text)) return "evidence";
  if (/地图|Halemaumau|Kilauea|地震群/u.test(text)) return "map-evidence";
  return "sequence";
}

function templateInternalDirectionScore(item, templateSource) {
  const slug = item.selectedSlug || "";
  let score = 0;
  if (/useCurrentFrame/u.test(templateSource)) score += 10;
  if (/interpolate/u.test(templateSource)) score += 10;
  if (/spring/u.test(templateSource)) score += 6;
  if (slug === "progress-bars" && /measurementFrame|materialSpecificityNote|evidenceItems|displayValue/u.test(templateSource)) score += 24;
  if (slug === "stat-counter" && /readingRows|instrumentReadings|evidenceImageUrl|rowFill/u.test(templateSource)) score += 24;
  if (slug === "quote-card" && /leftProgress|rightProgress|bridgeProgress|PATH NOT CONFIRMED/u.test(templateSource)) score += 24;
  if (slug === "progress-steps" && /methodFlowContract|stepItems|ruleProgress|spine/u.test(templateSource)) score += 24;
  if (slug === "animated-list" && /roleGridContract|roleRows|rowProgress|responsibility/u.test(templateSource)) score += 24;
  if (slug === "end-card" && /closingHoldContract|closingSupport|ruleProgress|supportOpacity/u.test(templateSource)) score += 24;
  if (/image|polaroid|carousel/u.test(slug) && /useCurrentFrame|interpolate|scale|translate/u.test(templateSource)) score += 12;
  if (/title-split/u.test(slug) && /useCurrentFrame|interpolate|spring/u.test(templateSource)) score += 10;
  return clamp(score, 0, 50);
}

function motionDepthScore(item, remotionSource, templateSource) {
  const plan = item.motionPlan || item.templateProps?.motionPlan || {};
  const layers = Array.isArray(plan.layers) ? plan.layers : [];
  let score = 36;
  score += Math.min(28, layers.length * 7);
  if (/useCurrentFrame/u.test(remotionSource)) score += 7;
  score += templateInternalDirectionScore(item, templateSource);
  return clamp(score, 0, 100);
}

function transitionStrengthScore(item, index, total, remotionSource) {
  const transitionPlan = item.transitionPlan || {};
  if (index === total - 1) return 100;
  if (transitionPlan.contract === "A1RelationTransitionPlan/v1" && transitionPlan.mode === "hard-cut") return 68;
  const transition = item.motionPlan?.transitionOut || item.templateProps?.motionPlan?.transitionOut || "";
  let score = 45;
  if (transitionPlan.contract === "A1RelationTransitionPlan/v1" && transitionPlan.durationFrames === 12) score += 18;
  if (transition) score += 16;
  if (/(wipe|slide|push|split|collapse|breaks|proof-lock|expand)/iu.test(transition)) score += 18;
  if (/data-a1-motion-transition-layer|relation-aware-wipe/u.test(remotionSource)) score += 12;
  if (/RelationTransitionLayer/u.test(remotionSource)) score += 5;
  return clamp(score, 0, 100);
}

function evidenceAnimationScore(item) {
  const kind = item.assetSlotPlan?.slotKind || "";
  const slug = item.selectedSlug || "";
  const props = item.templateProps || {};
  let score = ["data", "single-image", "multi-image"].includes(kind) ? 48 : 70;
  if (props.evidenceItems?.length >= 3 || props.measurementFrame) score += 22;
  if (props.instrumentReadings?.length >= 2 || props.evidenceTrend) score += 22;
  if (props.problemContrast?.left && props.problemContrast?.right) score += 18;
  if (/image|polaroid|carousel/u.test(slug) && (props.imageUrl || props.imageUrls?.length)) score += 12;
  if (props.motionPlan?.layers?.some((layer) => /pressure|seismic|instrument|evidence|map|branch/u.test(layer))) score += 10;
  return clamp(score, 0, 100);
}

function visualContinuityScore(item, hyperframesAudit) {
  const plan = item.motionPlan || item.templateProps?.motionPlan || {};
  const motif = plan.visualMotif || "";
  const sidecarItem = (hyperframesAudit?.items || []).find((candidate) => candidate.id === item.id);
  let score = 50;
  if (motif) score += 20;
  if (/volcano-map-grid/u.test(motif)) score += 12;
  if (/seismic-dots/u.test(motif)) score += 10;
  if (/pressure-line/u.test(motif)) score += 10;
  if (/monitoring-strokes/u.test(motif)) score += 8;
  if (sidecarItem?.motionPlanContract === "A1MotionPlan/v1") score += 10;
  return clamp(score, 0, 100);
}

function typographyMotionScore(item) {
  const plan = item.motionPlan || item.templateProps?.motionPlan || {};
  const text = `${item.templateProps?.title || ""}${item.templateProps?.subtitle || item.templateProps?.quote || ""}`;
  let score = 62;
  if (plan.entrance) score += 10;
  if (/title|text|quote|contrast|panel|split|resolves/u.test(`${plan.entrance} ${plan.layers?.join(" ")}`)) score += 10;
  if (text.length > 96) score -= 14;
  if (text.length > 132) score -= 12;
  return clamp(score, 0, 100);
}

function sfxReadinessScore(sfxManifest, remotionSource) {
  let score = 15;
  const files = new Set((sfxManifest?.assets || []).map((asset) => asset.filename));
  if (sfxManifest?.contract === "A1TemplateTimelineSfx/v1") score += 18;
  if (sfxManifest?.mode === "sfx-only-no-music-no-voice") score += 14;
  if (/data-a1-sfx-plan-contract="A1TemplateTimelineSfx\/v1"/u.test(remotionSource)) score += 16;
  if (/Audio/u.test(remotionSource) && /Sequence/u.test(remotionSource)) score += 10;
  if (files.has("low-rumble.wav")) score += 9;
  if (files.has("proof-hit.wav")) score += 11;
  if (files.has("transition-whoosh.wav")) score += 12;
  if (/proof-hit\.wav|transition-whoosh\.wav|low-rumble\.wav/u.test(remotionSource)) score += 10;
  return clamp(score, 0, 100);
}

function aeGapFor(scores, item, role, isTerminal) {
  const gaps = [];
  if (scores.motionDepth < 82) gaps.push("selected template motion is present, but the shot still needs bespoke evidence-driven motion inside the chosen template");
  if (!isTerminal && scores.transitionStrength < 82) gaps.push("transition is relation-aware in metadata but needs a more authored visual bridge");
  if (scores.evidenceAnimation < 82 && /evidence|map-evidence|comparison|problem/u.test(role)) gaps.push("evidence material needs more draw-on, lock-on, trace, or parallax motion");
  if (scores.sfxReadiness < 50) gaps.push("no SFX rhythm layer is available");
  if (item.selectedSlug === "title-split" && scores.motionDepth < 90) gaps.push("title shot needs more cinematic type reveal and camera rhythm");
  return gaps;
}

function recommendedFixFor(scores, item, role, isTerminal) {
  const weakest = Object.entries(scores)
    .filter(([key]) => key !== "overall")
    .sort((a, b) => a[1] - b[1])[0]?.[0] || "motionDepth";
  if (weakest === "sfxReadiness") return "Add an SFX-only pass: low volcanic rumble, proof-lock hits, and transition whooshes. Do not add music or voiceover.";
  if (weakest === "transitionStrength") {
    if (isTerminal) return "Preserve the quiet final hold; no outgoing transition is required.";
    if (item.transitionPlan?.mode === "hard-cut") {
      return "Keep this hard cut if the relation calls for it; earn premium readiness through bespoke evidence or typography motion on selected shots.";
    }
    return "Replace generic overlay wipes with per-edge transition primitives driven by previous/next relation.";
  }
  if (weakest === "evidenceAnimation") {
    if (role === "evidence") return "Animate evidence itself: draw bars/pressure lines from source measurements and lock labels to the official material.";
    if (role === "map-evidence") return "Add map parallax, seismic dot lock-on, and source-map crop movement.";
    return "Add shot-specific evidence motion instead of relying on template entrance only.";
  }
  if (weakest === "typographyMotion") return "Add phrase-level title timing and readable hold beats; avoid one-block title reveals.";
  return "Increase shot-specific layer choreography beyond the shared motif overlay.";
}

function buildShotQuality(item, index, items, hyperframesAudit, remotionSource, sfxManifest, templateSources) {
  const role = narrativeRoleFor(item, index, items.length);
  const isTerminal = index === items.length - 1;
  const templateSource = templateSources[item.selectedSlug] || "";
  const scores = {
    motionDepth: motionDepthScore(item, remotionSource, templateSource),
    transitionStrength: transitionStrengthScore(item, index, items.length, remotionSource),
    evidenceAnimation: evidenceAnimationScore(item),
    visualContinuity: visualContinuityScore(item, hyperframesAudit),
    typographyMotion: typographyMotionScore(item),
    sfxReadiness: sfxReadinessScore(sfxManifest, remotionSource),
  };
  const visualAverage = Math.round((
    scores.motionDepth
    + scores.transitionStrength
    + scores.evidenceAnimation
    + scores.visualContinuity
    + scores.typographyMotion
  ) / 5);
  const overall = Math.round((visualAverage * 0.82) + (scores.sfxReadiness * 0.18));
  scores.overall = overall;
  const aeGap = aeGapFor(scores, item, role, isTerminal);
  return {
    shotId: item.id,
    narrativeRole: role,
    screenTitle: item.templateProps?.title || "",
    templateSlug: item.selectedSlug || "",
    motionPlan: item.motionPlan || item.templateProps?.motionPlan || null,
    scores,
    qualityBand: scoreBand(overall),
    aeGap,
    recommendedFix: recommendedFixFor(scores, item, role, isTerminal),
  };
}

function buildMarkdown(report) {
  const lines = [
    "# Motion Quality Report",
    "",
    `- Contract: \`${report.contract}\``,
    `- Motion quality score: **${report.motionQualityScore}**`,
    `- Visual motion score: **${report.visualMotionScore}**`,
    `- SFX readiness score: **${report.sfxReadinessScore}**`,
    `- Sound mode: **${report.soundDesignMode}**`,
    `- AE-like ready: **${report.aeLikeReady ? "true" : "false"}**`,
    `- Shot count: ${report.summary.shotCount}`,
    `- Highest priority: ${report.summary.highestPriorityFix}`,
    "",
    "## Score Meaning",
    "",
    "- 85+ strong: close to finished motion-design quality for this pass.",
    "- 70-84 usable: coherent, but still needs authored richness.",
    "- 55-69 thin: functional but not AE-level.",
    "- <55 weak: blocks premium motion quality.",
    "",
    "## Shot Quality",
    "",
  ];

  for (const shot of report.shots) {
    lines.push(`### ${shot.shotId} - ${shot.screenTitle || shot.templateSlug}`);
    lines.push("");
    lines.push(`- Role: ${shot.narrativeRole}`);
    lines.push(`- Template: ${shot.templateSlug}`);
    lines.push(`- Overall: ${shot.scores.overall} (${shot.qualityBand})`);
    lines.push(`- Motion depth: ${shot.scores.motionDepth}`);
    lines.push(`- Transition strength: ${shot.scores.transitionStrength}`);
    lines.push(`- Evidence animation: ${shot.scores.evidenceAnimation}`);
    lines.push(`- Visual continuity: ${shot.scores.visualContinuity}`);
    lines.push(`- Typography motion: ${shot.scores.typographyMotion}`);
    lines.push(`- SFX readiness: ${shot.scores.sfxReadiness}`);
    lines.push(`- AE gap: ${shot.aeGap.length ? shot.aeGap.join("; ") : "none for current visual pass"}`);
    lines.push(`- Recommended fix: ${shot.recommendedFix}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const props = await readJson(propsPath);
  const hyperframesAudit = await readJsonOptional(hyperframesAuditPath, null);
  const remotionSource = await readTextOptional(remotionPath, "");
  const sfxManifest = await readJsonOptional(sfxManifestPath, null);
  const templateSources = {};
  await Promise.all(Object.entries(templateFileBySlug).map(async ([slug, filename]) => {
    templateSources[slug] = await readTextOptional(path.join(templateDir, filename), "");
  }));
  const items = Array.isArray(props.items) ? props.items : [];
  if (props.contract !== "A1ArticleTemplateTimeline/v1") throw new Error(`Unexpected props contract: ${props.contract}`);
  if (!items.length) throw new Error("Motion quality audit requires at least one current article shot");
  if (items.some((item) => item.transitionPlan?.contract !== "A1RelationTransitionPlan/v1")) {
    throw new Error("Motion quality audit requires A1RelationTransitionPlan/v1 on every current edge");
  }
  const realEdges = items.slice(0, -1);
  const authoredTransitions = realEdges.filter((item) => item.transitionPlan?.mode && item.transitionPlan.mode !== "hard-cut");
  if (authoredTransitions.length && !/data-a1-motion-transition-layer|RelationTransitionLayer/u.test(remotionSource)) {
    throw new Error(`Renderer is missing relation transition layers for ${authoredTransitions.length} authored edges`);
  }
  const shots = items.map((item, index) => buildShotQuality(item, index, items, hyperframesAudit, remotionSource, sfxManifest, templateSources));
  const visualMotionScore = Math.round(shots.reduce((sum, shot) => (
    sum
    + shot.scores.motionDepth
    + shot.scores.transitionStrength
    + shot.scores.evidenceAnimation
    + shot.scores.visualContinuity
    + shot.scores.typographyMotion
  ), 0) / (shots.length * 5));
  const sfxReadinessScoreValue = Math.round(shots.reduce((sum, shot) => sum + shot.scores.sfxReadiness, 0) / shots.length);
  const motionQualityScore = Math.round((visualMotionScore * 0.82) + (sfxReadinessScoreValue * 0.18));
  const lowestShots = [...shots].sort((a, b) => a.scores.overall - b.scores.overall).slice(0, 3);
  const recurringGaps = shots.flatMap((shot) => shot.aeGap);
  const gapCounts = recurringGaps.reduce((acc, gap) => {
    acc[gap] = (acc[gap] || 0) + 1;
    return acc;
  }, {});
  const topGap = Object.entries(gapCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Continue authored motion review.";
  const hardCutCount = realEdges.filter((item) => item.transitionPlan?.mode === "hard-cut").length;
  const hasBespokeEvidenceMotion = shots.some((shot) => shot.scores.evidenceAnimation >= 82);
  const hasAuthoredVisualBridge = authoredTransitions.length > 0;
  const hasAuthoredVisualMotion = hasAuthoredVisualBridge || hasBespokeEvidenceMotion;
  const aeLikeReady = motionQualityScore >= 85
    && sfxReadinessScoreValue >= 65
    && lowestShots.every((shot) => shot.scores.overall >= 76)
    && hasAuthoredVisualMotion;
  const report = {
    contract: "A1MotionQualityReport/v1",
    generatedAt: new Date().toISOString(),
    aeLikeReady,
    motionQualityScore,
    visualMotionScore,
    sfxReadinessScore: sfxReadinessScoreValue,
    audioReadinessScore: sfxReadinessScoreValue,
    soundDesignMode: sfxManifest?.mode || "sfx-only-no-music-no-voice-required",
    readyMeaning: "true only when visual motion is strong, the SFX rhythm layer is present, and the film contains an authored visual bridge or bespoke evidence animation; music and voiceover are intentionally out of scope",
    summary: {
      shotCount: shots.length,
      authoredTransitionCount: authoredTransitions.length,
      hardCutCount,
      hasBespokeEvidenceMotion,
      hasAuthoredVisualMotion,
      lowestShots: lowestShots.map((shot) => ({ shotId: shot.shotId, score: shot.scores.overall, recommendedFix: shot.recommendedFix })),
      highestPriorityFix: topGap,
      nextExecutionSlice: sfxReadinessScoreValue < 50
        ? "add-sfx-only-rhythm-design"
        : "author-shot-specific-transitions-and-evidence-motion",
    },
    artifacts: {
      propsPath,
      hyperframesAuditPath,
      remotionPath,
      sfxManifestPath,
      reportPath,
      markdownPath,
    },
    shots,
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(markdownPath, buildMarkdown(report));
  console.log(JSON.stringify({
    ok: true,
    contract: report.contract,
    aeLikeReady: report.aeLikeReady,
    motionQualityScore: report.motionQualityScore,
    visualMotionScore: report.visualMotionScore,
    sfxReadinessScore: report.sfxReadinessScore,
    soundDesignMode: report.soundDesignMode,
    highestPriorityFix: report.summary.highestPriorityFix,
    reportPath,
    markdownPath,
  }, null, 2));
  if (!aeLikeReady && process.env.A1_MOTION_QUALITY_STRICT === "1") process.exit(1);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
