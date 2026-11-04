#!/usr/bin/env python3
"""Compare two timed transcript candidates without promoting either to approved copy."""

import argparse
import difflib
import hashlib
import json
from pathlib import Path


def normalized_with_origin(rows, id_key):
    chars, origins = [], []
    for row in rows:
        for char in row["text"]:
            if char.isalnum():
                chars.append(char.lower())
                origins.append(row[id_key])
    return "".join(chars), origins


def origins_for(mapping, start, end):
    if start < end:
        return sorted(set(mapping[start:end]))
    if not mapping:
        return []
    return [mapping[min(start, len(mapping) - 1)]]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True)
    parser.add_argument("--crosscheck", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    plan_bytes = Path(args.plan).read_bytes()
    plan = json.loads(plan_bytes)
    crosscheck = json.loads(Path(args.crosscheck).read_text())
    if crosscheck.get("contract") != "A1ReferenceSpeechCrosscheck/v1" or (
        plan.get("source", {}).get("videoSha256") != crosscheck.get("sourceVideoSha256")
    ):
        raise ValueError("source-video-or-crosscheck-mismatch")
    cues = plan["spokenCues"]
    segments = [{**item, "segmentIndex": index} for index, item in enumerate(crosscheck["segments"])]
    old, old_origin = normalized_with_origin(cues, "index")
    new, new_origin = normalized_with_origin(segments, "segmentIndex")
    matcher = difflib.SequenceMatcher(None, old, new, autojunk=False)
    cues_by_id = {cue["index"]: cue for cue in cues}
    segments_by_id = {segment["segmentIndex"]: segment for segment in segments}
    disagreements = []
    for tag, old_start, old_end, new_start, new_end in matcher.get_opcodes():
        if tag == "equal":
            continue
        cue_ids = origins_for(old_origin, old_start, old_end)
        segment_ids = origins_for(new_origin, new_start, new_end)
        spans = [cues_by_id[index] for index in cue_ids] + [segments_by_id[index] for index in segment_ids]
        start_ms = max(0, min(row["startMs"] for row in spans) - 500)
        end_ms = min(round(plan["source"]["durationSeconds"] * 1000), max(row["endMs"] for row in spans) + 500)
        disagreements.append({
            "id": f"diff-{len(disagreements) + 1:03d}",
            "kind": tag.upper(),
            "oldCandidate": old[old_start:old_end],
            "newCandidate": new[new_start:new_end],
            "cueIds": cue_ids,
            "crosscheckSegmentIds": segment_ids,
            "reviewWindowMs": [start_ms, end_ms],
            "decision": "NEEDS_HUMAN_LISTEN_OR_SOURCE_CHECK",
        })
    review_groups = {}
    for item in disagreements:
        key = (tuple(item["cueIds"]), tuple(item["reviewWindowMs"]))
        review_groups.setdefault(key, []).append(item["id"])
    result = {
        "contract": "A1ReferenceASRDisagreementQueue/v1",
        "scope": "RESEARCH_ONLY",
        "sourceVideoSha256": plan["source"]["videoSha256"],
        "sourcePlanSha256": hashlib.sha256(plan_bytes).hexdigest(),
        "sourceAudioSha256": crosscheck["sourceAudioSha256"],
        "crosscheckModel": crosscheck["model"],
        "normalizedAgreementRatio": round(matcher.ratio(), 6),
        "cueCount": len(cues),
        "crosscheckSegmentCount": len(segments),
        "disagreementCount": len(disagreements),
        "reviewWindowCount": len(review_groups),
        "reviewGroups": [{"cueIds": list(cue_ids), "reviewWindowMs": list(window), "differenceIds": ids}
                         for (cue_ids, window), ids in review_groups.items()],
        "approvedCopyCount": 0,
        "status": "MACHINE_DISAGREEMENTS_FOR_TARGETED_REVIEW_NOT_APPROVAL",
        "items": disagreements,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"path": str(output), "cueCount": len(cues), "disagreementCount": len(disagreements),
                      "reviewWindowCount": result["reviewWindowCount"],
                      "agreementRatio": result["normalizedAgreementRatio"], "status": result["status"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
