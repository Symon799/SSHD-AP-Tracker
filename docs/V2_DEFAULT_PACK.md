# V2 Default Map Pack

`src/v2/data/default-map-pack.zip.1` and `.zip.2` are consecutive binary pieces
of the same ZIP. The app joins them when loading the default pack. This keeps
each deployable asset below GitHub's 100 MiB file limit; editor imports and
exports still use a single standard ZIP.

The pack keeps the **Sky Added** (v0.3) Sky and Skyloft areas and Ray's
**SSHD-Lanayru-V18** region with its Past/Present annotations. On 2026-11-22,
Faron and Eldin were replaced from **Faron-Mapping-V5.zip** and **Eldin.zip**.
On 2026-11-24, Lehonno's **Silent-Realm-and-Sky-Keep.zip** added three maps:
Sky Keep, the Goddess's Silent Realm and Din's Silent Realm. The 310 checks moved
from Skyloft and Eldin Volcano remain counted by those parent maps in vanilla.
It contains 74 maps and 15,016 unique check placements,
with no unused or byte-identical duplicate images. It is used for a fresh
workspace and the editor's **New pack** action. Authored placements are preserved.

Existing IndexedDB drafts take precedence, including older default packs.
Updating the deployed ZIP never replaces an existing local draft. Export a
backup before intentionally replacing a draft with **New pack**.

The V1 tracker does not load this archive.

V2 markers scale with the available viewport and zoom, independently of image
resolution. Their minimum, maximum
and native sizes are in `src/v2/markerSizing.ts`. Use the Marker size slider to
reduce those rendered sizes to 50% without changing map zoom. Unfinished checks
retain their counts even on small markers; completed markers have no count.
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

## Required checks on every pack merge

Use the [exhaustive association checklist](V2_PACK_CHECKLIST.md) as the working
list. It distinguishes source markers to add, existing markers to verify,
arrivals without a map, and player-following rules to check in game.

1. Audit the newly merged maps against `src/v2/defaultPackTracking.ts`. Use the
   APWorld stage table and documented room/layer conditions, not map names alone.
   Move broad province rules to detailed maps when justified and retain safe
   fallbacks for unidentified rooms. A layer is not necessarily a floor.
2. Audit `src/v2/defaultPackEntrances.ts` against the new map names, physical
   markers and the checked-in SSHD logic dump. Check both directions: the source
   marker uses the AP exit ID; the destination map owns the AP arrival ID. Use
   APWorld entrance spawn/exit metadata where needed. Preserve contributor-authored
   entrance IDs. Never bind a shortcut, a duplicate door, or a generic marker by
   matching its destination name alone. Check the actual marker position or leave
   it fixed until confirmed. Several arrivals can share one destination map.
3. Run `npm run audit:v2Pack` to regenerate the complete checklist from the
   merged default and its curated associations. Keep manual findings and
   decisions in this file or the curated tables, not in the generated report.
   Verify the totals and real default pack tests, including vanilla routing,
   unknown/shuffled destinations, and aggregated check counts. Update this ledger
   and tell Symon what changed, what is missing and what still needs in-game
   verification. Include a link to the checklist. `npm run check:code` rejects
   a stale report. Do not overwrite IndexedDB drafts.

Both curated tables are applied to the bundled default without rewriting the ZIP
images. They are part of the pack for fresh workspaces, **New pack**, and exports
thereof. Imported packs and existing local drafts are not retroactively edited.

## Open association checks

### Player following

- Current baseline: 70 of 74 maps (116 rules), excluding the Eldin Province
  navigation overview and three gameplay maps. Validate with a real Rust build
  that publishes `tracker_location`, especially full stage suffixes, room/layer
  updates, and a snapshot when the tracker connects after Link is already in game.
- Verify that `S000`, `S200` and all nine `D003_*` stages open the new maps.
  Sky Keep is one authored image for all of its rooms.
- Bug Heaven shares `F023` with the Thunderhead; no distinguishing room/layer is
  confirmed, so use The Sky. The Lumpy Pumpkin interior has `F011r`; the exterior
  is part of `F020` and stays on The Sky.
- Ancient Cistern B1 and Sandship B3 need verified in-game room data. Sandship's
  escape stage stays on the province fallback; verify any remaining unclassified
  rooms in the three dungeons with split floors. Knight Academy room 0 spans both
  floors and stays on Skyloft unless telemetry can distinguish them reliably.

### Entrance randomizer

- Current baseline: 71 physical links out of 249, and 174 arrival IDs out of
  188. The rest of the map links include navigation shortcuts, not 178 missing
  connections. Manual entrance choices now route verified links. Client-driven
  discovery remains separate; see [V2 Autotracking](V2_AUTOTRACKING.md).
- Confirm the six new directions for Sky Keep and the two Silent Realms in a
  real dungeon/trial ER seed, including their returns.
- Check marker positions before binding the individual doors in Knight Academy,
  Sparring Hall, Bazaar, Waterfall Cave, Lumpy Pumpkin, the Great Tree, Mogma
  Turf, Temple of Time north/south, Construction Bay upper/lower and Pirate
  Stronghold top/side. Their arrivals are already assigned where the map exists.
- Add or verify actual source markers for the Sandship exit, Nayru trial return,
  Lake Floria return and Volcano Summit toward Fire Sanctuary's exterior. The
  existing map overview and **Back to** shortcuts are not those exits. Bird
  statue landings are mapped as destinations; the province links are not treated
  as individual dives. The spawn itself does not have a physical map marker.
- Missing destination maps: Skyloft house interiors, the Statue of the Goddess interior, Bamboo Island and
  Isle of Songs. The synthetic SSHD Start Entrance is intentionally excluded.
  Decide whether to add dedicated maps or confirmed coarse destinations when the
  contributors provide more detail. Test both coupled and decoupled ER in game.
