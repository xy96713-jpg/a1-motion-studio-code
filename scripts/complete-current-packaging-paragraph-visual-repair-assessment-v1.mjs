#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const planPath = process.env.A1_PACKAGING_PARAGRAPH_VISUAL_REPAIR_PLAN;
if (!planPath || !fs.existsSync(planPath)) throw new Error("paragraph-visual-repair-plan-path-required");
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const reviewRoot = path.join(projectRoot, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/packaging-paragraph-canary-repair-v1", plan.planSha256);
const templatePath = path.join(reviewRoot, "objective-pixel-audit-v1/visual-director-assessment-input-template.json");
const outputPath = path.join(reviewRoot, "objective-pixel-audit-v1/visual-director-assessment-input.completed.json");
if (fs.existsSync(outputPath)) throw new Error("paragraph-visual-repair-completed-assessment-input-already-exists");
const input = JSON.parse(fs.readFileSync(templatePath, "utf8"));

const decisions = {
  "ED-12": {
    threeSecondRead: "PASS", visibleAction: "PASS",
    focalActor: "One rising evidence rail carries five verified model marks in a strict lower-left to upper-right spoken order.",
    visualThesisObserved: "The author tried five real systems; their attempts accumulate as one set and leave the frame as a shared trajectory rather than a capability ranking.",
    compositionEvidence: "A hard diagonal crop, unequal node spacing, offset red registration line, and large quiet field create one decisive reading path that exits toward ED-13.",
    typographyEvidence: "All five exact model names use bound local glyph outlines in separate rail-attached labels with no overlap or pseudo-copy.",
    weaknesses: ["The evidence rail is intentionally graphic and will still need timed reveals before it can prove motion maturity."],
    evidence: {
      "three-second-read": "The ascending five-node trial sequence is legible within three seconds.",
      "single-focal-actor": "The continuous diagonal rail is the single dominant actor; individual logos remain subordinate stops.",
      "authored-specificity": "Five exact verified marks, asymmetric spacing, and an exit trajectory create a source-specific silhouette.",
      "authored-background": "The negative field, pale registration band, dot origin, and cropped exit actively establish direction and hierarchy.",
      "structural-material": "Offset ink registration, rail thickness, and the dot origin construct accumulation rather than act as a full-screen filter.",
      "color-thesis": "Charcoal evidence structure, warm red progress signal, paper field, and authentic mark colors have controlled roles.",
      "editorial-composition": "Strong diagonal crop, scale changes, and generous unequal negative space make the sequence intentional.",
      "type-image-entanglement": "Each exact name is physically attached to its verified mark and ordered by the same rail.",
      "anti-template": "The frame is a directed evidence track rather than a centered card, logo matrix, fake interface, or cozy scene.",
      "sequence-diversity": "Its quiet iconic evidence-track fingerprint differs from the collision mechanism and poster-dense verdict."
    }
  },
  "ED-13": {
    threeSecondRead: "PASS", visibleAction: "PASS",
    focalActor: "A red, pink, and charcoal flow crosses translucent membranes and terminates in a dense unresolved right-side knot.",
    visualThesisObserved: "Surface fluency advances cleanly while the terminal obstruction remains compacted and unresolved, matching the spoken mechanism.",
    compositionEvidence: "Aggressive crops, membrane crossings, diagonal flow, and the unequal terminal knot create a causal editorial collision.",
    typographyEvidence: "Exact Chinese copy remains renderer-bound and strongly hierarchical, but the two panels still read as conventional rectangular overlays.",
    weaknesses: ["The copy panels remain rectangular labels and should become more physically entangled only in a later authorized motion treatment."],
    evidence: {
      "three-second-read": "The fluent path and unresolved knot communicate the mechanism immediately.",
      "single-focal-actor": "The continuous flow-to-knot mechanism remains the dominant actor.",
      "authored-specificity": "Membrane crossings, directional ribbons, and the terminal knot form a specific causal silhouette.",
      "authored-background": "Background geometry channels the path and concentrates obstruction at right.",
      "structural-material": "Translucent membranes, grain, and layered ribbons construct passage and blockage rather than decorate the frame.",
      "color-thesis": "Warm signal red and pink oppose charcoal obstruction on an off-white field.",
      "editorial-composition": "Strong crop, scale collision, diagonal motion, and unequal masses remain intentional.",
      "type-image-entanglement": "The copy is semantically aligned but still sits in two generic rectangular label panels.",
      "anti-template": "The causal abstract mechanism is materially different from a generic AI poster, card, or fake interface.",
      "sequence-diversity": "Its abstract mechanism fingerprint differs from both adjacent source-led frames."
    },
    fails: ["type-image-entanglement"]
  },
  "ED-14": {
    threeSecondRead: "PASS", visibleAction: "PASS",
    focalActor: "One oversized authentic paper crop feeds three exact bounded claims through cyan extraction paths.",
    visualThesisObserved: "The sample boundary enters first, then source regions visibly narrow into syntactic, lexical, and cautious expression-range conclusions.",
    compositionEvidence: "The paper is aggressively cropped and tilted against a charcoal wedge; three unequal extraction bands produce poster-dense hierarchy and source pressure.",
    typographyEvidence: "Exact renderer-bound Chinese claims originate at source-linked endpoints; cyan marks the strongest lexical finding without fabricating paper text.",
    weaknesses: ["The static frame proves source-to-claim structure but not yet the reveal timing of the three extraction paths."],
    evidence: {
      "three-second-read": "The paper-to-three-claim verdict reads clearly within three seconds.",
      "single-focal-actor": "The paper and its three extraction paths behave as one source-led verdict actor.",
      "authored-specificity": "The authentic paper crop, highlighted regions, and three bounded claim endpoints are source-specific.",
      "authored-background": "The charcoal wedge, cyan rails, and cropped paper edge actively create hierarchy and evidence pressure.",
      "structural-material": "Printed paper texture, overscale crop, highlight bands, and extraction lines construct the verdict.",
      "color-thesis": "Cyan evidence links, charcoal conclusion field, white copy, and neutral paper have explicit semantic roles.",
      "editorial-composition": "Scale collision, tilt, hard crop, unequal rows, and a diagonal field produce a poster-dense editorial frame.",
      "type-image-entanglement": "Every claim is connected to a highlighted source region instead of floating beside a document thumbnail.",
      "anti-template": "The frame is a source-extraction poster rather than a balanced report slide or centered information card.",
      "sequence-diversity": "Its poster-dense paper-verdict fingerprint completes the quiet-to-collision-to-dense progression."
    }
  }
};

for (const item of input.items) {
  const decision = decisions[item.shotId];
  Object.assign(item, {threeSecondRead: decision.threeSecondRead, visibleAction: decision.visibleAction, focalActor: decision.focalActor, visualThesisObserved: decision.visualThesisObserved, compositionEvidence: decision.compositionEvidence, typographyEvidence: decision.typographyEvidence, weaknesses: decision.weaknesses});
  item.coreCheckResults = item.coreCheckResults.map(({id}) => ({id, result: decision.fails?.includes(id) ? "FAIL" : "PASS", evidence: decision.evidence[id]}));
  item.hardFailureResults = item.hardFailureResults.map(({id}) => ({id, present: false, evidence: "Not present in the inspected repaired actual pixels."}));
}
input.status = "COMPLETED_ACTUAL_PIXEL_ASSESSMENT";
input.reviewer = {kind: "visual-director-agent", id: "codex-a1-visual-director", model: "GPT-5 Codex", human: false, mayClaimHumanStatus: false, assessedAt: new Date().toISOString()};
input.paragraph = {
  evidenceToMechanism: {result: "PASS", evidence: "ED-12's warm diagonal rail exits at upper right and ED-13 receives a warm flow from the left, transferring the accumulated attempts into the causal mechanism."},
  mechanismToVerdict: {result: "PASS", evidence: "ED-13 ends in an unresolved obstruction and ED-14 answers it with an authentic source crop whose highlighted regions extract into bounded conclusions."},
  roleDifferentiation: {result: "PASS", evidence: "The three roles remain unmistakable: verified attempts, explanatory mechanism, and source-bounded verdict."},
  densityProgression: {result: "PASS", evidence: "The paragraph deliberately progresses from quiet-iconic evidence to editorial collision and then to a poster-dense verdict."},
  singleParagraphRead: {result: "PASS", evidence: "A continuous left-to-right logic now reads as tried systems, observed mechanism, and externally bounded conclusion rather than three unrelated posters."},
  strongestHandoff: "ED-12 to ED-13 is strongest because the rising warm rail and the incoming warm flow share direction, color role, and causal momentum.",
  weakestHandoff: "ED-13 to ED-14 is still the weaker cut because the palette changes to cyan, but the unresolved knot-to-source-extraction logic remains readable and intentional.",
  repairInstruction: null
};
fs.writeFileSync(outputPath, `${JSON.stringify(input, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
console.log(JSON.stringify({status: input.status, outputPath, reviewedShotIds: input.items.map((item) => item.shotId), human: false, userVisualApproval: "NOT_APPROVED", productionAdmitted: false}, null, 2));
