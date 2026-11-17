# SSHD Map Tracker V2: Development Handoff

## Isolation

Code branch: `codex/tracker-v2`. Worktree: `../sshd-ap-tracker-v2`.
The original worktree remains on `sshd-prototype`. Its unpublished Signs changes
were copied into the V2 worktree as a baseline; they were not committed, removed,
or modified in the original worktree. The V2 worktree therefore includes those
baseline changes as well as the new V2 work. No commits or pushes were made.

GitHub Pages workflows are unchanged. Only pushes to `sshd-prototype` deploy the
existing site. Do not merge this preview into that branch before reviewing the
deployment strategy. A future `/v2/` public deployment must assemble both builds
in one deployment, not overwrite the live `gh-pages` output independently.

## Try It Without a Real Seed

Double-click `run-v2-demo.bat` in this worktree. It installs dependencies if
needed, starts Vite and a simulated AP server, and prints the actual addresses.
Defaults are:

- V2 connection: `http://127.0.0.1:5190/v2/connect`
- Reader: `http://127.0.0.1:5190/v2/`
- Editor: `http://127.0.0.1:5190/v2/editor`
- AP server: `localhost:38292`
- Slot: `Vegetation Player`, `Blade Player` or `Entrance Player`, no password.
  `Entrance Player` enables manual dungeon and Silent Realm entrance randomization;
  `Blade Player` changes grass to individual blades, not entrance settings.

For live simulation, connect on the V2 connection page and launch the tracker. Navigation
within the app retains the live AP connection; a full browser reload requires
reconnecting. Editor/reader routes also work without a server using locally
saved inventory and settings. The separate port protects V1 browser saves.

The default pack reuses all five V1 map images and their existing marker positions.
Every catalogue check is placed exactly once, using the V1 region ownership rules.
Regions remain large multi-check groups until an author expands them into detail
maps. This is not a new set of accurate per-check placements.

An untouched old two-map demo draft is replaced automatically. Customized drafts
are retained. **New pack** replaces the draft with a named copy of the default
V1 layout after a warning to export unsaved work. It requires no new image.
Undo remains available within the current session.

## What Exists

- Shared V1 logic, inventory, AP synchronization, check controls and tooltips.
- V1-based starter pack with square region/multicheck markers and circular links.
- Mouse-wheel zoom anchored at the pointer, drag-pan, fit and map-link navigation.
  Zoom is bounded to 100–1000%; 100% fits the complete image to its viewport.
- Inventory on the left and full remaining width for the map, no reader inspector.
- Reader counters reuse V1's compact component and wrapping behavior.
- The compact V1 dungeon row is reused with its keys and required-dungeon controls.
  Right-clicking a dungeon opens the map holding the most direct placements of its
  checks; ties prefer the map with fewer unrelated checks, then stable pack order.
  Links do not count as placements. Missing placements show a notice.
  Previous map / World map controls sit immediately before the map title.
- Bottom-left Connect and Server & Tools controls work without leaving V2.
  The footer stays under the left-side logs, not across the map. Connection
  status follows the two icons. The pack name is a small gray caption in the
  top-right header, immediately before Map Editor.
  Tools includes live session counts/completion, server commands, tracker-state
  import/export and debug Snapshot/AP Server Data downloads. These JSON state
  files do not contain a map pack; pack ZIP files remain managed by the editor.
  Server & Tools is a page switch, not a dialog. It reuses V1's actual Session,
  Tools and Server Log panels. Its left-side footer switches back to Tracker or
  opens Connect without moving its controls or connection status.
  V2 customization exposes theme presets and trick display, not item-layout or
  region-follow options that currently have no effect on V2 map navigation.
- Hover menus list grouped checks; individual rows keep nested requirement tooltips.
  Compact hover menus virtualize large groups without search, filters or extra counts.
  A link's clickable title opens its destination; its list shows destination checks.
- Check lists use V1 logic order, with regular checks followed by Signs, Grass,
  Grass blades and Trees, not alphabetic order or the order they were placed.
- `Show name on hover` is off for newly authored check groups. V1 starter regions
  enable it by default. Existing V1 region drafts/imports are upgraded without
  moving placements or overriding explicit choices. Links always keep their title.
- Marker state: gray complete, green all remaining reachable, amber mixed, red
  none reachable. Inactive-only markers disappear. Counts deduplicate IDs.
- Grouped grass references can include bundle/blade alternatives; only active
  checks for the current settings count or appear.
- Virtualized unplaced-check fallback. Unmapped content is not lost.
- Editor map list, new-pack creation, image import, new/replaced/deleted maps,
  exact marker coordinates, drag movement, explicit multicheck membership and links.
- Drag a check marker onto another to merge; a highlighted target previews the merge.
  The duplicate Merge command/menu has been removed. Deletion is a separate action.
