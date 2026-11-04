const PROSE_ROLES = new Set(["CAPTION", "EVIDENCE_TRANSLATION", "PRESENTER_SUPPORT", "SOURCE_ANNOTATION", "FORMAL_COPY", "PIXEL_DETAIL_TYPE"]);
const DISPLAY_ROLES = new Set(["PRESENTER_HERO", "FULLSCREEN_HERO", "HERO_GENERATED_TYPE"]);
const VALID_LOCALES = new Set(["zh-CN", "zh-Hans", "zh-Hant", "zh-TW", "zh-HK"]);
const FORBIDDEN_LINE_START = new Set(Array.from("，、。．！？；：」』）］｝〉》】〕〗〙〛々"));
const FORBIDDEN_LINE_END = new Set(Array.from("「『（［｛〈《【〔〖〘〚"));
const ORPHAN_FUNCTION_CHARACTERS = new Set(Array.from("的了是和与及在把被将而但或"));

const finding = (code, render, line, detail) => ({
  code,
  severity: "ERROR",
  viewport: `${render.width}x${render.height}`,
  lineIndex: line.index,
  text: line.text,
  detail,
  standardMapping: code === "FORBIDDEN_LINE_START" || code === "FORBIDDEN_LINE_END"
    ? "W3C CLReq: prohibition rules for line start and line end"
    : code === "ORPHAN_FUNCTION_CHARACTER"
      ? "A1 semantic line integrity; CLReq-compatible composition practice"
      : "A1 rendered text contract",
});

export function auditCjkRoleLayout({role, locale, sourceText, playbackRenders}) {
  if (!PROSE_ROLES.has(role) && !DISPLAY_ROLES.has(role)) throw new Error(`cjk-role-layout-role-invalid:${role}`);
  if (!VALID_LOCALES.has(locale)) throw new Error(`cjk-role-layout-locale-invalid:${locale}`);
  if (typeof sourceText !== "string" || !sourceText.length) throw new Error("cjk-role-layout-source-text-required");
  if (!Array.isArray(playbackRenders) || !playbackRenders.length) throw new Error("cjk-role-layout-playback-renders-required");
  const prose = PROSE_ROLES.has(role);
  const failures = [];
  const renderChecks = [];
  for (const render of playbackRenders) {
    if (!Number.isFinite(render?.width) || !Number.isFinite(render?.height) || render.width <= 0 || render.height <= 0 || !Array.isArray(render.lines) || !render.lines.length) throw new Error("cjk-role-layout-render-invalid");
    const lines = render.lines.map((line, index) => ({...line, index}));
    const renderedText = lines.map((line) => String(line.text || "")).join("");
    if (renderedText !== sourceText) failures.push({
      code: "EXACT_COPY_MISMATCH",
      severity: "ERROR",
      viewport: `${render.width}x${render.height}`,
      sourceText,
      renderedText,
      standardMapping: "A1 exact visible-copy authority",
    });
    for (const line of lines) {
      const text = String(line.text || "");
      const bounds = line.bounds;
      if (!text || !bounds || ![bounds.left, bounds.top, bounds.right, bounds.bottom, line.fontSizePx].every(Number.isFinite)) throw new Error("cjk-role-layout-rendered-line-invalid");
      if (bounds.left < 0 || bounds.top < 0 || bounds.right > render.width || bounds.bottom > render.height || bounds.right <= bounds.left || bounds.bottom <= bounds.top) {
        failures.push(finding("RENDERED_LINE_OUT_OF_BOUNDS", render, line, "Rendered ink bounds leave the playback canvas."));
      }
      if (!prose) continue;
      const first = Array.from(text)[0];
      const last = Array.from(text).at(-1);
      if (FORBIDDEN_LINE_START.has(first)) failures.push(finding("FORBIDDEN_LINE_START", render, line, `Line begins with prohibited punctuation ${first}.`));
      if (FORBIDDEN_LINE_END.has(last)) failures.push(finding("FORBIDDEN_LINE_END", render, line, `Line ends with opening punctuation ${last}.`));
      if (Array.from(text).length === 1 && ORPHAN_FUNCTION_CHARACTERS.has(text)) failures.push(finding("ORPHAN_FUNCTION_CHARACTER", render, line, `Function character ${text} cannot form an independent semantic line.`));
    }
    renderChecks.push({
      width: render.width,
      height: render.height,
      lineCount: lines.length,
      exactCopy: renderedText === sourceText,
      allInkInsideCanvas: !failures.some((item) => item.viewport === `${render.width}x${render.height}` && item.code === "RENDERED_LINE_OUT_OF_BOUNDS"),
    });
  }
  const signals = [];
  if (/\p{Script=Han}\s*[A-Za-z0-9]|[A-Za-z0-9]\s*\p{Script=Han}/u.test(sourceText)) signals.push({
    code: "CJK_LATIN_ADJACENCY_PRESENT",
    disposition: "REVIEW_ONLY",
    detail: "Do not insert spaces automatically; inspect locale, font, and rendered rhythm.",
  });
  return {
    contract: "A1CjkRoleLayoutAudit/v1",
    version: 1,
    status: failures.length ? "FAIL" : "PASS",
    role,
    locale,
    standardsScope: prose ? "CLREQ_PROSE_AND_MIXED_SCRIPT" : "DISPLAY_GLYPH_ONLY",
    checks: {
      exactCopyCheckedAtEveryPlaybackSize: true,
      renderedInkBoundsChecked: true,
      proseLineBreakRulesApplied: prose,
      sourceHeuristicsAreFinalVerdict: false,
    },
    renderChecks,
    failures,
    signals,
    productionAdmission: false,
  };
}
