import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererDir = path.join(root, "remotion-renderer");
const remotionBin = path.join(rendererDir, "node_modules", ".bin", "remotion");
const defaultPropsPath = path.join(root, "public", "generated", "studio-next-template-timeline", "article-template-timeline-props.json");
const defaultMp4Path = path.join(root, "public", "generated", "studio-next-template-timeline", "article-template-timeline.mp4");
const defaultHyperframesAuditPath = path.join(root, "public", "generated", "studio-next-template-timeline", "hyperframes-sidecar", "audit-report.json");

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.resolve(argValue("--out-dir", path.join(root, ".codex-artifacts", "film-readiness", timestamp)));
const reportPath = path.join(outDir, "film-readiness-report.json");
const markdownPath = path.join(outDir, "film-readiness-report.md");
const framesDir = path.join(outDir, "frames");
const montagePath = path.join(outDir, "film-readiness-montage.png");
const propsPath = path.resolve(argValue("--props", defaultPropsPath));
const mp4Path = path.resolve(argValue("--mp4", defaultMp4Path));
const hyperframesAuditPath = path.resolve(argValue("--hyperframes-audit", defaultHyperframesAuditPath));

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, "utf8"));
const readJsonOptional = async (filePath, fallback = null) => {
  try {
    return await readJson(filePath);
  } catch {
    return fallback;
  }
};