- Select group members and extract them together into one new multicheck, or drag
  members out of the inspector onto the map (or into another group).
- **Create sub-map from group** replaces that marker with a link, creates a child
  map plus return link, and places all checks in a single centered multicheck
  for subsequent manual extraction and placement.
  Creation requires a map name and a new raster image, including for sub-maps.
  Selecting members changes the command to **Create sub-map from selected**:
  only those checks move to the child map; the original group keeps its remainder.
- Catalogue search/region filter, batch selection, add/remove group members.
  Catalogue search shares its row with Select all / Clear; region selection shares
  its row with Unplaced. The inspector also has Select all / Clear next to its
  member search, selecting the matching members (including virtualized rows).
- Undo/redo (30 edit snapshots), shared live reader preview.
- ZIP import/export with `pack.json` and raster images.
- IndexedDB autosave for pack/image drafts, separate from tracker saves.
- Resizable left/right panels and Maps/Check catalogue split, saved in localStorage.
  The initial Maps pane fits six rows when viewport space permits; saved sizes
  take precedence. Unplaced / Select all / Clear share one compact row.
  Group-member lists use a smaller 226px viewport, while the main catalogue fills
  the available height down to its placement controls. Hover notes sit immediately
  under an optional title.
- Global pack name and colored local-save/export status on the same heading line.
  Export can rename the pack. The placed-check total is red for incomplete
  catalogue coverage and green when every known check is placed.
  Import marks the imported snapshot as exported; later edits mark it unexported.
- Repeat placements share one check state and never inflate logical counters.
- Right-click/double-click a fixed map link in the editor to open its destination.
- The inspector's Current selection dropdown controls all properties below it.
  Clicking the map background selects the map; drag-panning preserves selection.
  Editor links are green regardless of logic; reader colours still reflect access.
- Bottom placement status reserves its height, so toggling tools does not shift the map.
- Reuse of the existing manual entrance menu; no automatic ER discovery.
  The Entrances button is overlaid at the map's top-left, as in V1, and appears
  only for entrance-randomized seeds or local `?entranceTest=1` development mode.

## Architecture and Ownership

`src/v2/pack.ts` owns versioned presentation types and structural validation.
`packIO.ts` owns archives and image import, `documentStore.ts` owns local drafts
and undo history, `MapCanvas.tsx` is the shared authoring/runtime renderer.
`PackEditor.tsx` edits packs; `PackViewer.tsx` derives state from V1 selectors.
`legacyPack.ts` converts the V1 region data without guessing coordinates, and
`editOperations.ts` contains pure, tested merge/extraction/sub-map operations.
`V2App.tsx` lazy-loads the workspace and bootstraps local SSHD logic when needed.

`TrackerContents` accepts an optional custom layout. That is the only integration
needed to share AP callback setup with the existing tracker. It was not copied
into a second connection implementation. The classic reader remains available.
It has no V2 link and imports no V2 pack code. The generic connection form accepts
an optional destination route; its default remains the classic tracker.

The editor does NOT author logic, inventory, AP settings or executable scripts.
Checks reference exact existing tracker IDs from the catalogue (not arbitrary
name-prefix matches and not seed-specific numeric AP IDs). Unknown references
produce warnings and do not grant access. Renamed IDs require reviewed aliases
or a later pack migration tool, not guessed replacements.

## Version 1 Pack Contract

The ZIP root contains `pack.json` and `images/*.{png,jpg,jpeg,webp}`. The manifest
has `version: 1`, stable `id`, `name`, and a nonempty `maps` array. Each map has:

```json
{
  "id": "faron_woods",
  "name": "Faron Woods",
  "image": "images/faron_woods.png",
  "width": 1024,
  "height": 768,
  "entranceIds": [],
  "markers": [
    {
      "id": "clearing",
      "kind": "checks",
      "label": "Clearing",
      "x": 350,
      "y": 420,
      "checkIds": ["<exact catalogue check ID>"],
      "showNameOnHover": false,
      "note": "Optional location hint"
    },
    {
      "id": "path_back",
      "kind": "link",
      "label": "Sealed Grounds",
      "x": 150,
      "y": 600,
      "targetMapId": "sealed_grounds"
    }
  ]
}
```

The example link needs a matching `sealed_grounds` map in the pack. Coordinates
are native image pixels, origin top-left; viewport resizing and zoom never modify
saved coordinates. Replacing an image scales placements proportionally. Export
is canonicalized through validation; files contain no inventory or seed state.

Links optionally use `navigation: "child"` or `navigation: "back"`. Child links
contribute descendant checks to overview counters; back links do not create a
counter cycle. Ordinary navigation links do not expand the map's own totals.

