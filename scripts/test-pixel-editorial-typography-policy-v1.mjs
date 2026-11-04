#!/usr/bin/env node
import {
  A1_PIXEL_EDITORIAL_TYPOGRAPHY_POLICY_CONTRACT,
  auditPixelEditorialTypographyAssignments,
  buildPixelEditorialTypographyAssignment,
} from "../apps/studio-next/src/lib/a1-pixel-editorial-typography-policy-v1.mjs";

const modes = [
  ["ED-T01", "presenter-overlay", "vibe coding\n智能写作工作台"],
  ["ED-T02", "screen-demo", null],
  ["ED-T03", "full-package", "真实材料"],
  ["ED-T04", "type-only", "自己的风格"],
  ["ED-T05", "presenter-clean", null],
];
const shots = modes.map(([shotId, editMode, headlineText], index) => {
  const shot = {
    shotId,
    order: index + 1,
    editMode,
    typographyRole: editMode === "full-package" ? "证据与结构" : "短语重音",
    visualJob: "测试系统字体职责",
    sourceText: headlineText || "本人直接讲述",
    keyPhrases: headlineText ? [headlineText] : [],
    presenterPackage: index === 0 ? {intensity: "hero"} : null,
  };
  shot.typographyAssignment = buildPixelEditorialTypographyAssignment({shot, headlineText});
  return shot;
});
const audit = auditPixelEditorialTypographyAssignments(shots);
const presenter = shots[0].typographyAssignment;
const screen = shots[1].typographyAssignment;
const clean = shots[4].typographyAssignment;
const failures = [];
if (audit.status !== "PASS") failures.push(...audit.failures);
if (presenter.policyContract !== A1_PIXEL_EDITORIAL_TYPOGRAPHY_POLICY_CONTRACT || presenter.policyScope !== "LEGACY_EDITABLE_TYPOGRAPHY_COMPATIBILITY" || presenter.currentRoleAuthorityContract !== "A1TypographyRoleAuthority/v1" || presenter.primaryFontAssetIds[0] !== "type-pixel-correction" || presenter.objectBindingRequired !== true) failures.push("presenter-policy-invalid");
if (screen.pixelDuty !== "object-bound-micro-caption" || screen.primaryFontAssetIds.join(",") !== "type-pixel-correction") failures.push("screen-policy-invalid");
if (clean.pixelDuty !== "none" || clean.primaryFontAssetIds.length !== 0 || clean.headlineText !== null) failures.push("presenter-clean-policy-invalid");
console.log(JSON.stringify({status: failures.length ? "FAIL" : "PASS", audit, failures}, null, 2));
if (failures.length) process.exitCode = 1;
