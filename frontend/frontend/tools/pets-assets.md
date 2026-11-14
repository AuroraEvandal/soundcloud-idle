# Pet sprites

Generated with built-in ImageGen using the three supplied images in the repository's `pets/` folder as edit references. Originals unchanged. Source sheet: `pet-sheet.png`; runtime: `../public/pets/<id>/<pose>.png`.

Prompt: preserve the original three pixel-art identities (Soundity cloud, Micity microphone, Scalevillity CODE 80 chibi), create a transparent 5-column × 3-row sprite sheet; columns idle, happy, asleep, confused, music. Full character per cell, generous transparent margins, no labels or grid. Existing poses used as references; missing expressions derived with minimal changes.

Run `powershell -File ./slice_pet_sheet.ps1` from any folder on Windows to slice, trim alpha margins and fit each sprite into a 320px transparent square. No Python or additional dependencies.
