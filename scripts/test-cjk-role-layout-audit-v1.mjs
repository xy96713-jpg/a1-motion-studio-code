#!/usr/bin/env node
import assert from "node:assert/strict";

import {auditCjkRoleLayout} from "./lib/a1-cjk-role-layout-audit-v1.mjs";

const renders = (lines) => [
  {width: 1920, height: 1080, lines: lines.map((text, index) => ({text, bounds: {left: 120, top: 820 + index * 72, right: 1800, bottom: 882 + index * 72}, fontSizePx: 54}))},
  {width: 960, height: 540, lines: lines.map((text, index) => ({text, bounds: {left: 60, top: 410 + index * 36, right: 900, bottom: 441 + index * 36}, fontSizePx: 27}))},
  {width: 480, height: 270, lines: lines.map((text, index) => ({text, bounds: {left: 30, top: 205 + index * 18, right: 450, bottom: 220 + index * 18}, fontSizePx: 14}))},
];

const caption = auditCjkRoleLayout({
  role: "CAPTION",
  locale: "zh-CN",
  sourceText: "现在让 AI 写文章，已经不是什么新鲜事了。",
  playbackRenders: renders(["现在让 AI 写文章，", "已经不是什么新鲜事了。"]),
});
assert.equal(caption.contract, "A1CjkRoleLayoutAudit/v1");
assert.equal(caption.status, "PASS");
assert.equal(caption.standardsScope, "CLREQ_PROSE_AND_MIXED_SCRIPT");
assert.ok(caption.signals.some((signal) => signal.code === "CJK_LATIN_ADJACENCY_PRESENT"));
assert.equal(caption.failures.length, 0);

const invalid = auditCjkRoleLayout({
  role: "EVIDENCE_TRANSLATION",
  locale: "zh-Hans",
  sourceText: "这是（错误，的",
  playbackRenders: renders(["这是（", "，错误", "的"]),
});
assert.equal(invalid.status, "FAIL");
for (const code of ["FORBIDDEN_LINE_END", "FORBIDDEN_LINE_START", "ORPHAN_FUNCTION_CHARACTER"]) assert.ok(invalid.failures.some((failure) => failure.code === code));

const mismatch = auditCjkRoleLayout({
  role: "PRESENTER_SUPPORT",
  locale: "zh-CN",
  sourceText: "真实文本",
  playbackRenders: renders(["错误文本"]),
});
assert.ok(mismatch.failures.some((failure) => failure.code === "EXACT_COPY_MISMATCH"));

const hero = auditCjkRoleLayout({
  role: "HERO_GENERATED_TYPE",
  locale: "zh-CN",
  sourceText: "智能写作工具台",
  playbackRenders: renders(["智能写作工具台"]),
});
assert.equal(hero.status, "PASS");
assert.equal(hero.standardsScope, "DISPLAY_GLYPH_ONLY");
assert.equal(hero.checks.proseLineBreakRulesApplied, false);

const clipped = auditCjkRoleLayout({
  role: "FORMAL_COPY",
  locale: "zh-CN",
  sourceText: "完整证据",
  playbackRenders: [{width: 480, height: 270, lines: [{text: "完整证据", bounds: {left: -1, top: 10, right: 470, bottom: 80}, fontSizePx: 32}]}],
});
assert.ok(clipped.failures.some((failure) => failure.code === "RENDERED_LINE_OUT_OF_BOUNDS"));
assert.throws(() => auditCjkRoleLayout({role: "CAPTION", locale: "en-US", sourceText: "中文", playbackRenders: renders(["中文"])}), /cjk-role-layout-locale-invalid/u);

console.log("A1 CJK role layout audit PASS");
