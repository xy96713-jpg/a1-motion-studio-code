import assert from "node:assert/strict";
import {buildWholeFilmTypographyDutyMap} from "../apps/studio-next/src/lib/a1-whole-film-typography-duty-map-v1.mjs";
import {deriveTypographyDisplayGroupsV2, deriveTypographySemanticEventV2} from "../apps/studio-next/src/lib/a1-typography-role-authority-v2.mjs";

const sources = [
  "换模型，不等于解决问题。",
  "普通解释留给口播和画面。",
  "先分配任务，再检查结果。",
  "研究样本来自官方报告。",
  "这一镜不新增包装字。",
  "差距来自判断顺序。",
  "让结论回到真实使用。",
  "最后留下的是可复用判断。",
];
const shots = sources.map((sourceText, index) => ({
  shotId: `article-${index + 1}`,
  editMode: index === 0 || index === 2 ? "type-only" : index === 7 ? "presenter-overlay" : "presenter-clean",
  sourceText,
  visualJob: index === 2 ? "流程步骤" : index === 3 ? "研究证据" : "普通文章段落",
  keyPhrases: [],
}));
const v1Assignments = shots.map((shot) => ({contract: "A1TypographyAssignment/v1", treatmentMode: "none", pixelDuty: "NONE", headlineText: shot.sourceText}));
const map = buildWholeFilmTypographyDutyMap({shots, v1Assignments, sourceWorkspaceSha256: "test", sourceWorkspaceFileSha256: "test", sourceDirectorInputSha256: "test"});
assert.equal(map.assignments.length, 8);
assert.equal(map.status, "READY_FOR_USER_REVIEW");
assert.ok(map.assignments.some((item) => item.typographyRole === "FULLSCREEN_HERO"));
assert.ok(map.assignments.some((item) => item.typographyRole === "CONCLUSION_STAMP"));
assert.ok(map.assignments.some((item) => item.typographyRole === "NO_TYPE"));
assert.ok(map.assignments.some((item) => item.displayGroups.headline === "分配任务"));
assert.equal(deriveTypographySemanticEventV2({sourceText: sources[0], importance: 0.9}), "STRONG_CONTRAST");
const contrast = deriveTypographyDisplayGroupsV2({exactCopy: sources[0], role: "FULLSCREEN_HERO", semanticEvent: "STRONG_CONTRAST"});
assert.equal(contrast.headline, "换模型");
assert.equal(contrast.support, "不等于解决问题");
const process = deriveTypographyDisplayGroupsV2({exactCopy: sources[2], role: "EXPLANATION_DIAGRAM", semanticEvent: "PROCESS"});
assert.equal(process.headline, "分配任务");
assert.notEqual(process.headline, process.support);
console.log(JSON.stringify({contract: "A1TypographyArbitraryArticleTest/v1", status: "PASS", shotCount: map.assignments.length, roles: Object.fromEntries([...new Set(map.assignments.map((item) => item.typographyRole))].map((role) => [role, map.assignments.filter((item) => item.typographyRole === role).length])), examples: {contrast, process}}, null, 2));