One check may appear on several maps or several placements on the same map. A group
cannot reference the same check twice. Counts always deduplicate check IDs. A group
is explicit; identical coordinates do not implicitly merge marker identities.
Only references selected from the catalogue can be created through the editor.
Numeric AP IDs continue to be resolved by the existing AP integration layer.

An ER link optionally has `exitId`. In that case `targetMapId` is NOT a fallback:
the runtime looks up the mapped entrance and selects the map declaring that
entrance in `entranceIds`. Unknown/unplaced destinations open the manual entrance
workflow instead of revealing a fixed destination. These bindings use the same
exact IDs as the existing logic/menu, not names or seed-specific guesses.

## Manual Entrance Authoring

1. Select a map link, choose **Game entrance** under **Link routing**, and search
   for the actual outgoing door in **Exit on this map**. Fixed map links remain
   available for ordinary browsing and are not randomized.
2. Select each destination map (background click or Current selection dropdown),
   then add its real incoming doors under **Arrivals on this map**. Search accepts
   name fragments in any order and technical IDs; labels use `name (via source)`.
   Several arrivals may belong to one map, but one arrival cannot belong to two
   maps. Arrivals assigned elsewhere are disabled and show the owning map.
3. During play, set the actual connection in the existing **Entrances** menu.
   The editor binds physical doors/maps; it does not edit seed connections.

The link's hover, color and click destination follow the current manual mapping.
Its hover includes the arrival name and an Edit entrance connection icon. Clicking
an unresolved link opens the menu filtered to its associated exit. Opening the main
Entrances button opens the full list instead. Assignment does not navigate until
the player clicks the link or Go to. Coupled/decoupled rules remain owned by the
existing logic engine; V2 does not infer another connection independently.

No map assigned is reported distinctly from no manual mapping. Without ER, game
links resolve through the logic engine's vanilla connections. A bound link never
falls back to `targetMapId`. Bound links are not fixed child-containment links;
their former fixed subtree cannot contribute vanilla checks to overview totals.
Switching back to Fixed map clears the exit binding. Binding edits support local
autosave, undo/redo and pack ZIP export/import. Arrival coordinates/panning to an
exact door and automatic discovery from the game are not implemented.

## Validation and Tests

See [V2_AUTOTRACKING.md](V2_AUTOTRACKING.md) for optional player following, the
proposed telemetry/discovery inbox, authoring steps for lehonno and messages for
Wesley. No live client support is assumed and no new artwork was authored.

Run the normal `npm run check`. It includes schema/ZIP unit tests and Playwright
tests for V1 coverage, exact check preservation during editing, nested hover
requirements and their stacking, wheel zoom, drag merges/member extraction,
region-to-map conversion, ZIP round trips, reload, invalid imports, small screens
and the simulated AP server. V1 tests remain.
Screenshots are produced under `test-results/v2-*.png` (ignored by Git).

Structural validation rejects duplicate IDs, duplicate references inside a group,
invalid coordinates/dimensions, dangling fixed links and unknown versions.
ZIP import rejects unexpected/traversal paths, SVG/HTML files and oversized data.
Limits: 200 maps, 2,000 markers/map, 256 MB compressed, 512 MB expanded, 16 MB/file.
Import and export share the same limits. These are safety ceilings, not target
pack sizes: large packs can use substantially more memory while decoding images,
encoding base64, saving local drafts and creating ZIPs. Export may temporarily
block the UI; keep backups and optimize images where practical.

## Remaining Work Before a Real V2 Release

1. Supply detailed, redistributable artwork and place checks with game expertise.
2. Author a real Faron Woods + interior vertical slice and review routing.
3. Replace the fixed inspector sidebar with a polished responsive detail UI after
   contributor feedback; improve keyboard authoring and batch operations.
4. Add exact arrival coordinates and broader ER scenarios as detailed maps grow.
5. Add visual overlap diagnostics, pack-version migrations and broader catalogue
   compatibility tooling as content grows. Unknown references currently warn.
6. Support floors, alternate map states and time-dependent variants in a later
   schema revision; do not infer these from names.
7. Agree the prepared stage/room telemetry contract with Wesley and validate the
   real client. Optional following is tested with the simulator only.
   Exact Link coordinates are intentionally excluded.
8. Add pack management/distribution and a reviewed public preview deployment.
9. Review image credits/licensing and validate real generated seeds against UT.

The starter pack also has no entrance associations. Manual entrance mapping is
shared and functional, but map navigation to randomized destinations needs
authored exit links and destination entrance IDs; it must not guess vanilla maps.

The prototype is not a replacement for V1. The starter pack intentionally keeps
V1's coarse regional grouping. No new detailed production artwork, automatic
map following, player arrow or accurate inferred per-check placements are claimed.
