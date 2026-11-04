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

if (items.length !== 9) failures.push(`expected 9 timeline items, got ${items.length}`);

for (const [index, item] of items.entries()) {
  const bridge = item.filmBridge || item.templateProps?.filmBridge || {};
  if (bridge.contract !== "A1FilmBridge/v1") {
    failures.push(`${item.id} missing A1FilmBridge/v1`);
    continue;
  }
  if (!bridge.arcRole) failures.push(`${item.id} missing bridge.arcRole`);
  if (!bridge.argumentFunction) failures.push(`${item.id} missing bridge.argumentFunction`);
  if (index > 0 && !bridge.previousRelation) failures.push(`${item.id} missing bridge.previousRelation`);
  if (index < items.length - 1 && !bridge.nextRelation) failures.push(`${item.id} missing bridge.nextRelation`);
}

const distinctArcRoles = new Set(items.map((item) => (item.filmBridge || item.templateProps?.filmBridge || {}).arcRole).filter(Boolean));
for (const role of ["setup", "evidence", "turn", "resolution"]) {
  if (!distinctArcRoles.has(role)) failures.push(`missing film arc role ${role}`);
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  shotCount: items.length,
  arcRoles: [...distinctArcRoles],
}, null, 2));
