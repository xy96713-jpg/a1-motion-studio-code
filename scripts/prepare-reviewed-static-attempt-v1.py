#!/usr/bin/env python3
"""Normal pure preparation entry for the adopted, byte-pinned Pan adapter."""
import argparse
import ast
import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
TOOL = ROOT / 'work/module-development-launch-v1/integration/system-consumer-batch-20261002-v1/attempt-efficiency-unapplied-v1'
OUTPUTS = ROOT / 'work/attempt-preparation-output-v1'


def fact(p):
    data = p.read_bytes()
    return {'path': str(p.resolve()), 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}


def load_adopted_baseline():
    record = json.loads((TOOL / 'PREPARATION-TOOL-ADOPTION-v1.json').read_bytes())
    review_pin = record['independentReview']
    review_path = pathlib.Path(review_pin['path'])
    if fact(review_path) != review_pin:
        raise ValueError('ADOPTED_REVIEW_BYTES_CHANGED')
    review = json.loads(review_path.read_bytes())
    if not (review['status'] == 'PASS' and review['mustFixCount'] == 0
            and review['canAdoptIsolatedPreparationAdapter'] is True):
        raise ValueError('ADOPTED_PREPARATION_REVIEW_REQUIRED')
    for pin in review['newCodeFacts']:
        if fact(pathlib.Path(pin['path'])) != pin:
            raise ValueError('ADOPTED_HELPER_BYTES_CHANGED')
    sys.path.insert(0, str(TOOL))
    from attempt_delta import derive, encoded, verify_package, verify_review_identity
    # Reuse the byte-reviewed runner's bounded snapshot prefix, stopping before
    # derive/tests/writes. No alternate baseline loader or reviewed-code edit.
    runner = TOOL / 'prepare_and_test.py'
    tree = ast.parse(runner.read_text(), filename=str(runner))
    prefix = []
    for statement in tree.body:
        if (isinstance(statement, ast.Assign) and isinstance(statement.value, ast.Call)
                and isinstance(statement.value.func, ast.Name) and statement.value.func.id == 'derive'):
            break
        prefix.append(statement)
    else:
        raise ValueError('REVIEWED_SNAPSHOT_PREFIX_REQUIRED')
    namespace = {'__file__': str(runner), '__name__': 'adopted_readonly_snapshot'}
    exec(compile(ast.Module(body=prefix, type_ignores=[]), str(runner), 'exec'), namespace)
    if review['packageSHA'] != record['reviewedPackageSHA']:
        raise ValueError('ADOPTED_PACKAGE_IDENTITY_MISMATCH')
    return namespace['baseline'], namespace['baseline_files'], derive, encoded, verify_package, verify_review_identity


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'verify'])
    parser.add_argument('--out', required=True, type=pathlib.Path)
    parser.add_argument('--descriptor', type=pathlib.Path)
    parser.add_argument('--base-review-fact', type=pathlib.Path, help='Optional exact existing baseReview fact; never an approval substitute.')
    parser.add_argument('--review', type=pathlib.Path, help='Optional independent review envelope for readonly identity checking.')
    args = parser.parse_args()
    out = args.out.resolve()
    if not out.is_relative_to(OUTPUTS.resolve()) or out == OUTPUTS.resolve():
        raise ValueError('ISOLATED_PREPARATION_OUTPUT_REQUIRED')
    baseline, baseline_files, derive, encoded, verify_package, verify_review_identity = load_adopted_baseline()
    if args.action == 'prepare':
        if not args.descriptor:
            raise ValueError('DESCRIPTOR_REQUIRED')
        descriptor = json.loads(args.descriptor.read_bytes())
        if args.base_review_fact:
            baseline['baseReview'] = json.loads(args.base_review_fact.read_bytes())
        files, package = derive(descriptor, baseline)
        verify_package(package, files, baseline_files)
        if out.exists():
            raise ValueError('PREPARATION_OUTPUT_ALREADY_EXISTS')
        out.mkdir(parents=True, exist_ok=False)
        (out / 'candidate').mkdir()
        for name, data in files.items():
            (out / 'candidate' / name).write_bytes(data)
        (out / 'DELTA-REVIEW-PACKAGE.json').write_bytes(encoded(package))
    else:
        package = json.loads((out / 'DELTA-REVIEW-PACKAGE.json').read_bytes())
        entries = list((out / 'candidate').iterdir())
        if any(not p.is_file() or p.is_symlink() for p in entries):
            raise ValueError('UNDECLARED_DIRECTORY_OR_SYMLINK')
        files = {p.name: p.read_bytes() for p in entries}
        verify_package(package, files, baseline_files)
    if args.review:
        verify_review_identity(json.loads(args.review.read_bytes()), package, files, baseline_files)
    print(json.dumps({'status': 'PASS_ADOPTED_PREPARATION' if args.action == 'prepare' else 'PASS_ADOPTED_READONLY_VERIFICATION',
                      'packageSHA': package['packageSHA'], 'output': str(out), 'candidateFiles': len(files),
                      'independentReviewGrantedByThisCall': False, 'executionAuthorized': False,
                      'actual': 0, 'PS': 0, 'centralScopeWrites': 0, 'phaseWrites': 0, 'READYWrites': 0}))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError) as error:
        print(json.dumps({'status': 'REJECTED', 'error': str(error), 'actual': 0, 'PS': 0}), file=sys.stderr)
        sys.exit(2)
