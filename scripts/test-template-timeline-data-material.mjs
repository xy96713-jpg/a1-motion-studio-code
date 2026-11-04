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

const dataShots = (payload.props.items || []).filter((item) => item.assetSlotPlan?.slotKind === "data");
const failures = [];

for (const item of dataShots) {
  const props = item.templateProps || {};
  const urls = [
    ...(Array.isArray(props.imageUrls) ? props.imageUrls : []),
    props.imageUrl,
    props.evidenceImageUrl,
  ].filter(Boolean);
  const roles = Array.isArray(props.imageRoles) ? props.imageRoles : [];
  if (!urls.length) failures.push(`${item.id} data slot has no imageUrl/imageUrls/evidenceImageUrl in template props`);
  if (!roles.length) failures.push(`${item.id} data slot has no imageRoles in template props`);
  if (!item.assetSlotPlan?.subSlots?.some((slot) => slot.status === "ready" && slot.imageUrl)) {
    failures.push(`${item.id} data slot plan has no ready image subslot`);
  }
}

if (!dataShots.length) failures.push("no data shots found");

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  dataShotCount: dataShots.length,
  checked: dataShots.map((item) => item.id),
}, null, 2));