const run = (args, cwd = root) => new Promise((resolve) => {
  const child = spawn(args[0], args.slice(1), { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  child.on("close", (code) => resolve({ code, output }));
});

function compact(value = "", max = 110) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const clipped = text.slice(0, max + 1).replace(/\s+\S*$/u, "").trim();
  return `${clipped || text.slice(0, max).trim()}...`;
}

function hostFromSource(source = "") {
  if (!source) return "";
  try {
    return new URL(source).hostname.replace(/^www\./u, "");
  } catch {
    return source;
  }
}

function scoreStatus(blocking, warning = false) {
  if (blocking) return "blocked";
  if (warning) return "partial";
  return "pass";
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

function sourceAssessment(item, role) {
  const source = item.templateProps?.source || "";
  const host = hostFromSource(source);
  const query = item.assetSlotPlan?.query || "";
  const isSourceTextComparison = role === "comparison"
    && item.assetSlotPlan?.slotKind === "text"
    && item.materialRouteDecision?.decision === "text-first-no-image"
    && item.templateProps?.problemContrast?.left
    && item.templateProps?.problemContrast?.right;
  const isUserSourceTextShot = item.assetSlotPlan?.slotKind === "text"
    && item.materialRouteDecision?.decision === "text-first-no-image"
    && item.templateProps?.officialEvidence?.evidenceKind === "official-article-text"
    && Array.isArray(item.templateProps?.officialEvidence?.claimSupport)
    && item.templateProps.officialEvidence.claimSupport.length > 0;
  if (isSourceTextComparison) {
    return { status: "pass", reason: "comparison is derived directly from paired source-text clauses" };
  }
  if (isUserSourceTextShot) {
    return { status: "pass", reason: "text-first shot is derived directly from the user-provided source text and does not require an external URL" };
  }
  const needsOfficial = /map|evidence|comparison/u.test(role) || /USGS|GPS|倾斜仪|地震|地图|Kilauea|Halemaumau/u.test(query);
  const officialEvidence = item.templateProps?.officialEvidence || {};
  const officialSourceHost = hostFromSource(officialEvidence.sourceUrl || "");
  const officialMediaHost = hostFromSource(officialEvidence.mediaEvidenceUrl || "");
  const hasOfficialClaimEvidence = /(^|\.)usgs\.gov$/u.test(officialSourceHost)
    && Array.isArray(officialEvidence.claimSupport)
    && officialEvidence.claimSupport.length > 0;
  const visualSlotNeedsMedia = ["single-image", "multi-image"].includes(item.assetSlotPlan?.slotKind || "")
    || /GPS|倾斜仪|压力|300|地图|变化/u.test(query);
  const textOnlyEvidence = officialEvidence.evidenceKind === "official-article-text";
  const hasOfficialMediaEvidence = /(^|\.)usgs\.gov$/u.test(officialMediaHost);
  if (needsOfficial && hasOfficialClaimEvidence && (!visualSlotNeedsMedia || textOnlyEvidence || hasOfficialMediaEvidence)) {
    return {
      status: "pass",
      reason: hasOfficialMediaEvidence
        ? "official USGS claim and media evidence attached"
        : "official USGS article evidence attached",
    };
  }
  const isOfficial = /(^|\.)usgs\.gov$/u.test(host);
  const isArticleSource = /nationalparkstraveler\.org/u.test(host);
  const isWeak = !source || /duckduckgo|search|localhost|127\.0\.0\.1/u.test(source);
  if (needsOfficial && !isOfficial) {
    return {
      status: "blocked",
      reason: isArticleSource
        ? "uses article/source-site label but does not prove the shot's official USGS evidence"
        : "does not prove a primary official source for this evidence shot",
    };
  }
  if (isWeak) return { status: "blocked", reason: "source is missing, search-derived, or local-only" };
  return { status: "pass", reason: isOfficial ? "primary official source" : "source label present" };
}

function materialAssessment(item, role) {
  const slotKind = item.assetSlotPlan?.slotKind || "";
  const adoptedImages = item.assetSlotPlan?.adoptedImageUrls || [];
  const imageUrls = item.templateProps?.imageUrls || (item.templateProps?.imageUrl ? [item.templateProps.imageUrl] : []);
  const distinctImages = new Set(imageUrls.filter(Boolean)).size;
  const materialRouteDecision = item.materialRouteDecision || item.templateProps?.materialRouteDecision || {};
  if (slotKind === "data" && distinctImages === 0) {
    return {
      status: "blocked",
      reason: "data shot is marked ready but no chart/source image enters template props",
    };
  }
  if (slotKind === "single-image" && distinctImages < 1) {
    return { status: "blocked", reason: "single-image evidence shot has no rendered image prop" };
  }
  if (slotKind === "multi-image" && distinctImages < 3) {
    return { status: "blocked", reason: "multi-image shot needs three distinct rendered images" };
  }
  if ((role === "opening" || role === "closing") && adoptedImages.length && distinctImages === 0) {
    if (materialRouteDecision.contract === "A1MaterialRouteDecision/v1" && materialRouteDecision.decision === "text-first-no-image") {
      return {
        status: "pass",
        reason: `text-first material route is explicit: ${materialRouteDecision.reason}`,
      };
    }
    return {
      status: "partial",
      reason: "text shot has candidate imagery, but the film route does not explain why it is unused",
    };
  }
  return { status: "pass", reason: "material slot and rendered template props agree" };
}

function imageUrlsForItem(item) {
  return [
    item.templateProps?.imageUrl,
    ...(Array.isArray(item.templateProps?.imageUrls) ? item.templateProps.imageUrls : []),
    ...(Array.isArray(item.templateProps?.imageRoles) ? item.templateProps.imageRoles.map((role) => role.imageUrl) : []),
  ].filter(Boolean);
}

function visualEvidenceRequirement(item, role) {
  const slotKind = item.assetSlotPlan?.slotKind || "";
  const query = item.assetSlotPlan?.query || "";
  const officialEvidence = item.templateProps?.officialEvidence || {};
  const officialEvidenceKind = officialEvidence.evidenceKind || "";
  const needsVisualProof = ["single-image", "multi-image", "data"].includes(slotKind)
    || /map|evidence|comparison/u.test(role)
    || /USGS|地图|地震|GPS|倾斜仪|压力|数据|Kilauea|Halemaumau/u.test(query);
  const prefersOfficialVisual = /official-map-media|official-chart|official-data|map|media/u.test(officialEvidenceKind)
    || /USGS|地图|GPS|倾斜仪|压力|300 次|地震/u.test(query);
  return { needsVisualProof, prefersOfficialVisual };
}

function materialEvidenceAssessment(item, role) {
  const slotKind = item.assetSlotPlan?.slotKind || "";
  const materialRouteDecision = item.materialRouteDecision || item.templateProps?.materialRouteDecision || {};
  const officialEvidence = item.templateProps?.officialEvidence || {};
  const evidenceFields = item.templateProps?.evidenceFields || {};
  const sourceQualityTier = item.templateProps?.sourceQualityTier || evidenceFields.sourceQualityTier || "";
  const sourceQualityLabel = item.templateProps?.sourceQualityLabel || evidenceFields.sourceQualityLabel || "";
  const originalSourceUrl = item.templateProps?.sourceUrl
    || item.templateProps?.sourcePageUrl
    || item.templateProps?.originalRemoteUrl
    || evidenceFields.sourceUrl
    || evidenceFields.sourcePageUrl
    || "";
  const imageUrls = imageUrlsForItem(item);
  const distinctImages = new Set(imageUrls).size;
  const localOnlyImages = imageUrls.length > 0 && imageUrls.every((url) => /^(https?:\/\/localhost:4288|\/assets\/web-assets\/cache\/)/u.test(String(url)));
  const officialMediaHost = hostFromSource(officialEvidence.mediaEvidenceUrl || "");
  const officialArticleHost = hostFromSource(officialEvidence.sourceUrl || "");
  const originalHost = hostFromSource(originalSourceUrl);
  const officialTextEvidence = /(^|\.)usgs\.gov$/u.test(officialArticleHost)
    && Array.isArray(officialEvidence.claimSupport)
    && officialEvidence.claimSupport.length > 0;
  const officialRenderedSource = /(^|\.)usgs\.gov$/u.test(originalHost);
  const openOrOfficialQuality = ["official", "open-knowledge", "source-page"].includes(sourceQualityTier);
  const hasExtractionProof = Boolean(evidenceFields.selector || evidenceFields.extractionSource || evidenceFields.structuredDataType);
  const requirement = visualEvidenceRequirement(item, role);
  const dataTemplateHasSourceClaims = slotKind === "data"
    && officialTextEvidence
    && (
      (Array.isArray(item.templateProps?.evidenceItems) && item.templateProps.evidenceItems.length > 0)
      || (Array.isArray(item.templateProps?.instrumentReadings) && item.templateProps.instrumentReadings.length > 0)
      || Boolean(item.templateProps?.evidenceTrend)
    );

  if (!requirement.needsVisualProof) {
    if ((role === "opening" || role === "closing") && materialRouteDecision.decision === "text-first-no-image") {
      return { status: "pass", reason: "text-first shot explicitly does not require image evidence" };
    }
    return { status: "pass", reason: "shot does not require visual source evidence" };
  }

  if ((slotKind === "text" || slotKind === "none") && materialRouteDecision.decision === "text-first-no-image") {
    return { status: "pass", reason: `text-first material route is explicit: ${materialRouteDecision.reason}` };
  }

  if ((slotKind === "text" || slotKind === "none") && distinctImages === 0 && officialTextEvidence) {
    return { status: "pass", reason: `text-only claim is supported by official article evidence from ${officialArticleHost}` };
  }

  if (slotKind !== "text" && distinctImages === 0) {
    return { status: "blocked", reason: "visual/data evidence slot has no image material to audit" };
  }

  if (dataTemplateHasSourceClaims && officialEvidence.evidenceKind === "official-article-text") {
    return { status: "pass", reason: `data visualization is generated from official article evidence from ${officialArticleHost}` };
  }

  if (dataTemplateHasSourceClaims && officialEvidence.evidenceKind === "official-gps-media" && officialMediaHost) {
    return { status: "pass", reason: `instrument visualization is backed by official media reference ${officialEvidence.mediaEvidenceUrl}` };
  }

  if (officialRenderedSource) {
    return { status: "pass", reason: `rendered visual evidence source links back to official host ${originalHost}` };
  }

  if (openOrOfficialQuality && originalSourceUrl) {
    return {
      status: requirement.prefersOfficialVisual && sourceQualityTier !== "official" ? "partial" : "pass",
      reason: `${sourceQualityLabel || sourceQualityTier} material carries source URL ${originalSourceUrl}`,
    };
  }

  if (localOnlyImages && !originalSourceUrl && !sourceQualityTier && !hasExtractionProof) {
    return {
      status: "blocked",
      reason: "rendered material is only a local cache URL; original source/provenance was not carried into template props",
    };
  }

  if (requirement.prefersOfficialVisual) {
    if (officialMediaHost && originalHost && !/(^|\.)usgs\.gov$/u.test(originalHost)) {
      return {
        status: "blocked",
        reason: `official media reference exists (${officialEvidence.mediaEvidenceUrl}), but rendered image source is ${originalHost}`,
      };
    }
    return {
      status: "blocked",
      reason: "official/map/data shot needs official or source-qualified visual evidence, not only a source label",
    };
  }

  return {
    status: "partial",
    reason: "material exists, but source quality and visual-match evidence are incomplete",
  };
}

function templateAssessment(item, role) {
  const slug = item.selectedSlug || "";
  if (role === "evidence" && slug === "stat-counter") {
    if (
      Array.isArray(item.templateProps?.instrumentReadings)
      && item.templateProps.instrumentReadings.length >= 2
      && item.templateProps?.evidenceTrend
      && item.templateProps?.motionPlan?.semanticIntent
    ) {
      return { status: "pass", reason: "counter is bound to dual instrument trend evidence and shot motion intent" };
    }
    return {
      status: "partial",
      reason: "counter communicates a metric but not the full evidence source or trend without stronger material",
    };
  }
  if (role === "evidence" && slug === "progress-bars") {
    if (
      item.templateProps?.measurementFrame === "duration-magnitude-localization"
      && Array.isArray(item.templateProps?.evidenceItems)
      && item.templateProps.evidenceItems.length >= 3
      && item.templateProps?.motionPlan?.semanticIntent
    ) {
      return { status: "pass", reason: "progress bars encode duration, magnitude cap, and localization difficulty evidence" };
    }
    return {
      status: "partial",
      reason: "progress bars are dashboard-like and need proof that values come from the sentence evidence",
    };
  }
  if (role === "map-evidence" && !/image|polaroid|split|carousel/u.test(slug)) {
    return { status: "blocked", reason: "map evidence should render through an image/evidence template" };
  }
  if (role === "problem" && slug === "quote-card") {
    const contrastLayers = item.templateProps?.motionPlan?.layers || item.motionPlan?.layers || [];
    if (
      item.templateProps?.problemContrast?.left
      && item.templateProps?.problemContrast?.right
      && (contrastLayers.includes("problem-contrast") || contrastLayers.includes("uncertainty-mask"))
    ) {
      return { status: "pass", reason: "quote card is adapted into a signal-versus-path uncertainty contrast beat" };
    }
    return { status: "partial", reason: "quote card states uncertainty but does not create a visual contrast/problem beat" };
  }
  if (
    role === "comparison"
    && slug === "quote-card"
    && item.assetSlotPlan?.slotKind === "text"
    && item.materialRouteDecision?.decision === "text-first-no-image"
    && item.templateProps?.problemContrast?.left
    && item.templateProps?.problemContrast?.right
  ) {
    return { status: "pass", reason: "quote card renders an explicit source-text left/right comparison" };
  }
  if (role === "comparison" && !/carousel|gallery|stack|comparison|split/u.test(slug)) {
    return { status: "blocked", reason: "comparison beat should use a comparison or multi-image template" };
  }
  return { status: "pass", reason: "template family broadly matches shot role" };
}

function motionAssessment(item, sharedMotif) {
  const motionPlan = item.motionPlan || item.templateProps?.motionPlan || {};
  const required = ["semanticIntent", "visualMotif", "layers", "entrance", "emphasis", "transitionOut", "easing", "durationFrames", "filmBridgeRef", "officialEvidenceRef"];
  const missing = required.filter((key) => {
    const value = motionPlan[key];
    if (Array.isArray(value)) return value.length === 0;
    return value === undefined || value === null || value === "";
  });
  if (motionPlan.contract !== "A1MotionPlan/v1") {
    return { status: "blocked", reason: "missing A1MotionPlan/v1" };
  }
  if (missing.length) {
    return { status: "blocked", reason: `motion plan missing ${missing.join(", ")}` };
  }
  if (!sharedMotif || motionPlan.visualMotif !== sharedMotif) {
    return { status: "partial", reason: `motion plan does not carry the article's shared motif: ${sharedMotif || "missing"}` };
  }
  return { status: "pass", reason: `${motionPlan.semanticIntent}; motif: ${motionPlan.visualMotif}` };
}

function transitionAssessment(item, nextItem, index, total) {
  const motionPlan = item.motionPlan || item.templateProps?.motionPlan || {};
  if (index < total - 1 && !motionPlan.transitionOut) {
    return { status: "blocked", reason: "missing transitionOut for adjacent shot" };
  }
  const currentBridge = item.filmBridge || item.templateProps?.filmBridge || {};
  const nextBridge = nextItem?.filmBridge || nextItem?.templateProps?.filmBridge || {};
  const relationTarget = String(currentBridge.nextRelation || "").match(/\u63a8\u8fdb\u5230([a-z-]+)/iu)?.[1]
    || String(nextBridge.arcRole || "").trim();
  const carriesRelation = relationTarget && String(motionPlan.transitionOut || "").toLowerCase().includes(relationTarget.toLowerCase());
  if (index < total - 1 && !carriesRelation && !/(wipe|push|slide|proof-lock|expand|breaks|split|collapse|soft)/iu.test(motionPlan.transitionOut || "")) {
    return { status: "partial", reason: `transitionOut is present but not relation-aware: ${motionPlan.transitionOut}` };
  }
  return { status: "pass", reason: index < total - 1 ? motionPlan.transitionOut : "closing hold" };
}

function hyperframesAssessment(item, hyperframesAudit) {
  if (!hyperframesAudit) {
    return { status: "partial", reason: "current-article HyperFrames sidecar audit has not been generated yet" };
  }
  if (!hyperframesAudit.ok) {
    return { status: "blocked", reason: `HyperFrames sidecar audit failed: ${(hyperframesAudit.failures || []).slice(0, 2).join("; ") || "unknown failure"}` };
  }
  if (hyperframesAudit.itemCount !== hyperframesAudit.expectedItemCount) {
    return { status: "blocked", reason: `HyperFrames sidecar item count mismatch: ${hyperframesAudit.itemCount}` };
  }
  const sidecarItem = (hyperframesAudit.items || []).find((candidate) => candidate.id === item.id);
  if (!sidecarItem) {
    return { status: "blocked", reason: "shot is missing from current HyperFrames sidecar" };
  }
  if (sidecarItem.motionPlanContract !== "A1MotionPlan/v1") {
    return { status: "blocked", reason: "sidecar shot does not carry A1MotionPlan/v1" };
  }
  return { status: "pass", reason: "current-article HyperFrames sidecar aligns with this shot and motion plan" };
}

function readabilityAssessment(item) {
  const title = String(item.templateProps?.title || "");
  const subtitle = String(item.templateProps?.subtitle || item.templateProps?.quote || "");
  const total = `${title}${subtitle}`.length;
  const tooDense = total > 96;
  const missingTitle = !title.trim();
  const missingQuoteHierarchy = item.selectedSlug === "quote-card"
    && !item.templateProps?.problemContrast
    && item.templateProps?.quoteLayout !== "title-support";
  return {
    status: scoreStatus(missingTitle, tooDense || missingQuoteHierarchy),
    reason: missingTitle
      ? "screen title missing"
      : missingQuoteHierarchy
        ? "ordinary quote card lacks a title-support hierarchy and renders body copy too small"
        : tooDense
          ? "screen text may be too dense for a 3 second shot"
          : "screen text density is acceptable",
  };
}

function continuityAssessment(item, previous, next, index, total) {
  const bridge = item.filmBridge || item.templateProps?.filmBridge || {};
  if (bridge.contract === "A1FilmBridge/v1") {
    const issues = [];
    if (!bridge.arcRole) issues.push("missing arc role");
    if (!bridge.argumentFunction) issues.push("missing argument function");
    if (index > 0 && !bridge.previousRelation) issues.push("missing previous-shot relation");
    if (index < total - 1 && !bridge.nextRelation) issues.push("missing next-shot relation");
    if (!bridge.continuityCue) issues.push("missing continuity cue");
    return {
      status: scoreStatus(issues.length > 0, false),
      reason: issues.length
        ? issues.join("; ")
        : `${bridge.arcRole}: ${bridge.argumentFunction}; cue: ${bridge.continuityCue}`,
    };
  }
  const issues = [];
  if (index > 0 && item.routeGroup !== previous?.routeGroup && !item.assetSlotPlan?.label) {
    issues.push("route changes without visible bridge metadata");
  }
  if (index < total - 1 && item.durationSec < 3) {
    issues.push("shot is short for article comprehension");
  }
  const source = item.templateProps?.source || "";
  const nextSource = next?.templateProps?.source || "";
  if (next && source && nextSource && source !== nextSource && index !== total - 2) {
    issues.push("source label changes mid-film without a stated reason");
  }
  return {
    status: scoreStatus(issues.length > 0, index > 0 && index < total - 1),
    reason: issues.length ? issues.join("; ") : "no obvious continuity break from props",
  };
}

function recommendedFixFor(shot, role) {
  if (shot.materialEvidence?.status === "blocked") {
    return "Carry source provenance into the rendered template props or replace this shot with official/open-source visual evidence before calling the film ready.";
  }
  if (shot.materialSpecificity.status === "blocked") {
    if (shot.assetSlotKind === "data") return "Bind a real chart/map/source image or downgrade the data slot until the official evidence is verified.";
    return "Replace the promoted material with a verified source-specific asset before template polish.";
  }
  if (shot.materialEvidence?.status === "partial") {
    return "Upgrade this shot to official/source-qualified visual evidence, or document why open/source-page material is sufficient for the sentence.";
  }
  if (shot.sourceTrust.status === "blocked") {
    return "Resolve this shot to primary-source evidence, preferably official USGS material for volcano/map/data claims.";
  }
  if (shot.templateFit.status !== "pass") {
    return role === "problem"
      ? "Route the shot to a contrast/problem visual that shows uncertainty rather than a sparse quote card."
      : "Adapt or reroute the template so the sentence function is visible without relying on inspector metadata.";
  }
  if (shot.continuity.status !== "pass") return "Add relation/bridge metadata and verify the adjacent shots read as one argument.";
  return "No immediate blocker; keep as lower priority after source and continuity issues are closed.";
}

function buildShotReport(item, index, items, framePath, hyperframesAudit, sharedMotif) {
  const role = narrativeRoleFor(item, index, items.length);
  const sourceTrust = sourceAssessment(item, role);
  const materialSpecificity = materialAssessment(item, role);
  const materialEvidence = materialEvidenceAssessment(item, role);
  const templateFit = templateAssessment(item, role);
  const readability = readabilityAssessment(item);
  const continuity = continuityAssessment(item, items[index - 1], items[index + 1], index, items.length);
  const motionGrammar = motionAssessment(item, sharedMotif);
  const transitionFit = transitionAssessment(item, items[index + 1], index, items.length);
  const hyperframesLayout = hyperframesAssessment(item, hyperframesAudit);
  const blockingIssues = [];
  for (const [key, assessment] of Object.entries({ sourceTrust, materialSpecificity, materialEvidence, templateFit, readability, continuity, motionGrammar, transitionFit, hyperframesLayout })) {
    if (assessment.status === "blocked") blockingIssues.push(`${key}: ${assessment.reason}`);
  }
  const warningIssues = [];
  for (const [key, assessment] of Object.entries({ sourceTrust, materialSpecificity, materialEvidence, templateFit, readability, continuity, motionGrammar, transitionFit, hyperframesLayout })) {
    if (assessment.status === "partial") warningIssues.push(`${key}: ${assessment.reason}`);
  }
  const shot = {
    shotId: item.id || `shot-${String(index + 1).padStart(2, "0")}`,
    narrativeRole: role,
    screenTitle: item.templateProps?.title || "",
    templateSlug: item.selectedSlug || "",
    assetSlotKind: item.assetSlotPlan?.slotKind || "",
    source: item.templateProps?.source || "",
    renderedImageUrls: imageUrlsForItem(item),
    officialEvidence: item.templateProps?.officialEvidence || null,
    filmBridge: item.filmBridge || item.templateProps?.filmBridge || null,
    motionPlan: item.motionPlan || item.templateProps?.motionPlan || null,
    materialRouteDecision: item.materialRouteDecision || item.templateProps?.materialRouteDecision || null,
    sourceTrust,
    materialSpecificity,
    materialEvidence,
    templateFit,
    readability,
    continuity,
    motionGrammar,
    transitionFit,
    hyperframesLayout,
    blockingIssues,
    warningIssues,
    recommendedFix: "",
    framePath,
  };
  shot.recommendedFix = recommendedFixFor(shot, role);
  return shot;
}

function framePlan(items, fps) {
  let start = 0;
  return items.map((item, index) => {
    const durationFrames = Math.max(1, Math.round(Number(item.durationSec || 1) * fps));
    const frame = start + Math.floor(durationFrames / 2);
    start += durationFrames;
    return { index, frame, durationFrames };
  });
}

async function renderFrames(items, fps) {
  await fs.mkdir(framesDir, { recursive: true });
  const frames = framePlan(items, fps);
  for (const planned of frames) {
    const item = items[planned.index];
    const shotNo = String(planned.index + 1).padStart(2, "0");
    const outputPath = path.join(framesDir, `shot-${shotNo}-frame-${planned.frame}.png`);
    const args = [
      remotionBin,
      "still",
      "src/index.ts",
      "ArticleTemplateTimeline",
      outputPath,
      `--frame=${planned.frame}`,
      "--props",
      propsPath,
      "--overwrite",
      "--scale=0.5",
      "--log=error",
    ];
    const result = await run(args, rendererDir);
    if (result.code !== 0) {
      throw new Error(`Failed to render still for ${item.id}: ${result.output.slice(-2000)}`);
    }
    planned.path = outputPath;
  }
  return frames;
}

async function createMontage(items, renderedFrames) {
  const thumbWidth = 480;
  const thumbHeight = 270;
  const labelHeight = 46;
  const gap = 18;
  const columns = 3;
  const rows = Math.ceil(items.length / columns);
  const width = columns * thumbWidth + (columns + 1) * gap;
  const height = rows * (thumbHeight + labelHeight) + (rows + 1) * gap;
  const composites = [];

  for (const frame of renderedFrames) {
    const item = items[frame.index];
    const row = Math.floor(frame.index / columns);
    const col = frame.index % columns;
    const left = gap + col * (thumbWidth + gap);
    const top = gap + row * (thumbHeight + labelHeight + gap);
    const label = `${String(frame.index + 1).padStart(2, "0")} ${item.selectedSlug} ${item.assetSlotPlan?.slotKind || ""} f${frame.frame}`;
    const labelSvg = Buffer.from(`
      <svg width="${thumbWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#202020"/>
        <text x="12" y="29" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#f4f4f4">${label.replace(/&/gu, "&amp;").replace(/</gu, "&lt;")}</text>
      </svg>
    `);
    const image = await sharp(frame.path).resize(thumbWidth, thumbHeight, { fit: "cover" }).png().toBuffer();
    composites.push({ input: labelSvg, left, top });
    composites.push({ input: image, left, top: top + labelHeight });
  }

  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#111111",
    },
  }).composite(composites).png().toFile(montagePath);
}

