const rootUrl = process.env.A1_NEXT_WORKBENCH_URL || "http://localhost:4310";

const response = await fetch(`${rootUrl}/api/a1-render-template-timeline`, { cache: "no-store" });
if (!response.ok) {
  console.error(`template timeline API failed: ${response.status}`);
  process.exit(1);
}

const payload = await response.json();
if (!payload.ok || payload.props?.contract !== "A1ArticleTemplateTimeline/v1") {
  console.error(JSON.stringify({ message: "template timeline payload is not ready", payload }, null, 2));
  process.exit(1);
}

const items = payload.props.items || [];
const failures = [];

for (const item of items) {
  const props = item.templateProps || {};
  const officialEvidence = props.officialEvidence || {};
  const sourceUrl = officialEvidence.sourceUrl || "";
  const claimSupport = Array.isArray(officialEvidence.claimSupport) ? officialEvidence.claimSupport : [];
  if (!/^https:\/\/www\.usgs\.gov\//u.test(sourceUrl)) {
    failures.push(`${item.id} missing official USGS sourceUrl in templateProps.officialEvidence`);
  }
  if (!claimSupport.length) {
    failures.push(`${item.id} missing official claimSupport in templateProps.officialEvidence`);
  }
  const needsOfficialMedia = item.assetSlotPlan?.slotKind === "single-image"
    || item.assetSlotPlan?.slotKind === "multi-image"
    || /GPS|倾斜仪|压力|地图|300|变化/u.test(`${props.title || ""} ${props.subtitle || ""} ${item.assetSlotPlan?.query || ""}`);
  const textOnlyEvidence = officialEvidence.evidenceKind === "official-article-text";
  if (needsOfficialMedia && !textOnlyEvidence && !/^https:\/\/www\.usgs\.gov\/media\//u.test(officialEvidence.mediaEvidenceUrl || "")) {
    failures.push(`${item.id} missing official USGS mediaEvidenceUrl for visual/data evidence slot`);
  }
}

if (items.length !== 9) failures.push(`expected 9 timeline items, got ${items.length}`);

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  shotCount: items.length,
  officialEvidenceCount: items.filter((item) => item.templateProps?.officialEvidence?.sourceUrl).length,
}, null, 2));
