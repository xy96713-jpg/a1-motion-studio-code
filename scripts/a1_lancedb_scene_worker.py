#!/usr/bin/env python3
"""Isolated LanceDB writer/search worker for review-only scene vectors."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import lancedb


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = "A1LanceDbSceneWorkerResult/v1"


def inside_root(value: str, *, create: bool = False) -> Path:
    path = Path(value)
    if not path.is_absolute():
        path = ROOT / path
    path = path.resolve()
    if ROOT != path and ROOT not in path.parents:
        raise ValueError(f"path-outside-project:{path}")
    if create:
        path.mkdir(parents=True, exist_ok=True)
    return path


def write_index(request: dict[str, Any]) -> dict[str, Any]:
    db_path = inside_root(str(request.get("dbPath") or ""), create=True)
    table_name = str(request.get("tableName") or "scenes").strip()
    rows = request.get("rows") if isinstance(request.get("rows"), list) else []
    if not rows or not table_name:
        raise ValueError("rows-and-table-required")
    dimension = len(rows[0].get("vector") or [])
    if dimension < 8 or any(len(row.get("vector") or []) != dimension for row in rows):
        raise ValueError("vector-dimension-invalid")
    db = lancedb.connect(str(db_path))
    table = db.create_table(table_name, data=rows, mode="overwrite")
    count = table.count_rows()
    return {"contract": CONTRACT, "status": "PASS", "operation": "write-index", "provider": {"id": "LanceDB", "version": getattr(lancedb, "__version__", "unknown"), "mode": "embedded-local-single-writer"}, "dbPath": str(db_path), "tableName": table_name, "rowCount": count, "dimension": dimension, "failures": [], "reviewOnly": True, "productionAdmission": False}


def search_index(request: dict[str, Any]) -> dict[str, Any]:
    db_path = inside_root(str(request.get("dbPath") or ""))
    table_name = str(request.get("tableName") or "scenes").strip()
    vector = [float(value) for value in request.get("vector") or []]
    limit = max(1, min(50, int(request.get("limit") or 10)))
    if len(vector) < 8:
        raise ValueError("query-vector-invalid")
    db = lancedb.connect(str(db_path))
    table = db.open_table(table_name)
    rows = table.search(vector).limit(limit).to_list()
    for row in rows:
        row.pop("vector", None)
    return {"contract": CONTRACT, "status": "PASS", "operation": "search-index", "provider": {"id": "LanceDB", "version": getattr(lancedb, "__version__", "unknown"), "mode": "embedded-local-single-writer"}, "dbPath": str(db_path), "tableName": table_name, "results": rows, "failures": [], "reviewOnly": True, "productionAdmission": False}


def main() -> int:
    try:
        request = json.loads(sys.stdin.read())
        if request.get("contract") != "A1LanceDbSceneWorkerRequest/v1":
            raise ValueError("request-contract-invalid")
        operation = request.get("operation")
        if operation == "write-index":
            result = write_index(request)
        elif operation == "search-index":
            result = search_index(request)
        else:
            raise ValueError("operation-unsupported")
    except Exception as error:
        result = {"contract": CONTRACT, "status": "BLOCKED", "operation": None, "provider": None, "failures": [f"{type(error).__name__}:{str(error)[:400]}"], "reviewOnly": True, "productionAdmission": False}
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
