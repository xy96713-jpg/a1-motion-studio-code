import assert from "node:assert/strict";
import {auditPhysicalMotionEvidence, createPhysicalMotionContract} from "../apps/studio-next/src/lib/a1-physical-motion-contract-v1.mjs";

const contract = createPhysicalMotionContract({
  shotId: "ED-10",
  motionClass: "DETACHMENT_GRAVITY",
  entities: [
    {id: "PENCIL_SHELL", count: 1, bodyType: "RIGID_BODY", initialState: "fixed pencil with graphite attached", finalState: "fixed pencil with empty socket"},
    {id: "GRAPHITE_CORE", count: 1, bodyType: "RIGID_BODY", initialState: "attached inside pencil tip", finalState: "detached below-right"},
  ],
  drivers: [
    {id: "RETENTION_RELEASE", kind: "CONSTRAINT_RELEASE", cause: "tip retention releases once", response: "graphite slides along pencil axis then follows gravity", startT: 0.18},
  ],
  events: [
    {id: "CORE_DETACH", kind: "DETACH", atT: 0.42, entityIds: ["PENCIL_SHELL", "GRAPHITE_CORE"], driverId: "RETENTION_RELEASE"},
  ],
  constraints: {pencilTransform: "LOCKED", graphiteCount: 1, preDetachPath: "PENCIL_AXIS", postDetachPath: "DOWN_RIGHT_GRAVITY", terminalState: "HOLD"},
  protectedRegions: ["FORMAL_TEXT", "BACKGROUND", "CAMERA", "PENCIL_BODY_EXCEPT_TIP"],
  forbiddenOutcomes: ["GRAPHITE_SPLIT", "WOOD_SHELL_FRACTURE", "SECOND_PENCIL"],
});
assert.equal(contract.motionClass, "DETACHMENT_GRAVITY");
assert.equal(auditPhysicalMotionEvidence(contract, {temporalSampleCount: 9, endpointPixelParity: true, identityConserved: true, entityCountConserved: true, undeclaredTopologyChange: false, contactContinuity: true, cameraStable: true, protectedRegionsStable: true}).status, "PASS");
for (const bad of [
  {...contract, physicalMotionSha256: "0".repeat(64)},
  {...contract, events: []},
]) assert.throws(() => auditPhysicalMotionEvidence(bad, {}));
const failed = auditPhysicalMotionEvidence(contract, {temporalSampleCount: 4, endpointPixelParity: false, identityConserved: true, entityCountConserved: false, undeclaredTopologyChange: true, contactContinuity: false, cameraStable: false, protectedRegionsStable: false});
assert.equal(failed.status, "FAIL");
assert.ok(failed.failures.includes("TEMPORAL_SAMPLE_COUNT_INSUFFICIENT"));
console.log(JSON.stringify({status: "PASS", contract: contract.contract, physicalMotionSha256: contract.physicalMotionSha256, negativeFailures: failed.failures.length}, null, 2));
