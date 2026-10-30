# Chrollo game - UI project (claude_rea_ui)

Working copy of `E:\project\claude_rea` for building a better UI. Same files and build; the original project is left untouched. Not copied: `sheets/` (generated pictures) and `kit/`. The Python env in `tools\.venv` was recreated here.

Preview: `node tools\build.js` then open `chrollo.html` (or serve it on any port).

- `chrollo.html` - the deliverable. One self-contained file, double-click to play.
- `site/` - editable source. All pictures come from ONE sheet: `sheet.webp` (game) / `sheet.png` (lossless, plain grid).
- `site/editor.js` - in-page editor on its own page (chrollo.html#edit, opened by the Edit button): replace cells / whole sheet, per-cell zoom + move, per-move (punch) zoom + move / the 4 punch sounds with your own files (saved in the browser).
- `tools/crop_to_grid.py` - re-cuts a pasted 10x5 sheet picture into our 3:2 grid (output in `sheets/custom/`, sources in `reference/custom-sources/`); load the result with the editor's "Load whole sheet".
- `sample/` - two ready-made full sheets (gabi, tucker). `tools/make_samples.py` converts them to `site/sample-*.webp`; the Sample list (bottom-left of the game page) switches between them.
- `tools/analyze.py` - finds duplicate frames across the original 144 images.
- `tools/build_sheet.py` - packs the frames the game really draws into the sheet (cell order follows `reference/layout-order.webp`, no extra cells with --no-add), writes `site/manifest.js`.
- `sheets/` - `sheet-grid.png` (finished sheet, thin black lines) and `grid-blank.png` (empty white 3:2 grid, same layout).
- `tools/build.js` - bundles site/ into chrollo.html.  Run: `node tools/build.js`
- `original/` - untouched downloads from the source site, for reference. Sheet scripts read from here.
- `reference/` - rea analysis output.

Rebuild everything: `cd tools && .venv\Scripts\python build_sheet.py --no-add && cd .. && node tools\build.js`
(the `.venv` holds Pillow + numpy; recreate with `python -m venv tools\.venv` and `pip install pillow numpy`).

Display is 3:2 (750x500); frames are cropped at draw time, not edited on disk.

- `sheets/hand-mask-main.png` - hand mask (black hand on white) on the same grid as the sheet, fitted from your painted `reference/hand-mask-main-source.webp` by `tools/fit_mask.py`; `hand-mask-main-overlay.png` shows it on the real frames. `sheets/hand-mask.png` is the earlier automatic version (`tools/mask_hands.py`).