function mdStatus(status) {
  if (status === "blocked") return "BLOCKED";
  if (status === "partial") return "PARTIAL";
  return "PASS";
}

function buildMarkdown(report) {
  const lines = [
    "# Film Readiness Report",
    "",
    `- Contract: \`${report.contract}\``,
    `- Film ready: **${report.filmReady ? "true" : "false"}**`,
    `- Shots: ${report.summary.shotCount}`,
    `- Blocking issues: ${report.summary.blockingIssueCount}`,
    `- Warning issues: ${report.summary.warningIssueCount}`,
    `- Montage: \`${report.artifacts.montagePath}\``,
    `- MP4: \`${report.artifacts.mp4Path}\``,
    `- HyperFrames audit: \`${report.artifacts.hyperframesAuditPath}\``,
    "",
    "## Top Blocking Issues",
    "",
    ...report.summary.topBlockingIssues.map((issue) => `- ${issue}`),
    "",
    "## Shot Review",
    "",
  ];

  for (const shot of report.shots) {
    lines.push(`### ${shot.shotId} - ${shot.screenTitle || shot.templateSlug}`);
    lines.push("");
    lines.push(`- Role: ${shot.narrativeRole}`);
    lines.push(`- Template: ${shot.templateSlug}`);
    lines.push(`- Slot: ${shot.assetSlotKind}`);
    lines.push(`- Source: ${shot.source || "missing"}`);
    if (shot.officialEvidence?.sourceUrl) {
      lines.push(`- Official evidence: ${shot.officialEvidence.sourceLabel || shot.officialEvidence.sourceName || "official source"} <${shot.officialEvidence.sourceUrl}>${shot.officialEvidence.mediaEvidenceUrl ? `; media <${shot.officialEvidence.mediaEvidenceUrl}>` : ""}`);
    }
    if (shot.filmBridge?.contract === "A1FilmBridge/v1") {
      lines.push(`- Film bridge: ${shot.filmBridge.arcRole} - ${shot.filmBridge.argumentFunction}`);
      if (shot.filmBridge.previousRelation) lines.push(`- Previous relation: ${shot.filmBridge.previousRelation}`);
      if (shot.filmBridge.nextRelation) lines.push(`- Next relation: ${shot.filmBridge.nextRelation}`);
    }
    if (shot.motionPlan?.contract === "A1MotionPlan/v1") {
      lines.push(`- Motion intent: ${shot.motionPlan.semanticIntent}`);
      lines.push(`- Motion motif: ${shot.motionPlan.visualMotif}`);
      lines.push(`- Transition out: ${shot.motionPlan.transitionOut}`);
    }
    if (shot.materialRouteDecision?.contract === "A1MaterialRouteDecision/v1") {
      lines.push(`- Material route: ${shot.materialRouteDecision.decision} - ${shot.materialRouteDecision.reason}`);
    }
    lines.push(`- Material: ${mdStatus(shot.materialSpecificity.status)} - ${shot.materialSpecificity.reason}`);
    lines.push(`- Material evidence: ${mdStatus(shot.materialEvidence.status)} - ${shot.materialEvidence.reason}`);
    lines.push(`- Template fit: ${mdStatus(shot.templateFit.status)} - ${shot.templateFit.reason}`);
    lines.push(`- Readability: ${mdStatus(shot.readability.status)} - ${shot.readability.reason}`);
    lines.push(`- Continuity: ${mdStatus(shot.continuity.status)} - ${shot.continuity.reason}`);
    lines.push(`- Motion grammar: ${mdStatus(shot.motionGrammar.status)} - ${shot.motionGrammar.reason}`);
    lines.push(`- Transition fit: ${mdStatus(shot.transitionFit.status)} - ${shot.transitionFit.reason}`);
    lines.push(`- HyperFrames layout: ${mdStatus(shot.hyperframesLayout.status)} - ${shot.hyperframesLayout.reason}`);
    lines.push(`- Blocking issues: ${shot.blockingIssues.length ? shot.blockingIssues.join("; ") : "none"}`);
    lines.push(`- Recommended fix: ${shot.recommendedFix}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const props = await readJson(propsPath);
  const hyperframesAudit = await readJsonOptional(hyperframesAuditPath, null);
  await fs.access(mp4Path);
  const items = Array.isArray(props.items) ? props.items : [];
  if (!items.length) throw new Error("No timeline items found for film readiness audit.");
  const fps = Number(props.fps || 30);
  const sharedMotif = items[0]?.motionPlan?.visualMotif || items[0]?.templateProps?.motionPlan?.visualMotif || "";
  const renderedFrames = await renderFrames(items, fps);
  await createMontage(items, renderedFrames);
  const shots = items.map((item, index) => buildShotReport(item, index, items, renderedFrames[index].path, hyperframesAudit, sharedMotif));
  const blockingIssueCount = shots.reduce((sum, shot) => sum + shot.blockingIssues.length, 0);
  const warningIssueCount = shots.reduce((sum, shot) => sum + shot.warningIssues.length, 0);
  const topBlockingIssues = shots
    .flatMap((shot) => shot.blockingIssues.map((issue) => `${shot.shotId}: ${issue}`))
    .slice(0, 8);
  const filmReady = blockingIssueCount === 0 && warningIssueCount <= 1;
  const report = {
    contract: "A1FilmReadinessReport/v1",
    generatedAt: new Date().toISOString(),
    filmReady,
    readyMeaning: "true only when source trust, material specificity, template fit, readability, and continuity pass at film level",
    summary: {
      shotCount: shots.length,
      blockingIssueCount,
      warningIssueCount,
      topBlockingIssues,
      highestPriorityFix: topBlockingIssues[0] || shots.find((shot) => shot.warningIssues.length)?.recommendedFix || "Continue film-level review.",
    },
    artifacts: {
      propsPath,
      mp4Path,
      hyperframesAuditPath,
      framesDir,
      montagePath,
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
    filmReady: report.filmReady,
    shotCount: shots.length,
    blockingIssueCount,
    warningIssueCount,
    reportPath,
    markdownPath,
    montagePath,
  }, null, 2));
  if (!filmReady && process.env.A1_FILM_READINESS_STRICT === "1") process.exit(1);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
