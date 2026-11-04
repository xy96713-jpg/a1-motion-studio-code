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
const requiredFields = [
  "semanticIntent",
  "visualMotif",
  "layers",
  "entrance",
  "emphasis",
  "transitionOut",
  "easing",
  "durationFrames",
  "filmBridgeRef",
  "officialEvidenceRef",
];

if (items.length !== 9) failures.push(`expected 9 timeline items, got ${items.length}`);

for (const item of items) {
  const motionPlan = item.motionPlan || {};
  const propsMotionPlan = item.templateProps?.motionPlan || {};
  if (motionPlan.contract !== "A1MotionPlan/v1") failures.push(`${item.id} missing top-level A1MotionPlan/v1`);
  if (propsMotionPlan.contract !== "A1MotionPlan/v1") failures.push(`${item.id} missing templateProps A1MotionPlan/v1`);
  if (JSON.stringify(motionPlan) !== JSON.stringify(propsMotionPlan)) failures.push(`${item.id} top-level and templateProps motionPlan differ`);
  for (const field of requiredFields) {
    const value = motionPlan[field];
    if (Array.isArray(value) ? value.length === 0 : value === undefined || value === null || value === "") {
      failures.push(`${item.id} motionPlan missing ${field}`);
    }
  }
  if (!/volcano-map-grid|seismic-dots|pressure-line|monitoring-strokes|uncertainty-mask/u.test(motionPlan.visualMotif || "")) {
    failures.push(`${item.id} motionPlan missing shared volcano monitoring motif`);
  }
  if (item.materialRouteDecision?.contract !== "A1MaterialRouteDecision/v1") {
    failures.push(`${item.id} missing material route decision`);
  }
}

const byId = Object.fromEntries(items.map((item) => [item.id, item]));
if (byId["shot-03"]?.templateProps?.measurementFrame !== "duration-magnitude-localization") {
  failures.push("shot-03 must encode duration/magnitude/localization measurementFrame");
}
if (!Array.isArray(byId["shot-05"]?.templateProps?.instrumentReadings) || byId["shot-05"].templateProps.instrumentReadings.length < 2) {
  failures.push("shot-05 must carry GPS + tilt instrumentReadings");
}
if (!byId["shot-06"]?.templateProps?.problemContrast?.left || !byId["shot-06"]?.templateProps?.problemContrast?.right) {
  failures.push("shot-06 must carry signal/path problemContrast");
}
for (const id of ["shot-01", "shot-09"]) {
  if (byId[id]?.materialRouteDecision?.decision !== "text-first-no-image") {
    failures.push(`${id} must explicitly explain text-first-no-image material route`);
  }
}

const arcRoles = new Set(items.map((item) => item.filmBridge?.arcRole || item.templateProps?.filmBridge?.arcRole).filter(Boolean));
for (const role of ["setup", "evidence", "turn", "resolution"]) {
  if (!arcRoles.has(role)) failures.push(`missing film arc role ${role}`);
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  shotCount: items.length,
  motionPlanCount: items.filter((item) => item.motionPlan?.contract === "A1MotionPlan/v1").length,
  arcRoles: [...arcRoles],
}, null, 2));
