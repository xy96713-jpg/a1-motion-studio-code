#!/usr/bin/env python3
import hashlib
import importlib.util
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts/lib/a1_arcade_crt_display_v1.py"
CONFIG_PATH = ROOT / "configs/system-line-display/a1-arcade-crt-display-v1.json"
spec = importlib.util.spec_from_file_location("a1_crt", MODULE_PATH)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
config = module.load_config(CONFIG_PATH)

height, width = 900, 1600
rgb = np.zeros((height, width, 3), dtype=np.uint8)
rgb[:, :] = (8, 20, 28)
rgb[260:620, 260:1340] = (222, 224, 196)
rgb[320:560:32, 360:1240] = (20, 72, 132)
rgb[400:480, 760:840] = (196, 52, 40)
full_a = module.render(rgb, config, "FULL_CRT", input_has_crt=False)
full_b = module.render(rgb, config, "FULL_CRT", input_has_crt=False)
balanced = module.render(rgb, config, "BALANCED_CRT", input_has_crt=False)
preserved = module.render(rgb, config, "PRESERVE_SOURCE", input_has_crt=False)
assert np.array_equal(full_a, full_b)
assert not np.array_equal(full_a, balanced)
assert np.array_equal(preserved, rgb)
assert full_a.shape == balanced.shape == rgb.shape
try:
    module.render(rgb, config, "FULL_CRT", input_has_crt=True)
    raise AssertionError("double processing accepted")
except ValueError as error:
    assert "double CRT" in str(error)
try:
    module.render(rgb[:540, :960], config, "FULL_CRT", input_has_crt=False)
    raise AssertionError("uncalibrated resolution accepted")
except ValueError as error:
    assert "calibrated resolution" in str(error)
rgba = np.dstack([rgb, np.zeros((height, width), dtype=np.uint8)])
rgba[260:620, 260:1340, 3] = 255
local = module.render_rgba(rgba, config, "LOCAL_CRT", input_has_crt=False)
assert local.shape == (height, width, 4)
assert int(local[0, 0, 3]) == 0
assert int(local[450, 800, 3]) > 0
sha = lambda value: hashlib.sha256(value.tobytes()).hexdigest()
print(json.dumps({
    "contract": "A1ArcadeCrtDisplayRendererTest/v1",
    "status": "PASS",
    "fullDeterministic": True,
    "doubleProcessingRejected": True,
    "uncalibratedResolutionRejected": True,
    "localAlphaPreserved": True,
    "hashes": {"full": sha(full_a), "balanced": sha(balanced), "preserved": sha(preserved), "local": sha(local)},
}, indent=2))
