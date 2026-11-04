# Shot module art kit

Generated once by image generation (Codex image_gen), reused by every shot of the modules (`modules.mjs`, `../sidecard.html`, `../article.html`). The user, 2026-10-20: code-drawn boxes look like PPT; image generation makes what things look like (paper, card stock, marker ink, display lettering); code places the exact words, real material and motion.

| file | what | text |
|---|---|---|
| torn-1.png, torn-2.png | torn paper strips, transparent | none |
| card-red.png | product card plate (red; the ink tone is a hue turn in CSS) | none |
| marker.png | a red highlighter stroke, transparent | none |
| h100.png, h800.png | chrome display lettering of the model names | checked: H800 by OCR, H100 by eye (OCR cannot read the chrome) |

`raw/` holds the untouched generations (not committed); `prep.py` removes the glow the model leaves around a transparent sprite and trims it. Prompts: the session's kit script, recorded in the commit that added this folder.
