# V2 Default Map Pack

`src/v2/data/default-map-pack.zip` retains **Sky Added** (v0.3) outside Lanayru,
including Bug Heaven and Lumpy Pumpkin. On 2026-11-20, Lanayru and its sub-maps
were replaced with Ray's **SSHD-Lanayru-V18.zip** region, including its
Past/Present annotations.
It contains 35 maps and 15,016 unique check placements,
with no unused or byte-identical duplicate images. It is used for a fresh
workspace and the editor's **New pack** action. Authored placements are preserved.

Existing IndexedDB drafts take precedence, including older default packs.
Updating the deployed ZIP never replaces an existing local draft. Export a
backup before intentionally replacing a draft with **New pack**.

The V1 tracker does not load this archive.

V2 markers scale with the available viewport and zoom, independently of image
resolution. Their minimum, maximum
and native sizes are in `src/v2/markerSizing.ts`. Counts are hidden when the
marker cannot contain them legibly; hover contents and check state are unchanged.
Dense placements may still overlap at extreme zoom-out; zooming in restores
space and numeric labels without changing authored coordinates.

Current dimensions are 7 px minimum, 19 px at the reference viewport and 38 px maximum.
The reference drawing area is 843 x 465 px, excluding 48 px of canvas padding.
Twice that available width and height produces 38 px markers. All maps use the
same reference dimensions, regardless of their actual image resolution.
Increase the maximum to allow more growth on large displays without changing
small viewports. Changing the native size affects all viewport scales.

Existing interaction tests use a frozen V1 layout fixture. Separate bundled-pack
browser tests exercise the contributor default, resizing, New pack and draft
preservation.
