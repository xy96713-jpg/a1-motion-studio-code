#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const planSha256 = "7a2103c3da22b7166227e87cab72f8e02a92758e7bed9450f0929dd47dc520a6";
const reviewRoot = path.join(projectRoot, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/packaging-paragraph-canary-review-v1", planSha256, "objective-pixel-audit-v1");
const templatePath = path.join(reviewRoot, "visual-director-assessment-input-template.json");
const outputPath = path.join(reviewRoot, "visual-director-assessment-input.completed.json");
if (fs.existsSync(outputPath)) throw new Error("completed-visual-director-input-already-exists");

const input = JSON.parse(fs.readFileSync(templatePath, "utf8"));
const decisions = {
  "ED-12": {
    threeSecondRead: "PASS",
    visibleAction: "FAIL",
    focalActor: "The left model-name list and right logo grid compete; neither becomes one decisive evidence actor.",
    visualThesisObserved: "Five real model identities are legible, but the frame communicates a static inventory rather than an authored sequence of attempts converging on one shared problem.",
    compositionEvidence: "The two-column split is clean and readable, yet the large rectangular logo board and isolated list behave like a comparison template with extensive inactive background.",
    typographyEvidence: "Real renderer-bound names are sharp and correctly spelled, but type is detached from the logos and does not perform the reveal-or-bind action.",
    weaknesses: [
      "All five attempts appear simultaneously, so spoken order and accumulation are not visible.",
      "The black logo rectangle reads as a generic comparison card rather than structural evidence.",
      "No visual handoff carries the five attempts into ED-13's mechanism path."
    ],
    core: {
      "three-second-read": ["PASS", "Within three seconds the frame reads as five AI models that were tried."],
      "single-focal-actor": ["FAIL", "The oversized name list and logo board have similar visual weight and split attention."],
      "authored-specificity": ["FAIL", "The marks are authentic but arranged as a conventional list-plus-grid without a specific gesture or object relationship."],
      "authored-background": ["FAIL", "The pale field is mostly inactive and does not create hierarchy, tension, or evidence flow."],
      "structural-material": ["FAIL", "No low-fi material or registration device constructs the meaning of repeated attempts."],
      "color-thesis": ["PASS", "Charcoal, warm red, off-white, and source-logo accents have controlled roles."],
      "editorial-composition": ["PASS", "The frame uses a clear asymmetric left-right scale split and deliberate negative space."],
      "type-image-entanglement": ["FAIL", "Names and marks sit in separate zones instead of acting on one another."],
      "anti-template": ["FAIL", "The result remains close to a generic comparison board despite correct assets."],
      "sequence-diversity": ["PASS", "Its flat evidence-board fingerprint is materially distinct from ED-13 and ED-14."
      ]
    },
    hard: {"centered-card-or-balanced-template-composition": [true, "The dominant logo matrix is a conventional rectangular comparison card paired with a balanced list column."]}
  },
  "ED-13": {
    threeSecondRead: "PASS",
    visibleAction: "PASS",
    focalActor: "A red, pink, and charcoal flow passes through translucent membranes and terminates in a dense unresolved knot.",
    visualThesisObserved: "Surface fluency advances cleanly from left to right while the compacted obstruction at right remains visibly unresolved, matching the spoken mechanism.",
    compositionEvidence: "Aggressive edge crops, diagonal flow, layered membranes, and the lower-right knot create a decisive asymmetric reading path rather than a centered poster.",
    typographyEvidence: "Exact Chinese copy is renderer-bound and strongly hierarchical; the two blocks frame the mechanism, although they remain visibly rectangular overlays.",
    weaknesses: ["The copy panels are still conventional rectangles and could be more physically entangled with the flow in a future motion pass."],
    core: {
      "three-second-read": ["PASS", "The fluent path and unresolved knot explain surface improvement without root resolution immediately."],
      "single-focal-actor": ["PASS", "The continuous flow-to-knot mechanism is the dominant actor."],
      "authored-specificity": ["PASS", "Membrane crossings, directional ribbons, and the terminal knot form a specific causal silhouette."],
      "authored-background": ["PASS", "Background geometry actively channels the path and concentrates obstruction at right."],
      "structural-material": ["PASS", "Translucent membranes, grain, and layered ribbons construct passage and blockage rather than decorate the frame."],
      "color-thesis": ["PASS", "Warm signal red and pink oppose charcoal obstruction on an off-white field."],
      "editorial-composition": ["PASS", "Strong crop, scale collision, diagonal motion, and unequal masses form an intentional editorial composition."],
      "type-image-entanglement": ["FAIL", "The copy is semantically aligned but still sits in two generic label boxes over the mechanism."],
      "anti-template": ["PASS", "The causal abstract mechanism is materially different from a generic AI poster, card, or fake interface."],
      "sequence-diversity": ["PASS", "Its abstract mechanism fingerprint clearly differs from the adjacent evidence and source-verdict frames."]
    },
    hard: {}
  },
  "ED-14": {
    threeSecondRead: "PASS",
    visibleAction: "FAIL",
    focalActor: "The claim list and full paper page compete as two static columns instead of one source-led verdict actor.",
    visualThesisObserved: "The authentic paper and three bounded findings are present, but the frame does not visibly extract or narrow evidence from the sample into the verdict.",
    compositionEvidence: "A large pale text card faces a framed paper page in a familiar two-column layout; spacing is controlled but the background and relationship remain inert.",
    typographyEvidence: "All Chinese claims are exact and legible with one cyan emphasis, yet they read as a stacked summary detached from the cited page.",
    weaknesses: [
      "The expected sample-to-claim narrowing action is absent because all claims are presented at once.",
      "The paper is evidence but functions as a thumbnail rather than the structural source of the typography.",
      "The poster-dense verdict route collapses into a restrained information-board template."
    ],
    core: {
      "three-second-read": ["PASS", "The frame quickly reads as an English-news study with three constrained findings."],
      "single-focal-actor": ["FAIL", "The claim card and paper page are equal competing columns."],
      "authored-specificity": ["PASS", "The actual paper page and bounded three-claim wording are source-specific rather than generic decoration."],
      "authored-background": ["FAIL", "The pale background does not establish a source-to-verdict path or meaningful tension."],
      "structural-material": ["FAIL", "Paper is shown as a framed rectangle; its lines, crop, and print texture do not construct the verdict."],
      "color-thesis": ["PASS", "Charcoal claims, cyan lexical emphasis, off-white paper, and pale blue-gray field have controlled semantic roles."],
      "editorial-composition": ["FAIL", "The safe two-column split lacks the scale collision, crop pressure, or source extraction expected of poster-dense."],
      "type-image-entanglement": ["FAIL", "Claims do not originate from highlighted paper regions or cross the image boundary."],
      "anti-template": ["FAIL", "The result resembles a generic report-summary slide with a document thumbnail."],
      "sequence-diversity": ["PASS", "Its source-verdict fingerprint differs from the preceding abstract mechanism and evidence board."]
    },
    hard: {"centered-card-or-balanced-template-composition": [true, "The frame is a balanced report-card and document-thumbnail template with little spatial tension."]}
  }
};

for (const item of input.items) {
  const decision = decisions[item.shotId];
  Object.assign(item, {
    threeSecondRead: decision.threeSecondRead,
    visibleAction: decision.visibleAction,
    focalActor: decision.focalActor,
    visualThesisObserved: decision.visualThesisObserved,
    compositionEvidence: decision.compositionEvidence,
    typographyEvidence: decision.typographyEvidence,
    weaknesses: decision.weaknesses
  });
  item.coreCheckResults = item.coreCheckResults.map(({id}) => ({id, result: decision.core[id][0], evidence: decision.core[id][1]}));
  item.hardFailureResults = item.hardFailureResults.map(({id}) => {
    const result = decision.hard[id] || [false, "Not present in the inspected actual pixels."];
    return {id, present: result[0], evidence: result[1]};
  });
}

input.status = "COMPLETED_ACTUAL_PIXEL_ASSESSMENT";
input.reviewer = {
  kind: "visual-director-agent",
  id: "codex-a1-visual-director",
  model: "GPT-5 Codex",
  human: false,
  mayClaimHumanStatus: false,
  assessedAt: new Date().toISOString()
};
input.paragraph = {
  evidenceToMechanism: {result: "FAIL", evidence: "ED-12 ends as a static logo grid while ED-13 begins as an abstract flow; no shared edge, trajectory, or accumulating object performs the handoff."},
  mechanismToVerdict: {result: "FAIL", evidence: "ED-13's dense causal knot cuts abruptly to ED-14's calm report slide; the obstruction is not converted into source extraction or a bounded verdict."},
  roleDifferentiation: {result: "PASS", evidence: "Evidence, mechanism, and verdict are semantically distinct and use different primary visual families."},
  densityProgression: {result: "FAIL", evidence: "The sequence rises from a quiet board to editorial collision, then falls back to a sparse report layout instead of completing the intended poster-dense verdict."},
  singleParagraphRead: {result: "FAIL", evidence: "The three frames read as separate slides with a strong middle image, not yet as one continuous evidence-to-mechanism-to-verdict paragraph."},
  strongestHandoff: "ED-13 contains the strongest internal handoff: fluent ribbons visibly cross membranes and compress into the unresolved right-side knot.",
  weakestHandoff: "ED-12 to ED-13 is weakest because a flat inventory abruptly becomes a glossy causal mechanism without a shared trajectory or transferred actor.",
  repairInstruction: "Preserve ED-13 pixels and all source hashes. Recompose ED-12 and ED-14 only: turn ED-12 into one ordered five-attempt evidence track whose final trajectory exits toward ED-13, and make ED-14 a poster-dense source-led verdict where three exact claims grow from highlighted regions of the authentic paper crop. Carry the ED-13 trajectory into ED-14 as extraction lines, keep renderer-bound text, forbid new generated evidence, then rerun objective and continuous-triptych review without expanding to motion or production."
};

fs.writeFileSync(outputPath, `${JSON.stringify(input, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
console.log(JSON.stringify({status: input.status, outputPath, reviewedShotIds: input.items.map(({shotId}) => shotId), mediaWritten: false, workspaceMutationPerformed: false}, null, 2));
