import assert from "node:assert/strict";
import fs from "node:fs";

const auditSource = fs.readFileSync("scripts/audit-editorial-template-maturity.mjs", "utf8");

assert.equal(
  /generated\/studio-next-template-timeline\/article-template-timeline-props\.json/u.test(auditSource),
  false,
  "editorial template maturity must not read mutable latest render props",
);

assert.equal(
  /audit-remocn-mechanism-flow/u.test(auditSource),
  true,
  "editorial template maturity must point mechanism runtime coverage to its dedicated audit",
);

console.log(JSON.stringify({ ok: true, contract: "A1EditorialTemplateMaturityDeterminismTest/v1" }, null, 2));
