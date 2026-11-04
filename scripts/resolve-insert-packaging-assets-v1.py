#!/usr/bin/env python3
"""Guarded live Resolve insertion entrypoint; never runs without explicit intent."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path


def canonical(value):
    if isinstance(value, dict):
        return {key: canonical(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [canonical(item) for item in value]
    return value


def receipt_sha(value):
    return hashlib.sha256(json.dumps(canonical(value), ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True)
    parser.add_argument("--receipt", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    receipt = json.loads(Path(args.receipt).read_text())
    if receipt.get("contract") != "A1PackagingAuthorization/v6" or receipt.get("stage") != "RESOLVE_INSERT" or receipt.get("authorized") is not True:
        raise SystemExit("explicit-resolve-insert-authorization-receipt-required")
    body = dict(receipt)
    provided_sha = body.pop("receiptSha256", None)
    if not provided_sha or receipt_sha(body) != provided_sha:
        raise SystemExit("resolve-insert-authorization-receipt-hash-invalid")
    if os.environ.get("A1_EXECUTE_RESOLVE_INSERT") != "1" and not args.dry_run:
        raise SystemExit("resolve-insert-execution-intent-required")
    plan = json.loads(Path(args.plan).read_text())
    if plan.get("contract") != "A1ResolvePackagingInsertPlan/v1" or plan.get("status") != "READY_FOR_GUARDED_LIVE_INSERT":
        raise SystemExit("resolve-insert-plan-not-ready")
    if args.dry_run:
        print(json.dumps({"status": "READY_FOR_LIVE_RESOLVE_READBACK", "mutation": False, "shotCount": len(plan.get("appendItems", []))}, ensure_ascii=False))
        return
    raise SystemExit("resolve-insert-live-bridge-not-run-without-resolve-readback")


if __name__ == "__main__":
    main()
